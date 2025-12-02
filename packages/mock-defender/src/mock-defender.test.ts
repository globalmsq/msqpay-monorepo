import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockDefender } from './mock-defender';
import { MockRelaySigner } from './relay-signer';
import { MockDefenderConfig } from './types';

describe('MockDefender', () => {
  let config: MockDefenderConfig;
  let mockDefender: MockDefender;

  beforeEach(() => {
    config = {
      forwarderAddress: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      relayerPrivateKey: '0x1234567890123456789012345678901234567890123456789012345678901234' as `0x${string}`,
      rpcUrl: 'http://localhost:8545',
      chainId: 31337,
    };

    mockDefender = new MockDefender(config);
  });

  describe('initialization', () => {
    it('should initialize with valid config', () => {
      expect(mockDefender).toBeDefined();
      expect(mockDefender.relaySigner).toBeDefined();
      expect(mockDefender.relaySigner).toBeInstanceOf(MockRelaySigner);
    });

    it('should throw error with invalid forwarder address', () => {
      const invalidConfig = {
        ...config,
        forwarderAddress: 'invalid' as `0x${string}`,
      };
      expect(() => new MockDefender(invalidConfig)).toThrow();
    });

    it('should throw error with invalid private key', () => {
      const invalidConfig = {
        ...config,
        relayerPrivateKey: 'invalid' as `0x${string}`,
      };
      expect(() => new MockDefender(invalidConfig)).toThrow();
    });

    it('should throw error with empty rpcUrl', () => {
      const invalidConfig = {
        ...config,
        rpcUrl: '',
      };
      expect(() => new MockDefender(invalidConfig)).toThrow();
    });
  });

  describe('relaySigner interface', () => {
    it('should have sendTransaction method', () => {
      expect(typeof mockDefender.relaySigner.sendTransaction).toBe('function');
    });

    it('should have getTransaction method', () => {
      expect(typeof mockDefender.relaySigner.getTransaction).toBe('function');
    });

    it('should have getRelayer method', () => {
      expect(typeof mockDefender.relaySigner.getRelayer).toBe('function');
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction successfully', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
        value: '0',
        gasLimit: '100000',
      };

      const result = await mockDefender.relaySigner.sendTransaction(params);

      expect(result).toBeDefined();
      expect(result.transactionId).toBeDefined();
      expect(result.status).toBe('sent');
      expect(typeof result.transactionId).toBe('string');
    });

    it('should accept optional value and gasLimit', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
        value: '1000000000000000000',
        gasLimit: '200000',
      };

      const result = await mockDefender.relaySigner.sendTransaction(params);

      expect(result).toBeDefined();
      expect(result.status).toBe('sent');
    });

    it('should generate unique transaction IDs', async () => {
      const params1 = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const params2 = {
        to: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        data: '0xdef0' as `0x${string}`,
      };

      const result1 = await mockDefender.relaySigner.sendTransaction(params1);
      const result2 = await mockDefender.relaySigner.sendTransaction(params2);

      expect(result1.transactionId).not.toBe(result2.transactionId);
    });
  });

  describe('getTransaction', () => {
    it('should retrieve transaction by ID', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const sent = await mockDefender.relaySigner.sendTransaction(params);
      const retrieved = await mockDefender.relaySigner.getTransaction(sent.transactionId);

      expect(retrieved).toBeDefined();
      expect(retrieved.transactionId).toBe(sent.transactionId);
      expect(retrieved.status).toBeDefined();
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        mockDefender.relaySigner.getTransaction('non-existent-id')
      ).rejects.toThrow();
    });

    it('should return pending status initially', async () => {
      const params = {
        to: '0x9876543210987654321098765432109876543210' as `0x${string}`,
        data: '0xabcd' as `0x${string}`,
      };

      const sent = await mockDefender.relaySigner.sendTransaction(params);
      const retrieved = await mockDefender.relaySigner.getTransaction(sent.transactionId);

      expect(['pending', 'sent', 'submitted']).toContain(retrieved.status);
    });
  });

  describe('getRelayer', () => {
    it('should return relayer info', async () => {
      const relayer = await mockDefender.relaySigner.getRelayer();

      expect(relayer).toBeDefined();
      expect(relayer.address).toBeDefined();
      expect(relayer.address.startsWith('0x')).toBe(true);
      expect(relayer.address.length).toBe(42);
    });

    it('should return consistent relayer address', async () => {
      const relayer1 = await mockDefender.relaySigner.getRelayer();
      const relayer2 = await mockDefender.relaySigner.getRelayer();

      expect(relayer1.address).toBe(relayer2.address);
    });
  });

  describe('OZ SDK interface compatibility', () => {
    it('should be compatible with Defender SDK interface', () => {
      const defenderInterface = {
        relaySigner: {
          sendTransaction: expect.any(Function),
          getTransaction: expect.any(Function),
          getRelayer: expect.any(Function),
        },
      };

      expect(mockDefender).toMatchObject({
        relaySigner: expect.any(Object),
      });

      expect(mockDefender.relaySigner).toHaveProperty('sendTransaction');
      expect(mockDefender.relaySigner).toHaveProperty('getTransaction');
      expect(mockDefender.relaySigner).toHaveProperty('getRelayer');
    });
  });
});
