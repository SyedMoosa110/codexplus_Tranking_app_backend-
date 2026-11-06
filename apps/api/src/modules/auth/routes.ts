import { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { prisma } from '../../lib/prisma';
import { sha256, newToken } from '../../lib/crypto';
import { env } from '../../config/env';
import { AdminLoginSchema } from '@platform/contracts';

export async function authRoutes(app: FastifyInstance) {
  // Web Portal Login (Admin, Manager, Employee)
  app.post('/login', {
    config: {
      rateLimit: { max: 15, timeWindow: '1 minute' },
    },
  }, async (req, reply) => {
    const parseResult = AdminLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parseResult.error.format() });
    }

    const { email, password } = parseResult.data;
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
      include: { organization: true },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const accessToken = app.jwt.sign(
      {
        sub: user.id,
        org: user.organizationId,
        role: user.role,
        typ: 'web',
      },
      { expiresIn: env.ACCESS_TTL_SEC }
    );

    const refreshTokenPlain = newToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshTokenPlain),
        expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86400000),
      },
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
      accessToken,
      refreshToken: refreshTokenPlain,
    });
  });

  // Token Refresh with Rotation & Reuse Detection
  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = (req.body as { refreshToken?: string }) || {};
    if (!refreshToken) {
      return reply.code(400).send({ error: 'missing_refresh_token' });
    }

    const hash = sha256(refreshToken);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      if (storedToken && storedToken.isRevoked) {
        // Reuse detected! Compromised family! Invalidate all tokens for this user.
        await prisma.refreshToken.updateMany({
          where: { userId: storedToken.userId },
          data: { isRevoked: true },
        });
      }
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }

    // Invalidate current token and rotate
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    const newRefreshPlain = newToken();
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.userId,
        deviceId: storedToken.deviceId,
        familyId: storedToken.familyId,
        tokenHash: sha256(newRefreshPlain),
        expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86400000),
      },
    });

    const newAccessToken = app.jwt.sign(
      {
        sub: storedToken.user.id,
        org: storedToken.user.organizationId,
        dev: storedToken.deviceId || undefined,
        role: storedToken.user.role,
        typ: storedToken.deviceId ? 'agent' : 'web',
      },
      { expiresIn: env.ACCESS_TTL_SEC }
    );

    return reply.send({
      accessToken: newAccessToken,
      refreshToken: newRefreshPlain,
    });
  });
}
