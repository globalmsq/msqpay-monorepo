---
id: SPEC-API-001
version: "1.1.0"
status: "completed"
created: "2025-12-01"
updated: "2025-12-09"
author: "R2-D2"
priority: "high"
---

## HISTORY

| 버전 | 날짜 | 작성자 | 변경 내역 |
|------|------|--------|----------|
| 1.0.0 | 2025-12-01 | R2-D2 | 초안 작성 (SPEC-API-002에서 SPEC-API-001로 리팩토링) |
| 1.1.0 | 2025-12-09 | System | 구현 완료 - 서버 Single Source of Truth 달성, Demo App 트랜잭션에서 서버 응답 주소 사용 |

---

# SPEC-API-001: createPayment API 개선

## 1. Environment (환경)

**시스템**: MSQ Pay 결제 시스템
**대상 컴포넌트**:
- packages/pay-server (결제 서버)
- packages/sdk (상점 SDK)
- apps/demo (데모 앱)

**기술 스택**:
- Node.js 20+ LTS
- Hono.js v4
- Zod v3
- Viem v2
- Wagmi v2

**지원 블록체인**:
- Polygon Amoy (chainId: 80002)
- Hardhat Local (chainId: 31337)

---

## 2. Assumptions (가정)

1. **상점은 사용자 지갑의 chainId를 정확히 전달한다**
   - wagmi의 `useChainId()` 훅을 통해 연결된 체인 ID 확인

2. **모든 토큰은 ERC20 표준 준수**
   - decimals(), symbol() 메서드 지원
   - decimals 조회 실패 시 fallback: 18로 간주

3. **체인별 컨트랙트는 결제 서버에서 중앙 관리**
   - chains.ts에 체인별 Gateway, Forwarder, Token 매핑
   - 새 체인/토큰 추가는 서버 설정만 변경

4. **상점 앱은 서버 응답을 신뢰**
   - tokenAddress, gatewayAddress를 검증 없이 사용
   - 보안: 결제 서버는 지원하는 체인/토큰만 응답

---

## 3. Requirements (요구사항)

### 3.1 Ubiquitous (시스템 전반)

**REQ-001**: 결제 서버는 모든 블록체인 정보를 Single Source of Truth로 제공해야 한다
- 체인별 Gateway, Forwarder, Token 주소
- 토큰 decimals 정보
- wei 단위 변환된 금액

**REQ-002**: 상점 앱은 컨트랙트 주소를 하드코딩하지 않는다
- wagmi.ts의 CONTRACTS, TOKENS 객체 제거
- 모든 주소는 서버 응답에서 조회

### 3.2 Event-driven (이벤트 기반)

**REQ-003**: 사용자가 지갑을 연결하면(wagmi connected)
- chainId를 자동으로 감지
- 결제 생성 시 chainId를 서버에 전달

**REQ-004**: createPayment 요청 시
- chainId, currency가 지원 목록에 없으면 HTTP 400 반환
- code: "UNSUPPORTED_CHAIN" 또는 "UNSUPPORTED_TOKEN"

**REQ-005**: ERC20 decimals 조회 실패 시
- fallback으로 18 decimals 사용
- Warning 로그 기록

### 3.3 State-driven (상태 기반)

**REQ-006**: chainId가 80002 또는 31337일 때
- 해당 체인의 컨트랙트 주소 반환
- 지원하지 않는 chainId는 에러 응답

**REQ-007**: currency가 해당 체인의 지원 토큰 목록에 있을 때
- 토큰 주소 및 decimals 정보 반환
- 지원하지 않는 currency는 에러 응답

### 3.4 Unwanted (금지)

**REQ-008**: 절대 하드코딩된 주소를 반환하지 않는다
- chains.ts에서 동적 조회
- 환경변수(.env)로 체인별 설정 가능

**REQ-009**: decimals가 없는 토큰은 거부하지 않는다
- fallback 처리 후 경고만 기록

---

## 4. Architecture (아키텍처)

### 4.1 파일 구조 변경

#### 서버 (packages/pay-server)

**신규 파일**:

1. **src/config/chains.ts**
   ```typescript
   export interface ChainConfig {
     id: number;
     name: string;
     contracts: {
       gateway: string;
       forwarder: string;
     };
     tokens: Record<string, string>; // symbol -> address
   }

   export const SUPPORTED_CHAINS: ChainConfig[] = [
     {
       id: 80002,
       name: "Polygon Amoy",
       contracts: {
         gateway: "0x0000000000000000000000000000000000000000",
         forwarder: "0x0000000000000000000000000000000000000000",
       },
       tokens: {
         SUT: "0xE4C687167705Abf55d709395f92e254bdF5825a2",
       },
     },
     {
       id: 31337,
       name: "Hardhat",
       contracts: {
         gateway: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
         forwarder: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
       },
       tokens: {
         TEST: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
       },
     },
   ];
   ```

2. **src/services/blockchain.service.ts 확장**
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
         // viem으로 decimals() 호출
         return await readContract({ address: tokenAddress, functionName: 'decimals' });
       } catch (error) {
         console.warn(`Failed to get decimals for ${tokenAddress}, using fallback 18`);
         return 18;
       }
     }
   }
   ```

**수정 파일**:

3. **src/schemas/payment.schema.ts**
   ```typescript
   export const CreatePaymentSchema = z.object({
     amount: z.number().positive(),
     currency: z.string(), // "SUT", "MSQ", "TEST"
     chainId: z.number().int().positive(),
     recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
   });
   ```

4. **src/routes/payments/create.ts**
   ```typescript
   export default async function createPaymentRoute(c: Context) {
     const body = await c.req.json();
     const validated = CreatePaymentSchema.parse(body);

     // 체인 검증
     const chain = SUPPORTED_CHAINS.find(c => c.id === validated.chainId);
     if (!chain) {
       return c.json({ code: "UNSUPPORTED_CHAIN", message: `Chain ID ${validated.chainId} is not supported` }, 400);
     }

     // 토큰 주소 조회
     const tokenAddress = await blockchainService.getTokenAddress(validated.chainId, validated.currency);
     if (!tokenAddress) {
       return c.json({ code: "UNSUPPORTED_TOKEN", message: `Token ${validated.currency} not supported on chain ${validated.chainId}` }, 400);
     }

     // decimals 조회 (fallback: 18)
     const decimals = await blockchainService.getDecimals(validated.chainId, tokenAddress);
     const amountInWei = parseUnits(validated.amount.toString(), decimals);

     // 결제 생성
     const payment = await createPayment({
       ...validated,
       tokenAddress,
       amount: amountInWei.toString(),
     });

     return c.json({
       success: true,
       paymentId: payment.id,
       tokenAddress,
       gatewayAddress: chain.contracts.gateway,
       forwarderAddress: chain.contracts.forwarder,
       amount: amountInWei.toString(),
       status: payment.status,
     }, 201);
   }
   ```

#### SDK (packages/sdk)

**수정 파일**:

5. **src/types.ts**
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

6. **src/client.ts**
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

#### Demo App (apps/demo)

**수정 파일**:

7. **src/lib/wagmi.ts**
   ```typescript
   // ❌ 삭제: CONTRACTS, TOKENS 하드코딩 제거
   // export const CONTRACTS = { ... };
   // export const TOKENS = { ... };

   // ✅ 유지: wagmi config는 그대로
   export const config = createConfig({
     chains: [polygonAmoy, hardhat],
     transports: {
       [polygonAmoy.id]: http(),
       [hardhat.id]: http('http://127.0.0.1:8545'),
     },
   });
   ```

8. **src/app/api/payments/create/route.ts (신규)**
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

9. **프론트엔드 컴포넌트에서 사용**
   ```typescript
   const { chainId } = useAccount();

   async function handleCreatePayment() {
     const response = await fetch('/api/payments/create', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         amount: 100,
         currency: 'SUT',
         chainId, // wagmi에서 가져온 chainId
         recipientAddress: merchantAddress,
       }),
     });

     const payment = await response.json();

     // ✅ 서버에서 받은 주소 사용
     const { tokenAddress, gatewayAddress, amount } = payment;

     // 트랜잭션 실행
     await writeContract({
       address: tokenAddress,
       abi: ERC20_ABI,
       functionName: 'approve',
       args: [gatewayAddress, BigInt(amount)],
     });
   }
   ```

### 4.2 데이터 플로우

```
[사용자]
   ↓ (1) MetaMask 연결
[Wagmi Hook] useAccount() → chainId: 80002
   ↓ (2) chainId 포함 결제 생성 요청
[Demo Frontend]
   ↓ (3) POST /api/payments/create { amount, currency, chainId, recipientAddress }
[Demo Backend] (Next.js API Route)
   ↓ (4) SDK.createPayment()
[MSQPay SDK]
   ↓ (5) POST /payments/create
[Payment Server]
   ├─ (6) chains.ts에서 chainId로 컨트랙트 조회
   ├─ (7) currency로 토큰 주소 조회
   ├─ (8) viem으로 decimals 조회 (fallback: 18)
   ├─ (9) amount → wei 변환
   └─ (10) DB에 결제 저장
   ↓ (11) Response: { paymentId, tokenAddress, gatewayAddress, forwarderAddress, amount }
[Demo Frontend]
   ↓ (12) tokenAddress, gatewayAddress로 트랜잭션 생성
[Blockchain]
```

### 4.3 에러 처리 전략

| 에러 케이스 | HTTP Status | 응답 코드 | 처리 방법 |
|------------|-------------|----------|----------|
| 지원하지 않는 chainId | 400 | UNSUPPORTED_CHAIN | 사용자에게 지원 체인 안내 |
| 지원하지 않는 currency | 400 | UNSUPPORTED_TOKEN | 사용자에게 지원 토큰 안내 |
| decimals 조회 실패 | - | - | fallback 18 사용, 로그 경고 |
| 잘못된 recipientAddress | 400 | VALIDATION_ERROR | Zod 검증 메시지 반환 |
| DB 저장 실패 | 500 | INTERNAL_ERROR | 에러 로그, 트랜잭션 롤백 |

---

## 5. Success Criteria (성공 기준)

### 5.1 기능 요구사항

| 항목 | 성공 기준 |
|------|----------|
| **SC-001** | Demo App wagmi.ts에서 CONTRACTS, TOKENS 완전 제거 |
| **SC-002** | 서버 응답에 tokenAddress, gatewayAddress, forwarderAddress 포함 |
| **SC-003** | chainId 80002, 31337 모두 정상 작동 |
| **SC-004** | 지원하지 않는 chainId 입력 시 HTTP 400 UNSUPPORTED_CHAIN |
| **SC-005** | 지원하지 않는 currency 입력 시 HTTP 400 UNSUPPORTED_TOKEN |
| **SC-006** | decimals 조회 실패 시 fallback 18로 동작 |

### 5.2 하위 호환성

| 항목 | 전략 |
|------|------|
| **SDK Breaking Change** | MAJOR 버전 업데이트 (v1.0.0 → v2.0.0) |
| **API Breaking Change** | 기존 필드 유지, 신규 필드 추가 (안전한 확장) |
| **Demo App** | 전면 수정 (하드코딩 제거) |

### 5.3 테스트 커버리지

| 테스트 종류 | 커버리지 목표 |
|-------------|--------------|
| Unit Tests | ≥ 90% |
| Integration Tests | 주요 플로우 100% |
| E2E Tests | Demo App 결제 전체 플로우 |

**필수 테스트 케이스**:

1. ✅ chainId=80002, currency="SUT" → 정상 응답
2. ✅ chainId=31337, currency="TEST" → 정상 응답
3. ✅ chainId=1 (Ethereum) → 400 UNSUPPORTED_CHAIN
4. ✅ chainId=80002, currency="ETH" → 400 UNSUPPORTED_TOKEN
5. ✅ decimals 조회 실패 → fallback 18 사용
6. ✅ Demo App에서 서버 응답으로 트랜잭션 생성

---

## 6. Implementation Phases

Phase 1~4의 상세 내용은 **plan.md** 참조

---

## 7. 참조 문서

- [기존 SPEC (docs/specs)](../../docs/specs/SPEC-API-001.md)
- [결제 API 문서](../../docs/api/payments.md)
- [기술 아키텍처](../../docs/architecture-payments.md)
- [SDK 문서](../../packages/sdk/README.md)
