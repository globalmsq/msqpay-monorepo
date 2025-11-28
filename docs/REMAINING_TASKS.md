# MSQPay Monorepo - Remaining Tasks

Last Updated: 2025-11-27
Status: Architecture Finalized

## Current State

### Completed Work
- [x] Smart Contracts (PaymentGateway, UUPS Proxy, ERC2771Forwarder)
- [x] OpenZeppelin v5 compatibility fixes
- [x] 16 unit tests passing
- [x] Local deployment working (Hardhat Ignition)
- [x] Demo App with RainbowKit wallet connection
- [x] Chain-aware token selection (TEST on localhost, SUT on Amoy)
- [x] Direct payment flow (Approve + Pay) working
- [x] Git repository initialized
- [x] Architecture finalized (Stateless MVP)
- [x] PRD 문서 업데이트
- [x] Technical Spec 문서 업데이트
- [x] Architecture 문서 작성
- [x] **Docker Compose 로컬 개발 환경**

### Architecture Summary

**핵심 원칙**:
- Contract = Source of Truth (DB/Redis 없음)
- Stateless MVP (Contract 직접 조회)
- 동일 API 인터페이스 (MVP ↔ Production 호환)
- 서버 발급 paymentId
- 상점서버 ↔ 블록체인 분리

**시스템 구성**:
```
프론트 → 상점서버 → 결제서버 → Contract
         (SDK)      (API)    (Source of Truth)
```

**주요 변경점**:
- paymentId: 클라이언트 생성 → 결제서버 발급 (keccak256 + randomBytes)
- 결제 검증: 이벤트 모니터링 → Contract 직접 조회
- SDK: 직접 블록체인 호출 → 결제서버 API 클라이언트
- 상태: pending/completed만 (MVP), +expired/failed (Production)

---

## Remaining Tasks

### Priority 1: 결제서버 개발 (MVP)

**신규 구현 필요**

**기술 스택**:
- Node.js + Fastify (또는 Express)
- viem (Contract 조회)
- OZ Defender SDK (Gasless Relay)

**API 엔드포인트**:
| 엔드포인트 | 용도 |
|-----------|------|
| `POST /payments/create` | 결제 생성, paymentId 발급 |
| `GET /payments/:id/status` | 결제 상태 조회 (Contract 조회) |
| `GET /payments/:id/gasless` | Gasless 서명 데이터 조회 |
| `POST /payments/:id/relay` | Gasless 서명 제출 → Relay |

**MVP에서 제외**:
- DB/Redis
- 이벤트 모니터링
- 금액 검증
- 만료 처리

**예상 파일 구조**:
```
packages/server/
├── src/
│   ├── app.ts                 # Fastify 앱
│   ├── routes/
│   │   └── payments.ts        # 결제 API
│   ├── services/
│   │   ├── payment.service.ts # paymentId 생성, 상태 조회
│   │   ├── gasless.service.ts # typedData 생성
│   │   └── relay.service.ts   # OZ Defender 연동
│   └── lib/
│       ├── viem.ts            # viem 클라이언트
│       └── config.ts          # 환경변수
├── package.json
└── tsconfig.json
```

---

### Priority 2: SDK 개발 (`@globalmsq/msqpay`)

**신규 구현 필요**

**클래스 구조**:
```typescript
class MSQPayClient {
  constructor(config: MSQPayConfig);

  // URL 관리
  setApiUrl(url: string): void;
  getApiUrl(): string;

  // 공통
  createPayment(params: CreatePaymentParams): Promise<Payment>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;

  // Gasless
  getGaslessData(paymentId: string, userAddress: string): Promise<GaslessData>;
  submitGaslessSignature(paymentId: string, signature: string, forwardRequest: ForwardRequest): Promise<RelayResult>;
}
```

**환경 설정**:
```typescript
type Environment = 'development' | 'staging' | 'production' | 'custom';

const API_URLS = {
  development: 'http://localhost:3001',
  staging: 'https://pay-api.staging.msq.com',
  production: 'https://pay-api.msq.com'
};
```

**예상 파일 구조**:
```
packages/sdk/
├── src/
│   ├── index.ts               # 메인 export
│   ├── client.ts              # MSQPayClient 클래스
│   ├── types.ts               # TypeScript 타입
│   └── constants.ts           # 환경별 URL
├── package.json               # @globalmsq/msqpay
└── tsconfig.json
```

---

### Priority 3: Demo App 수정

**Location**: `apps/demo/`

**변경 사항**:

1. **결제 플로우 수정**
   - 기존: 클라이언트에서 paymentId 생성
   - 신규: 상점서버(시뮬레이션) → 결제서버에서 paymentId 받기

2. **상태 확인 방식**
   - 기존: 클라이언트에서 블록체인 직접 확인
   - 신규: 서버 API polling

3. **샘플 코드 제공**
   - Direct Payment (wagmi useWriteContract)
   - Gasless Payment (wagmi useSignTypedData)
   - Approve (1회 무한 승인)

---

### Priority 4: Polygon Amoy Testnet 배포

**Prerequisites**:
- Polygon Amoy MATIC (faucet)
- 배포자 Private Key

**Steps**:
1. `.env` 파일 설정
2. `npx hardhat ignition deploy --network amoy`
3. Polygonscan 검증
4. 결제서버/SDK constants 업데이트

---

### Priority 5: OZ Defender Relay 설정

**Steps**:
1. OZ Defender 계정 생성
2. Relayer 생성 (Polygon Amoy)
3. MATIC 충전
4. API Key/Secret 발급
5. 결제서버에 환경변수 설정

**환경 변수**:
```
OZ_DEFENDER_API_KEY=xxx
OZ_DEFENDER_API_SECRET=xxx
OZ_DEFENDER_RELAYER_ID=xxx
```

---

## Quick Start Commands

### Docker (Recommended)
```bash
cd docker && docker-compose up -d
# Demo: http://localhost:3000
# API: http://localhost:3001/health
```

### Manual Development
```bash
# Terminal 1: Hardhat node
cd contracts && npx hardhat node

# Terminal 2: Deploy
cd contracts && pnpm deploy:local

# Terminal 3: Demo App
cd apps/demo && pnpm dev
```

### Run Tests
```bash
cd contracts
pnpm test
```

---

## Project Structure

```
msqpay-monorepo/
├── contracts/           # Smart contracts (완료)
├── packages/
│   ├── sdk/             # @globalmsq/msqpay (신규 개발)
│   └── server/          # 결제서버 (신규 개발)
├── apps/
│   └── demo/            # Demo App (수정 필요)
└── docs/
    ├── prd.md              # PRD (업데이트 완료)
    ├── technical-spec.md   # 기술 스펙 (업데이트 완료)
    ├── architecture.md     # 아키텍처 (신규)
    ├── implementation-plan.md # 구현 계획서 (신규)
    └── REMAINING_TASKS.md  # 이 파일
```

---

## Key Design Decisions

### 1. Contract = Source of Truth
- **이유**: DB 없이 결제 상태 확인 가능
- **방식**: `processedPayments[paymentId]` 직접 조회
- **이점**: Stateless MVP, 인프라 비용 절감

### 2. 서버 발급 paymentId
- **이유**: 클라이언트 조작 방지, 상점간 충돌 방지
- **방식**: `keccak256(storeId + orderId + randomBytes)`
- **이점**: 유일성 보장, 추적성 확보

### 3. 무한 Approve
- **이유**: 가스비 절감 (토큰당 1회)
- **보안**: `_msgSender()` 사용으로 제3자 인출 불가
- **주의**: 컨트랙트 감사(Audit) 필요

### 4. MVP ↔ Production API 호환
- **이유**: 상점서버/프론트엔드 수정 최소화
- **방식**: 같은 API 인터페이스, 서버 내부 로직만 변경
- **이점**: 점진적 기능 추가 가능

---

## Environment Variables

### 결제서버
```bash
# API Key (MVP - 환경변수)
STORE_API_KEYS='{"sk_test_xxx": {"storeId": "store_001", "name": "Demo"}}'

# Blockchain
POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology
GATEWAY_ADDRESS=0x...
FORWARDER_ADDRESS=0x...

# OZ Defender (Gasless)
OZ_DEFENDER_API_KEY=xxx
OZ_DEFENDER_API_SECRET=xxx
OZ_DEFENDER_RELAYER_ID=xxx
```

### Demo App
```bash
NEXT_PUBLIC_GATEWAY_ADDRESS=0x...
NEXT_PUBLIC_FORWARDER_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0xE4C687167705Abf55d709395f92e254bdF5825a2
```

---

## MVP vs Production 비교

| 항목 | MVP | Production |
|------|-----|------------|
| DB | 없음 | PostgreSQL |
| Redis | 없음 | 캐시 (선택) |
| 이벤트 모니터링 | 없음 | WebSocket (선택) |
| 결제 검증 | Contract만 조회 | Contract + DB 비교 |
| API Key | 환경변수 | DB |
| 금액 검증 | 없음 | DB 저장값과 비교 |
| 결제 상태 | pending, completed | + expired, failed |
| **API 인터페이스** | **동일** | **동일** |
