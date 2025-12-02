import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelayFactory } from '../relay.factory';

describe('RelayFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isLocalEnvironment', () => {
    it('should return true when USE_MOCK_DEFENDER is true', () => {
      process.env.USE_MOCK_DEFENDER = 'true';
      expect(RelayFactory.isLocalEnvironment()).toBe(true);
    });

    it('should return false when USE_MOCK_DEFENDER is not set', () => {
      delete process.env.USE_MOCK_DEFENDER;
      expect(RelayFactory.isLocalEnvironment()).toBe(false);
    });

    it('should return false when USE_MOCK_DEFENDER is false', () => {
      process.env.USE_MOCK_DEFENDER = 'false';
      expect(RelayFactory.isLocalEnvironment()).toBe(false);
    });
  });

  describe('getEnvironmentInfo', () => {
    it('should return environment info', () => {
      process.env.USE_MOCK_DEFENDER = 'true';
      process.env.NODE_ENV = 'development';

      const info = RelayFactory.getEnvironmentInfo();

      expect(info).toBeDefined();
      expect(info.isLocal).toBe(true);
      expect(info.useMock).toBe(true);
      expect(info.nodeEnv).toBe('development');
    });

    it('should handle missing NODE_ENV', () => {
      delete process.env.NODE_ENV;

      const info = RelayFactory.getEnvironmentInfo();

      expect(info.nodeEnv).toBe('development');
    });

    it('should return isLocal and useMock as consistent values', () => {
      process.env.USE_MOCK_DEFENDER = 'true';

      const info = RelayFactory.getEnvironmentInfo();

      expect(info.isLocal).toBe(info.useMock);
    });
  });

  describe('createRelayService', () => {
    it('should throw error when using mock without implementation', () => {
      process.env.USE_MOCK_DEFENDER = 'true';

      expect(() => RelayFactory.createRelayService()).toThrow(
        'MockDefender not yet implemented in factory'
      );
    });

    it('should throw error when DEFENDER_API_KEY is missing', () => {
      delete process.env.USE_MOCK_DEFENDER;
      delete process.env.DEFENDER_API_KEY;
      process.env.DEFENDER_API_SECRET = 'test-secret';

      expect(() => RelayFactory.createRelayService()).toThrow(
        'DEFENDER_API_KEY and DEFENDER_API_SECRET are required'
      );
    });

    it('should throw error when DEFENDER_API_SECRET is missing', () => {
      delete process.env.USE_MOCK_DEFENDER;
      process.env.DEFENDER_API_KEY = 'test-key';
      delete process.env.DEFENDER_API_SECRET;

      expect(() => RelayFactory.createRelayService()).toThrow(
        'DEFENDER_API_KEY and DEFENDER_API_SECRET are required'
      );
    });

    it('should throw error when both API credentials are missing', () => {
      delete process.env.USE_MOCK_DEFENDER;
      delete process.env.DEFENDER_API_KEY;
      delete process.env.DEFENDER_API_SECRET;

      expect(() => RelayFactory.createRelayService()).toThrow(
        'DEFENDER_API_KEY and DEFENDER_API_SECRET are required'
      );
    });

    it('should create DefenderService when credentials are provided', () => {
      delete process.env.USE_MOCK_DEFENDER;
      process.env.DEFENDER_API_KEY = 'test-key';
      process.env.DEFENDER_API_SECRET = 'test-secret';
      process.env.DEFENDER_RELAYER_ADDRESS = '0x1234567890123456789012345678901234567890';

      const service = RelayFactory.createRelayService();

      expect(service).toBeDefined();
      expect(typeof service.submitGaslessTransaction).toBe('function');
      expect(typeof service.getRelayStatus).toBe('function');
    });

    it('should use default relayer address when not provided', () => {
      delete process.env.USE_MOCK_DEFENDER;
      process.env.DEFENDER_API_KEY = 'test-key';
      process.env.DEFENDER_API_SECRET = 'test-secret';
      delete process.env.DEFENDER_RELAYER_ADDRESS;

      const service = RelayFactory.createRelayService();

      expect(service).toBeDefined();
    });
  });
});
