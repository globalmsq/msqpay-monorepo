import { describe, it, expect } from 'vitest';
import { SUPPORTED_CHAINS, ChainConfig } from '../chains';

describe('chains.ts - SUPPORTED_CHAINS Configuration', () => {
  it('should have SUPPORTED_CHAINS as an array', () => {
    expect(Array.isArray(SUPPORTED_CHAINS)).toBe(true);
  });

  it('should contain exactly 2 chains', () => {
    expect(SUPPORTED_CHAINS).toHaveLength(2);
  });

  it('should have Polygon Amoy chain with chainId 80002', () => {
    const polygonAmoy = SUPPORTED_CHAINS.find(c => c.id === 80002);
    expect(polygonAmoy).toBeDefined();
    expect(polygonAmoy?.name).toBe('Polygon Amoy');
  });

  it('should have Hardhat chain with chainId 31337', () => {
    const hardhat = SUPPORTED_CHAINS.find(c => c.id === 31337);
    expect(hardhat).toBeDefined();
    expect(hardhat?.name).toBe('Hardhat');
  });

  describe('Polygon Amoy (80002)', () => {
    let polygonAmoy: ChainConfig;

    beforeEach(() => {
      polygonAmoy = SUPPORTED_CHAINS.find(c => c.id === 80002)!;
    });

    it('should have valid contract addresses', () => {
      expect(polygonAmoy.contracts.gateway).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(polygonAmoy.contracts.forwarder).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have SUT token configured', () => {
      expect(polygonAmoy.tokens.SUT).toBeDefined();
      expect(polygonAmoy.tokens.SUT).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have SUT token address as E4C687167705Abf55d709395f92e254bdF5825a2', () => {
      expect(polygonAmoy.tokens.SUT).toBe('0xE4C687167705Abf55d709395f92e254bdF5825a2');
    });
  });

  describe('Hardhat (31337)', () => {
    let hardhat: ChainConfig;

    beforeEach(() => {
      hardhat = SUPPORTED_CHAINS.find(c => c.id === 31337)!;
    });

    it('should have valid contract addresses', () => {
      expect(hardhat.contracts.gateway).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(hardhat.contracts.forwarder).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have TEST token configured', () => {
      expect(hardhat.tokens.TEST).toBeDefined();
      expect(hardhat.tokens.TEST).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have correct Hardhat contract addresses', () => {
      expect(hardhat.contracts.gateway).toBe('0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9');
      expect(hardhat.contracts.forwarder).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3');
    });

    it('should have correct Hardhat TEST token address', () => {
      expect(hardhat.tokens.TEST).toBe('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512');
    });
  });

  describe('ChainConfig interface', () => {
    it('should have required fields', () => {
      const chain = SUPPORTED_CHAINS[0];
      expect(chain).toHaveProperty('id');
      expect(chain).toHaveProperty('name');
      expect(chain).toHaveProperty('contracts');
      expect(chain).toHaveProperty('tokens');
    });

    it('should have contracts with gateway and forwarder', () => {
      const chain = SUPPORTED_CHAINS[0];
      expect(chain.contracts).toHaveProperty('gateway');
      expect(chain.contracts).toHaveProperty('forwarder');
    });

    it('should have tokens as Record<string, string>', () => {
      const chain = SUPPORTED_CHAINS[0];
      expect(typeof chain.tokens).toBe('object');
      Object.values(chain.tokens).forEach(token => {
        expect(typeof token).toBe('string');
      });
    });
  });
});
