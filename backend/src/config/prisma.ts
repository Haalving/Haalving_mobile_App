import { PrismaClient } from '@prisma/client';

import { isDev, isTest } from './env.js';

/**
 * One Prisma client for the process.
 *
 * The global cache is not a nicety in development: `tsx watch` re-imports the
 * module on every save, and a fresh client per reload exhausts Postgres's
 * connection pool within a few edits.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isTest ? ['warn', 'error'] : isDev ? ['warn', 'error'] : ['error'],
  });

if (isDev) globalForPrisma.prisma = prisma;

export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
