# Demo App 마이그레이션 가이드

**타이틀**: Demo App 하드코딩 제거 및 SDK 통합
**작성일**: 2025-12-01
**대상**: 개발자
**예상 소요시간**: 3시간

---

## 📌 목표

SPEC-API-001 구현에 따라 Demo App을 업데이트하여 블록체인 정보를 서버에서 동적으로 조회하도록 변경합니다.

**Before** (현재):
```typescript
// 하드코딩된 주소 사용
const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // 고정값
```

**After** (목표):
```typescript
// 서버에서 동적 조회
const response = await fetch('/api/payments/create', { ... });
const { tokenAddress, gatewayAddress } = await response.json();
```

---

## 🚀 Step 1: wagmi.ts 정리 (30분)

### 1.1 현재 상태 확인

```bash
cat apps/demo/src/lib/wagmi.ts
```

### 1.2 변경 내용

**File**: `apps/demo/src/lib/wagmi.ts`

```typescript
// ❌ REMOVE: CONTRACTS 객체
// export const CONTRACTS = {
//   gateway: "0x...",
//   forwarder: "0x...",
// };

// ❌ REMOVE: TOKENS 객체
// export const TOKENS = {
//   [80002]: { SUT: "0x..." },
//   [31337]: { TEST: "0x..." },
// };

// ✅ KEEP: wagmi config
import { createConfig, http } from 'wagmi';
import { hardhat, polygonAmoy } from 'wagmi/chains';

export const config = createConfig({
  chains: [hardhat, polygonAmoy],
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [polygonAmoy.id]: http('https://rpc-amoy.polygon.technology'),
  },
});
```

### 1.3 Verification

```bash
# 확인 1: CONTRACTS, TOKENS 제거됨
grep -E "CONTRACTS|TOKENS" apps/demo/src/lib/wagmi.ts || echo "✅ Removed"

# 확인 2: wagmi config 존재
grep "createConfig" apps/demo/src/lib/wagmi.ts && echo "✅ Config exists"

# 확인 3: 컴파일 성공
cd apps/demo && pnpm build
```

---

## 🔌 Step 2: API Routes 생성 (1시간)

### 2.1 디렉토리 구조 생성

```bash
mkdir -p apps/demo/src/app/api/payments/{create,[id]/status,[id]/gasless,[id]/relay}
```

### 2.2 create/route.ts 구현

**File**: `apps/demo/src/app/api/payments/create/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@msqpay/sdk';

const client = new MSQPayClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  apiKey: process.env.STORE_API_KEY || 'sk_test_demo',
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validation
    if (!body.amount || !body.currency || !body.chainId || !body.recipientAddress) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create payment via SDK
    const payment = await client.createPayment({
      amount: body.amount,
      currency: body.currency,
      chainId: body.chainId,
      recipientAddress: body.recipientAddress,
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Payment creation error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { code: 'PAYMENT_ERROR', message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2.3 status/route.ts 구현

**File**: `apps/demo/src/app/api/payments/[id]/status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@msqpay/sdk';

const client = new MSQPayClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  apiKey: process.env.STORE_API_KEY || 'sk_test_demo',
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const paymentId = params.id;

    const status = await client.getPaymentStatus(paymentId);

    return NextResponse.json(status);
  } catch (error) {
    console.error('Status check error:', error);

    return NextResponse.json(
      { code: 'PAYMENT_ERROR', message: 'Failed to get payment status' },
      { status: 400 }
    );
  }
}
```

### 2.4 gasless/route.ts 구현

**File**: `apps/demo/src/app/api/payments/[id]/gasless/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@msqpay/sdk';

const client = new MSQPayClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  apiKey: process.env.STORE_API_KEY || 'sk_test_demo',
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const paymentId = params.id;

    const result = await client.submitGasless(paymentId, body.signature);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Gasless submission error:', error);

    return NextResponse.json(
      { code: 'PAYMENT_ERROR', message: 'Failed to submit gasless payment' },
      { status: 400 }
    );
  }
}
```

### 2.5 relay/route.ts 구현

**File**: `apps/demo/src/app/api/payments/[id]/relay/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@msqpay/sdk';

const client = new MSQPayClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
  apiKey: process.env.STORE_API_KEY || 'sk_test_demo',
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const paymentId = params.id;

    const result = await client.executeRelay(paymentId, body.relayData);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Relay execution error:', error);

    return NextResponse.json(
      { code: 'PAYMENT_ERROR', message: 'Failed to execute relay' },
      { status: 400 }
    );
  }
}
```

---

## 🎨 Step 3: 컴포넌트 업데이트 (1시간 30분)

### 3.1 PaymentModal.tsx 업데이트

**File**: `apps/demo/src/components/PaymentModal.tsx`

```typescript
'use client';

import { useAccount, useChainId } from 'wagmi';
import { useState } from 'react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaymentModal({ isOpen, onClose }: PaymentModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<any>(null);

  const [formData, setFormData] = useState({
    amount: '',
    currency: chainId === 31337 ? 'TEST' : 'SUT',
    recipientAddress: '',
  });

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPaymentData(null);

    try {
      // ✅ Call demo backend API route
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(formData.amount),
          currency: formData.currency,
          chainId,
          recipientAddress: formData.recipientAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create payment');
      }

      const payment = await response.json();

      // ✅ Use server response
      setPaymentData(payment);

      console.log('Payment created:', {
        paymentId: payment.paymentId,
        tokenAddress: payment.tokenAddress,
        gatewayAddress: payment.gatewayAddress,
        amount: payment.amount,
      });

      // Next: Approve token and execute payment
      // await approveToken(payment.tokenAddress, payment.gatewayAddress, payment.amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg w-96">
        <h2 className="text-2xl font-bold mb-6">Create Payment</h2>

        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded mb-4">
            {error}
          </div>
        )}

        {paymentData ? (
          <div className="bg-green-100 text-green-700 p-4 rounded">
            <p className="font-bold">Payment Created!</p>
            <p className="text-sm mt-2">
              ID: {paymentData.paymentId}
            </p>
            <p className="text-sm">
              Status: {paymentData.status}
            </p>
          </div>
        ) : (
          <form onSubmit={handleCreatePayment}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Amount
              </label>
              <input
                type="number"
                placeholder="100"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                className="w-full border rounded px-3 py-2"
                disabled={loading}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Currency
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="w-full border rounded px-3 py-2"
                disabled={loading}
              >
                <option value={chainId === 31337 ? 'TEST' : 'SUT'}>
                  {chainId === 31337 ? 'TEST' : 'SUT'}
                </option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">
                Recipient Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={formData.recipientAddress}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recipientAddress: e.target.value,
                  })
                }
                className="w-full border rounded px-3 py-2"
                disabled={loading}
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Payment'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
```

### 3.2 환경변수 설정

**File**: `apps/demo/.env.local`

```bash
# API Configuration
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
STORE_API_KEY=sk_test_demo

# Optional: RPC endpoints
NEXT_PUBLIC_HARDHAT_RPC=http://127.0.0.1:8545
NEXT_PUBLIC_POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology
```

---

## ✅ Step 4: 검증 및 테스트 (30분)

### 4.1 Type Checking

```bash
cd apps/demo
pnpm build
```

### 4.2 개발 서버 실행

```bash
# Terminal 1: Hardhat node
cd contracts
pnpm hardhat node

# Terminal 2: Payment server
cd packages/server
pnpm dev

# Terminal 3: Demo app
cd apps/demo
pnpm dev
```

### 4.3 수동 테스트

1. **브라우저 열기**: http://localhost:3000
2. **지갑 연결**: MetaMask → Hardhat network 선택
3. **결제 생성**: "Create Payment" 버튼 클릭
4. **정보 입력**:
   - Amount: 100
   - Currency: TEST (Hardhat) 또는 SUT (Polygon Amoy)
   - Recipient: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
5. **결과 확인**:
   - ✅ Payment ID 생성됨
   - ✅ Token Address 수신됨 (서버에서)
   - ✅ Gateway Address 수신됨 (서버에서)

### 4.4 API 호출 확인

```bash
# Direct API test
curl -X POST http://localhost:3000/api/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "currency": "TEST",
    "chainId": 31337,
    "recipientAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  }'

# Expected response:
# {
#   "success": true,
#   "paymentId": "pay_1732960000000",
#   "tokenAddress": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
#   "gatewayAddress": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
#   "amount": "100000000000000000000",
#   "status": "pending"
# }
```

---

## 📊 변경 요약

| Component | Before | After | Status |
|-----------|--------|-------|--------|
| **wagmi.ts** | CONTRACTS, TOKENS 하드코딩 | config만 유지 | ✅ |
| **API Routes** | 없음 | create, status, gasless, relay | ✅ |
| **PaymentModal** | 하드코딩된 주소 | 서버 응답 사용 | ✅ |
| **환경변수** | 하드코딩 | .env.local 설정 | ✅ |
| **E2E Test** | 없음 | Playwright E2E 필요 | ⏳ |

---

## 🐛 Troubleshooting

### Issue 1: "Cannot find module '@msqpay/sdk'"

**Solution**:
```bash
# SDK 패키지 설치
cd apps/demo
pnpm install @msqpay/sdk
```

### Issue 2: "NEXT_PUBLIC_SERVER_URL is undefined"

**Solution**:
```bash
# .env.local 확인
cat apps/demo/.env.local

# 환경변수 설정
echo "NEXT_PUBLIC_SERVER_URL=http://localhost:3001" >> apps/demo/.env.local
```

### Issue 3: "Payment server connection failed"

**Solution**:
```bash
# Server running check
curl http://localhost:3001/health

# If failed, restart server
cd packages/server
pnpm dev
```

---

## 📈 Performance Targets

- Page load: <2s
- API response: <200ms
- Payment creation: <1s
- Linting: 0 errors
- Type checking: 0 errors

---

## 📚 Related Documents

- **SPEC**: `.moai/specs/SPEC-API-001/spec.md`
- **Server API**: `docs/api/payments.md`
- **Architecture**: `docs/architecture-payments.md`
- **SDK README**: `packages/sdk/README.md`

---

**Created by manager-docs on 2025-12-01**
