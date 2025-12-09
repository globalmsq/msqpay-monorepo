import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockchainService } from '../blockchain.service';
import { ChainsConfig } from '../../config/chains.config';

// 테스트용 ChainsConfig mock
const mockChainsConfig: ChainsConfig = {
  chains: [
    {
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      contracts: {
        gateway: '0x0000000000000000000000000000000000000000',
        forwarder: '0x0000000000000000000000000000000000000000',
      },
      tokens: {
        SUT: { address: '0xE4C687167705Abf55d709395f92e254bdF5825a2', decimals: 18 },
      },
    },
    {
      chainId: 31337,
      name: 'Hardhat',
      rpcUrl: 'http://127.0.0.1:8545',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      contracts: {
        gateway: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
        forwarder: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      },
      tokens: {
        TEST: { address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', decimals: 18 },
      },
    },
  ],
};

describe('BlockchainService - New methods for SPEC-API-001', () => {
  let service: BlockchainService;

  beforeEach(() => {
    service = new BlockchainService(mockChainsConfig);
  });

  describe('getTokenAddress', () => {
    it('should return token address for supported chain and symbol', () => {
      const address = service.getTokenAddress(80002, 'SUT');
      expect(address).toBe('0xE4C687167705Abf55d709395f92e254bdF5825a2');
    });

    it('should return TEST token address for Hardhat', () => {
      const address = service.getTokenAddress(31337, 'TEST');
      expect(address).toBe('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512');
    });

    it('should return undefined for unsupported chainId', () => {
      const address = service.getTokenAddress(1, 'SUT');
      expect(address).toBeUndefined();
    });

    it('should return undefined for unsupported token symbol', () => {
      const address = service.getTokenAddress(80002, 'ETH');
      expect(address).toBeUndefined();
    });

    it('should be case-sensitive for token symbols', () => {
      const addressLower = service.getTokenAddress(80002, 'sut');
      expect(addressLower).toBeUndefined();
    });
  });

  describe('getChainContracts', () => {
    it('should return contracts for supported chain', () => {
      const contracts = service.getChainContracts(80002);
      expect(contracts).toBeDefined();
      expect(contracts).toHaveProperty('gateway');
      expect(contracts).toHaveProperty('forwarder');
    });

    it('should return correct gateway and forwarder for Polygon Amoy', () => {
      const contracts = service.getChainContracts(80002);
      expect(contracts?.gateway).toBe('0x0000000000000000000000000000000000000000');
      expect(contracts?.forwarder).toBe('0x0000000000000000000000000000000000000000');
    });

    it('should return correct addresses for Hardhat', () => {
      const contracts = service.getChainContracts(31337);
      expect(contracts?.gateway).toBe('0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9');
      expect(contracts?.forwarder).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3');
    });

    it('should return undefined for unsupported chainId', () => {
      const contracts = service.getChainContracts(1);
      expect(contracts).toBeUndefined();
    });
  });

  describe('getDecimals', () => {
    it('should fallback to 18 when contract call fails', async () => {
      // Mock getClient to return a mock client with failing readContract
      const mockClient = {
        readContract: vi.fn().mockRejectedValue(new Error('Network error')),
      };
      vi.spyOn(service as any, 'getClient').mockReturnValue(mockClient);

      const decimals = await service.getDecimals(80002, '0xE4C687167705Abf55d709395f92e254bdF5825a2');
      expect(decimals).toBe(18);
    });

    it('should return actual decimals when contract call succeeds', async () => {
      // Mock getClient to return a mock client with successful readContract
      const mockClient = {
        readContract: vi.fn().mockResolvedValue(6),
      };
      vi.spyOn(service as any, 'getClient').mockReturnValue(mockClient);

      const decimals = await service.getDecimals(80002, '0xE4C687167705Abf55d709395f92e254bdF5825a2');
      expect(decimals).toBe(6);
    });

    it('should log warning when falling back to 18 decimals', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockClient = {
        readContract: vi.fn().mockRejectedValue(new Error('Network error')),
      };
      vi.spyOn(service as any, 'getClient').mockReturnValue(mockClient);

      await service.getDecimals(80002, '0xE4C687167705Abf55d709395f92e254bdF5825a2');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get decimals')
      );
      warnSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('should handle missing chainId gracefully', () => {
      const result = service.getChainContracts(999);
      expect(result).toBeUndefined();
    });

    it('should handle missing token symbol gracefully', () => {
      const result = service.getTokenAddress(80002, 'UNKNOWN');
      expect(result).toBeUndefined();
    });
  });
});
