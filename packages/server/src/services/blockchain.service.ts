import { createPublicClient, http, PublicClient, Address, parseAbiItem } from 'viem';
import { polygon } from 'viem/chains';
import { PaymentStatus } from '../schemas/payment.schema';

/**
 * 결제 이력 아이템 인터페이스
 */
export interface PaymentHistoryItem {
  paymentId: string;
  payer: string;
  merchant: string;
  token: string;
  tokenSymbol: string;
  amount: string;
  timestamp: string;
  transactionHash: string;
  status: string;
}

// PaymentCompleted 이벤트 ABI
const PAYMENT_COMPLETED_EVENT = parseAbiItem(
  'event PaymentCompleted(bytes32 indexed paymentId, address indexed payer, address indexed merchant, address token, uint256 amount, uint256 timestamp)'
);

// PaymentGateway ABI (processedPayments 조회용)
const PAYMENT_GATEWAY_ABI = [
  {
    type: 'function',
    name: 'processedPayments',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// ERC20 ABI (balanceOf, allowance, symbol)
const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;

/**
 * 트랜잭션 상태 인터페이스
 */
export interface TransactionStatus {
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  confirmations?: number;
}

/**
 * 블록체인 서비스 - viem을 통한 스마트 컨트랙트 상호작용
 * 무상태 아키텍처: 모든 데이터는 스마트 컨트랙트에서 조회
 */
export class BlockchainService {
  private publicClient: PublicClient;
  private contractAddress: Address;

  constructor(rpcUrl: string = 'https://polygon-rpc.com', contractAddress: string) {
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });

    this.contractAddress = contractAddress as Address;
  }

  /**
   * 결제 상태를 스마트 컨트랙트에서 조회
   * Contract의 processedPayments(paymentId) mapping과 PaymentCompleted 이벤트를 조회
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
    try {
      // Contract의 processedPayments mapping 조회 (bool 반환)
      const isProcessed = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'processedPayments',
        args: [paymentId as `0x${string}`],
      });

      const now = new Date().toISOString();

      // 결제가 완료된 경우, 이벤트 로그에서 실제 결제 정보 조회
      if (isProcessed) {
        const paymentDetails = await this.getPaymentDetailsByPaymentId(paymentId);
        if (paymentDetails) {
          return {
            paymentId,
            userId: paymentDetails.payer,
            amount: Number(paymentDetails.amount),
            tokenAddress: paymentDetails.token,
            tokenSymbol: paymentDetails.tokenSymbol,
            recipientAddress: paymentDetails.merchant,
            status: 'completed',
            createdAt: paymentDetails.timestamp,
            updatedAt: now,
            transactionHash: paymentDetails.transactionHash,
          };
        }
      }

      // 아직 처리되지 않은 결제
      return {
        paymentId,
        userId: '',
        amount: 0,
        tokenAddress: '',
        tokenSymbol: '',
        recipientAddress: '',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      console.error('결제 상태 조회 실패:', error);
      // 네트워크 오류나 RPC 오류 시에도 pending 반환 (polling 계속 가능하도록)
      const now = new Date().toISOString();
      return {
        paymentId,
        userId: '',
        amount: 0,
        tokenAddress: '',
        tokenSymbol: '',
        recipientAddress: '',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  /**
   * paymentId로 PaymentCompleted 이벤트 조회
   * @param paymentId 결제 ID (bytes32)
   */
  private async getPaymentDetailsByPaymentId(paymentId: string): Promise<{
    payer: string;
    merchant: string;
    token: string;
    tokenSymbol: string;
    amount: string;
    timestamp: string;
    transactionHash: string;
  } | null> {
    try {
      const currentBlock = await this.publicClient.getBlockNumber();
      // 최근 10000블록 범위에서 검색 (약 5-6시간)
      const fromBlock = currentBlock > BigInt(10000)
        ? currentBlock - BigInt(10000)
        : BigInt(0);

      const logs = await this.publicClient.getLogs({
        address: this.contractAddress,
        event: PAYMENT_COMPLETED_EVENT,
        args: {
          paymentId: paymentId as `0x${string}`,
        },
        fromBlock,
        toBlock: 'latest',
      });

      if (logs.length === 0) {
        return null;
      }

      const log = logs[0];
      const block = await this.publicClient.getBlock({ blockHash: log.blockHash! });
      const tokenAddress = (log.args as any).token || '';

      // 온체인에서 토큰 심볼 조회
      const tokenSymbol = tokenAddress ? await this.getTokenSymbol(tokenAddress) : 'UNKNOWN';

      return {
        payer: (log.args as any).payer || '',
        merchant: (log.args as any).merchant || '',
        token: tokenAddress,
        tokenSymbol,
        amount: ((log.args as any).amount || BigInt(0)).toString(),
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        transactionHash: log.transactionHash,
      };
    } catch (error) {
      console.error('결제 상세 정보 조회 실패:', error);
      return null;
    }
  }

  /**
   * 결제를 스마트 컨트랙트에 기록
   */
  async recordPaymentOnChain(paymentData: {
    userId: string;
    amount: bigint;
    currency: string;
    tokenAddress: Address;
    recipientAddress: Address;
    description?: string;
  }): Promise<string> {
    try {
      // 실제 구현에서는 트랜잭션 서명 및 전송
      // 여기서는 데이터 검증만 수행
      if (!paymentData.userId || !paymentData.amount || !paymentData.tokenAddress) {
        throw new Error('필수 결제 정보가 누락되었습니다');
      }

      // 트랜잭션 해시 반환 (실제로는 sendTransaction 결과)
      return '0x' + 'a'.repeat(64);
    } catch (error) {
      console.error('스마트 컨트랙트에 결제 기록 실패:', error);
      // 원본 에러 메시지를 그대로 전파하지 않고, 구체적인 메시지는 보존
      if (error instanceof Error && error.message === '필수 결제 정보가 누락되었습니다') {
        throw error;
      }
      throw new Error('결제를 기록할 수 없습니다');
    }
  }

  /**
   * 트랜잭션 수신 확인 확인
   */
  async waitForConfirmation(
    transactionHash: string,
    _confirmations: number = 1
  ): Promise<{ status: string; blockNumber: bigint; transactionHash: string } | null> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
        confirmations: _confirmations,
      });
      return {
        status: receipt.status === 'success' ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.transactionHash,
      };
    } catch (error) {
      console.error('트랜잭션 확인 대기 실패:', error);
      return null;
    }
  }

  /**
   * 가스 비용 추정
   */
  async estimateGasCost(
    _tokenAddress: Address,
    _amount: bigint,
    _recipientAddress: Address
  ): Promise<bigint> {
    try {
      // 실제 구현에서는 eth_estimateGas 호출
      // 여기서는 고정 값 반환 (파라미터는 향후 실제 추정에 사용)
      return BigInt('200000');
    } catch (error) {
      console.error('가스 비용 추정 실패:', error);
      throw new Error('가스 비용을 추정할 수 없습니다');
    }
  }

  /**
   * 토큰 잔액 조회
   * @param tokenAddress ERC20 토큰 주소
   * @param walletAddress 지갑 주소
   */
  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<string> {
    try {
      const balance = await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as Address],
      });

      return balance.toString();
    } catch (error) {
      console.error('토큰 잔액 조회 실패:', error);
      throw new Error('토큰 잔액을 조회할 수 없습니다');
    }
  }

  /**
   * 토큰 승인액 조회
   * @param tokenAddress ERC20 토큰 주소
   * @param owner 소유자 주소
   * @param spender 승인받은 주소 (보통 gateway contract)
   */
  async getTokenAllowance(
    tokenAddress: string,
    owner: string,
    spender: string
  ): Promise<string> {
    try {
      const allowance = await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner as Address, spender as Address],
      });

      return allowance.toString();
    } catch (error) {
      console.error('토큰 승인액 조회 실패:', error);
      throw new Error('토큰 승인액을 조회할 수 없습니다');
    }
  }

  /**
   * 토큰 심볼 조회 (온체인 ERC20.symbol())
   * @param tokenAddress ERC20 토큰 주소
   * @returns 토큰 심볼 (예: "USDC", "USDT")
   */
  async getTokenSymbol(tokenAddress: string): Promise<string> {
    try {
      const symbol = await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'symbol',
      });

      return symbol;
    } catch (error) {
      console.error('토큰 심볼 조회 실패:', error);
      // 조회 실패 시 기본값 반환 (알 수 없는 토큰)
      return 'UNKNOWN';
    }
  }

  /**
   * 트랜잭션 상태 조회
   * @param txHash 트랜잭션 해시
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      const currentBlock = await this.publicClient.getBlockNumber();
      const confirmations = Number(currentBlock - receipt.blockNumber);

      return {
        status: receipt.status === 'success' ? 'confirmed' : 'failed',
        blockNumber: Number(receipt.blockNumber),
        confirmations,
      };
    } catch (error) {
      // 트랜잭션이 아직 채굴되지 않았거나 존재하지 않음
      return {
        status: 'pending',
      };
    }
  }

  /**
   * 사용자의 결제 이력 조회 (PaymentCompleted 이벤트 로그)
   * @param payerAddress 사용자 지갑 주소
   * @param blockRange 조회할 블록 범위 (기본값: 최근 1000블록)
   */
  async getPaymentHistory(
    payerAddress: string,
    blockRange: number = 1000
  ): Promise<PaymentHistoryItem[]> {
    try {
      const currentBlock = await this.publicClient.getBlockNumber();
      const fromBlock = currentBlock > BigInt(blockRange)
        ? currentBlock - BigInt(blockRange)
        : BigInt(0);

      const logs = await this.publicClient.getLogs({
        address: this.contractAddress,
        event: PAYMENT_COMPLETED_EVENT,
        args: {
          payer: payerAddress as Address,
        },
        fromBlock,
        toBlock: 'latest',
      });

      const payments: PaymentHistoryItem[] = await Promise.all(
        logs.map(async (log) => {
          const block = await this.publicClient.getBlock({ blockHash: log.blockHash! });
          const tokenAddress = (log.args as any).token || '';
          // 온체인에서 토큰 심볼 조회
          const tokenSymbol = tokenAddress ? await this.getTokenSymbol(tokenAddress) : 'UNKNOWN';

          return {
            paymentId: (log.args as any).paymentId || '',
            payer: (log.args as any).payer || '',
            merchant: (log.args as any).merchant || '',
            token: tokenAddress,
            tokenSymbol,
            amount: ((log.args as any).amount || BigInt(0)).toString(),
            timestamp: block.timestamp.toString(),
            transactionHash: log.transactionHash,
            status: 'completed',
          };
        })
      );

      // 타임스탬프 기준 내림차순 정렬
      payments.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

      return payments;
    } catch (error) {
      console.error('결제 이력 조회 실패:', error);
      throw new Error('결제 이력을 조회할 수 없습니다');
    }
  }
}
