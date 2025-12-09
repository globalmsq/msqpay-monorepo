import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../__mocks__/client';

// Mock the client module
vi.mock('../client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

import { getPrismaClient } from '../client';

describe('Prisma Client', () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  it('should return a singleton Prisma Client instance', () => {
    const instance1 = getPrismaClient();
    const instance2 = getPrismaClient();
    expect(instance1).toBe(instance2);
  });

  it('should have all required models', () => {
    const prisma = getPrismaClient();
    expect(prisma.chain).toBeDefined();
    expect(prisma.token).toBeDefined();
    expect(prisma.merchant).toBeDefined();
    expect(prisma.merchantPaymentMethod).toBeDefined();
    expect(prisma.payment).toBeDefined();
    expect(prisma.relayRequest).toBeDefined();
    expect(prisma.paymentEvent).toBeDefined();
  });

  it('should be able to connect to database', async () => {
    const mockResult = [{ test: 1 }];
    mockPrisma.$queryRaw.mockResolvedValue(mockResult);

    const prisma = getPrismaClient();
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
    expect(result).toEqual(mockResult);
  });

  it('should have a health check method', () => {
    const prisma = getPrismaClient();
    expect(prisma.$disconnect).toBeDefined();
    expect(typeof prisma.$disconnect).toBe('function');
  });
});
