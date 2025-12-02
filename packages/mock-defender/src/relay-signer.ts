import { privateKeyToAccount } from 'viem/accounts';
import {
  MockDefenderConfig,
  SendTransactionParams,
  TransactionResponse,
  RelayerInfo,
} from './types';

interface StoredTransaction {
  transactionId: string;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gasLimit: string;
  speed: string;
  status: TransactionResponse['status'];
  timestamp: number;
  hash?: `0x${string}`;
}

const DEFAULT_GAS_LIMIT = '200000';
const DEFAULT_SPEED = 'average';
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HEX_REGEX = /^0x[a-fA-F0-9]*$/;

export class MockRelaySigner {
  private config: MockDefenderConfig;
  private relayerAccount: ReturnType<typeof privateKeyToAccount>;
  private transactions: Map<string, StoredTransaction>;

  constructor(config: MockDefenderConfig) {
    this.validateConfig(config);
    this.config = config;
    this.transactions = new Map();

    try {
      this.relayerAccount = privateKeyToAccount(config.relayerPrivateKey);
    } catch (error) {
      throw new Error(
        `Invalid relayer private key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
    if (!config.rpcUrl) {
      throw new Error('rpcUrl is required');
    }
    if (config.chainId <= 0) {
      throw new Error('chainId must be positive');
    }
  }

  private validateAddress(address: `0x${string}`): void {
    if (!ADDRESS_REGEX.test(address)) {
      throw new Error(`Invalid address format: ${address}`);
    }
  }

  private validateData(data: `0x${string}`): void {
    if (!data.startsWith('0x')) {
      throw new Error('Data must start with 0x');
    }
    if (data.length % 2 !== 0) {
      throw new Error('Data must have even length');
    }
    if (!HEX_REGEX.test(data)) {
      throw new Error('Data contains invalid hex characters');
    }
  }

  private generateTransactionId(): string {
    return `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateMockHash(): `0x${string}` {
    const randomBytes = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    ).join('');
    return `0x${randomBytes}` as `0x${string}`;
  }

  async sendTransaction(params: SendTransactionParams): Promise<TransactionResponse> {
    this.validateAddress(params.to);
    this.validateData(params.data);

    const transactionId = this.generateTransactionId();
    const gasLimit = params.gasLimit ? String(params.gasLimit) : DEFAULT_GAS_LIMIT;
    const value = params.value ? String(params.value) : '0';
    const speed = params.speed ?? DEFAULT_SPEED;
    const mockHash = this.generateMockHash();

    const transaction: StoredTransaction = {
      transactionId,
      to: params.to,
      data: params.data,
      value,
      gasLimit,
      speed,
      status: 'sent',
      timestamp: Date.now(),
      hash: mockHash,
    };

    this.transactions.set(transactionId, transaction);

    return {
      transactionId,
      hash: mockHash,
      status: 'sent',
    };
  }

  async getTransaction(transactionId: string): Promise<TransactionResponse> {
    const transaction = this.transactions.get(transactionId);

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    return {
      transactionId,
      status: transaction.status,
    };
  }

  async getRelayer(): Promise<RelayerInfo> {
    return {
      address: this.relayerAccount.address as `0x${string}`,
    };
  }
}
