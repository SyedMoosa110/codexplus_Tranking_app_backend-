import { z } from 'zod';

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  mfaCode: z.string().length(6).optional(),
}).strict();

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

export const TimelineQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

export const CreateEmployeeSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
  teamId: z.string().uuid().optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
}).strict();

export const UpdateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
  teamId: z.string().uuid().optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

export const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  title: z.string().min(2).max(200),
  dueDate: z.string().datetime().optional().nullable(),
}).strict();

export const CreateWorkLogSchema = z.object({
  taskId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
}).strict();

export const TimeCorrectionRequestSchema = z.object({
  sessionId: z.string().uuid(),
  requestedStartAt: z.string().datetime(),
  requestedEndAt: z.string().datetime(),
  reason: z.string().min(10).max(500),
}).strict();

export const ReviewCorrectionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(500).optional().nullable(),
}).strict();

export const UpdatePolicySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  scheduleJson: z.record(z.any()).optional(),
  idleThresholdSec: z.number().int().min(30).max(1800).optional(),
  captureProcess: z.boolean().optional(),
  captureWindowTitle: z.boolean().optional(),
  captureScreenshots: z.boolean().optional(),
  screenshotEverySec: z.number().int().min(60).optional().nullable(),
  maskedApps: z.array(z.string()).optional(),
}).strict();
