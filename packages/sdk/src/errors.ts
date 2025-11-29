export class MSQPayError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MSQPayError';
    Object.setPrototypeOf(this, MSQPayError.prototype);
  }
}

export const ERROR_CODES: Record<string, number> = {
  VALIDATION_ERROR: 400,
  INVALID_REQUEST: 400,
  INVALID_TRANSACTION_DATA: 400,
  INVALID_GAS_ESTIMATE: 400,
  INVALID_SIGNATURE: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500
};
