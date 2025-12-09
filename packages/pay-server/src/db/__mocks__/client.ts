/**
 * Prisma Client Mock for Unit Tests
 *
 * This module provides a mock Prisma client for unit testing.
 * It uses vitest-mock-extended to create type-safe deep mocks.
 */

import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended';

// Create a deep mock of PrismaClient with full type safety
export const mockPrisma: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

/**
 * Reset all mock implementations and call history.
 * Call this in beforeEach() to ensure test isolation.
 */
export function resetPrismaMocks(): void {
  mockReset(mockPrisma);
}

/**
 * Mock implementation of getPrismaClient that returns the mock instance.
 * This is used by vi.mock() to replace the real implementation.
 */
export function getMockPrismaClient(): DeepMockProxy<PrismaClient> {
  return mockPrisma;
}
