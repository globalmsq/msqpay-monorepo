/**
 * Payment API Client
 * Demo App에서 Payment API Server를 호출하는 유틸 함수
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// 결제 상태 타입 (서버 응답과 일치)
export interface PaymentStatus {
  id: string;
  userId: string;
  amount: number;
  currency: 'USD' | 'EUR' | 'KRW';
  tokenAddress: string;
  recipientAddress: string;
  status: 'pending' | 'confirmed' | 'failed' | 'completed';
  transactionHash?: string;
  blockNumber?: number;
  createdAt: string;
  updatedAt: string;
}

// API 응답 타입
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  code?: string;
  message?: string;
}

// 결제 이력 조회용 타입 (Payment API에서 제공)
export interface PaymentHistoryItem {
  id: string;
  paymentId: string;
  payer: string;
  merchant: string;
  token: string;
  amount: string;
  timestamp: string;
  transactionHash: string;
  status: string;
}

/**
 * 결제 상태 조회
 * @param paymentId 결제 ID (bytes32 형식)
 */
export async function getPaymentStatus(paymentId: string): Promise<ApiResponse<PaymentStatus>> {
  const response = await fetch(`${API_URL}/payments/${paymentId}/status`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch payment status' }));
    return {
      success: false,
      code: error.code || 'FETCH_ERROR',
      message: error.message,
    };
  }

  return response.json();
}

/**
 * 사용자의 결제 이력 조회
 * @param userAddress 사용자 지갑 주소
 */
export async function getPaymentHistory(userAddress: string): Promise<ApiResponse<PaymentHistoryItem[]>> {
  const response = await fetch(`${API_URL}/payments/history?payer=${userAddress}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch payment history' }));
    return {
      success: false,
      code: error.code || 'FETCH_ERROR',
      message: error.message,
    };
  }

  return response.json();
}

/**
 * API URL 반환 (테스트/디버깅용)
 */
export function getApiUrl(): string {
  return API_URL;
}

// 트랜잭션 상태 타입
export interface TransactionStatus {
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  confirmations?: number;
}

/**
 * 토큰 잔액 조회
 * @param tokenAddress ERC20 토큰 주소
 * @param walletAddress 지갑 주소
 */
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string
): Promise<ApiResponse<{ balance: string }>> {
  const response = await fetch(
    `${API_URL}/tokens/${tokenAddress}/balance?address=${walletAddress}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch token balance' }));
    return {
      success: false,
      code: error.code || 'FETCH_ERROR',
      message: error.message,
    };
  }

  return response.json();
}

/**
 * 토큰 승인액 조회
 * @param tokenAddress ERC20 토큰 주소
 * @param owner 소유자 주소
 * @param spender 승인받은 주소 (gateway contract)
 */
export async function getTokenAllowance(
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<ApiResponse<{ allowance: string }>> {
  const response = await fetch(
    `${API_URL}/tokens/${tokenAddress}/allowance?owner=${owner}&spender=${spender}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch token allowance' }));
    return {
      success: false,
      code: error.code || 'FETCH_ERROR',
      message: error.message,
    };
  }

  return response.json();
}

/**
 * 트랜잭션 상태 조회
 * @param txHash 트랜잭션 해시
 */
export async function getTransactionStatus(
  txHash: string
): Promise<ApiResponse<TransactionStatus>> {
  const response = await fetch(`${API_URL}/transactions/${txHash}/status`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch transaction status' }));
    return {
      success: false,
      code: error.code || 'FETCH_ERROR',
      message: error.message,
    };
  }

  return response.json();
}

/**
 * 트랜잭션 확인 대기 (polling)
 * @param txHash 트랜잭션 해시
 * @param options 타임아웃 및 폴링 간격 설정
 */
export async function waitForTransaction(
  txHash: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<TransactionStatus> {
  const { timeout = 60000, interval = 2000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await getTransactionStatus(txHash);

    if (response.success && response.data) {
      if (response.data.status === 'confirmed' || response.data.status === 'failed') {
        return response.data;
      }
    }

    // 아직 pending이면 대기 후 재시도
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // 타임아웃
  throw new Error('Transaction confirmation timeout');
}
