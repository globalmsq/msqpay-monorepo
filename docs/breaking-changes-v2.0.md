# SDK v2.0.0 Breaking Changes

**Version**: 2.0.0
**Release Date**: 2025-12-01
**Migration Guide**: Required for upgrading from v1.x

---

## 📋 Overview

MSQPay SDK v2.0.0 introduces significant changes to support server-driven blockchain configuration. This document outlines all breaking changes and provides migration guidance.

**TL;DR**:
- ✅ SDK now returns `chainId`, `currency` required in request
- ✅ Server provides `tokenAddress`, `gatewayAddress` in response
- ✅ No local contract hardcoding required
- ⚠️ Response field names changed: `id` → `paymentId`, `currency` → `tokenSymbol`

---

## 🔴 Breaking Changes

### 1. Response Field Renaming

**Type**: Field name change

**Before** (v1.x):
```typescript
interface PaymentResponse {
  id: string;                    // ❌ Renamed
  success: boolean;
  currency: string;              // ❌ Renamed
  amount: string;
  status: 'pending' | 'completed';
}

// Example:
const response = await client.createPayment({...});
console.log(response.id);        // "pay_xxx"
console.log(response.currency);  // "SUT"
```

**After** (v2.0):
```typescript
interface CreatePaymentResponse {
  success: boolean;
  paymentId: string;             // ✅ New name (was 'id')
  tokenAddress: string;          // ✅ New field (from server)
  gatewayAddress: string;        // ✅ New field (from server)
  forwarderAddress: string;      // ✅ New field (from server)
  amount: string;
  status: 'pending' | 'completed';
}

// Example:
const response = await client.createPayment({...});
console.log(response.paymentId);      // "pay_xxx"
console.log(response.tokenAddress);   // "0x..."
console.log(response.gatewayAddress); // "0x..."
```

**Migration**:
```typescript
// Before
const { id, currency } = response;
await approveToken(contractAddress, id);

// After
const { paymentId, tokenAddress, gatewayAddress } = response;
await approveToken(tokenAddress, gatewayAddress, paymentId);
```

---

### 2. Request Requires chainId

**Type**: Required field added

**Before** (v1.x):
```typescript
const payment = await client.createPayment({
  amount: 100,
  currency: 'SUT',
  recipientAddress: '0x...',
  // chainId not required (assumed from connected wallet)
});
```

**After** (v2.0):
```typescript
const payment = await client.createPayment({
  amount: 100,
  currency: 'SUT',
  chainId: 80002,               // ✅ Now required
  recipientAddress: '0x...',
});
```

**Why**: Server needs to validate supported chains and provide correct contract addresses.

**Migration**:
```typescript
import { useChainId } from 'wagmi';

function PaymentComponent() {
  const chainId = useChainId();  // Get from wagmi hook

  const handlePayment = async () => {
    const response = await client.createPayment({
      amount: 100,
      currency: 'SUT',
      chainId,                    // ✅ Add this
      recipientAddress: '0x...',
    });
  };
}
```

---

### 3. No Local Contract Addresses

**Type**: Architecture change

**Before** (v1.x):
```typescript
// apps/demo/src/lib/wagmi.ts or contracts.ts
export const CONTRACTS = {
  gateway: '0x0000000000000000000000000000000000000000',
  forwarder: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
};

export const TOKENS = {
  [80002]: { SUT: '0xE4C687...' },
  [31337]: { TEST: '0xe7f172...' },
};

// Usage in component
await approveToken(
  TOKENS[chainId][currency],  // Local
  CONTRACTS.gateway           // Local
);
```

**After** (v2.0):
```typescript
// All addresses from server response
const response = await client.createPayment({
  amount: 100,
  currency: 'SUT',
  chainId,
  recipientAddress: '0x...',
});

// Use addresses from response
await approveToken(
  response.tokenAddress,       // ✅ From server
  response.gatewayAddress      // ✅ From server
);
```

**Migration**:
1. Remove local contract definitions
2. Always use server response addresses
3. Store `paymentId` for later status checks

---

### 4. Error Codes Changed

**Type**: Error handling

**Before** (v1.x):
```typescript
try {
  const payment = await client.createPayment({...});
} catch (error) {
  if (error.code === 'INVALID_CHAIN') { ... }
  if (error.code === 'INVALID_TOKEN') { ... }
}
```

**After** (v2.0):
```typescript
try {
  const payment = await client.createPayment({...});
} catch (error) {
  if (error.code === 'UNSUPPORTED_CHAIN') { ... }  // ✅ Renamed
  if (error.code === 'UNSUPPORTED_TOKEN') { ... }  // ✅ Renamed
  if (error.code === 'VALIDATION_ERROR') { ... }   // ✅ New
}
```

**Error Code Reference**:

| Error Code | Meaning | Status | v1 Name |
|------------|---------|--------|---------|
| `UNSUPPORTED_CHAIN` | chainId not supported | 400 | `INVALID_CHAIN` |
| `UNSUPPORTED_TOKEN` | currency not supported | 400 | `INVALID_TOKEN` |
| `VALIDATION_ERROR` | Request validation failed | 400 | `INVALID_REQUEST` |
| `PAYMENT_ERROR` | Payment creation failed | 500 | `SERVER_ERROR` |
| `NETWORK_ERROR` | Server connection failed | 503 | `CONNECTION_ERROR` |

---

### 5. Type Definitions Updated

**Before** (v1.x):
```typescript
interface CreatePaymentRequest {
  amount: number;
  currency: string;
  recipientAddress: string;
}

interface PaymentResponse {
  id: string;
  currency: string;
  amount: string;
  status: string;
}
```

**After** (v2.0):
```typescript
interface CreatePaymentRequest {
  amount: number;
  currency: string;
  chainId: number;              // ✅ New required field
  recipientAddress: string;
}

interface CreatePaymentResponse {
  success: boolean;
  paymentId: string;            // ✅ Renamed from 'id'
  tokenAddress: string;         // ✅ New field
  gatewayAddress: string;       // ✅ New field
  forwarderAddress: string;     // ✅ New field
  amount: string;
  status: 'pending' | 'completed';
}
```

---

## 🔄 Migration Guide

### Step 1: Update SDK Package

```bash
npm install @globalmsq/msqpay@2.0.0
# or
pnpm add @globalmsq/msqpay@2.0.0
```

### Step 2: Remove Local Contract Definitions

**File**: Remove or empty these files:
```bash
# Remove hardcoded contracts
rm src/lib/contracts.ts
rm src/lib/tokens.ts
rm src/config/addresses.ts
```

If contracts are needed elsewhere, move to a separate config file with deprecation notice:
```typescript
// src/config/DEPRECATED_contracts.ts
export const DEPRECATED_LOCAL_CONTRACTS = {
  // @deprecated - Use server response instead
  gateway: '0x...',
};
```

### Step 3: Update createPayment Calls

**Before**:
```typescript
const payment = await client.createPayment({
  amount: 100,
  currency: 'SUT',
  recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
});
```

**After**:
```typescript
import { useChainId } from 'wagmi';

function PaymentComponent() {
  const chainId = useChainId();

  const handleCreatePayment = async () => {
    const payment = await client.createPayment({
      amount: 100,
      currency: 'SUT',
      chainId,  // ✅ Add this
      recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    });

    // Use response addresses
    await approveToken(
      payment.tokenAddress,      // ✅ From server
      payment.gatewayAddress,    // ✅ From server
      payment.amount
    );
  };
}
```

### Step 4: Update Payment Approval Logic

**Before**:
```typescript
import { TOKENS, CONTRACTS } from '@/lib/contracts';

async function approveToken(amount: string) {
  const tokenAddress = TOKENS[chainId][currency];
  const gatewayAddress = CONTRACTS.gateway;

  await writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [gatewayAddress, amount],
  });
}
```

**After**:
```typescript
async function approveToken(
  tokenAddress: string,     // From response
  gatewayAddress: string,   // From response
  amount: string
) {
  await writeContract({
    address: tokenAddress,  // ✅ Use from parameter
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [gatewayAddress, amount],
  });
}
```

### Step 5: Update Error Handling

**Before**:
```typescript
try {
  const payment = await client.createPayment({...});
} catch (error) {
  if (error.code === 'INVALID_CHAIN') {
    showError('Unsupported network');
  }
  if (error.code === 'INVALID_TOKEN') {
    showError('Token not supported');
  }
}
```

**After**:
```typescript
try {
  const payment = await client.createPayment({...});
} catch (error) {
  if (error.code === 'UNSUPPORTED_CHAIN') {  // ✅ Updated error code
    showError('Unsupported network');
  }
  if (error.code === 'UNSUPPORTED_TOKEN') {  // ✅ Updated error code
    showError('Token not supported');
  }
  if (error.code === 'VALIDATION_ERROR') {   // ✅ New error type
    showError('Invalid request');
  }
}
```

### Step 6: Update Type Imports

**Before**:
```typescript
import { PaymentResponse, CreatePaymentRequest } from '@globalmsq/msqpay';
```

**After**:
```typescript
import {
  CreatePaymentRequest,     // Same name
  CreatePaymentResponse,    // Renamed response type
} from '@globalmsq/msqpay';
```

---

## ✅ Compatibility Matrix

| Scenario | v1.x | v2.0 | Notes |
|----------|------|------|-------|
| Hardhat local | ✅ | ✅ | chainId=31337 required |
| Polygon Amoy | ✅ | ✅ | chainId=80002 required |
| Ethereum Mainnet | ✅ | ❌ | Not supported in v2.0 |
| Custom RPC | ✅ | ❌ | Requires server addition |
| Multiple chains | ⚠️ | ✅ | chainId parameter enables |

---

## 📋 Checklist for Migration

- [ ] Install @globalmsq/msqpay@2.0.0
- [ ] Remove local contract/token definitions
- [ ] Add `chainId` to createPayment() calls
- [ ] Update address usage to use response fields
- [ ] Update error handling (INVALID_CHAIN → UNSUPPORTED_CHAIN)
- [ ] Update TypeScript types (PaymentResponse → CreatePaymentResponse)
- [ ] Test on Hardhat local network
- [ ] Test on Polygon Amoy testnet
- [ ] Verify E2E payment flow
- [ ] Run type checking (`tsc --noEmit`)
- [ ] Deploy to staging
- [ ] Deploy to production

---

## 🆘 FAQ

### Q: Do I need to update my payment approval logic?

**A**: Yes. Instead of using hardcoded addresses, use addresses from the server response:
```typescript
const { tokenAddress, gatewayAddress } = await client.createPayment({...});
await approveToken(tokenAddress, gatewayAddress, amount);
```

### Q: What if I'm using custom networks?

**A**: Custom networks are not supported in v2.0. You must contact the MSQPay team to add your network to the server's `SUPPORTED_CHAINS` configuration.

### Q: Can I stay on v1.x?

**A**: Yes, but v1.x support will end on 2025-12-31. We recommend upgrading to v2.0 immediately.

### Q: How do I get the `chainId`?

**A**: Use wagmi's `useChainId()` hook:
```typescript
import { useChainId } from 'wagmi';

function MyComponent() {
  const chainId = useChainId();
  // Use chainId in your requests
}
```

### Q: What about payment status checks?

**A**: Status checks remain similar, but now use `paymentId`:
```typescript
// v1.x
const status = await client.getPaymentStatus(payment.id);

// v2.0
const status = await client.getPaymentStatus(payment.paymentId);  // Same API
```

---

## 📞 Support

For migration issues or questions:
- **Issues**: [GitHub Issues](https://github.com/msqpay/msqpay/issues)
- **SDK Documentation**: `/docs/sdk/` 디렉토리의 최신 마이그레이션 가이드 참조

---

## 📊 Version Timeline

| Version | Status | EOL Date |
|---------|--------|----------|
| v1.x | Deprecated | 2025-12-31 |
| v2.0 | Current | 2026-12-31 |
| v2.1 (planned) | Alpha | Q2 2026 |

---

**Document Version**: 1.0
**Created**: 2025-12-01
**Last Updated**: 2025-12-01
**Maintainer**: MSQPay Team
