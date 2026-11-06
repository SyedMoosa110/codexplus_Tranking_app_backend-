import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { logAuditEvent } from '../../lib/audit';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  UpdatePolicySchema,
  TimelineQuerySchema,
} from '@platform/contracts';
import argon2 from 'argon2';

export async function adminRoutes(app: FastifyInstance) {
  // RBAC Guard Middleware
  const requireRole = (allowedRoles: string[]) => async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'forbidden_insufficient_permissions' });
    }
  };

  // 1. Overview Dashboard Stats
  app.get(
    '/overview',
    { preHandler: [requireRole(['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'])] },
    async (req: any, reply) => {
      const orgId = req.user.org;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const [totalEmployees, activeDevices, openSessions, todaySummaries] = await Promise.all([
        prisma.user.count({ where: { organizationId: orgId, isActive: true, role: 'EMPLOYEE' } }),
        prisma.device.count({
          where: {
            organizationId: orgId,
            status: 'ACTIVE',
            lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // seen in last 5 min
          },
        }),
        prisma.workSession.count({
          where: {
            user: { organizationId: orgId },
            status: 'ACTIVE',
          },
        }),
        prisma.dailySummary.findMany({
          where: { organizationId: orgId, summaryDate: today },
        }),
      ]);

      const totalTrackedSecondsToday = todaySummaries.reduce((acc, s) => acc + s.trackedSec, 0);
      const totalActiveSecondsToday = todaySummaries.reduce((acc, s) => acc + s.activeSec, 0);
      const totalIdleSecondsToday = todaySummaries.reduce((acc, s) => acc + s.idleSec, 0);

      return reply.send({
        totalEmployees,
        onlineNow: activeDevices,
        activeSessions: openSessions,
        todayMetrics: {
          trackedHours: +(totalTrackedSecondsToday / 3600).toFixed(1),
          activeHours: +(totalActiveSecondsToday / 3600).toFixed(1),
          idleHours: +(totalIdleSecondsToday / 3600).toFixed(1),
        },
      });
    }
  );

  // 2. Live Employee Status Board
  app.get(
    '/live',
    { preHandler: [requireRole(['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'])] },
    async (req: any, reply) => {
      const orgId = req.user.org;
      const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 min heartbeat threshold

      const users = await prisma.user.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          devices: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              hostname: true,
              lastSeenAt: true,
              agentVersion: true,
            },
            take: 1,
            orderBy: { lastSeenAt: 'desc' },
          },
          sessions: {
            where: { status: { not: 'CLOSED' } },
            take: 1,
            orderBy: { startAt: 'desc' },
            select: {
              id: true,
              startAt: true,
              status: true,
              events: {
                take: 1,
                orderBy: { occurredAt: 'desc' },
                select: {
                  type: true,
                  occurredAt: true,
                  payload: true,
                },
              },
            },
          },
        },
      });

      const liveList = users.map((u) => {
        const dev = u.devices[0];
        const isOnline = dev?.lastSeenAt ? dev.lastSeenAt >= cutoff : false;
        const currentSession = u.sessions[0];
        const lastEvent = currentSession?.events[0];

        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          isOnline,
          lastSeenAt: dev?.lastSeenAt ?? null,
          hostname: dev?.hostname ?? null,
          currentSessionStatus: currentSession?.status ?? 'OFFLINE',
          currentActivityType: lastEvent?.type ?? 'OFFLINE',
          currentApp: (() => {
            try {
              const p = typeof lastEvent?.payload === 'string' ? JSON.parse(lastEvent.payload) : lastEvent?.payload;
              return p?.processName ?? 'None';
            } catch { return 'None'; }
          })(),
          currentWindowTitle: (() => {
            try {
              const p = typeof lastEvent?.payload === 'string' ? JSON.parse(lastEvent.payload) : lastEvent?.payload;
              return p?.windowTitle ?? null;
            } catch { return null; }
          })(),
        };
      });

      return reply.send({ employees: liveList });
    }
  );

  // 3. Employee Directory & CRUD
  app.get(
    '/employees',
    { preHandler: [requireRole(['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'])] },
    async (req: any, reply) => {
      const employees = await prisma.user.findMany({
        where: { organizationId: req.user.org },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          devices: {
            select: { id: true, hostname: true, status: true, lastSeenAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ employees });
    }
  );

  app.post(
    '/employees',
    { preHandler: [requireRole(['SUPER_ADMIN', 'IT_ADMIN'])] },
    async (req: any, reply) => {
      const parseResult = CreateEmployeeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: 'invalid_payload', details: parseResult.error.format() });
      }

      const { email, fullName, password, role, teamId, policyId } = parseResult.data;
      const existing = await prisma.user.findFirst({
        where: { organizationId: req.user.org, email: email.toLowerCase() },
      });

      if (existing) {
        return reply.code(409).send({ error: 'email_already_registered' });
      }

      const passwordHash = await argon2.hash(password);
      const newUser = await prisma.user.create({
        data: {
          organizationId: req.user.org,
          email: email.toLowerCase(),
          fullName,
          role,
          passwordHash,
          teamId: teamId ?? null,
          policyId: policyId ?? null,
        },
        select: { id: true, email: true, fullName: true, role: true },
      });

      await logAuditEvent({
        organizationId: req.user.org,
        actorId: req.user.sub,
        action: 'CREATE_EMPLOYEE',
        targetType: 'USER',
        targetId: newUser.id,
        ip: req.ip,
      });

      return reply.code(201).send(newUser);
    }
  );

  // 4. Interactive Timeline for Employee on Date
  app.get(
    '/employees/:id/timeline',
    { preHandler: [requireRole(['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'])] },
    async (req: any, reply) => {
      const { id } = req.params as { id: string };
      const parseQuery = TimelineQuerySchema.safeParse(req.query);
      if (!parseQuery.success) {
        return reply.code(400).send({ error: 'invalid_date_format', details: parseQuery.error.format() });
      }

      const targetUser = await prisma.user.findFirst({
        where: { id, organizationId: req.user.org },
      });

      if (!targetUser) {
        return reply.code(404).send({ error: 'employee_not_found' });
      }

      const dayStart = new Date(`${parseQuery.data.date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const [sessions, events, segments] = await Promise.all([
        prisma.workSession.findMany({
          where: {
            userId: id,
            startAt: { gte: dayStart, lt: dayEnd },
          },
          include: { device: { select: { hostname: true } } },
          orderBy: { startAt: 'asc' },
        }),
        prisma.activityEvent.findMany({
          where: {
            session: { userId: id },
            occurredAt: { gte: dayStart, lt: dayEnd },
          },
          orderBy: { occurredAt: 'asc' },
        }),
        prisma.appUsageSegment.findMany({
          where: {
            session: { userId: id },
            startedAt: { gte: dayStart, lt: dayEnd },
          },
          orderBy: { startedAt: 'asc' },
        }),
      ]);

      // Record audit log for data transparency
      await logAuditEvent({
        organizationId: req.user.org,
        actorId: req.user.sub,
        action: 'VIEW_TIMELINE',
        targetType: 'USER',
        targetId: id,
        ip: req.ip,
        metadata: { date: parseQuery.data.date },
      });

      return reply.send({
        employee: { id: targetUser.id, fullName: targetUser.fullName, email: targetUser.email },
        date: parseQuery.data.date,
        sessions,
        events: events.map((e) => {
          let parsedPayload = e.payload;
          if (typeof e.payload === 'string') {
            try {
              parsedPayload = JSON.parse(e.payload);
            } catch {}
          }
          return {
            ...e,
            payload: parsedPayload,
          };
        }),
        segments,
      });
    }
  );

  // 5. Device Management: Remote Revoke
  app.post(
    '/devices/:id/revoke',
    { preHandler: [requireRole(['SUPER_ADMIN', 'IT_ADMIN'])] },
    async (req: any, reply) => {
      const { id } = req.params as { id: string };

      const device = await prisma.device.findFirst({
        where: { id, organizationId: req.user.org },
      });

      if (!device) {
        return reply.code(404).send({ error: 'device_not_found' });
      }

      await prisma.$transaction([
        prisma.device.update({
          where: { id },
          data: { status: 'REVOKED', revokedAt: new Date() },
        }),
        prisma.refreshToken.updateMany({
          where: { deviceId: id },
          data: { isRevoked: true },
        }),
      ]);

      await logAuditEvent({
        organizationId: req.user.org,
        actorId: req.user.sub,
        action: 'REVOKE_DEVICE',
        targetType: 'DEVICE',
        targetId: id,
        ip: req.ip,
      });

      return reply.send({ ok: true, message: 'Device revoked successfully' });
    }
  );

  // 6. Security Audit Logs
  app.get(
    '/audit',
    { preHandler: [requireRole(['SUPER_ADMIN'])] },
    async (req: any, reply) => {
      const logs = await prisma.auditLog.findMany({
        where: { organizationId: req.user.org },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return reply.send({ logs });
    }
  );
}
