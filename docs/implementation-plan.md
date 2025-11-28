# MSQPay Monorepo - 구현 계획서

## Document Information
- **Version**: 1.0
- **Date**: 2025-11-27
- **Status**: Approved

---

## 1. 개요

새로운 아키텍처에 맞춰 **결제서버 → SDK → Demo App** 순서로 전면 재구현합니다.

### 1.1 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **Contract = Source of Truth** | 결제 완료 여부는 스마트 컨트랙트만 신뢰 |
| **Stateless MVP** | DB/Redis/이벤트 모니터링 없이 Contract 직접 조회 |
| **서버 발급 paymentId** | 결제서버가 유일한 paymentId 생성자 (클라이언트 조작 방지) |
| **API Key 인증** | 프론트엔드 직접 호출 차단, 상점서버만 접근 가능 |

### 1.2 구현 우선순위

1. **결제서버** (packages/server/) - 신규 개발
2. **SDK** (packages/sdk/) - 완전 재작성
3. **Demo App** (apps/demo/) - 전면 재작성

---

## 2. Phase 1: 결제서버 개발

### 2.1 기술 스택

| 구성요소 | 기술 | 버전 |
|----------|------|------|
| Runtime | Node.js | 18+ |
| Framework | Fastify | 4.x |
| Language | TypeScript | 5.4+ |
| Blockchain | viem | 2.0+ |
| Relay | @openzeppelin/defender-sdk | 1.14+ |
| Validation | Zod | 3.22+ |
| Testing | Vitest | 2.0+ |

### 2.2 디렉토리 구조

```
msqpay-monorepo/
├── docker/                        # Docker 개발 환경
│   ├── Dockerfile.packages        # 통합 Dockerfile (모든 타겟 정의)
│   ├── docker-compose.yml         # 개발 환경 (환경변수 하드코딩)
│   ├── mysql/
│   │   ├── init.sql               # DB 스키마 초기화
│   │   └── my.cnf                 # MySQL 설정
│   ├── redis/
│   │   └── redis.conf             # Redis 설정
│   └── .dockerignore              # 빌드 제외 파일
├── contracts/                     # Smart contracts
├── packages/
│   ├── sdk/                       # @globalmsq/msqpay
│   └── server/                    # 결제서버
│       ├── src/
│       │   ├── app.ts             # Fastify 앱 초기화
│       │   ├── server.ts          # HTTP 서버 시작
│       │   ├── config/
│       │   │   ├── env.ts         # 환경변수 검증 (Zod)
│       │   │   └── contracts.ts   # Contract ABI 및 주소
│       │   ├── routes/
│       │   │   ├── health.ts      # GET /health
│       │   │   └── payments.ts    # 4개 결제 API
│       │   ├── services/
│       │   │   ├── payment.service.ts    # paymentId 생성, 상태 조회
│       │   │   ├── gasless.service.ts    # Gasless typedData 생성
│       │   │   ├── relay.service.ts      # OZ Defender Relay
│       │   │   └── contract.service.ts   # viem Contract 조회
│       │   ├── middleware/
│       │   │   ├── apiKey.ts      # API Key 인증
│       │   │   └── errorHandler.ts # 에러 핸들링
│       │   └── types/
│       │       ├── api.ts         # API 요청/응답 타입
│       │       └── errors.ts      # 커스텀 에러 타입
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── apps/
│   └── demo/                      # Demo Web App
└── docs/
```

### 2.3 API 엔드포인트

#### POST /payments/create

결제 생성 및 paymentId 발급

**Request**:
```
Headers: { "x-api-key": "sk_test_abc123" }
Body: {
  "orderId": "order_123",
  "amount": "1000000000000000000",
  "token": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  "merchant": "0x..."
}
```

**Response**:
```json
{
  "paymentId": "0xabc123...",
  "orderId": "order_123",
  "amount": "1000000000000000000",
  "token": "0xE4C...",
  "merchant": "0x...",
  "status": "pending"
}
```

**내부 로직**:
```typescript
function generatePaymentId(storeId: string, orderId: string): `0x${string}` {
  return keccak256(concat([
    toBytes(storeId),      // API Key에서 추출
    toBytes(orderId),      // 상점서버 요청
    randomBytes(32)        // 매번 다른 ID 보장
  ]));
}
```

#### GET /payments/:id/status

결제 상태 조회 (Contract 직접 조회)

**Response**:
```json
{
  "paymentId": "0xabc123...",
  "status": "pending" | "completed"
}
```

**내부 로직**:
```typescript
const isProcessed = await publicClient.readContract({
  address: GATEWAY_ADDRESS,
  abi: PAYMENT_GATEWAY_ABI,
  functionName: "processedPayments",
  args: [paymentId]
});
return { status: isProcessed ? "completed" : "pending" };
```

#### GET /payments/:id/gasless

Gasless 결제용 EIP-712 서명 데이터 조회

**Query**: `?userAddress=0xUser...`

**Response**:
```json
{
  "nonce": "5",
  "forwardRequest": {
    "from": "0xUser...",
    "to": "0xGateway...",
    "value": "0",
    "gas": "200000",
    "nonce": "5",
    "deadline": "1732780800",
    "data": "0x..."
  },
  "typedData": {
    "domain": {
      "name": "ERC2771Forwarder",
      "version": "1",
      "chainId": 80002,
      "verifyingContract": "0xForwarder..."
    },
    "types": {
      "ForwardRequest": [...]
    },
    "primaryType": "ForwardRequest",
    "message": { ... }
  }
}
```

#### POST /payments/:id/relay

서명된 Meta Transaction을 OZ Defender로 전송

**Request**:
```json
{
  "signature": "0x...",
  "forwardRequest": { ... }
}
```

**Response**:
```json
{
  "txHash": "0x...",
  "status": "submitted"
}
```

### 2.4 API Key 인증

**MVP 방식**: 환경변수 기반

```bash
# .env
STORE_API_KEYS='{
  "sk_test_abc123": { "storeId": "store_001", "name": "Demo Store" },
  "sk_test_def456": { "storeId": "store_002", "name": "Test Shop" }
}'
```

**미들웨어**:
```typescript
function apiKeyAuth(request, reply) {
  const apiKey = request.headers["x-api-key"];
  const stores = JSON.parse(process.env.STORE_API_KEYS!);
  const store = stores[apiKey];

  if (!store) {
    return reply.code(401).send({ error: "Invalid API key" });
  }

  request.store = store;
}
```

### 2.5 환경변수

```bash
# Server
NODE_ENV=development
PORT=3001

# API Keys (MVP)
STORE_API_KEYS='{"sk_test_abc123": {"storeId": "store_001", "name": "Demo"}}'

# Blockchain
POLYGON_AMOY_RPC=https://rpc-amoy.polygon.technology
GATEWAY_ADDRESS=0x...
FORWARDER_ADDRESS=0x...

# OpenZeppelin Defender
OZ_DEFENDER_API_KEY=your_api_key
OZ_DEFENDER_API_SECRET=your_api_secret
OZ_DEFENDER_RELAYER_ID=your_relayer_id
```

---

## 3. Phase 2: SDK 재작성

### 3.1 패키지 정보

| 항목 | 값 |
|------|-----|
| 패키지명 | `@globalmsq/msqpay` |
| 목적 | 결제서버 API 클라이언트 |
| 기존 SDK | 완전 교체 (블록체인 직접 호출 제거) |

### 3.2 디렉토리 구조

```
packages/sdk/
├── src/
│   ├── index.ts                    # 메인 export
│   ├── MSQPayClient.ts             # MSQPayClient 클래스
│   ├── types/
│   │   ├── config.ts               # Environment, MSQPayConfig
│   │   ├── payment.ts              # Payment, PaymentStatus
│   │   ├── gasless.ts              # GaslessData, RelayResult
│   │   └── errors.ts               # MSQPayError, ErrorCode
│   ├── lib/
│   │   └── httpClient.ts           # HttpClient (axios + retry)
│   └── __tests__/
│       ├── MSQPayClient.test.ts
│       └── httpClient.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 3.3 MSQPayClient 인터페이스

```typescript
class MSQPayClient {
  constructor(config: MSQPayConfig);

  // URL 관리
  setApiUrl(url: string): void;
  getApiUrl(): string;

  // 공통 API
  createPayment(params: CreatePaymentParams): Promise<Payment>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;

  // Gasless API
  getGaslessData(paymentId: string, userAddress: string): Promise<GaslessData>;
  submitGaslessSignature(
    paymentId: string,
    signature: string,
    forwardRequest: ForwardRequest
  ): Promise<RelayResult>;
}
```

### 3.4 타입 정의

**환경 설정**:
```typescript
type Environment = 'development' | 'staging' | 'production' | 'custom';

interface MSQPayConfig {
  environment: Environment;
  apiKey: string;                // sk_test_* or sk_live_*
  customApiUrl?: string;         // custom 환경 시 필수
  timeout?: number;              // 기본 30000ms
  maxRetries?: number;           // 기본 3
}

const API_URLS = {
  development: 'http://localhost:3001',
  staging: 'https://pay-api.staging.msq.com',
  production: 'https://pay-api.msq.com'
};
```

**결제 타입**:
```typescript
interface CreatePaymentParams {
  orderId: string;
  amount: string;           // wei 단위
  token: `0x${string}`;
  merchant: `0x${string}`;
}

interface Payment {
  paymentId: `0x${string}`;
  orderId: string;
  amount: string;
  token: `0x${string}`;
  merchant: `0x${string}`;
  status: 'pending' | 'completed';
}

interface PaymentStatus {
  paymentId: `0x${string}`;
  status: 'pending' | 'completed';
}
```

**에러 처리**:
```typescript
enum MSQPayErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_PARAMS = 'INVALID_PARAMS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVER_ERROR = 'SERVER_ERROR',
  RELAY_ERROR = 'RELAY_ERROR'
}

class MSQPayError extends Error {
  constructor(
    public code: MSQPayErrorCode,
    message: string,
    public statusCode?: number
  ) {
    super(message);
  }

  get isRetryable(): boolean {
    return [
      MSQPayErrorCode.NETWORK_ERROR,
      MSQPayErrorCode.TIMEOUT_ERROR,
      MSQPayErrorCode.SERVER_ERROR
    ].includes(this.code);
  }
}
```

### 3.5 사용 예시

```typescript
import { MSQPayClient } from '@globalmsq/msqpay';

// 초기화
const client = new MSQPayClient({
  environment: 'development',
  apiKey: 'sk_test_abc123'
});

// 결제 생성
const payment = await client.createPayment({
  orderId: 'order_123',
  amount: '1000000000000000000',
  token: '0xE4C...',
  merchant: '0x...'
});

// 상태 조회
const status = await client.getPaymentStatus(payment.paymentId);

// Gasless 데이터 요청
const gaslessData = await client.getGaslessData(payment.paymentId, userAddress);

// 서명 제출
const result = await client.submitGaslessSignature(
  payment.paymentId,
  signature,
  gaslessData.forwardRequest
);
```

---

## 4. Phase 3: Demo App 재작성

### 4.1 새로운 아키텍처

```
Frontend (PaymentModal) → Store Server (Next.js API) → Payment Server → Contract
```

### 4.2 디렉토리 구조

```
apps/demo/src/
├── app/api/payments/              # NEW: Store Server 시뮬레이션
│   ├── prepare/route.ts           # paymentId 생성 요청
│   ├── gasless/route.ts           # Gasless 데이터 요청
│   ├── submit/route.ts            # 서명 제출
│   └── status/[id]/route.ts       # 상태 조회
├── components/
│   └── PaymentModal.tsx           # REFACTOR: 새 플로우
└── lib/
    ├── sdk-client.ts              # NEW: MSQPayClient 래퍼
    └── constants.ts               # UPDATE: 서버 URL 추가
```

### 4.3 Store Server API Routes

**/api/payments/prepare/route.ts**:
```typescript
import { MSQPayClient } from '@globalmsq/msqpay';

const msqPay = new MSQPayClient({
  environment: 'development',
  apiKey: process.env.MSQ_API_KEY!,
  customApiUrl: process.env.PAYMENT_SERVER_URL
});

export async function POST(req: Request) {
  const { productId, amount, token } = await req.json();

  const payment = await msqPay.createPayment({
    orderId: `ORDER_${Date.now()}_${productId}`,
    amount,
    token,
    merchant: process.env.MERCHANT_ADDRESS!
  });

  return Response.json({ paymentId: payment.paymentId });
}
```

**/api/payments/status/[id]/route.ts**:
```typescript
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const status = await msqPay.getPaymentStatus(params.id);
  return Response.json(status);
}
```

### 4.4 결제 플로우

#### Direct Payment (6-8 단계)

```
1. 사용자 상품 선택
2. 프론트 → 상점서버: paymentId 요청
3. 상점서버 → 결제서버 (SDK): createPayment()
4. 프론트: Token Approve (필요 시)
5. 프론트: pay() TX 실행
6. 상점서버: getPaymentStatus() polling (2초 간격)
7. 결제서버 → Contract: processedPayments 조회
8. 완료 확인 → 상품 지급
```

#### Gasless Payment (10-12 단계)

```
1-3. Direct와 동일 (paymentId 요청)
4. 상점서버 → 결제서버: getGaslessData()
5. 결제서버: Forwarder nonce + typedData 생성
6. 상점서버 → 프론트: typedData 전달
7. 프론트: EIP-712 서명 (가스비 없음)
8. 프론트 → 상점서버: signature 전송
9. 상점서버 → 결제서버: submitGaslessSignature()
10. 결제서버 → OZ Defender → Contract: 가스비 대납 TX
11-12. Polling 후 상품 지급
```

### 4.5 PaymentModal 상태 머신

```typescript
type PaymentStep =
  | 'idle'           // 초기 상태
  | 'preparing'      // paymentId 요청 중
  | 'ready'          // paymentId 받음
  | 'approving'      // Token Approve 중 (Direct만)
  | 'signing'        // 사용자 서명/확인 중
  | 'submitting'     // TX 제출 중
  | 'polling'        // 완료 대기 중
  | 'success'        // 결제 완료
  | 'error';         // 실패
```

### 4.6 상태 Polling Hook

```typescript
function usePaymentStatusPolling(paymentId: string | null) {
  const [status, setStatus] = useState<'pending' | 'completed' | 'timeout'>('pending');

  useEffect(() => {
    if (!paymentId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 150;  // 5분 (2초 간격)

    async function poll() {
      while (!cancelled && attempts < maxAttempts) {
        const { status: paymentStatus } = await fetch(
          `/api/payments/status/${paymentId}`
        ).then(r => r.json());

        if (paymentStatus === 'completed') {
          setStatus('completed');
          return;
        }

        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        setStatus('timeout');
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [paymentId]);

  return status;
}
```

---

## 5. 구현 일정

### Week 1: 결제서버 + SDK

| 일차 | 작업 내용 |
|------|----------|
| Day 1 | `packages/server/` 디렉토리 생성, Fastify 앱 초기화 |
| Day 2 | 환경변수 설정, API Key 인증 미들웨어 |
| Day 3 | 4개 API 엔드포인트 구현 (create, status, gasless, relay) |
| Day 4 | SDK 완전 재작성 - MSQPayClient, HttpClient |
| Day 5 | SDK 타입 정의, 단위 테스트 |

### Week 2: Demo App

| 일차 | 작업 내용 |
|------|----------|
| Day 6 | Next.js API Routes 생성 (4개) |
| Day 7 | MSQPayClient 통합 |
| Day 8 | PaymentModal 상태 머신 구현 |
| Day 9 | Direct/Gasless 플로우 재작성, Polling 로직 |

### Week 3: 테스트 및 배포

| 일차 | 작업 내용 |
|------|----------|
| Day 10-11 | Local 통합 테스트 (Hardhat + 결제서버 + Demo) |
| Day 12 | E2E 테스트 (Direct/Gasless, 에러 시나리오) |
| Day 13 | OZ Defender 설정, Polygon Amoy 배포 |
| Day 14 | 최종 검증 |

---

## 6. 핵심 파일 목록

### Priority 1: 결제서버 (신규)

| 파일 | 설명 |
|------|------|
| `packages/server/package.json` | 프로젝트 초기화, 의존성 |
| `packages/server/src/app.ts` | Fastify 앱 초기화 |
| `packages/server/src/routes/payments.ts` | 4개 결제 API |
| `packages/server/src/services/payment.service.ts` | paymentId 생성 |
| `packages/server/src/services/contract.service.ts` | Contract 조회 |
| `packages/server/src/services/gasless.service.ts` | typedData 생성 |
| `packages/server/src/services/relay.service.ts` | OZ Defender 연동 |
| `packages/server/src/middleware/apiKey.ts` | API Key 인증 |

### Priority 2: SDK (재작성)

| 파일 | 설명 |
|------|------|
| `packages/sdk/package.json` | 의존성 변경 (viem 제거, axios 추가) |
| `packages/sdk/src/MSQPayClient.ts` | API 클라이언트 클래스 |
| `packages/sdk/src/types/config.ts` | 환경 설정 타입 |
| `packages/sdk/src/lib/httpClient.ts` | HTTP 클라이언트 |
| `packages/sdk/src/types/errors.ts` | 에러 처리 |

### Priority 3: Demo App (신규 + 수정)

| 파일 | 설명 |
|------|------|
| `apps/demo/src/app/api/payments/prepare/route.ts` | paymentId 생성 요청 |
| `apps/demo/src/app/api/payments/status/[id]/route.ts` | 상태 조회 |
| `apps/demo/src/app/api/payments/gasless/route.ts` | Gasless 데이터 |
| `apps/demo/src/app/api/payments/submit/route.ts` | 서명 제출 |
| `apps/demo/src/components/PaymentModal.tsx` | 결제 모달 재작성 |

---

## 7. 성공 지표

| 지표 | 목표 |
|------|------|
| 결제서버 API | 4개 모두 정상 작동 |
| SDK 메서드 | 6개 모두 정상 작동 |
| Direct Payment | 100% 성공률 |
| Gasless Payment | 100% 성공률 |
| Contract 조회 응답 시간 | < 500ms |
| Polling 감지 정확도 | 100% |
| 클라이언트 조작 방지 | 완벽 차단 |

---

## 8. 보안 개선사항

| 기존 문제 | 새 아키텍처 해결 |
|----------|----------------|
| 클라이언트가 paymentId 생성 | 결제서버만 생성 |
| 클라이언트가 결제 완료 판단 | 서버가 Contract 조회 |
| 프론트엔드 직접 호출 가능 | API Key 인증 차단 |
| amount/merchant 임의 지정 | MVP: 무시, Production: 검증 |

---

## 9. MVP vs Production 비교

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
