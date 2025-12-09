import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TokenService } from '../token.service';
import { ChainService } from '../chain.service';
import { getPrismaClient, disconnectPrisma } from '../../db/client';

describe('TokenService', () => {
  let tokenService: TokenService;
  let chainService: ChainService;
  let prisma: ReturnType<typeof getPrismaClient>;
  let chainId: string;
  const TEST_NETWORK_ID = 99004; // Unique network ID for this test suite

  beforeAll(async () => {
    prisma = getPrismaClient();
    tokenService = new TokenService(prisma);
    chainService = new ChainService(prisma);

    // Clean up only test-specific data - first delete existing chain if any
    const existingChain = await prisma.chain.findFirst({ where: { network_id: TEST_NETWORK_ID } });
    if (existingChain) {
      await prisma.token.deleteMany({ where: { chain_id: existingChain.id } });
      await prisma.chain.delete({ where: { id: existingChain.id } });
    }

    // Create test chain
    const chain = await chainService.create({
      network_id: TEST_NETWORK_ID,
      name: 'TokenTestChain',
      rpc_url: 'http://localhost:8545',
      is_testnet: true,
    });
    chainId = chain.id;
  });

  afterAll(async () => {
    // Clean up only test-specific data
    await prisma.token.deleteMany({ where: { chain_id: chainId } });
    await prisma.chain.deleteMany({ where: { network_id: TEST_NETWORK_ID } });
    await disconnectPrisma();
  });

  it('should create a new token', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    };

    const result = await tokenService.create(tokenData);

    expect(result).toBeDefined();
    expect(result.chain_id).toBe(chainId);
    expect(result.symbol).toBe('USDC');
    expect(result.decimals).toBe(6);
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
  });

  it('should find token by address on chain', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      symbol: 'DAI',
      decimals: 18,
    };

    await tokenService.create(tokenData);

    const result = await tokenService.findByAddress(
      chainId,
      '0x6B175474E89094C44Da98b954EedeAC495271d0F'
    );

    expect(result).toBeDefined();
    expect(result?.symbol).toBe('DAI');
    expect(result?.decimals).toBe(18);
  });

  it('should find token by ID', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      decimals: 6,
    };

    const created = await tokenService.create(tokenData);
    const result = await tokenService.findById(created.id);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
    expect(result?.symbol).toBe('USDT');
  });

  it('should find all tokens on chain', async () => {
    await prisma.token.deleteMany({ where: { chain_id: chainId } });

    await tokenService.create({
      chain_id: chainId,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB49',
      symbol: 'USDC2',
      decimals: 6,
    });

    await tokenService.create({
      chain_id: chainId,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d1F',
      symbol: 'DAI2',
      decimals: 18,
    });

    const result = await tokenService.findAllOnChain(chainId);

    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should update token information', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0x2260fac5e5542a773aa44fbcff0b92d3d107d3d9',
      symbol: 'WBTC',
      decimals: 8,
    };

    const created = await tokenService.create(tokenData);

    const updated = await tokenService.update(created.id, {
      symbol: 'Wrapped BTC',
    });

    expect(updated.symbol).toBe('Wrapped BTC');
  });

  it('should soft delete token', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0xC02aaA39b223FE8D0A0e8e4F27ead9083C756Cc2',
      symbol: 'WETH',
      decimals: 18,
    };

    const created = await tokenService.create(tokenData);

    const deleted = await tokenService.softDelete(created.id);

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();
  });

  it('should return null for non-existent token', async () => {
    const result = await tokenService.findByAddress(chainId, '0x0000000000000000000000000000000000000000');
    expect(result).toBeNull();
  });

  it('should enforce unique constraint on chain_id and address', async () => {
    const tokenData = {
      chain_id: chainId,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    };

    // First creation should succeed
    await tokenService.create(tokenData);

    // Second creation with same chain_id and address should fail
    try {
      await tokenService.create(tokenData);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
