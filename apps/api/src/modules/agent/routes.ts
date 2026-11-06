import { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { prisma } from '../../lib/prisma';
import { sha256, newToken } from '../../lib/crypto';
import { env } from '../../config/env';
import {
  AgentLoginSchema,
  EventBatchSchema,
  SessionEndSchema,
} from '@platform/contracts';

export async function agentRoutes(app: FastifyInstance) {
  // 1. Employee Login from Desktop Agent (EXE)
  app.post(
    '/login',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (req, reply) => {
      const parseResult = AgentLoginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.code(400).send({ error: 'invalid_payload', details: parseResult.error.format() });
      }

      const body = parseResult.data;
      const user = await prisma.user.findFirst({
        where: { email: body.email.toLowerCase(), isActive: true },
        include: { organization: true },
      });

      if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }

      // Upsert device bound to this user and organization
      const device = await prisma.device.upsert({
        where: {
          organizationId_deviceUuid: {
            organizationId: user.organizationId,
            deviceUuid: body.deviceUuid,
          },
        },
        update: {
          hostname: body.hostname,
          osVersion: body.osVersion,
          agentVersion: body.agentVersion,
          lastSeenAt: new Date(),
        },
        create: {
          organizationId: user.organizationId,
          userId: user.id,
          deviceUuid: body.deviceUuid,
          hostname: body.hostname,
          osVersion: body.osVersion,
          agentVersion: body.agentVersion,
          lastSeenAt: new Date(),
        },
      });

      if (device.status === 'REVOKED' || device.userId !== user.id) {
        return reply.code(403).send({ error: 'device_not_allowed' });
      }

      const access = app.jwt.sign(
        {
          sub: user.id,
          org: user.organizationId,
          dev: device.id,
          role: user.role,
          typ: 'agent',
        },
        { expiresIn: env.ACCESS_TTL_SEC }
      );

      const refresh = newToken();
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          tokenHash: sha256(refresh),
          expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86400000),
        },
      });

      return reply.send({
        access,
        refresh,
        userName: user.fullName,
        deviceId: device.id,
        organizationId: user.organizationId,
      });
    }
  );

  // 2. Fetch Active Policy for this Employee / Device
  app.get('/policy', { preHandler: [(app as any).auth] }, async (req: any, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { policy: true },
    });

    const defaultMasked = ['1password', 'bitwarden', 'keepass', 'whatsapp', 'telegram', 'banking'];

    if (user?.policy) {
      let parsedMasked = defaultMasked;
      if (Array.isArray(user.policy.maskedApps)) {
        parsedMasked = user.policy.maskedApps;
      } else if (typeof user.policy.maskedApps === 'string') {
        try { parsedMasked = JSON.parse(user.policy.maskedApps); } catch {}
      }

      let parsedSchedule = user.policy.scheduleJson;
      if (typeof user.policy.scheduleJson === 'string') {
        try { parsedSchedule = JSON.parse(user.policy.scheduleJson); } catch {}
      }

      return reply.send({
        idleThresholdSec: user.policy.idleThresholdSec,
        captureProcess: user.policy.captureProcess,
        captureWindowTitle: user.policy.captureWindowTitle,
        captureScreenshots: user.policy.captureScreenshots,
        screenshotEverySec: user.policy.screenshotEverySec,
        maskedApps: parsedMasked.length > 0 ? parsedMasked : defaultMasked,
        scheduleJson: parsedSchedule,
      });
    }

    return reply.send({
      idleThresholdSec: 180,
      captureProcess: true,
      captureWindowTitle: true,
      captureScreenshots: false,
      screenshotEverySec: null,
      maskedApps: defaultMasked,
      scheduleJson: null,
    });
  });

  // 3. Start Work Session (Atomic transaction prevents concurrent open sessions)
  app.post('/session/start', { preHandler: [(app as any).auth] }, async (req: any, reply) => {
    return prisma.$transaction(async (tx) => {
      const openSession = await tx.workSession.findFirst({
        where: { userId: req.user.sub, status: { not: 'CLOSED' } },
      });

      if (openSession) {
        return reply.send({
          sessionId: openSession.id,
          status: openSession.status,
          startAt: openSession.startAt,
        });
      }

      const created = await tx.workSession.create({
        data: {
          userId: req.user.sub,
          deviceId: req.user.dev,
          startAt: new Date(),
          status: 'ACTIVE',
        },
      });

      return reply.send({
        sessionId: created.id,
        status: created.status,
        startAt: created.startAt,
      });
    });
  });

  // 4. End Work Session
  app.post('/session/end', { preHandler: [(app as any).auth] }, async (req: any, reply) => {
    const parseResult = SessionEndSchema.safeParse(req.body ?? {});
    const reason = parseResult.success ? parseResult.data.reason : 'USER';

    await prisma.workSession.updateMany({
      where: { userId: req.user.sub, status: { not: 'CLOSED' } },
      data: {
        status: 'CLOSED',
        endAt: new Date(),
        closeReason: reason,
      },
    });

    return reply.send({ ok: true, closedAt: new Date().toISOString() });
  });

  // 5. Batch Event Ingestion (Universal DB idempotency via client UUIDs + clock drift correction)
  app.post('/events/batch', { preHandler: [(app as any).auth] }, async (req: any, reply) => {
    const parseResult = EventBatchSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_batch_payload', details: parseResult.error.format() });
    }

    const body = parseResult.data;
    // Calculate clock drift between client and server
    const clientTimestamp = new Date(body.clientNow).getTime();
    const serverTimestamp = Date.now();
    const clockOffsetMs = Math.round(serverTimestamp - clientTimestamp);

    // Validate that all referenced session IDs belong to this authenticated user
    const sessionIds = [...new Set(body.events.map((e) => e.sessionId))];
    const ownedSessions = await prisma.workSession.findMany({
      where: {
        id: { in: sessionIds },
        userId: req.user.sub,
      },
      select: { id: true },
    });

    if (ownedSessions.length !== sessionIds.length) {
      return reply.code(403).send({ error: 'unauthorized_session_access' });
    }

    // Resolve device ID reliably
    let devId = req.user.dev;
    if (!devId && req.user.sub) {
      const dev = await prisma.device.findFirst({
        where: { userId: req.user.sub, status: 'ACTIVE' },
        orderBy: { lastSeenAt: 'desc' },
      });
      if (dev) devId = dev.id;
    }

    // Deduplicate against existing events (universal for PostgreSQL and SQLite)
    const incomingIds = body.events.map((e) => e.id);
    const existingEvents = await prisma.activityEvent.findMany({
      where: { id: { in: incomingIds } },
      select: { id: true },
    });
    const existingSet = new Set(existingEvents.map((e) => e.id));
    const newEvents = body.events.filter((e) => !existingSet.has(e.id));

    let insertedCount = 0;
    if (newEvents.length > 0) {
      const insertResult = await prisma.activityEvent.createMany({
        data: newEvents.map((e) => ({
          id: e.id,
          sessionId: e.sessionId,
          deviceId: devId || undefined,
          type: e.type,
          occurredAt: new Date(new Date(e.occurredAt).getTime() + clockOffsetMs),
          clockOffsetMs,
          payload: e.payload ? (typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)) : undefined,
        })),
      });
      insertedCount = insertResult.count;
    }

    // Update device lastSeenAt safely
    if (devId) {
      await prisma.device.update({
        where: { id: devId },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});
    }

    return reply.send({
      accepted: body.events.map((e) => e.id),
      insertedCount,
    });
  });

  // 6. Fast Lightweight Heartbeat
  app.post('/heartbeat', { preHandler: [(app as any).auth] }, async (req: any, reply) => {
    let devId = req.user.dev;
    if (!devId && req.user.sub) {
      const dev = await prisma.device.findFirst({
        where: { userId: req.user.sub, status: 'ACTIVE' },
        orderBy: { lastSeenAt: 'desc' },
      });
      if (dev) devId = dev.id;
    }
    if (devId) {
      await prisma.device.update({
        where: { id: devId },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});
    }

    return reply.send({
      ok: true,
      serverTime: new Date().toISOString(),
    });
  });
}
