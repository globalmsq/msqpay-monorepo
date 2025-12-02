import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NonceService } from '../nonce.service';

describe('NonceService', () => {
  const forwarderAddress = '0x1234567890123456789012345678901234567890' as const;
  const rpcUrl = 'http://localhost:8545';

  let nonceService: NonceService;

  beforeEach(() => {
    nonceService = new NonceService(rpcUrl, forwarderAddress);
  });

  describe('initialization', () => {
    it('should initialize with valid config', () => {
      expect(nonceService).toBeDefined();
    });

    it('should throw error with missing RPC URL', () => {
      expect(() => new NonceService('', forwarderAddress)).toThrow('RPC URL is required');
    });

    it('should throw error with invalid forwarder address', () => {
      expect(() => new NonceService(rpcUrl, 'invalid' as any)).toThrow('Invalid forwarder address');
    });

    it('should throw error with invalid address format', () => {
      expect(() => new NonceService(rpcUrl, '0x123' as any)).toThrow('Invalid forwarder address');
    });
  });

  describe('getNonce', () => {
    it('should throw error with invalid address format', async () => {
      await expect(nonceService.getNonce('invalid' as any)).rejects.toThrow(
        'Invalid address format'
      );
    });

    it('should throw error with short address', async () => {
      await expect(nonceService.getNonce('0x123' as any)).rejects.toThrow('Invalid address format');
    });

    it('should throw error with address not starting with 0x', async () => {
      await expect(
        nonceService.getNonce('1234567890123456789012345678901234567890' as any)
      ).rejects.toThrow('Invalid address format');
    });

    it('should throw error when contract not found', async () => {
      await expect(
        nonceService.getNonce('0x0000000000000000000000000000000000000001')
      ).rejects.toThrow();
    });
  });

  describe('getNonceBatch', () => {
    it('should throw error with empty array', async () => {
      await expect(nonceService.getNonceBatch([])).rejects.toThrow(
        'Addresses must be a non-empty array'
      );
    });

    it('should throw error with non-array input', async () => {
      await expect(nonceService.getNonceBatch(null as any)).rejects.toThrow(
        'Addresses must be a non-empty array'
      );
    });

    it('should return error for invalid addresses in batch', async () => {
      const addresses = ['0x0000000000000000000000000000000000000001' as const];
      await expect(nonceService.getNonceBatch(addresses)).rejects.toThrow();
    });
  });
});
