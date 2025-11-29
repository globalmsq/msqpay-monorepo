# MSQPay SDK (`@globalmsq/msqpay`)

A lightweight TypeScript SDK for store servers to interact with the MSQPay payment API. Built with Node.js 18+ native `fetch` and zero external dependencies.

## Installation

```bash
pnpm add @globalmsq/msqpay
```

## Quick Start

### Basic Usage

```typescript
import { MSQPayClient } from '@globalmsq/msqpay';

// Initialize the client
const client = new MSQPayClient({
  environment: 'production',
  apiKey: 'your-api-key'
});

// Create a payment
const payment = await client.createPayment({
  userId: 'user-123',
  amount: 1000,
  currency: 'USD',
  tokenAddress: '0x1234567890123456789012345678901234567890',
  recipientAddress: '0x0987654321098765432109876543210987654321',
  description: 'Purchase order #12345'
});

console.log(`Payment created: ${payment.paymentId}`);
```

## Environment Setup

### Supported Environments

- **development**: `http://localhost:3001`
- **staging**: `https://pay-api.staging.msq.com`
- **production**: `https://pay-api.msq.com`
- **custom**: Provide custom `apiUrl` in config

### Configuration Examples

```typescript
// Development
const devClient = new MSQPayClient({
  environment: 'development',
  apiKey: 'dev-api-key'
});

// Custom environment
const customClient = new MSQPayClient({
  environment: 'custom',
  apiKey: 'custom-api-key',
  apiUrl: 'https://my-api.example.com'
});
```

## API Methods

### createPayment(params)

Create a new payment.

```typescript
const response = await client.createPayment({
  userId: string;
  amount: number;
  currency?: 'USD' | 'EUR' | 'KRW';
  tokenAddress: string;
  recipientAddress: string;
  description?: string;
});

// Response
{
  success: true;
  paymentId: string;
  transactionHash: string;
  status: 'pending';
}
```

### getPaymentStatus(paymentId)

Retrieve the status of a payment.

```typescript
const status = await client.getPaymentStatus('pay-123');

// Response
{
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
```

### submitGasless(params)

Submit a gasless (meta-transaction) request.

```typescript
const response = await client.submitGasless({
  paymentId: string;
  forwarderAddress: string;
  signature: string;
});

// Response
{
  success: true;
  relayRequestId: string;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}
```

### executeRelay(params)

Execute a relay transaction.

```typescript
const response = await client.executeRelay({
  paymentId: string;
  transactionData: string;
  gasEstimate: number;
});

// Response
{
  success: true;
  relayRequestId: string;
  transactionHash?: string;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}
```

### setApiUrl(url)

Dynamically change the API URL.

```typescript
client.setApiUrl('https://new-api.example.com');
```

### getApiUrl()

Get the current API URL.

```typescript
const url = client.getApiUrl();
console.log(url); // https://pay-api.msq.com
```

## Error Handling

All API errors are thrown as `MSQPayError` with the following structure:

```typescript
try {
  await client.createPayment(params);
} catch (error) {
  if (error instanceof MSQPayError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    console.error(`HTTP Status: ${error.statusCode}`);
    console.error(`Details:`, error.details);
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|------------|------------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `INVALID_REQUEST` | 400 | Malformed request |
| `INVALID_SIGNATURE` | 400 | Invalid signature format |
| `INVALID_TRANSACTION_DATA` | 400 | Invalid transaction data |
| `INVALID_GAS_ESTIMATE` | 400 | Invalid gas estimate |
| `NOT_FOUND` | 404 | Payment not found |
| `INTERNAL_ERROR` | 500 | Server error |

## TypeScript Types

The SDK exports all types for full type safety:

```typescript
import {
  MSQPayClient,
  MSQPayError,
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
} from '@globalmsq/msqpay';
```

### Type Definitions

```typescript
type Environment = 'development' | 'staging' | 'production' | 'custom';

interface MSQPayConfig {
  environment: Environment;
  apiKey: string;
  apiUrl?: string; // Required when environment is 'custom'
}

interface CreatePaymentParams {
  userId: string;
  amount: number;
  currency?: 'USD' | 'EUR' | 'KRW';
  tokenAddress: string;      // 0x + 40 hex characters
  recipientAddress: string;  // 0x + 40 hex characters
  description?: string;
}

interface GaslessParams {
  paymentId: string;
  forwarderAddress: string;  // 0x + 40 hex characters
  signature: string;         // 0x hex string
}

interface RelayParams {
  paymentId: string;
  transactionData: string;   // 0x hex string
  gasEstimate: number;
}
```

## Complete Example

```typescript
import { MSQPayClient, MSQPayError } from '@globalmsq/msqpay';

async function processPayment() {
  const client = new MSQPayClient({
    environment: 'production',
    apiKey: process.env.MSQPAY_API_KEY!
  });

  try {
    // Step 1: Create payment
    console.log('Creating payment...');
    const payment = await client.createPayment({
      userId: 'user-456',
      amount: 5000,
      currency: 'USD',
      tokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
      recipientAddress: '0x9e5b65f2d0ca4541925d7c4cc5367cbeca076f82'
    });
    console.log(`Payment created: ${payment.paymentId}`);

    // Step 2: Check payment status
    console.log('Checking payment status...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await client.getPaymentStatus(payment.paymentId);
    console.log(`Payment status: ${status.data.status}`);

    // Step 3: Submit gasless transaction
    if (status.data.status === 'pending') {
      console.log('Submitting gasless transaction...');
      const gaslessResult = await client.submitGasless({
        paymentId: payment.paymentId,
        forwarderAddress: '0x9e5b65f2d0ca4541925d7c4cc5367cbeca076f82',
        signature: '0x' + 'a'.repeat(130)
      });
      console.log(`Relay request: ${gaslessResult.relayRequestId}`);
    }
  } catch (error) {
    if (error instanceof MSQPayError) {
      console.error(`Payment error: [${error.code}] ${error.message}`);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

processPayment();
```

## Requirements

- Node.js >= 18.0.0 (for native `fetch` support)
- TypeScript >= 5.0 (optional, for development)

## Features

- ✅ **Zero Dependencies**: Uses native Node.js `fetch` API
- ✅ **Full TypeScript Support**: Complete type definitions
- ✅ **Type-Safe Error Handling**: `MSQPayError` class with error codes
- ✅ **Environment Management**: Built-in support for multiple environments
- ✅ **API Key Authentication**: Secure header-based authentication
- ✅ **Comprehensive Test Coverage**: 100% coverage with 26+ test cases

## Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build TypeScript
pnpm build
```

## License

MIT

## Support

For issues or questions:
1. Check the error code and details in the thrown `MSQPayError`
2. Verify your API key and environment configuration
3. Ensure Node.js version >= 18.0.0
4. Review the [API documentation](https://docs.msq.com/api)
