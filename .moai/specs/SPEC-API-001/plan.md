---
id: SPEC-API-001
version: "1.0.0"
---

# 구현 계획 (Implementation Plan)

## Phase 1: 서버 설정 (4시간)

### 1.1 chains.ts 생성
**파일**: `packages/server/src/config/chains.ts`

**작업**:
- ChainConfig 인터페이스 정의
- SUPPORTED_CHAINS 배열 생성
- 체인별 컨트랙트 주소 매핑 (Polygon Amoy, Hardhat)
- 체인별 토큰 주소 매핑

**산출물**:
```typescript
export const SUPPORTED_CHAINS: ChainConfig[] = [
  { id: 80002, name: "Polygon Amoy", contracts: {...}, tokens: {...} },
  { id: 31337, name: "Hardhat", contracts: {...}, tokens: {...} }
];
```

**검증**:
- TypeScript 컴파일 성공
- 모든 주소가 유효한 Ethereum 주소 형식 (0x + 40자)

---

### 1.2 payment.schema.ts 수정
**파일**: `packages/server/src/schemas/payment.schema.ts`

**작업**:
- CreatePaymentSchema에 `chainId` 필드 추가
- CreatePaymentSchema에 `currency` 필드 추가
- Zod 검증 규칙 업데이트
  - chainId: positive integer
  - currency: string (추후 enum 가능)

**Before**:
```typescript
export const CreatePaymentSchema = z.object({
  amount: z.number().positive(),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});
```

**After**:
```typescript
export const CreatePaymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
  chainId: z.number().int().positive(),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});
```

**검증**:
- Zod 스키마 테스트 작성
- 유효한 입력값 테스트 (chainId=80002, currency="SUT")
- 유효하지 않은 입력값 테스트 (chainId=-1, currency="")

---

### 1.3 blockchain.service.ts 확장
**파일**: `packages/server/src/services/blockchain.service.ts`

**작업**:
1. **getTokenAddress 메서드 추가**
   - 입력: chainId, symbol
   - 출력: token address
   - 에러: UNSUPPORTED_CHAIN, UNSUPPORTED_TOKEN

2. **getChainContracts 메서드 추가**
   - 입력: chainId
   - 출력: { gateway, forwarder }
   - 에러: UNSUPPORTED_CHAIN

3. **getDecimals 메서드 추가**
   - 입력: chainId, tokenAddress
   - viem readContract 사용
   - fallback: decimals 조회 실패 시 18 반환
   - 경고 로그 출력

**구현 예시**:
```typescript
export class BlockchainService {
  async getTokenAddress(chainId: number, symbol: string): Promise<string> {
    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
    if (!chain) throw new Error("UNSUPPORTED_CHAIN");

    const tokenAddress = chain.tokens[symbol];
    if (!tokenAddress) throw new Error("UNSUPPORTED_TOKEN");

    return tokenAddress;
  }

  async getDecimals(chainId: number, tokenAddress: string): Promise<number> {
    try {
      return await readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      });
    } catch (error) {
      console.warn(`Failed to get decimals for ${tokenAddress}, using fallback 18`);
      return 18;
    }
  }
}
```

**검증**:
- Unit tests: getTokenAddress, getChainContracts, getDecimals
- Integration test: viem readContract 호출
- Error handling test: UNSUPPORTED_CHAIN, UNSUPPORTED_TOKEN

---

### 1.4 routes/payments/create.ts 수정
**파일**: `packages/server/src/routes/payments/create.ts`

**작업**:
1. Request 타입 변경
   - CreatePaymentSchema 적용 (chainId, currency 포함)

2. 체인 검증 로직 추가
   - SUPPORTED_CHAINS에서 chainId 조회
   - 없으면 HTTP 400 UNSUPPORTED_CHAIN

3. 토큰 주소 조회
   - blockchainService.getTokenAddress(chainId, currency)
   - 실패 시 HTTP 400 UNSUPPORTED_TOKEN

4. decimals 조회 및 변환
   - blockchainService.getDecimals(chainId, tokenAddress)
   - parseUnits(amount, decimals) → wei

5. Response에 블록체인 정보 추가
   - tokenAddress
   - gatewayAddress
   - forwarderAddress
   - amount (wei)

**검증**:
- API 통합 테스트
- 정상 케이스: chainId=80002, currency="SUT"
- 에러 케이스: 지원하지 않는 체인/토큰

---

## Phase 2: SDK 업데이트 (3시간)

### 2.1 sdk/types.ts 수정
**파일**: `packages/sdk/src/types.ts`

**작업**:
- CreatePaymentRequest에 chainId, currency 필드 추가
- CreatePaymentResponse에 tokenAddress, gatewayAddress, forwarderAddress 추가

**Before**:
```typescript
export interface CreatePaymentRequest {
  amount: number;
  recipientAddress: string;
}
```

**After**:
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
  amount: string; // wei
  status: string;
}
```

**검증**:
- TypeScript 컴파일 성공
- 타입 정의 문서화

---

### 2.2 sdk/client.ts 수정
**파일**: `packages/sdk/src/client.ts`

**작업**:
- createPayment 메서드 파라미터 업데이트
- Request body에 chainId, currency 포함
- Response 타입 업데이트

**Before**:
```typescript
async createPayment(params: { amount: number; recipientAddress: string }) {
  // ...
}
```

**After**:
```typescript
async createPayment(params: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  const response = await fetch(`${this.baseURL}/payments/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create payment');
  }

  return response.json();
}
```

**검증**:
- SDK 단위 테스트
- Mock 서버로 통합 테스트

---

### 2.3 Breaking Change 문서 작성
**파일**: `packages/sdk/BREAKING_CHANGES.md`

**작업**:
- v1.x → v2.0.0 Breaking Change 문서 작성
- Migration Guide 제공

**내용**:
```markdown
# Breaking Changes in v2.0.0

## createPayment API

**Before (v1.x)**:
\`\`\`typescript
client.createPayment({
  amount: 100,
  recipientAddress: "0x...",
});
\`\`\`

**After (v2.0.0)**:
\`\`\`typescript
client.createPayment({
  amount: 100,
  currency: "SUT",
  chainId: 80002,
  recipientAddress: "0x...",
});
\`\`\`

## Migration Guide

1. Add `chainId` parameter from wagmi `useChainId()` hook
2. Add `currency` parameter (token symbol)
3. Update response handling to use `tokenAddress`, `gatewayAddress`, `forwarderAddress`
```

**검증**:
- 문서 리뷰
- 예제 코드 검증

---

## Phase 3: Demo App 통합 (4시간)

### 3.1 demo/wagmi.ts 리팩토링
**파일**: `apps/demo/src/lib/wagmi.ts`

**작업**:
1. **CONTRACTS 객체 제거**
   ```typescript
   // ❌ 삭제
   export const CONTRACTS: Record<number, { gateway: string; forwarder: string }> = { ... };
   ```

2. **TOKENS 객체 제거**
   ```typescript
   // ❌ 삭제
   export const TOKENS: Record<number, Record<string, string>> = { ... };
   ```

3. **wagmi config 유지**
   ```typescript
   // ✅ 유지
   export const config = createConfig({
     chains: [polygonAmoy, hardhat],
     transports: { ... },
   });
   ```

**검증**:
- TypeScript 컴파일 성공
- 다른 컴포넌트에서 CONTRACTS, TOKENS 참조 제거 확인

---

### 3.2 demo/api/payments/create/route.ts 생성
**파일**: `apps/demo/src/app/api/payments/create/route.ts`

**작업**:
1. MSQPayClient 인스턴스 생성
2. POST 핸들러 작성
3. Request body 검증
4. SDK createPayment 호출
5. Response 반환

**구현**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@msqpay/sdk';

const client = new MSQPayClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001',
});

export async function POST(request: NextRequest) {
  const body = await request.json();

  const payment = await client.createPayment({
    amount: body.amount,
    currency: body.currency,
    chainId: body.chainId,
    recipientAddress: body.recipientAddress,
  });

  return NextResponse.json(payment);
}
```

**검증**:
- API route 테스트
- 환경변수 설정 확인

---

### 3.3 E2E 테스트 작성
**파일**: `apps/demo/tests/e2e/payment-flow.spec.ts`

**작업**:
1. Playwright 테스트 설정
2. 결제 생성 E2E 테스트
3. 트랜잭션 실행 검증

**테스트 시나리오**:
```typescript
test('createPayment E2E flow', async ({ page }) => {
  // 1. Demo App 접속
  await page.goto('http://localhost:3000');

  // 2. MetaMask 연결 (chainId=31337)
  await page.click('button:has-text("Connect Wallet")');

  // 3. 결제 생성 버튼 클릭
  await page.fill('input[name="amount"]', '100');
  await page.click('button:has-text("Create Payment")');

  // 4. 서버 응답 확인
  const responseText = await page.locator('[data-testid="payment-response"]').textContent();
  const response = JSON.parse(responseText);

  expect(response.tokenAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  expect(response.gatewayAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  expect(response.forwarderAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
});
```

**검증**:
- E2E 테스트 성공
- Hardhat 로컬 네트워크에서 실행

---

## Phase 4: 문서화 (1시간)

### 4.1 docs/api/payments.md 최종 동기화
**파일**: `docs/api/payments.md`

**작업**:
1. Request 예시 업데이트 (chainId, currency 추가)
2. Response 예시 업데이트 (블록체인 정보 추가)
3. 에러 코드 문서화 (UNSUPPORTED_CHAIN, UNSUPPORTED_TOKEN)
4. 지원 체인/토큰 목록 추가

**검증**:
- 문서와 실제 API 응답 일치 확인
- OpenAPI 스펙 업데이트 (선택)

---

## Risk Analysis (위험 분석)

### 1. ERC20 decimals 조회 실패
**위험도**: Medium
**영향**: 금액 변환 오류
**대응**:
- fallback 18 decimals 사용
- 경고 로그 남기기
- 모니터링 설정

### 2. SDK Breaking Change
**위험도**: High
**영향**: 기존 상점 앱 동작 불가
**대응**:
- MAJOR 버전 업데이트 (v2.0.0)
- Breaking Change 문서 작성
- Migration Guide 제공
- v1.x 지원 기간 공지 (예: 3개월)

### 3. Demo App 전면 수정
**위험도**: Medium
**영향**: 개발 시간 증가
**대응**:
- Phase 3 집중 테스트
- Hardhat 로컬 환경 E2E 검증
- Polygon Amoy Testnet 검증

---

## Timeline (일정)

| Phase | 작업 | 예상 시간 |
|-------|------|----------|
| Phase 1 | 서버 설정 | 4시간 |
| Phase 2 | SDK 업데이트 | 3시간 |
| Phase 3 | Demo App 통합 | 4시간 |
| Phase 4 | 문서화 | 1시간 |
| **총계** | | **12시간** |

**권장 일정**: 3일 (하루 4시간 작업 기준)

---

## Next Steps (다음 단계)

구현 완료 후:

1. `/moai:2-run SPEC-API-001` 실행
   - TDD 사이클 (RED-GREEN-REFACTOR)
   - 테스트 커버리지 ≥ 90% 달성

2. `/moai:3-sync SPEC-API-001` 실행
   - API 문서 동기화
   - Breaking Change 문서 최종 검토
   - PR 생성 (Draft → Ready for Review)

3. QA 테스트
   - Hardhat 로컬 환경
   - Polygon Amoy Testnet

4. Production 배포
   - SDK v2.0.0 npm 배포
   - Server 배포
   - Demo App 배포
