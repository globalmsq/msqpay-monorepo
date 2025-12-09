import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChainService } from '../chain.service';
import { getPrismaClient, disconnectPrisma } from '../../db/client';

describe('ChainService', () => {
  let chainService: ChainService;
  let prisma: ReturnType<typeof getPrismaClient>;
  const TEST_NETWORK_IDS = [99101, 99102, 99103, 99104, 99105, 99106, 99107, 99108]; // Unique network IDs for this test suite

  beforeAll(async () => {
    prisma = getPrismaClient();
    chainService = new ChainService(prisma);

    // Clean up only test-specific data
    await prisma.chain.deleteMany({ where: { network_id: { in: TEST_NETWORK_IDS } } });
  });

  afterAll(async () => {
    // Clean up only test-specific data
    await prisma.chain.deleteMany({ where: { network_id: { in: TEST_NETWORK_IDS } } });
    await disconnectPrisma();
  });

  it('should create a new chain', async () => {
    const chainData = {
      network_id: TEST_NETWORK_IDS[0],
      name: 'TestEthereum',
      rpc_url: 'https://eth-mainnet.g.alchemy.com/v2/demo',
      is_testnet: false,
    };

    const result = await chainService.create(chainData);

    expect(result).toBeDefined();
    expect(result.network_id).toBe(TEST_NETWORK_IDS[0]);
    expect(result.name).toBe('TestEthereum');
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
  });

  it('should find chain by network ID', async () => {
    const chainData = {
      network_id: TEST_NETWORK_IDS[1],
      name: 'TestHardhat',
      rpc_url: 'http://localhost:8545',
      is_testnet: true,
    };

    await chainService.create(chainData);

    const result = await chainService.findByNetworkId(TEST_NETWORK_IDS[1]);

    expect(result).toBeDefined();
    expect(result?.network_id).toBe(TEST_NETWORK_IDS[1]);
    expect(result?.name).toBe('TestHardhat');
  });

  it('should find chain by ID', async () => {
    const chainData = {
      network_id: TEST_NETWORK_IDS[2],
      name: 'TestPolygon',
      rpc_url: 'https://polygon-rpc.com',
      is_testnet: false,
    };

    const created = await chainService.create(chainData);
    const result = await chainService.findById(created.id);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
    expect(result?.name).toBe('TestPolygon');
  });

  it('should find all enabled chains', async () => {
    // Clean up test-specific data first
    await prisma.chain.deleteMany({ where: { network_id: { in: [TEST_NETWORK_IDS[3], TEST_NETWORK_IDS[4]] } } });

    await chainService.create({
      network_id: TEST_NETWORK_IDS[3],
      name: 'TestChain3',
      rpc_url: 'https://eth-mainnet.g.alchemy.com/v2/demo',
      is_testnet: false,
    });

    await chainService.create({
      network_id: TEST_NETWORK_IDS[4],
      name: 'TestChain4',
      rpc_url: 'https://polygon-rpc.com',
      is_testnet: false,
    });

    const result = await chainService.findAll();

    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should update chain information', async () => {
    const chainData = {
      network_id: TEST_NETWORK_IDS[5],
      name: 'TestArbitrum',
      rpc_url: 'https://arb1.arbitrum.io/rpc',
      is_testnet: false,
    };

    const created = await chainService.create(chainData);

    const updated = await chainService.update(created.id, {
      name: 'TestArbitrum One',
      rpc_url: 'https://arbitrum-one.publicrpc.com',
    });

    expect(updated.name).toBe('TestArbitrum One');
    expect(updated.rpc_url).toBe('https://arbitrum-one.publicrpc.com');
  });

  it('should soft delete chain', async () => {
    const chainData = {
      network_id: TEST_NETWORK_IDS[6],
      name: 'TestOptimism',
      rpc_url: 'https://mainnet.optimism.io',
      is_testnet: false,
    };

    const created = await chainService.create(chainData);

    const deleted = await chainService.softDelete(created.id);

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();

    // Should not find deleted chain
    const found = await chainService.findById(created.id);
    expect(found).toBeNull();
  });

  it('should return null for non-existent chain', async () => {
    const result = await chainService.findByNetworkId(99999);
    expect(result).toBeNull();
  });

  it('should exclude deleted chains from findAll', async () => {
    // Clean up test-specific data first
    await prisma.chain.deleteMany({ where: { network_id: { in: [TEST_NETWORK_IDS[7], 99109] } } });

    const chain1 = await chainService.create({
      network_id: TEST_NETWORK_IDS[7],
      name: 'TestChain7',
      rpc_url: 'https://eth-mainnet.g.alchemy.com/v2/demo',
      is_testnet: false,
    });

    const chain2 = await chainService.create({
      network_id: 99109,
      name: 'TestChain8',
      rpc_url: 'https://test.example.com',
      is_testnet: true,
    });

    await chainService.softDelete(chain2.id);

    const result = await chainService.findAll();

    const chainIds = result.map((c) => c.id);
    expect(chainIds).toContain(chain1.id);
    expect(chainIds).not.toContain(chain2.id);
  });
});
