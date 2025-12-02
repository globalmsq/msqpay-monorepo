import { MockRelaySigner } from './relay-signer';
import { MockDefenderConfig } from './types';

export class MockDefender {
  readonly relaySigner: MockRelaySigner;

  constructor(config: MockDefenderConfig) {
    this.validateConfig(config);
    this.relaySigner = new MockRelaySigner(config);
  }

  private validateConfig(config: MockDefenderConfig): void {
    if (!config.forwarderAddress) {
      throw new Error('forwarderAddress is required');
    }
    if (!config.forwarderAddress.startsWith('0x') || config.forwarderAddress.length !== 42) {
      throw new Error('Invalid forwarderAddress format');
    }
    if (!config.relayerPrivateKey) {
      throw new Error('relayerPrivateKey is required');
    }
    if (!config.relayerPrivateKey.startsWith('0x')) {
      throw new Error('relayerPrivateKey must be hex string');
    }
    if (config.relayerPrivateKey.length !== 66) {
      throw new Error('relayerPrivateKey must be 32 bytes (66 chars with 0x)');
    }
    if (!config.rpcUrl) {
      throw new Error('rpcUrl is required');
    }
    if (!config.chainId || config.chainId <= 0) {
      throw new Error('chainId must be positive');
    }
  }
}
