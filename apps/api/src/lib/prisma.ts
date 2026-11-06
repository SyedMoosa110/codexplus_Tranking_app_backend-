import { PrismaClient } from '@prisma/client';
import path from 'path';

let dbUrl = process.env.DATABASE_URL || 'file:./prisma/test.db';
if (dbUrl.startsWith('file:')) {
  const rawPath = dbUrl.replace(/^file:/, '');
  if (!path.isAbsolute(rawPath)) {
    const resolved = path.resolve(__dirname, '../../../../prisma/test.db');
    dbUrl = `file:${resolved}`;
  }
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
