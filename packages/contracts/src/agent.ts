import { z } from 'zod';

export const AgentLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  deviceUuid: z.string().uuid(),
  hostname: z.string().max(100),
  osVersion: z.string().max(100).optional(),
  agentVersion: z.string().max(20),
}).strict();

export type AgentLoginInput = z.infer<typeof AgentLoginSchema>;

export const EventItemSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: z.enum(['HEARTBEAT', 'IDLE_START', 'IDLE_END', 'APP_CHANGE', 'PAUSE', 'RESUME']),
  occurredAt: z.string().datetime(),
  payload: z.record(z.any()).optional().nullable(),
});

export type EventItem = z.infer<typeof EventItemSchema>;

export const EventBatchSchema = z.object({
  clientNow: z.string().datetime(),
  events: z.array(EventItemSchema).min(1).max(500),
}).strict();

export type EventBatchInput = z.infer<typeof EventBatchSchema>;

export const SessionStartSchema = z.object({
  deviceUuid: z.string().uuid().optional(),
}).strict();

export const SessionEndSchema = z.object({
  reason: z.enum(['USER', 'LOGOFF', 'SHUTDOWN', 'SLEEP', 'IDLE_TIMEOUT', 'ADMIN_FORCE']).default('USER'),
}).strict();

export const HeartbeatResponseSchema = z.object({
  ok: z.boolean(),
  serverTime: z.string().datetime(),
});

export const AgentLoginResponseSchema = z.object({
  access: z.string(),
  refresh: z.string(),
  userName: z.string(),
  deviceId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

export type AgentLoginResponse = z.infer<typeof AgentLoginResponseSchema>;

export const AgentPolicySchema = z.object({
  idleThresholdSec: z.number().int().min(30).default(180),
  captureProcess: z.boolean().default(true),
  captureWindowTitle: z.boolean().default(false),
  captureScreenshots: z.boolean().default(false),
  screenshotEverySec: z.number().int().optional().nullable(),
  maskedApps: z.array(z.string()).default(['1password', 'bitwarden', 'keepass', 'whatsapp', 'telegram']),
  scheduleJson: z.record(z.any()).optional().nullable(),
});

export type AgentPolicy = z.infer<typeof AgentPolicySchema>;
