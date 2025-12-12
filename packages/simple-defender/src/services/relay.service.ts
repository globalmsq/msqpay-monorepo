import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  type PublicClient,
  type Chain,
  type Transport,
  type Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';

type WalletClientWithAccount = ReturnType<typeof createWalletClient<Transport, Chain, Account>>;

/**
 * ERC2771 ForwardRequest 구조체
 * OZ ERC2771Forwarder.execute()에 전달되는 파라미터
 */
export interface ForwardRequestData {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  gas: string;
  deadline: string;
  data: `0x${string}`;
  signature: `0x${string}`;
}

export interface RelayRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  gasLimit?: string;
  speed?: 'safeLow' | 'average' | 'fast' | 'fastest';
}

/**
 * ERC2771 ForwardRequest를 포함한 Relay 요청
 */
export interface ForwardRelayRequest {
  forwardRequest: ForwardRequestData;
  gasLimit?: string;
  speed?: 'safeLow' | 'average' | 'fast' | 'fastest';
}

export interface TransactionRecord {
  transactionId: string;
  hash?: `0x${string}`;
  status: 'pending' | 'sent' | 'submitted' | 'mined' | 'confirmed' | 'failed';
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gasLimit: string;
  createdAt: number;
  updatedAt: number;
}

export interface RelayServiceConfig {
  relayerPrivateKey: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  forwarderAddress: `0x${string}`;
}

/**
 * OZ ERC2771Forwarder ABI
 * @see https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/metatx/ERC2771Forwarder.sol
 *
 * ForwardRequestData struct:
 * - from: address
 * - to: address
 * - value: uint256
 * - gas: uint256
 * - deadline: uint48
 * - data: bytes
 * - signature: bytes (signature is INSIDE the struct!)
 */
const ERC2771_FORWARDER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'deadline', type: 'uint48' },
          { name: 'data', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
        name: 'request',
        type: 'tuple',
      },
    ],
    name: 'execute',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'nonces',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export class RelayService {
  private walletClient: WalletClientWithAccount;
  private publicClient: PublicClient;
  private relayerAccount: ReturnType<typeof privateKeyToAccount>;
  private transactions: Map<string, TransactionRecord> = new Map();
  private config: RelayServiceConfig;

  constructor(config: RelayServiceConfig) {
    // Normalize private key: add 0x prefix if missing
    const normalizedConfig = {
      ...config,
      relayerPrivateKey: this.normalizeHexString(config.relayerPrivateKey) as `0x${string}`,
    };
    this.config = normalizedConfig;
    this.validateConfig(normalizedConfig);

    this.relayerAccount = privateKeyToAccount(normalizedConfig.relayerPrivateKey);

    const chain = {
      ...hardhat,
      id: config.chainId,
    };

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.relayerAccount,
      chain,
      transport: http(config.rpcUrl),
    });
  }

  /**
   * Normalize hex string by adding 0x prefix if missing
   */
  private normalizeHexString(value: string): string {
    if (!value) return value;
    return value.startsWith('0x') ? value : `0x${value}`;
  }

  private validateConfig(config: RelayServiceConfig): void {
    if (!config.relayerPrivateKey) {
      throw new Error('relayerPrivateKey is required');
    }
    // After normalization, should start with 0x and be 66 chars (0x + 64 hex chars)
    if (!config.relayerPrivateKey.startsWith('0x') || config.relayerPrivateKey.length !== 66) {
      throw new Error('relayerPrivateKey must be a valid 32-byte hex string');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(config.relayerPrivateKey)) {
      throw new Error('relayerPrivateKey contains invalid hex characters');
    }
    if (!config.rpcUrl) {
      throw new Error('rpcUrl is required');
    }
    if (!config.chainId || config.chainId <= 0) {
      throw new Error('chainId must be positive');
    }
    if (!config.forwarderAddress?.startsWith('0x')) {
      throw new Error('forwarderAddress must be hex string starting with 0x');
    }
  }

  private generateTransactionId(): string {
    return `mock_tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  async submitTransaction(request: RelayRequest): Promise<TransactionRecord> {
    const transactionId = this.generateTransactionId();
    const now = Date.now();

    const record: TransactionRecord = {
      transactionId,
      status: 'pending',
      to: request.to,
      data: request.data,
      value: request.value ?? '0',
      gasLimit: request.gasLimit ?? '200000',
      createdAt: now,
      updatedAt: now,
    };

    this.transactions.set(transactionId, record);

    try {
      const hash = await this.walletClient.sendTransaction({
        account: this.relayerAccount,
        to: request.to,
        data: request.data,
        value: BigInt(request.value ?? '0'),
        gas: BigInt(request.gasLimit ?? '200000'),
      });

      record.hash = hash;
      record.status = 'sent';
      record.updatedAt = Date.now();
      this.transactions.set(transactionId, record);

      this.monitorTransaction(transactionId, hash);

      return record;
    } catch (error) {
      record.status = 'failed';
      record.updatedAt = Date.now();
      this.transactions.set(transactionId, record);
      throw error;
    }
  }

  private async monitorTransaction(
    transactionId: string,
    hash: `0x${string}`
  ): Promise<void> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });

      const record = this.transactions.get(transactionId);
      if (record) {
        record.status = receipt.status === 'success' ? 'mined' : 'failed';
        record.updatedAt = Date.now();
        this.transactions.set(transactionId, record);

        setTimeout(() => {
          const r = this.transactions.get(transactionId);
          if (r && r.status === 'mined') {
            r.status = 'confirmed';
            r.updatedAt = Date.now();
            this.transactions.set(transactionId, r);
          }
        }, 5000);
      }
    } catch (error) {
      const record = this.transactions.get(transactionId);
      if (record) {
        record.status = 'failed';
        record.updatedAt = Date.now();
        this.transactions.set(transactionId, record);
      }
    }
  }

  async getTransaction(transactionId: string): Promise<TransactionRecord> {
    const record = this.transactions.get(transactionId);
    if (!record) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    return record;
  }

  async getRelayerInfo(): Promise<{
    address: `0x${string}`;
    balance: string;
  }> {
    const balance = await this.publicClient.getBalance({
      address: this.relayerAccount.address,
    });

    return {
      address: this.relayerAccount.address,
      balance: balance.toString(),
    };
  }

  async getNonce(address: `0x${string}`): Promise<bigint> {
    const nonce = await this.publicClient.readContract({
      address: this.config.forwarderAddress,
      abi: ERC2771_FORWARDER_ABI,
      functionName: 'nonces',
      args: [address],
    });
    return nonce;
  }

  /**
   * ERC2771 ForwardRequest를 사용하여 Forwarder.execute() 호출
   *
   * 1. ForwardRequestData를 ABI 인코딩
   * 2. Forwarder 컨트랙트에 execute() 함수 호출
   * 3. 트랜잭션 상태 추적
   */
  async submitForwardRequest(request: ForwardRelayRequest): Promise<TransactionRecord> {
    const transactionId = this.generateTransactionId();
    const now = Date.now();

    const { forwardRequest } = request;

    const record: TransactionRecord = {
      transactionId,
      status: 'pending',
      to: this.config.forwarderAddress,
      data: '0x' as `0x${string}`,
      value: forwardRequest.value,
      gasLimit: request.gasLimit ?? '500000',
      createdAt: now,
      updatedAt: now,
    };

    this.transactions.set(transactionId, record);

    try {
      // Forwarder.execute(ForwardRequestData) 함수 호출 인코딩
      // Note: deadline은 uint48이므로 number로 변환 필요
      const deadlineNum = Number(forwardRequest.deadline);
      if (deadlineNum > Number.MAX_SAFE_INTEGER) {
        throw new Error('deadline value is too large for uint48');
      }

      const executeData = encodeFunctionData({
        abi: ERC2771_FORWARDER_ABI,
        functionName: 'execute',
        args: [
          {
            from: forwardRequest.from,
            to: forwardRequest.to,
            value: BigInt(forwardRequest.value),
            gas: BigInt(forwardRequest.gas),
            deadline: deadlineNum,
            data: forwardRequest.data,
            signature: forwardRequest.signature,
          },
        ],
      });

      record.data = executeData;

      // Forwarder 컨트랙트에 execute 트랜잭션 전송
      const hash = await this.walletClient.sendTransaction({
        account: this.relayerAccount,
        to: this.config.forwarderAddress,
        data: executeData,
        value: BigInt(forwardRequest.value),
        gas: BigInt(request.gasLimit ?? '500000'),
      });

      record.hash = hash;
      record.status = 'sent';
      record.updatedAt = Date.now();
      this.transactions.set(transactionId, record);

      this.monitorTransaction(transactionId, hash);

      return record;
    } catch (error) {
      record.status = 'failed';
      record.updatedAt = Date.now();
      this.transactions.set(transactionId, record);
      throw error;
    }
  }
}
