---
id: SPEC-API-001-DEMO
version: "1.0.0"
status: "ready"
created: "2025-12-01"
parent: SPEC-API-001
priority: "high"
---

# SPEC-API-001 Demo App 구현 계획

## 1. 현황 분석

### 1.1 완료된 작업 (Server + SDK)
- `packages/server/src/config/chains.ts` - ChainConfig, SUPPORTED_CHAINS 구현
- `packages/server/src/services/blockchain.service.ts` - getTokenAddress, getChainContracts, getDecimals 메서드
- `packages/server/src/schemas/payment.schema.ts` - chainId, currency 필드 추가
- `packages/server/src/routes/payments/create.ts` - 체인/토큰 검증 로직
- `packages/sdk` - 타입 및 클라이언트 업데이트
- **테스트**: 154개 PASS

### 1.2 미완료 작업 (Demo App)

| 파일 | 현재 상태 | 문제점 |
|------|----------|--------|
| `PaymentModal.tsx` L106-107 | `getTokenForChain()`, `getContractsForChain()` 사용 | 레거시 하드코딩 함수 |
| `wagmi.ts` L58-75 | LEGACY_CONTRACTS 존재, DEPRECATED 주석만 | 실제 삭제 안됨 |

### 1.3 핵심 문제 코드

```typescript
// PaymentModal.tsx L106-107 (현재)
const token = getTokenForChain(chainId);        // ❌ 하드코딩된 주소
const contracts = getContractsForChain(chainId); // ❌ 하드코딩된 주소

// PaymentModal.tsx L191-195 (Approve에서 사용)
const hash = await walletClient.writeContract({
  address: token.address as Address,       // ❌ 레거시 주소
  // ...
  args: [contracts.gateway as Address, amount], // ❌ 레거시 주소
});

// PaymentModal.tsx L219-228 (Payment에서 사용)
const hash = await walletClient.writeContract({
  address: contracts.gateway as Address,   // ❌ 레거시 주소
  // ...
  args: [paymentId, token.address as Address, amount, ...], // ❌ 레거시 주소
});
```

---

## 2. 구현 목표

### 2.1 SPEC 요구사항 충족

| AC | 요구사항 | 구현 방법 |
|----|----------|----------|
| AC-1 | wagmi.ts 하드코딩 완전 제거 | LEGACY_CONTRACTS, getContractsForChain() 삭제 |
| AC-8 | 서버 응답으로 트랜잭션 생성 | API 호출 후 tokenAddress, gatewayAddress 사용 |

### 2.2 서버 응답 구조 (이미 구현됨)

```typescript
// POST /api/payments/create 응답
{
  success: true,
  paymentId: string,
  tokenAddress: string,      // 서버가 제공하는 토큰 주소
  gatewayAddress: string,    // 서버가 제공하는 게이트웨이 주소
  forwarderAddress: string,  // 서버가 제공하는 포워더 주소
  amount: string,            // wei 단위로 변환된 금액
  status: "pending"
}
```

---

## 3. 구현 계획

### Phase 1: API 클라이언트 함수 추가 (30분)

**파일**: `apps/demo/src/lib/api.ts`

**작업**:
1. `createPayment()` 함수 추가
2. 타입 정의 추가

**추가 코드**:
```typescript
export interface CreatePaymentRequest {
  amount: number;
  currency: string;
  chainId: number;
  recipientAddress: string;
}

export interface CreatePaymentResponse {
  success: boolean;
  paymentId: string;
  tokenAddress: string;
  gatewayAddress: string;
  forwarderAddress: string;
  amount: string;
  status: string;
}

export async function createPayment(
  params: CreatePaymentRequest
): Promise<ApiResponse<CreatePaymentResponse>> {
  const response = await fetch(`${API_URL}/payments/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create payment' }));
    return { success: false, code: error.code, message: error.message };
  }

  const data = await response.json();
  return { success: true, data };
}
```

---

### Phase 2: PaymentModal.tsx 수정 (2시간)

**파일**: `apps/demo/src/components/PaymentModal.tsx`

#### 2.1 Import 변경

```typescript
// 삭제
import { getTokenForChain, getContractsForChain } from "@/lib/wagmi";

// 추가
import { getTokenForChain } from "@/lib/wagmi"; // UI 표시용만 유지
import { createPayment } from "@/lib/api";
```

#### 2.2 State 추가 (L103 이후)

```typescript
// 서버에서 받은 블록체인 설정
const [serverConfig, setServerConfig] = useState<{
  paymentId: string;
  tokenAddress: string;
  gatewayAddress: string;
  forwarderAddress: string;
  amount: string;
} | null>(null);
const [configLoading, setConfigLoading] = useState(false);
const [configError, setConfigError] = useState<string | null>(null);
```

#### 2.3 레거시 코드 제거 (L107)

```typescript
// 삭제
const contracts = getContractsForChain(chainId);

// 유지 (UI 표시용)
const token = getTokenForChain(chainId);
```

#### 2.4 서버 설정 로드 useEffect 추가

```typescript
// 결제 시작 시 서버에서 블록체인 설정 로드
const loadServerConfig = useCallback(async () => {
  if (!address || !token) return;

  try {
    setConfigLoading(true);
    setConfigError(null);

    const result = await createPayment({
      amount: parseFloat(product.price),
      currency: token.symbol,
      chainId,
      recipientAddress: DEMO_MERCHANT_ADDRESS,
    });

    if (result.success && result.data) {
      setServerConfig({
        paymentId: result.data.paymentId,
        tokenAddress: result.data.tokenAddress,
        gatewayAddress: result.data.gatewayAddress,
        forwarderAddress: result.data.forwarderAddress,
        amount: result.data.amount,
      });
    } else {
      setConfigError(result.message || 'Failed to load blockchain config');
    }
  } catch (error) {
    setConfigError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    setConfigLoading(false);
  }
}, [address, token, product.price, chainId]);

useEffect(() => {
  loadServerConfig();
}, [loadServerConfig]);
```

#### 2.5 handleApprove 수정 (L184-205)

```typescript
const handleApprove = async () => {
  if (!walletClient || !address || !serverConfig) {
    setError("Blockchain configuration not ready");
    return;
  }

  try {
    setStatus("approving");
    setError(null);

    const hash = await walletClient.writeContract({
      address: serverConfig.tokenAddress as Address,  // 서버 주소 사용
      abi: ERC20_ABI,
      functionName: "approve",
      args: [
        serverConfig.gatewayAddress as Address,       // 서버 주소 사용
        BigInt(serverConfig.amount)                   // 서버 계산 wei 사용
      ],
    });

    setApproveTxHash(hash);
  } catch (err: unknown) {
    console.error("Approval error:", err);
    const message = err instanceof Error ? err.message : "Approval failed";
    setError(message);
    setStatus("error");
  }
};
```

#### 2.6 handleDirectPayment 수정 (L208-251)

```typescript
const handleDirectPayment = async () => {
  if (!walletClient || !address || !serverConfig) {
    setError("Blockchain configuration not ready");
    return;
  }

  try {
    setStatus("paying");
    setError(null);

    // 서버가 생성한 paymentId 사용 (중복 방지)
    setCurrentPaymentId(serverConfig.paymentId);

    const hash = await walletClient.writeContract({
      address: serverConfig.gatewayAddress as Address,  // 서버 주소 사용
      abi: PAYMENT_GATEWAY_ABI,
      functionName: "pay",
      args: [
        serverConfig.paymentId as `0x${string}`,        // 서버 생성 ID
        serverConfig.tokenAddress as Address,           // 서버 주소 사용
        BigInt(serverConfig.amount),                    // 서버 계산 wei 사용
        DEMO_MERCHANT_ADDRESS as Address,
      ],
    });

    setPendingTxHash(hash);
    await pollPaymentStatus(serverConfig.paymentId);

    setStatus("success");
    if (onSuccess) {
      onSuccess(hash);
    }
    setTimeout(() => { onClose(); }, 1500);
  } catch (err: unknown) {
    console.error("Payment error:", err);
    const message = err instanceof Error ? err.message : "Payment failed";
    setError(message);
    setStatus("error");
  }
};
```

#### 2.7 useReadContract 수정 (L110-129)

```typescript
// Read token balance
const { data: balance, isLoading: balanceLoading } = useReadContract({
  address: serverConfig?.tokenAddress as Address,  // 서버 주소 사용
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: address ? [address] : undefined,
  query: {
    enabled: !!address && !!serverConfig,
  },
});

// Read token allowance
const { data: allowance, refetch: refetchAllowance } = useReadContract({
  address: serverConfig?.tokenAddress as Address,  // 서버 주소 사용
  abi: ERC20_ABI,
  functionName: "allowance",
  args: address && serverConfig
    ? [address, serverConfig.gatewayAddress as Address]  // 서버 주소 사용
    : undefined,
  query: {
    enabled: !!address && !!serverConfig,
  },
});
```

#### 2.8 UI 로딩 상태 추가

```typescript
{/* 설정 로딩 상태 */}
{configLoading && (
  <div className="text-sm text-gray-500">Loading blockchain configuration...</div>
)}

{/* 설정 에러 */}
{configError && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
    {configError}
  </div>
)}
```

---

### Phase 3: wagmi.ts 정리 (30분)

**파일**: `apps/demo/src/lib/wagmi.ts`

**삭제할 코드**:

```typescript
// L56-75 삭제
const LEGACY_CONTRACTS: Record<number, { gateway: `0x${string}`; forwarder: `0x${string}` }> = {
  // ... 전체 삭제
};

export function getContractsForChain(chainId: number): { gateway: `0x${string}`; forwarder: `0x${string}` } | undefined {
  // ... 전체 삭제
}
```

**유지할 코드**:

```typescript
// UI 표시용 (getTokenForChain)
export const DEFAULT_TOKEN_SYMBOL: Record<number, string> = { ... };
export const TOKENS: Record<number, Record<string, `0x${string}`>> = { ... };
export function getTokenForChain(chainId: number) { ... }
```

---

## 4. 테스트 계획

### 4.1 Unit Tests

| 테스트 | 파일 | 설명 |
|--------|------|------|
| createPayment API | `api.test.ts` | 서버 호출 및 응답 검증 |
| PaymentModal | `PaymentModal.test.tsx` | 서버 설정 로드 및 사용 |

### 4.2 Integration Tests

| 테스트 | 설명 |
|--------|------|
| chainId=31337 | Hardhat 로컬에서 전체 플로우 |
| chainId=80002 | Polygon Amoy에서 전체 플로우 |

### 4.3 검증 체크리스트

- [ ] `createPayment()` 함수 추가 및 동작 확인
- [ ] PaymentModal에서 서버 응답 사용 확인
- [ ] Approve TX에 서버 주소 사용 확인
- [ ] Payment TX에 서버 주소 사용 확인
- [ ] LEGACY_CONTRACTS 삭제 확인
- [ ] getContractsForChain() 삭제 확인
- [ ] 전체 결제 플로우 테스트

---

## 5. 예상 소요 시간

| Phase | 작업 | 시간 |
|-------|------|------|
| Phase 1 | API 클라이언트 함수 추가 | 30분 |
| Phase 2 | PaymentModal.tsx 수정 | 2시간 |
| Phase 3 | wagmi.ts 정리 | 30분 |
| **총계** | | **3시간** |

---

## 6. 위험 분석

### 6.1 paymentId 불일치 (Critical)

**문제**: 기존 `generatePaymentId()`가 클라이언트에서 생성하지만, 서버도 독립적으로 생성
**해결**: 서버가 생성한 `serverConfig.paymentId` 사용

### 6.2 API 호출 타이밍 (Medium)

**문제**: 컴포넌트 마운트 시 API 호출로 불필요한 서버 부하 가능
**해결**: 현재는 단순 구현, 추후 캐싱 고려

### 6.3 로딩 상태 UX (Low)

**문제**: 서버 설정 로드 중 버튼 비활성화 필요
**해결**: `configLoading` 상태 체크 추가

---

## 7. 실행 명령

```bash
# 구현 시작
/moai:2-run SPEC-API-001-DEMO

# 완료 후 문서 동기화
/moai:3-sync SPEC-API-001
```
