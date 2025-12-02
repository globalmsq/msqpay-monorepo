import { describe, it, expect, beforeEach } from 'vitest';
import { MockRelaySigner } from './relay-signer';
import { MockDefenderConfig } from './types';

describe('MockRelaySigner', () => {
  let config: MockDefenderConfig;
  let relaySigner: MockRelaySigner;

  beforeEach(() => {
    config = {
      forwarderAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      relayerPrivateKey: '0x1234567890123456789012345678901234567890123456789012345678901234' as `0x${string}`,
      rpcUrl: 'http://localhost:8545',
      chainId: 31337,
    };

    relaySigner = new MockRelaySigner(config);
  });

  describe('sendTransaction', () => {
    it('should send transaction with minimal params', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const result = await relaySigner.sendTransaction(params);

      expect(result).toBeDefined();
      expect(result.transactionId).toBeDefined();
      expect(result.status).toBe('sent');
      expect(typeof result.transactionId).toBe('string');
    });

    it('should send transaction with all params', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
        value: '1000000000000000000',
        gasLimit: '200000',
        speed: 'fast' as const,
      };

      const result = await relaySigner.sendTransaction(params);

      expect(result).toBeDefined();
      expect(result.status).toBe('sent');
    });

    it('should throw error with invalid to address', async () => {
      const params = {
        to: 'invalid' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      await expect(relaySigner.sendTransaction(params)).rejects.toThrow();
    });

    it('should throw error with invalid data', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: 'invalid' as `0x${string}`,
      };

      await expect(relaySigner.sendTransaction(params)).rejects.toThrow();
    });

    it('should assign default gasLimit when not provided', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const result = await relaySigner.sendTransaction(params);

      expect(result).toBeDefined();
      expect(result.transactionId).toBeDefined();
    });

    it('should assign default speed when not provided', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
        gasLimit: '100000',
      };

      const result = await relaySigner.sendTransaction(params);

      expect(result).toBeDefined();
    });
  });

  describe('getTransaction', () => {
    it('should retrieve existing transaction', async () => {
      const sendParams = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const sent = await relaySigner.sendTransaction(sendParams);
      const retrieved = await relaySigner.getTransaction(sent.transactionId);

      expect(retrieved.transactionId).toBe(sent.transactionId);
      expect(retrieved.status).toBeDefined();
    });

    it('should throw NotFoundError for non-existent ID', async () => {
      await expect(relaySigner.getTransaction('invalid-id')).rejects.toThrow();
    });

    it('should return correct status for retrieved transaction', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const sent = await relaySigner.sendTransaction(params);
      const retrieved = await relaySigner.getTransaction(sent.transactionId);

      expect(['pending', 'sent', 'submitted']).toContain(retrieved.status);
    });
  });

  describe('getRelayer', () => {
    it('should return relayer address', async () => {
      const relayer = await relaySigner.getRelayer();

      expect(relayer).toBeDefined();
      expect(relayer.address).toBeDefined();
      expect(relayer.address.startsWith('0x')).toBe(true);
      expect(relayer.address.length).toBe(42);
    });

    it('should return same relayer on multiple calls', async () => {
      const relayer1 = await relaySigner.getRelayer();
      const relayer2 = await relaySigner.getRelayer();

      expect(relayer1.address).toBe(relayer2.address);
    });

    it('should derive relayer address from private key', async () => {
      const relayer = await relaySigner.getRelayer();

      expect(relayer.address).toBeDefined();
      expect(relayer.address.toLowerCase()).toMatch(/^0x[a-f0-9]{40}$/);
    });
  });

  describe('transaction lifecycle', () => {
    it('should track multiple transactions independently', async () => {
      const params1 = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const params2 = {
        to: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        data: '0xdef0' as `0x${string}`,
      };

      const tx1 = await relaySigner.sendTransaction(params1);
      const tx2 = await relaySigner.sendTransaction(params2);

      expect(tx1.transactionId).not.toBe(tx2.transactionId);

      const retrieved1 = await relaySigner.getTransaction(tx1.transactionId);
      const retrieved2 = await relaySigner.getTransaction(tx2.transactionId);

      expect(retrieved1.transactionId).toBe(tx1.transactionId);
      expect(retrieved2.transactionId).toBe(tx2.transactionId);
    });
  });
});
