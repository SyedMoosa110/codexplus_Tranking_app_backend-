import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { CreateTaskSchema, CreateWorkLogSchema } from '@platform/contracts';

export async function taskRoutes(app: FastifyInstance) {
  // Guard
  const authGuard = async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };

  // 1. List Projects & Tasks
  app.get('/projects', { preHandler: [authGuard] }, async (req: any, reply) => {
    const projects = await prisma.project.findMany({
      where: { organizationId: req.user.org },
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, fullName: true, email: true } },
            logs: { take: 5, orderBy: { startAt: 'desc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ projects });
  });

  // 2. Create Task (Manager or Admin)
  app.post('/tasks', { preHandler: [authGuard] }, async (req: any, reply) => {
    const parseResult = CreateTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_task_payload', details: parseResult.error.format() });
    }

    const task = await prisma.task.create({
      data: {
        projectId: parseResult.data.projectId,
        assigneeId: parseResult.data.assigneeId,
        title: parseResult.data.title,
        dueDate: parseResult.data.dueDate ? new Date(parseResult.data.dueDate) : null,
      },
    });

    return reply.code(201).send(task);
  });

  // 3. Employee Submits Work Log (The "Work Layer" delivering auditable proof of work)
  app.post('/work-logs', { preHandler: [authGuard] }, async (req: any, reply) => {
    const parseResult = CreateWorkLogSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_worklog_payload', details: parseResult.error.format() });
    }

    const log = await prisma.workLog.create({
      data: {
        taskId: parseResult.data.taskId,
        userId: req.user.sub,
        startAt: new Date(parseResult.data.startAt),
        endAt: parseResult.data.endAt ? new Date(parseResult.data.endAt) : null,
        note: parseResult.data.note ?? null,
      },
    });

    return reply.code(201).send(log);
  });
}
