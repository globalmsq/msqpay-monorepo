import { API_URLS, DEFAULT_HEADERS } from './constants';
import { MSQPayError, ERROR_CODES } from './errors';
import type {
  Environment,
  MSQPayConfig,
  CreatePaymentParams,
  CreatePaymentResponse,
  PaymentStatusResponse,
  GaslessParams,
  GaslessResponse,
  RelayParams,
  RelayResponse,
  ErrorResponse
} from './types';

export class MSQPayClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: MSQPayConfig) {
    this.apiKey = config.apiKey;

    if (config.environment === 'custom') {
      if (!config.apiUrl) {
        throw new Error('apiUrl is required when environment is "custom"');
      }
      this.apiUrl = config.apiUrl;
    } else {
      this.apiUrl = API_URLS[config.environment];
    }
  }

  setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
    return this.request<CreatePaymentResponse>('POST', '/payments/create', params);
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    return this.request<PaymentStatusResponse>('GET', `/payments/${paymentId}/status`);
  }

  async submitGasless(params: GaslessParams): Promise<GaslessResponse> {
    const path = `/payments/${params.paymentId}/gasless`;
    return this.request<GaslessResponse>('POST', path, params);
  }

  async executeRelay(params: RelayParams): Promise<RelayResponse> {
    const path = `/payments/${params.paymentId}/relay`;
    return this.request<RelayResponse>('POST', path, params);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers = {
      ...DEFAULT_HEADERS,
      'X-API-Key': this.apiKey
    };

    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = (await response.json()) as T | ErrorResponse;

    if (!response.ok) {
      const error = data as ErrorResponse;
      const statusCode = response.status;
      throw new MSQPayError(
        error.code,
        error.message,
        statusCode,
        error.details
      );
    }

    return data as T;
  }
}
