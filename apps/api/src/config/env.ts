import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load root or local .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  ACCESS_TTL_SEC: z.coerce.number().default(900), // 15 min
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  HEARTBEAT_GAP_THRESHOLD_SEC: z.coerce.number().default(300), // 5 min
});

export const env = envSchema.parse(process.env);
