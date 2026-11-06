import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { env } from './config/env';
import { authRoutes } from './modules/auth/routes';
import { agentRoutes } from './modules/agent/routes';
import { adminRoutes } from './modules/admin/routes';
import { taskRoutes } from './modules/tasks/routes';

export async function buildServer() {
  const app = Fastify({
    logger: env.NODE_ENV === 'development' ? {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : true,
    bodyLimit: 1_000_000, // 1MB payload limit protects against memory bloat / DoS
  });

  // Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // CORS Configuration
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Rate Limiting (Protects agent and auth endpoints)
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  // JWT Plugin
  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // Global Auth Decorator for Route Guards
  app.decorate('auth', async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Token is missing or expired' });
    }
  });

  // Healthcheck endpoint
  app.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  // Register API Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(agentRoutes, { prefix: '/api/v1/agent' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(taskRoutes, { prefix: '/api/v1/tasks' });

  return app;
}

// Start Server when invoked directly
if (require.main === module || process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  buildServer()
    .then((server) => {
      server.listen({ port: env.PORT, host: '0.0.0.0' }, (err, address) => {
        if (err) {
          server.log.error(err);
          process.exit(1);
        }
        server.log.info(`🚀 Enterprise Time Tracking API running on ${address}`);
      });
    })
    .catch((err) => {
      console.error('Fatal bootstrap error:', err);
      process.exit(1);
    });
}
