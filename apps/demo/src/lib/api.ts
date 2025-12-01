/**
 * Payment API Client
 * Demo App에서 Payment API Server를 호출하는 유틸 함수
 *
 * ⚠️ SECURITY: 금액 조작 방지
 * - checkout(): productId만 전송, 서버에서 가격 조회
 * - createPayment(): 내부용 (checkout API route에서만 호출)
 */

import { z } from 'zod';

// 클라이언트 사이드에서는 Next.js API Routes를 통해 결제서버 호출
// 브라우저 → /api/* (Next.js) → 결제서버 (localhost:3001)
const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

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

// API Error Codes
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Payment API Schemas
export const CreatePaymentRequestSchema = z.object({
  chainId: z.number().int().positive('Chain ID must be positive'),
  amount: z.string().refine((val) => {
    const num = BigInt(val);
    return num > 0n;
  }, 'Amount must be positive'),
  merchantId: z.string().min(1, 'Merchant ID is required'),
});

export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

export const CreatePaymentResponseSchema = z.object({
  success: z.boolean(),
  paymentId: z.string(),
  tokenAddress: z.string(),
  gatewayAddress: z.string(),
  forwarderAddress: z.string(),
  amount: z.string(),
  status: z.string(),
});

export type CreatePaymentResponse = z.infer<typeof CreatePaymentResponseSchema>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  code?: ApiErrorCode | string;
  message?: string;
}

// Helper: Retry with delay
async function retryWithDelay(
  fn: () => Promise<Response>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fn();

      // Only retry on 5xx errors
      if (response.status >= 500) {
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return response;
      }

      // Return immediately for non-5xx responses
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}


/**
 * Create a payment request with the server
 * @param request Payment request with chainId, amount, merchantId
 * @returns Promise with payment response or error
 */
export async function createPayment(
  request: CreatePaymentRequest
): Promise<ApiResponse<CreatePaymentResponse>> {
  // Validate request
  const validation = CreatePaymentRequestSchema.safeParse(request);
  if (!validation.success) {
    return {
      success: false,
      code: ApiErrorCode.VALIDATION_ERROR,
      message: validation.error.errors[0]?.message || 'Validation failed',
    };
  }

  const validatedRequest = validation.data;

  try {
    // Make request with retry logic
    const response = await retryWithDelay(
      async () => {
        return fetch(`${API_URL}/payments/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chainId: validatedRequest.chainId,
            amount: validatedRequest.amount,
            merchantId: validatedRequest.merchantId,
          }),
        });
      },
      3,
      1000
    );

    // Handle 4xx errors (no retry)
    if (response.status >= 400 && response.status < 500) {
      const error = await response.json().catch(() => ({ message: 'Client error' }));
      return {
        success: false,
        code: ApiErrorCode.CLIENT_ERROR,
        message: error.message || 'Client error',
      };
    }

    // Handle 5xx errors (after retries exhausted)
    if (response.status >= 500) {
      const error = await response.json().catch(() => ({ message: 'Server error' }));
      return {
        success: false,
        code: ApiErrorCode.SERVER_ERROR,
        message: error.message || 'Server error',
      };
    }

    // Parse successful response
    const data = await response.json();
    const paymentValidation = CreatePaymentResponseSchema.safeParse(data);

    if (!paymentValidation.success) {
      return {
        success: false,
        code: ApiErrorCode.UNKNOWN_ERROR,
        message: 'Invalid response format from server',
      };
    }

    return {
      success: true,
      data: paymentValidation.data,
    };
  } catch (err) {
    return {
      success: false,
      code: ApiErrorCode.NETWORK_ERROR,
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}

// ============================================================
// Checkout API (Secure - Server-side price and chain lookup)
// ============================================================

/**
 * Checkout Request Schema
 * ⚠️ SECURITY: Only productId is sent, NOT amount, NOT chainId!
 * Server looks up both price and chainId from product config
 */
export const CheckoutRequestSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  // ⚠️ chainId is NOT sent - server determines it from product config
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

/**
 * Checkout Response Schema
 * Amount, chainId, and decimals are returned from server (server-verified)
 */
export const CheckoutResponseSchema = z.object({
  success: z.boolean(),
  productId: z.string(),
  productName: z.string(),
  amount: z.string(), // Server-verified price (human-readable, e.g., "10")
  decimals: z.number(), // Token decimals (e.g., 18, 6)
  chainId: z.number(), // Server-verified chainId
  paymentId: z.string(),
  tokenAddress: z.string(),
  gatewayAddress: z.string(),
  forwarderAddress: z.string(),
  status: z.string(),
});

export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

/**
 * Checkout - Secure payment initiation
 *
 * ⚠️ SECURITY: This function prevents amount and chain manipulation by:
 * 1. Sending ONLY productId to server (NOT amount, NOT chainId)
 * 2. Server looks up product price and chainId from constants/DB
 * 3. Server creates payment with verified values
 *
 * @param request Checkout request with productId only
 * @returns Promise with checkout response including server-verified amount and chainId
 */
export async function checkout(
  request: CheckoutRequest
): Promise<ApiResponse<CheckoutResponse>> {
  // Validate request
  const validation = CheckoutRequestSchema.safeParse(request);
  if (!validation.success) {
    return {
      success: false,
      code: ApiErrorCode.VALIDATION_ERROR,
      message: validation.error.errors[0]?.message || 'Validation failed',
    };
  }

  const validatedRequest = validation.data;

  try {
    // Make request with retry logic
    // ⚠️ SECURITY: Only productId is sent, NOT amount, NOT chainId!
    const response = await retryWithDelay(
      async () => {
        return fetch(`${API_URL}/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId: validatedRequest.productId,
            // ❌ amount is NOT sent - server looks it up!
            // ❌ chainId is NOT sent - server looks it up!
          }),
        });
      },
      3,
      1000
    );

    // Handle 4xx errors (no retry)
    if (response.status >= 400 && response.status < 500) {
      const error = await response.json().catch(() => ({ message: 'Client error' }));
      return {
        success: false,
        code: error.code || ApiErrorCode.CLIENT_ERROR,
        message: error.message || 'Client error',
      };
    }

    // Handle 5xx errors (after retries exhausted)
    if (response.status >= 500) {
      const error = await response.json().catch(() => ({ message: 'Server error' }));
      return {
        success: false,
        code: ApiErrorCode.SERVER_ERROR,
        message: error.message || 'Server error',
      };
    }

    // Parse successful response
    const data = await response.json();
    const checkoutValidation = CheckoutResponseSchema.safeParse(data);

    if (!checkoutValidation.success) {
      return {
        success: false,
        code: ApiErrorCode.UNKNOWN_ERROR,
        message: 'Invalid response format from server',
      };
    }

    return {
      success: true,
      data: checkoutValidation.data,
    };
  } catch (err) {
    return {
      success: false,
      code: ApiErrorCode.NETWORK_ERROR,
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}
