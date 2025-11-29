export type Environment = 'development' | 'staging' | 'production' | 'custom';

export interface MSQPayConfig {
  environment: Environment;
  apiKey: string;
  apiUrl?: string;
}

// Request types
export interface CreatePaymentParams {
  userId: string;
  amount: number;
  currency?: 'USD' | 'EUR' | 'KRW';
  tokenAddress: string;
  recipientAddress: string;
  description?: string;
}

export interface GaslessParams {
  paymentId: string;
  forwarderAddress: string;
  signature: string;
}

export interface RelayParams {
  paymentId: string;
  transactionData: string;
  gasEstimate: number;
}

// Response types
export interface CreatePaymentResponse {
  success: true;
  paymentId: string;
  transactionHash: string;
  status: 'pending';
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

export interface ErrorResponse {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}
