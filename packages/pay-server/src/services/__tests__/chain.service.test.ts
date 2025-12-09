import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';

// Mock the client module
vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

import { ChainService } from '../chain.service';

describe('ChainService', () => {
  let chainService: ChainService;

  beforeEach(() => {
    resetPrismaMocks();
    chainService = new ChainService(mockPrisma);
  });

  it('should create a new chain', async () => {
    const chainData = {
      network_id: 99101,
      name: 'TestEthereum',
      rpc_url: 'https://eth-mainnet.g.alchemy.com/v2/demo',
      is_testnet: false,
    };

    const mockResult = {
      id: 1,
      ...chainData,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.chain.create.mockResolvedValue(mockResult);

    const result = await chainService.create(chainData);

    expect(result).toBeDefined();
    expect(result.network_id).toBe(99101);
    expect(result.name).toBe('TestEthereum');
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
    expect(mockPrisma.chain.create).toHaveBeenCalledOnce();
  });

  it('should find chain by network ID', async () => {
    const mockChain = {
      id: 2,
      network_id: 99102,
      name: 'TestHardhat',
      rpc_url: 'http://localhost:8545',
      is_testnet: true,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.chain.findFirst.mockResolvedValue(mockChain);

    const result = await chainService.findByNetworkId(99102);

    expect(result).toBeDefined();
    expect(result?.network_id).toBe(99102);
    expect(result?.name).toBe('TestHardhat');
    expect(mockPrisma.chain.findFirst).toHaveBeenCalledOnce();
  });

  it('should find chain by ID', async () => {
    const mockChain = {
      id: 3,
      network_id: 99103,
      name: 'TestPolygon',
      rpc_url: 'https://polygon-rpc.com',
      is_testnet: false,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.chain.findFirst.mockResolvedValue(mockChain);

    const result = await chainService.findById(3);

    expect(result).toBeDefined();
    expect(result?.id).toBe(3);
    expect(result?.name).toBe('TestPolygon');
    expect(mockPrisma.chain.findFirst).toHaveBeenCalledOnce();
  });

  it('should find all enabled chains', async () => {
    const mockChains = [
      {
        id: 4,
        network_id: 99104,
        name: 'TestChain3',
        rpc_url: 'https://eth-mainnet.g.alchemy.com/v2/demo',
        is_testnet: false,
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
      {
        id: 5,
        network_id: 99105,
        name: 'TestChain4',
        rpc_url: 'https://polygon-rpc.com',
        is_testnet: false,
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    mockPrisma.chain.findMany.mockResolvedValue(mockChains);

    const result = await chainService.findAll();

    expect(result.length).toBe(2);
    expect(mockPrisma.chain.findMany).toHaveBeenCalledOnce();
  });

  it('should update chain information', async () => {
    const mockUpdated = {
      id: 6,
      network_id: 99106,
      name: 'TestArbitrum One',
      rpc_url: 'https://arbitrum-one.publicrpc.com',
      is_testnet: false,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.chain.update.mockResolvedValue(mockUpdated);

    const updated = await chainService.update(6, {
      name: 'TestArbitrum One',
      rpc_url: 'https://arbitrum-one.publicrpc.com',
    });

    expect(updated.name).toBe('TestArbitrum One');
    expect(updated.rpc_url).toBe('https://arbitrum-one.publicrpc.com');
    expect(mockPrisma.chain.update).toHaveBeenCalledOnce();
  });

  it('should soft delete chain', async () => {
    const mockDeleted = {
      id: 7,
      network_id: 99107,
      name: 'TestOptimism',
      rpc_url: 'https://mainnet.optimism.io',
      is_testnet: false,
      is_enabled: true,
      is_deleted: true,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: new Date(),
    };

    mockPrisma.chain.update.mockResolvedValue(mockDeleted);
    mockPrisma.chain.findFirst.mockResolvedValue(null);

    const deleted = await chainService.softDelete(7);

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();

    // Should not find deleted chain
    const found = await chainService.findById(7);
    expect(found).toBeNull();
  });

  it('should return null for non-existent chain', async () => {
    mockPrisma.chain.findFirst.mockResolvedValue(null);

    const result = await chainService.findByNetworkId(99999);
    expect(result).toBeNull();
  });

  it('should exclude deleted chains from findAll', async () => {
    const mockChains = [
      {
        id: 8,
        network_id: 99108,
        name: 'TestChain7',
        rpc_url: 'https://eth-mainnet.g.alchemy.com/v2/demo',
        is_testnet: false,
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    // Only non-deleted chains should be returned
    mockPrisma.chain.findMany.mockResolvedValue(mockChains);

    const result = await chainService.findAll();

    expect(result.length).toBe(1);
    expect(result[0].id).toBe(8);
    expect(mockPrisma.chain.findMany).toHaveBeenCalledOnce();
  });
});
