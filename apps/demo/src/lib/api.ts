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
  status: 'pending' | 'confirmed' | 'failed' | 'completed' | 'CREATED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
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
  tokenSymbol: string;
  decimals: number;
  amount: string;
  timestamp: string;
  transactionHash: string;
  status: string;
  isGasless: boolean;
  relayId?: string;
}

/**
 * 결제 상태 조회
 * @param paymentId 결제 ID (bytes32 형식)
 * chainId는 서버에서 paymentId 기반으로 조회
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
 * @param chainId 체인 ID
 */
export async function getPaymentHistory(userAddress: string, chainId: number): Promise<ApiResponse<PaymentHistoryItem[]>> {
  const response = await fetch(`${API_URL}/payments/history?chainId=${chainId}&payer=${userAddress}`);

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
 * @param chainId 체인 ID
 * @param tokenAddress ERC20 토큰 주소
 * @param walletAddress 지갑 주소
 */
export async function getTokenBalance(
  chainId: number,
  tokenAddress: string,
  walletAddress: string
): Promise<ApiResponse<{ balance: string }>> {
  const response = await fetch(
    `${API_URL}/tokens/${tokenAddress}/balance?chainId=${chainId}&address=${walletAddress}`
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
 * @param chainId 체인 ID
 * @param tokenAddress ERC20 토큰 주소
 * @param owner 소유자 주소
 * @param spender 승인받은 주소 (gateway contract)
 */
export async function getTokenAllowance(
  chainId: number,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<ApiResponse<{ allowance: string }>> {
  const response = await fetch(
    `${API_URL}/tokens/${tokenAddress}/allowance?chainId=${chainId}&owner=${owner}&spender=${spender}`
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
 * @param chainId 체인 ID
 * @param txHash 트랜잭션 해시
 */
export async function getTransactionStatus(
  chainId: number,
  txHash: string
): Promise<ApiResponse<TransactionStatus>> {
  const response = await fetch(`${API_URL}/transactions/${txHash}/status?chainId=${chainId}`);

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
 * @param chainId 체인 ID
 * @param txHash 트랜잭션 해시
 * @param options 타임아웃 및 폴링 간격 설정
 */
export async function waitForTransaction(
  chainId: number,
  txHash: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<TransactionStatus> {
  const { timeout = 60000, interval = 2000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await getTransactionStatus(chainId, txHash);

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

// ============================================================
// Gasless Payment API
// ============================================================

/**
 * ERC2771 ForwardRequest Schema
 */
export const ForwardRequestSchema = z.object({
  from: z.string().startsWith('0x').length(42, 'Invalid from address'),
  to: z.string().startsWith('0x').length(42, 'Invalid to address'),
  value: z.string(),
  gas: z.string(),
  deadline: z.string(),
  data: z.string().startsWith('0x', 'Data must start with 0x'),
  signature: z.string().startsWith('0x', 'Signature must start with 0x'),
});

export type ForwardRequestType = z.infer<typeof ForwardRequestSchema>;

/**
 * Gasless Payment Request Schema
 */
export const GaslessPaymentRequestSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  forwarderAddress: z.string().startsWith('0x').length(42, 'Invalid forwarder address'),
  forwardRequest: ForwardRequestSchema,
});

export type GaslessPaymentRequest = z.infer<typeof GaslessPaymentRequestSchema>;

/**
 * Gasless Payment Response Schema
 */
export const GaslessPaymentResponseSchema = z.object({
  success: z.boolean(),
  relayRequestId: z.string(),
  status: z.enum(['submitted', 'pending', 'mined', 'confirmed', 'failed']),
  message: z.string().optional(),
});

export type GaslessPaymentResponse = z.infer<typeof GaslessPaymentResponseSchema>;

/**
 * Relay Status Response Schema
 */
export const RelayStatusResponseSchema = z.object({
  success: z.boolean(),
  relayRequestId: z.string(),
  transactionHash: z.string().optional(),
  status: z.enum(['submitted', 'pending', 'mined', 'confirmed', 'failed']),
});

export type RelayStatusResponse = z.infer<typeof RelayStatusResponseSchema>;

/**
 * Submit gasless payment via OZ Defender relay
 * @param paymentId Payment ID (from checkout)
 * @param forwarderAddress Forwarder contract address (from checkout response)
 * @param forwardRequest Full ERC2771 ForwardRequest with signature
 */
export async function submitGaslessPayment(
  paymentId: string,
  forwarderAddress: string,
  forwardRequest: ForwardRequestType
): Promise<ApiResponse<GaslessPaymentResponse>> {
  // Validate input
  const validation = GaslessPaymentRequestSchema.safeParse({
    paymentId,
    forwarderAddress,
    forwardRequest,
  });

  if (!validation.success) {
    return {
      success: false,
      code: ApiErrorCode.VALIDATION_ERROR,
      message: validation.error.errors[0]?.message || 'Validation failed',
    };
  }

  try {
    const response = await fetch(`${API_URL}/payments/${paymentId}/gasless`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentId,
        forwarderAddress,
        forwardRequest,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Gasless payment submission failed' }));
      return {
        success: false,
        code: error.code || ApiErrorCode.SERVER_ERROR,
        message: error.message,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data as GaslessPaymentResponse,
    };
  } catch (err) {
    return {
      success: false,
      code: ApiErrorCode.NETWORK_ERROR,
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Get relay transaction status
 * @param relayRequestId Relay request ID (from submitGaslessPayment response)
 */
export async function getRelayStatus(
  relayRequestId: string
): Promise<ApiResponse<RelayStatusResponse>> {
  try {
    const response = await fetch(`${API_URL}/payments/relay/${relayRequestId}/status`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch relay status' }));
      return {
        success: false,
        code: error.code || ApiErrorCode.SERVER_ERROR,
        message: error.message,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data as RelayStatusResponse,
    };
  } catch (err) {
    return {
      success: false,
      code: ApiErrorCode.NETWORK_ERROR,
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Wait for relay transaction to complete
 * @param relayRequestId Relay request ID
 * @param options Polling options
 */
export async function waitForRelayTransaction(
  relayRequestId: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<RelayStatusResponse> {
  const { timeout = 120000, interval = 3000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await getRelayStatus(relayRequestId);

    if (response.success && response.data) {
      const status = response.data.status;
      if (status === 'mined' || status === 'confirmed' || status === 'failed') {
        return response.data;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Relay transaction confirmation timeout');
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
 * Checkout Item Schema
 * 개별 상품 항목
 */
export const CheckoutItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be positive').default(1),
});

export type CheckoutItem = z.infer<typeof CheckoutItemSchema>;

/**
 * Checkout Request Schema
 * ⚠️ SECURITY: Only products array is sent, NOT amount, NOT chainId!
 * Server looks up both price and chainId from product config
 */
export const CheckoutRequestSchema = z.object({
  products: z.array(CheckoutItemSchema).min(1, 'At least one product is required'),
  // ⚠️ chainId is NOT sent - server determines it from merchant config
  // ⚠️ amount is NOT sent - server calculates from product prices
});

export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

/**
 * Checkout Response Item Schema
 * 개별 상품 응답 정보
 */
export const CheckoutResponseItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.string(), // 개별 상품 가격
  subtotal: z.string(), // quantity * unitPrice
});

export type CheckoutResponseItem = z.infer<typeof CheckoutResponseItemSchema>;

/**
 * Checkout Response Schema
 * Amount, chainId, decimals, and tokenSymbol are returned from server (server-verified)
 */
export const CheckoutResponseSchema = z.object({
  success: z.boolean(),
  // 결제 서버에서 생성된 paymentId
  paymentId: z.string(),
  // 상점 서버에서 생성된 orderId
  orderId: z.string(),
  // 상품 정보 (배열)
  products: z.array(CheckoutResponseItemSchema),
  // 결제 정보 (상점 설정 기반)
  totalAmount: z.string(), // 총 금액 (human-readable, e.g., "30")
  decimals: z.number(), // Token decimals (e.g., 18, 6)
  chainId: z.number(), // Server-verified chainId
  tokenSymbol: z.string(), // Server-verified token symbol (e.g., 'SUT', 'TEST')
  tokenAddress: z.string(),
  // 결제 컨트랙트 정보
  gatewayAddress: z.string(),
  forwarderAddress: z.string(),
  recipientAddress: z.string(),
});

export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

/**
 * Checkout - Secure payment initiation
 *
 * ⚠️ SECURITY: This function prevents amount and chain manipulation by:
 * 1. Sending ONLY products array to server (NOT amount, NOT chainId)
 * 2. Server looks up product prices and chainId from constants/DB
 * 3. Server creates payment with verified values
 *
 * @param request Checkout request with products array
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
    // ⚠️ SECURITY: Only products array is sent, NOT amount, NOT chainId!
    const response = await retryWithDelay(
      async () => {
        return fetch(`${API_URL}/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            products: validatedRequest.products,
            // ❌ amount is NOT sent - server calculates it!
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
