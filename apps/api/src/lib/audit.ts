import { prisma } from './prisma';

interface LogAuditParams {
  organizationId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  ip?: string;
  metadata?: any;
}

export async function logAuditEvent(params: LogAuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        ip: params.ip ?? null,
        metadata: params.metadata ? (typeof params.metadata === 'string' ? params.metadata : JSON.stringify(params.metadata)) : undefined,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
