import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';

// Mock the client module
vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

import { TokenService } from '../token.service';

describe('TokenService', () => {
  let tokenService: TokenService;
  const chainId = 'test-chain-id';

  beforeEach(() => {
    resetPrismaMocks();
    tokenService = new TokenService(mockPrisma);
  });

  it('should create a new token', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    };

    const mockResult = {
      id: 'token-id-1',
      ...tokenData,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.token.create.mockResolvedValue(mockResult);

    const result = await tokenService.create(tokenData);

    expect(result).toBeDefined();
    expect(result.chain_id).toBe(chainId);
    expect(result.symbol).toBe('USDC');
    expect(result.decimals).toBe(6);
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
    expect(mockPrisma.token.create).toHaveBeenCalledOnce();
  });

  it('should find token by address on chain', async () => {
    const mockToken = {
      id: 'token-id-2',
      chain_id: chainId,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      decimals: 18,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.token.findFirst.mockResolvedValue(mockToken);

    const result = await tokenService.findByAddress(chainId, '0x6B175474E89094C44Da98b954EedeAC495271d0F');

    expect(result).toBeDefined();
    expect(result?.symbol).toBe('DAI');
    expect(result?.decimals).toBe(18);
    expect(mockPrisma.token.findFirst).toHaveBeenCalledOnce();
  });

  it('should find token by ID', async () => {
    const mockToken = {
      id: 'token-id-3',
      chain_id: chainId,
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.token.findFirst.mockResolvedValue(mockToken);

    const result = await tokenService.findById('token-id-3');

    expect(result).toBeDefined();
    expect(result?.id).toBe('token-id-3');
    expect(result?.symbol).toBe('USDT');
    expect(mockPrisma.token.findFirst).toHaveBeenCalledOnce();
  });

  it('should find all tokens on chain', async () => {
    const mockTokens = [
      {
        id: 'token-id-4',
        chain_id: chainId,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB49',
        symbol: 'USDC2',
        decimals: 6,
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
      {
        id: 'token-id-5',
        chain_id: chainId,
        address: '0x6B175474E89094C44Da98b954EedeAC495271d1F',
        symbol: 'DAI2',
        decimals: 18,
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    mockPrisma.token.findMany.mockResolvedValue(mockTokens);

    const result = await tokenService.findAllOnChain(chainId);

    expect(result.length).toBe(2);
    expect(mockPrisma.token.findMany).toHaveBeenCalledOnce();
  });

  it('should update token information', async () => {
    const mockUpdated = {
      id: 'token-id-6',
      chain_id: chainId,
      address: '0x2260fac5e5542a773aa44fbcff0b92d3d107d3d9',
      symbol: 'Wrapped BTC',
      decimals: 8,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.token.update.mockResolvedValue(mockUpdated);

    const updated = await tokenService.update('token-id-6', {
      symbol: 'Wrapped BTC',
    });

    expect(updated.symbol).toBe('Wrapped BTC');
    expect(mockPrisma.token.update).toHaveBeenCalledOnce();
  });

  it('should soft delete token', async () => {
    const mockDeleted = {
      id: 'token-id-7',
      chain_id: chainId,
      address: '0xC02aaA39b223FE8D0A0e8e4F27ead9083C756Cc2',
      symbol: 'WETH',
      decimals: 18,
      is_enabled: true,
      is_deleted: true,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: new Date(),
    };

    mockPrisma.token.update.mockResolvedValue(mockDeleted);

    const deleted = await tokenService.softDelete('token-id-7');

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();
    expect(mockPrisma.token.update).toHaveBeenCalledOnce();
  });

  it('should return null for non-existent token', async () => {
    mockPrisma.token.findFirst.mockResolvedValue(null);

    const result = await tokenService.findByAddress(chainId, '0x0000000000000000000000000000000000000000');
    expect(result).toBeNull();
  });

  it('should enforce unique constraint on chain_id and address', async () => {
    const error = new Error('Unique constraint failed on the fields: (`chain_id`, `address`)');
    mockPrisma.token.create.mockRejectedValue(error);

    await expect(
      tokenService.create({
        chain_id: chainId,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
      })
    ).rejects.toThrow();
  });
});
