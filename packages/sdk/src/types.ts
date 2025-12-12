export type Environment = 'development' | 'staging' | 'production' | 'custom';

export interface MSQPayConfig {
  environment: Environment;
  apiKey: string;
  apiUrl?: string;
}

// Request types
export interface CreatePaymentParams {
  /** 상점 고유 식별자 */
  merchantId: string;
  /** 상점에서 생성한 주문 ID */
  orderId: string;
  /** 결제 금액 (토큰 단위) */
  amount: number;
  /** 결제 토큰 심볼 (예: TEST, USDC) */
  currency: string;
  /** 블록체인 체인 ID */
  chainId: number;
  /** 결제 수령 주소 */
  recipientAddress: string;
  /** 결제 토큰 컨트랙트 주소 */
  tokenAddress: string;
  /** 토큰 소수점 자릿수 */
  tokenDecimals: number;
}

/**
 * ERC2771 ForwardRequest for gasless meta-transactions
 * Matches OZ ERC2771Forwarder.execute() parameters
 */
export interface ForwardRequest {
  from: string;
  to: string;
  value: string;
  gas: string;
  deadline: string;
  data: string;
  signature: string;
}

export interface GaslessParams {
  paymentId: string;
  forwarderAddress: string;
  forwardRequest: ForwardRequest;
}

export interface RelayParams {
  paymentId: string;
  transactionData: string;
  gasEstimate: number;
}

export interface GetPaymentHistoryParams {
  /** 블록체인 체인 ID */
  chainId: number;
  /** 결제자 지갑 주소 */
  payer: string;
  /** 조회할 블록 범위 (기본값: 1000) */
  limit?: number;
}

// Response types
export interface CreatePaymentResponse {
  success: boolean;
  paymentId: string;
  tokenAddress: string;
  gatewayAddress: string;
  forwarderAddress: string;
  amount: string; // wei
  status: string;
}

export interface PaymentStatusResponse {
  success: true;
  data: {
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
  };
}

export interface GaslessResponse {
  success: true;
  relayRequestId: string;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}

export interface RelayResponse {
  success: true;
  relayRequestId: string;
  transactionHash?: string;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}

export interface RelayStatusResponse {
  success: true;
  relayRequestId: string;
  transactionHash?: string;
  status: 'submitted' | 'pending' | 'mined' | 'confirmed' | 'failed';
}

export interface ErrorResponse {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}

// Payment History types
export interface PaymentHistoryItem {
  /** 결제 ID (bytes32 해시) */
  paymentId: string;
  /** 결제자 주소 */
  payer: string;
  /** 상점 주소 */
  merchant: string;
  /** 토큰 컨트랙트 주소 */
  token: string;
  /** 토큰 심볼 */
  tokenSymbol: string;
  /** 토큰 소수점 자리수 */
  decimals: number;
  /** 결제 금액 (Wei 단위) */
  amount: string;
  /** 결제 완료 시간 (Unix timestamp) */
  timestamp: string;
  /** 트랜잭션 해시 */
  transactionHash: string;
  /** 결제 상태 */
  status: string;
  /** Gasless 결제 여부 */
  isGasless: boolean;
  /** Relay 요청 ID (Gasless인 경우) */
  relayId?: string;
}

export interface PaymentHistoryResponse {
  success: true;
  data: PaymentHistoryItem[];
}
