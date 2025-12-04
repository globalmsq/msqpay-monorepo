import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPrismaClient } from '../client';

describe('Prisma Client', () => {
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should return a singleton Prisma Client instance', () => {
    const instance1 = getPrismaClient();
    const instance2 = getPrismaClient();
    expect(instance1).toBe(instance2);
  });

  it('should have all required models', () => {
    expect(prisma.chain).toBeDefined();
    expect(prisma.token).toBeDefined();
    expect(prisma.merchant).toBeDefined();
    expect(prisma.merchantPaymentMethod).toBeDefined();
    expect(prisma.payment).toBeDefined();
    expect(prisma.relayRequest).toBeDefined();
    expect(prisma.paymentEvent).toBeDefined();
  });

  it('should be able to connect to database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
  });

  it('should have a health check method', async () => {
    expect(prisma.$disconnect).toBeDefined();
    expect(typeof prisma.$disconnect).toBe('function');
  });
});
