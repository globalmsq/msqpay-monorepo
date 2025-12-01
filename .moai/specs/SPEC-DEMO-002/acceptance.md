---
id: SPEC-DEMO-002
type: acceptance
version: "1.0.1"
status: "draft"
created: "2025-12-01"
updated: "2025-12-01"
---

# SPEC-DEMO-002 인수 기준 (Acceptance Criteria)

## 📋 Overview

이 문서는 SPEC-DEMO-002 "Demo App 서버 기반 블록체인 설정 적용"의 상세 인수 기준을 정의합니다.

모든 인수 기준은 **Given-When-Then** 형식으로 작성되었으며, 각 기준은 독립적으로 검증 가능합니다.

> **⚠️ 보안 필수사항 - 금액 조작 방지**
>
> AC-8, AC-9는 보안 관련 인수 기준으로, 반드시 통과해야 합니다.
> 프론트엔드에서 `amount`를 직접 전송하는 코드는 보안 취약점입니다.

---

## ✅ AC-1: API 클라이언트 함수 추가

### 시나리오
서버 API를 호출하여 블록체인 설정을 가져오는 클라이언트 함수가 정상적으로 동작해야 합니다.

### Given-When-Then
**GIVEN** api.ts 파일에 createPayment() 함수가 구현되어 있고
**WHEN** 유효한 CreatePaymentRequest로 호출하면
**THEN** 서버로부터 CreatePaymentResponse를 성공적으로 받는다.

### 검증 방법
```typescript
// Test: apps/demo/src/utils/api.test.ts
const request: CreatePaymentRequest = {
  merchantId: 'merchant-123',
  amount: 100,
  currency: 'USDC',
  chainId: 80002,
  description: 'Test payment',
};

const response = await createPayment(request);

expect(response.success).toBe(true);
expect(response.data?.paymentId).toBeDefined();
expect(response.data?.tokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
expect(response.data?.gatewayAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
```

### 예상 결과
- ✅ HTTP 200 응답
- ✅ response.success === true
- ✅ response.data 에 paymentId, tokenAddress, gatewayAddress 포함
- ✅ 모든 주소 형식이 유효한 Ethereum 주소 (0x...)

---

## ✅ AC-2: Zod 스키마 검증

### 시나리오
잘못된 요청 데이터는 Zod 스키마 검증에 의해 거부되어야 합니다.

### Given-When-Then
**GIVEN** 잘못된 chainId (-1)로 createPayment() 호출 시
**WHEN** Zod 스키마 검증이 실행되면
**THEN** VALIDATION_ERROR 코드와 함께 실패한다.

### 검증 방법
```typescript
// Test: apps/demo/src/utils/api.test.ts
const invalidRequest = {
  merchantId: 'merchant-123',
  amount: 100,
  currency: 'USDC',
  chainId: -1, // ❌ 잘못된 chainId
};

const response = await createPayment(invalidRequest);

expect(response.success).toBe(false);
expect(response.error?.code).toBe(ApiErrorCode.VALIDATION_ERROR);
expect(response.error?.details).toBeDefined();
```

### 예상 결과
- ✅ response.success === false
- ✅ response.error.code === "VALIDATION_ERROR"
- ✅ response.error.details 에 Zod 에러 정보 포함

### 추가 검증 케이스
```typescript
// 음수 amount
const invalidAmount = { ...validRequest, amount: -50 };
await createPayment(invalidAmount); // VALIDATION_ERROR

// 빈 merchantId
const invalidMerchant = { ...validRequest, merchantId: '' };
await createPayment(invalidMerchant); // VALIDATION_ERROR

// 잘못된 currency
const invalidCurrency = { ...validRequest, currency: 'ETH' };
await createPayment(invalidCurrency); // VALIDATION_ERROR
```

---

## ✅ AC-3: API 재시도 로직

### 시나리오
일시적인 서버 에러(5xx)는 자동으로 재시도되어야 합니다.

### Given-When-Then
**GIVEN** 서버가 500 에러를 2회 반환한 후 성공하는 경우
**WHEN** createPayment() 호출 시
**THEN** 최대 3회 재시도하여 최종적으로 성공한다.

### 검증 방법
```typescript
// Test: apps/demo/src/utils/api.test.ts
const mockResponse = {
  success: true,
  data: { paymentId: 'payment-123', /* ... */ },
};

// Mock fetch: 첫 2회는 500 에러, 3회째 성공
(global.fetch as any)
  .mockRejectedValueOnce(
    Object.assign(new Error('Internal Server Error'), { status: 500 })
  )
  .mockRejectedValueOnce(
    Object.assign(new Error('Internal Server Error'), { status: 500 })
  )
  .mockResolvedValueOnce({
    ok: true,
    json: async () => mockResponse,
  });

const result = await createPayment(validRequest);

expect(result.success).toBe(true);
expect(global.fetch).toHaveBeenCalledTimes(3); // 2회 실패 + 1회 성공
```

### 예상 결과
- ✅ 최대 3회까지 재시도
- ✅ 5xx 에러만 재시도 (4xx는 재시도하지 않음)
- ✅ 최종적으로 성공 응답 반환

### 추가 검증 케이스
```typescript
// 4xx 에러는 재시도하지 않음
mockRejectedValue({ status: 400 });
const result = await createPayment(validRequest);
expect(global.fetch).toHaveBeenCalledTimes(1); // 재시도 없음

// 3회 모두 실패하면 에러 반환
mockRejectedValue({ status: 500 }); // 3회
const result = await createPayment(validRequest);
expect(result.success).toBe(false);
expect(global.fetch).toHaveBeenCalledTimes(3);
```

---

## ✅ AC-4: PaymentModal 서버 설정 로드

### 시나리오
PaymentModal이 마운트될 때 자동으로 서버 API를 호출하여 블록체인 설정을 로드해야 합니다.

### Given-When-Then
**GIVEN** PaymentModal이 마운트되고
**WHEN** 지갑이 연결되어 있으면
**THEN** 자동으로 서버 API를 호출하여 블록체인 설정을 로드한다.

### 검증 방법
```typescript
// Test: apps/demo/src/components/PaymentModal.test.tsx
const createPaymentSpy = vi.spyOn(api, 'createPayment').mockResolvedValueOnce({
  success: true,
  data: {
    paymentId: 'payment-123',
    tokenAddress: '0x1234567890abcdef',
    gatewayAddress: '0xabcdef1234567890',
    amount: '100',
    currency: 'USDC',
    chainId: 80002,
    expiresAt: '2025-12-01T12:00:00Z',
  },
});

// Mock wagmi: 지갑 연결 상태
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x123', isConnected: true }),
  // ...
}));

render(<PaymentModal amount={100} merchantId="merchant-123" chainId={80002} currency="USDC" onClose={vi.fn()} onSuccess={vi.fn()} />);

await waitFor(() => {
  expect(createPaymentSpy).toHaveBeenCalledWith({
    merchantId: 'merchant-123',
    amount: 100,
    currency: 'USDC',
    chainId: 80002,
    description: expect.stringContaining('merchant-123'),
  });
});
```

### 예상 결과
- ✅ 컴포넌트 마운트 시 createPayment() 자동 호출
- ✅ 올바른 파라미터로 API 호출
- ✅ 지갑 미연결 시 API 호출하지 않음

### 추가 검증 케이스
```typescript
// 지갑 미연결 시 API 호출 없음
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: null, isConnected: false }),
}));

render(<PaymentModal {...props} />);
expect(createPaymentSpy).not.toHaveBeenCalled();
```

---

## ✅ AC-5: 서버 주소로 트랜잭션 생성

### 시나리오
사용자가 Approve 버튼을 클릭하면, 서버에서 받은 주소를 사용하여 트랜잭션을 생성해야 합니다.

### Given-When-Then
**GIVEN** 서버 설정이 로드된 상태에서
**WHEN** Approve 버튼을 클릭하면
**THEN** serverConfig.tokenAddress와 serverConfig.gatewayAddress를 사용하여 트랜잭션을 생성한다.

### 검증 방법
```typescript
// Test: apps/demo/src/components/PaymentModal.test.tsx
const writeContractSpy = vi.fn();

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x123', isConnected: true }),
  useWriteContract: () => ({ writeContract: writeContractSpy, data: null }),
  // ...
}));

// 서버 설정 로드 완료 대기
await waitFor(() => screen.getByText(/Approve USDC/i));

// Approve 버튼 클릭
const approveButton = screen.getByText(/Approve USDC/i);
await userEvent.click(approveButton);

// writeContract 호출 검증
expect(writeContractSpy).toHaveBeenCalledWith({
  address: '0x1234567890abcdef', // serverConfig.tokenAddress
  abi: expect.any(Array),
  functionName: 'approve',
  args: ['0xabcdef1234567890', expect.any(BigInt)], // gatewayAddress, amount
});
```

### 예상 결과
- ✅ serverConfig.tokenAddress로 approve 호출
- ✅ serverConfig.gatewayAddress를 spender로 사용
- ✅ 하드코딩된 주소 사용하지 않음

### 추가 검증 케이스
```typescript
// Pay Now 버튼 클릭 시
await userEvent.click(screen.getByText(/Pay Now/i));

expect(writeContractSpy).toHaveBeenCalledWith({
  address: '0xabcdef1234567890', // serverConfig.gatewayAddress
  abi: expect.any(Array),
  functionName: 'processPayment',
  args: [
    'payment-123', // paymentId
    '0x1234567890abcdef', // tokenAddress
    expect.any(BigInt), // amount
  ],
});
```

---

## ✅ AC-6: 레거시 코드 완전 제거

### 시나리오
wagmi.ts에서 LEGACY_CONTRACTS와 getContractsForChain() 함수가 완전히 삭제되어야 합니다.

### Given-When-Then
**GIVEN** wagmi.ts 파일을 검토할 때
**WHEN** LEGACY_CONTRACTS를 검색하면
**THEN** 검색 결과가 0개여야 한다.

### 검증 방법
```bash
# 스크립트: apps/demo/scripts/verify-cleanup.sh

# LEGACY_CONTRACTS 검색
LEGACY_COUNT=$(git grep -c "LEGACY_CONTRACTS" apps/demo/src || echo "0")

if [ "$LEGACY_COUNT" != "0" ]; then
  echo "❌ FAILED: LEGACY_CONTRACTS still exists!"
  exit 1
fi

# getContractsForChain 검색
GET_CONTRACTS_COUNT=$(git grep -c "getContractsForChain" apps/demo/src || echo "0")

if [ "$GET_CONTRACTS_COUNT" != "0" ]; then
  echo "❌ FAILED: getContractsForChain still exists!"
  exit 1
fi

# getTokenForChain은 유지되어야 함 (UI 표시용)
GET_TOKEN_COUNT=$(git grep -c "getTokenForChain" apps/demo/src || echo "0")

if [ "$GET_TOKEN_COUNT" == "0" ]; then
  echo "❌ FAILED: getTokenForChain was removed (should be kept)!"
  exit 1
fi

echo "✅ PASSED: All legacy code removed successfully!"
```

### 예상 결과
- ✅ LEGACY_CONTRACTS 검색 결과 0개
- ✅ getContractsForChain 검색 결과 0개
- ✅ getTokenForChain은 유지됨 (UI 표시용)

### 수동 검증
```typescript
// apps/demo/src/config/wagmi.ts 파일 확인

// ❌ 존재하지 않아야 함
// export const LEGACY_CONTRACTS = { ... };
// export function getContractsForChain(chainId: number) { ... }

// ✅ 존재해야 함
export function getTokenForChain(chainId: number) {
  // UI 표시용 토큰 정보
}
```

---

## ✅ AC-7: 테스트 커버리지 90% 달성

### 시나리오
모든 주요 파일에 대해 90% 이상의 테스트 커버리지를 달성해야 합니다.

### Given-When-Then
**GIVEN** 전체 테스트를 실행하고
**WHEN** 커버리지 리포트를 확인하면
**THEN** api.ts 95%+, PaymentModal.tsx 90%+, wagmi.ts 85%+ 커버리지를 달성한다.

### 검증 방법
```bash
# 전체 테스트 + 커버리지 실행
npm test -- --coverage

# 커버리지 리포트 확인
# api.ts: 95%+ (Statements, Branches, Functions, Lines 모두)
# PaymentModal.tsx: 90%+
# wagmi.ts: 85%+
```

### 예상 결과
```
File                    | Stmts | Branch | Funcs | Lines | Uncovered Lines
------------------------|-------|--------|-------|-------|------------------
api.ts                  | 96.5  | 95.0   | 100   | 96.8  | 45-47
PaymentModal.tsx        | 92.3  | 90.5   | 94.1  | 92.0  | 125, 180-182
wagmi.ts                | 87.5  | 85.0   | 88.9  | 87.2  | 67
------------------------|-------|--------|-------|-------|------------------
All files               | 91.8  | 90.2   | 93.5  | 91.5  |
```

### 커버리지 누락 허용 범위
- **api.ts**: 에러 핸들링 일부 케이스 (예: 네트워크 타임아웃)
- **PaymentModal.tsx**: 엣지 케이스 UI 상태 (예: 트랜잭션 대기 중 컴포넌트 언마운트)
- **wagmi.ts**: Chain ID 검증 로직 일부

### 추가 검증
```bash
# TypeScript 컴파일 에러 0개 (NFR-3)
npm run type-check
# Expected: ✅ No errors found

# ESLint 에러 0개
npm run lint
# Expected: ✅ No errors found

# 번들 크기 증가 <5KB (NFR-4)
npm run build
du -sh dist/assets/*.js
# Expected: 기존 대비 +3~4KB
```

---

## ✅ AC-8: 금액 조작 방지 검증 (보안)

### 시나리오
PaymentModal은 프론트엔드에서 금액을 직접 받지 않고, productId만 받아야 합니다.

### Given-When-Then
**GIVEN** PaymentModal 컴포넌트 코드를 검토할 때
**WHEN** props 인터페이스를 확인하면
**THEN** `amount` props가 없고 `productId` props만 존재해야 한다.

### 검증 방법
```bash
# PaymentModal props에서 amount 검색
git grep "amount.*:" apps/demo/src/components/PaymentModal.tsx | grep -i "props"

# Expected: 검색 결과 없음 (amount props가 없어야 함)

# productId props 확인
git grep "productId.*:" apps/demo/src/components/PaymentModal.tsx | grep -i "props"

# Expected: productId: string; 라인 존재
```

### 예상 결과
- ✅ PaymentModalProps에 `amount` 없음
- ✅ PaymentModalProps에 `productId` 존재
- ✅ 프론트엔드에서 가격을 직접 전달하지 않음

---

## ✅ AC-9: 서버 측 가격 조회 검증 (보안)

### 시나리오
Next.js API Route는 클라이언트에서 받은 금액이 아닌, 서버에서 조회한 가격으로 결제서버 API를 호출해야 합니다.

### Given-When-Then
**GIVEN** Next.js API Route `/api/checkout` 코드를 검토할 때
**WHEN** 결제서버 API 호출 로직을 확인하면
**THEN** `amount`는 서버에서 조회한 가격을 사용하고, 클라이언트에서 받은 값을 사용하지 않아야 한다.

### 검증 방법
```typescript
// apps/demo/src/app/api/checkout/route.ts 확인

// ❌ 잘못된 구현 (클라이언트에서 받은 amount 사용)
const { productId, amount } = await request.json();
// amount를 직접 사용하면 안됨!

// ✅ 올바른 구현 (서버에서 가격 조회)
const { productId } = await request.json();
const product = PRODUCTS.find(p => p.id === productId);
const amount = product.price; // 서버에서 조회한 가격
```

### 예상 결과
- ✅ 클라이언트에서 `amount` 파라미터를 받지 않음
- ✅ 서버에서 `productId`로 상품 가격 조회
- ✅ 조회된 가격으로 결제서버 API 호출

### 보안 검증 스크립트
```bash
#!/bin/bash
# scripts/verify-security.sh

echo "🔒 보안 검증: 금액 조작 방지..."

# 1. PaymentModal에서 amount props 검색
AMOUNT_PROPS=$(git grep -E "amount\s*:" apps/demo/src/components/PaymentModal.tsx | grep -i "props" | wc -l)

if [ "$AMOUNT_PROPS" != "0" ]; then
  echo "❌ FAILED: PaymentModal에 amount props가 존재합니다!"
  echo "   프론트엔드에서 amount를 받으면 금액 조작이 가능합니다."
  exit 1
fi

# 2. API Route에서 클라이언트 amount 사용 검색
CLIENT_AMOUNT=$(git grep -E "const.*amount.*=.*request" apps/demo/src/app/api/ | wc -l)

if [ "$CLIENT_AMOUNT" != "0" ]; then
  echo "❌ FAILED: API Route에서 클라이언트 amount를 사용합니다!"
  echo "   서버에서 가격을 조회해야 합니다."
  exit 1
fi

echo "✅ PASSED: 금액 조작 방지 보안 검증 통과!"
exit 0
```

---

## 📊 통합 검증 체크리스트

모든 인수 기준을 통합적으로 검증하는 체크리스트입니다.

### 🔧 개발 환경 검증
- [ ] TypeScript 컴파일 에러 0개 (`npm run type-check`)
- [ ] ESLint 에러 0개 (`npm run lint`)
- [ ] 전체 테스트 통과 (`npm test`)
- [ ] 커버리지 ≥90% (`npm test -- --coverage`)

### 🧪 기능 검증
- [ ] AC-1: API 클라이언트 함수 정상 동작
- [ ] AC-2: Zod 스키마 검증 정상 동작
- [ ] AC-3: API 재시도 로직 정상 동작
- [ ] AC-4: PaymentModal 서버 설정 자동 로드
- [ ] AC-5: 서버 주소로 트랜잭션 생성
- [ ] AC-6: 레거시 코드 완전 제거
- [ ] AC-7: 테스트 커버리지 90% 달성

### 🔒 보안 검증
- [ ] AC-8: 금액 조작 방지 검증 (PaymentModal에 amount props 없음)
- [ ] AC-9: 서버 측 가격 조회 검증 (API Route에서 서버 가격 사용)

### 🚀 통합 테스트
- [ ] 통합 테스트 통과 (`payment-flow.test.tsx`)
- [ ] E2E 테스트 통과 (선택사항, `npx playwright test`)

### 📦 빌드 검증
- [ ] 프로덕션 빌드 성공 (`npm run build`)
- [ ] 번들 크기 증가 <5KB
- [ ] 빌드 결과물에 에러 없음

### 🎯 성능 검증
- [ ] API 응답 시간 ≤3초 (NFR-1)
- [ ] 로딩 상태 표시 정상 동작 (FR-5)
- [ ] 에러 처리 및 재시도 버튼 정상 동작 (IR-3)

---

## 🎯 Definition of Done

모든 다음 조건을 만족해야 SPEC-DEMO-002가 완료된 것으로 간주합니다:

1. ✅ 모든 인수 기준 (AC-1 ~ AC-9) 통과
2. ✅ 테스트 커버리지 ≥90%
3. ✅ TypeScript/ESLint 에러 0개
4. ✅ 레거시 코드 완전 제거 검증 통과
5. ✅ 통합 테스트 통과
6. ✅ 프로덕션 빌드 성공
7. ✅ 성능 요구사항 충족 (API ≤3초)
8. ✅ **보안 검증 통과 (AC-8, AC-9)** ← 필수!
9. ✅ 코드 리뷰 완료 (Team 모드인 경우)
10. ✅ 문서화 완료 (`/moai:3-sync SPEC-DEMO-002`)

---

**Status**: Draft
**Last Updated**: 2025-12-01
**Total Acceptance Criteria**: 9개 (보안 2개 포함)
