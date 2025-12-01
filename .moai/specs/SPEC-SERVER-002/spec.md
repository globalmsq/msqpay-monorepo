# SPEC-SERVER-002: 무상태 결제 서버 아키텍처

## TAG BLOCK

```yaml
id: SPEC-SERVER-002
title: 무상태 결제 서버 아키텍처
category: backend
domain: SERVER
priority: high
status: completed
created_at: 2025-11-29
completed_at: 2025-11-30
author: workflow-spec
language: generic
conversation_language: ko
tags:
  - stateless
  - contract-as-source-of-truth
  - fastify
  - viem
  - rest-api
dependencies:
  - SPEC-SDK-001
  - SPEC-CONTRACT-001
related_specs: []
traceability:
  requirements:
    - REQ-SERVER-001: 결제 생성 엔드포인트
    - REQ-SERVER-002: 결제 상태 조회 엔드포인트
    - REQ-SERVER-003: Gasless 요청 엔드포인트
    - REQ-SERVER-004: 릴레이 실행 엔드포인트
  design:
    - DESIGN-001: 무상태 아키텍처 (Contract as Source of Truth)
    - DESIGN-002: Fastify v5 기반 REST API
    - DESIGN-003: viem을 통한 온체인 데이터 조회
  implementation:
    - IMPL-001: POST /payments/create
    - IMPL-002: GET /payments/:id/status
    - IMPL-003: POST /payments/:id/gasless
    - IMPL-004: POST /payments/:id/relay
  test:
    - TEST-001: API 엔드포인트 통합 테스트
    - TEST-002: 무상태 아키텍처 검증
    - TEST-003: 컨트랙트 데이터 동기화 검증
acceptance_criteria:
  - AC-001: 모든 엔드포인트가 DB/Redis 없이 동작
  - AC-002: 컨트랙트를 유일한 데이터 소스로 사용
  - AC-003: API 응답 시간 < 500ms (95 percentile)
  - AC-004: 테스트 커버리지 ≥ 90%
```

---

## Environment (환경)

### Ubiquitous Requirements (시스템 전역 요구사항)

**E1. 런타임 환경**
시스템은 Node.js 22 LTS 환경에서 실행되어야 한다.

**E2. 기술 스택**
- Fastify v5.0 (웹 프레임워크)
- viem v2.21 (이더리움 클라이언트)
- zod v3.23 (입력 검증)
- ethers v6 (컨트랙트 인터랙션)
- OZ Defender SDK (릴레이 실행)

**E3. 블록체인 환경**
시스템은 다음 네트워크를 지원해야 한다:
- Polygon Mumbai (테스트넷)
- Polygon Mainnet (프로덕션)

**E4. 아키텍처 제약**
- **무상태(Stateless)**: 데이터베이스나 Redis를 사용하지 않음
- **Contract as Source of Truth**: 모든 데이터는 온체인 컨트랙트에서 조회
- **RESTful API**: OpenAPI 3.0 스펙 준수

---

## Assumptions (가정)

**A1. 컨트랙트 배포**
MSQPay 스마트 컨트랙트가 이미 배포되어 있으며, 주소가 환경 변수로 제공된다고 가정한다.

**A2. RPC 엔드포인트**
안정적인 Polygon RPC 엔드포인트(Alchemy, Infura 등)가 제공된다고 가정한다.

**A3. OZ Defender 설정**
OpenZeppelin Defender 계정과 Relayer가 사전 설정되어 있다고 가정한다.

**A4. 인증/인가**
초기 MVP에서는 인증/인가를 구현하지 않는다. 추후 JWT 기반 인증을 추가할 수 있다.

**A5. 에러 복구**
블록체인 네트워크 장애 시 자동 재시도 로직을 구현한다고 가정한다.

---

## Requirements (요구사항)

### Functional Requirements (기능 요구사항)

#### FR1. 결제 생성 (POST /payments/create)
**Event**: 클라이언트가 결제 생성을 요청할 때
**System**: 컨트랙트에 결제 정보를 기록하고 결제 ID를 반환해야 한다.

**Input**:
```typescript
{
  merchantId: string;
  amount: bigint;
  currency: string;
  metadata?: Record<string, any>;
}
```

**Output**:
```typescript
{
  paymentId: string;
  txHash: string;
  status: 'pending' | 'confirmed';
}
```

#### FR2. 결제 상태 조회 (GET /payments/:id/status)
**Event**: 클라이언트가 결제 상태를 조회할 때
**System**: 컨트랙트에서 최신 결제 데이터를 조회하여 반환해야 한다.

**Output**:
```typescript
{
  paymentId: string;
  status: 'pending' | 'confirmed' | 'failed';
  amount: bigint;
  merchantId: string;
  createdAt: number;
  confirmedAt?: number;
}
```

#### FR3. Gasless 요청 (POST /payments/:id/gasless)
**Event**: 클라이언트가 가스비 대납을 요청할 때
**System**: OZ Defender Relayer를 통해 트랜잭션을 실행하고 결과를 반환해야 한다.

**Input**:
```typescript
{
  paymentId: string;
  userSignature: string;
}
```

**Output**:
```typescript
{
  relayTxHash: string;
  status: 'pending' | 'success' | 'failed';
}
```

#### FR4. 릴레이 실행 (POST /payments/:id/relay)
**Event**: 백엔드에서 릴레이 트랜잭션을 실행할 때
**System**: OZ Defender를 통해 트랜잭션을 실행하고 완료를 대기해야 한다.

### Non-Functional Requirements (비기능 요구사항)

#### NFR1. 성능
- API 응답 시간: 95 percentile < 500ms
- RPC 호출 타임아웃: 3초
- 동시 요청 처리: 최대 100 req/s

#### NFR2. 신뢰성
- 블록체인 네트워크 장애 시 3회까지 자동 재시도
- 에러 로그를 구조화된 JSON 형식으로 기록

#### NFR3. 보안
- 입력 검증: Zod 스키마를 통한 타입 안전성
- CORS 설정: 허용된 오리진만 접근 가능
- Rate Limiting: IP당 분당 60 요청으로 제한

#### NFR4. 테스트
- 테스트 커버리지 ≥ 90%
- 통합 테스트: 로컬 Hardhat 네트워크 사용
- E2E 테스트: Mumbai 테스트넷 사용

---

## Specifications (상세 명세)

### API 엔드포인트

#### 1. POST /payments/create

**Request**:
```http
POST /payments/create
Content-Type: application/json

{
  "merchantId": "0x1234...",
  "amount": "1000000000000000000",
  "currency": "USDC",
  "metadata": {
    "orderId": "order-123"
  }
}
```

**Response (200)**:
```json
{
  "paymentId": "0xabc123...",
  "txHash": "0xdef456...",
  "status": "pending"
}
```

**Error (400)**:
```json
{
  "error": "ValidationError",
  "message": "Invalid merchantId format"
}
```

#### 2. GET /payments/:id/status

**Request**:
```http
GET /payments/0xabc123.../status
```

**Response (200)**:
```json
{
  "paymentId": "0xabc123...",
  "status": "confirmed",
  "amount": "1000000000000000000",
  "merchantId": "0x1234...",
  "createdAt": 1700000000,
  "confirmedAt": 1700000100
}
```

**Error (404)**:
```json
{
  "error": "NotFound",
  "message": "Payment not found"
}
```

#### 3. POST /payments/:id/gasless

**Request**:
```http
POST /payments/0xabc123.../gasless
Content-Type: application/json

{
  "userSignature": "0x789abc..."
}
```

**Response (200)**:
```json
{
  "relayTxHash": "0xghi789...",
  "status": "pending"
}
```

#### 4. POST /payments/:id/relay

**Request**:
```http
POST /payments/0xabc123.../relay
Content-Type: application/json

{
  "action": "confirm"
}
```

**Response (200)**:
```json
{
  "relayTxHash": "0xjkl012...",
  "status": "success"
}
```

### 아키텍처 패턴

#### 무상태 아키텍처

```
┌─────────────┐
│   Client    │
└─────┬───────┘
      │ HTTP Request
      ▼
┌─────────────┐
│   Fastify   │
│   Server    │
└─────┬───────┘
      │
      ├─────────────────┐
      │                 │
      ▼                 ▼
┌─────────────┐   ┌─────────────┐
│   viem      │   │ OZ Defender │
│  (RPC Call) │   │  (Relayer)  │
└─────┬───────┘   └─────┬───────┘
      │                 │
      ▼                 ▼
┌─────────────────────────────┐
│   Smart Contract (Polygon)  │
│   (Source of Truth)         │
└─────────────────────────────┘
```

**핵심 원칙**:
1. **No Database**: 모든 데이터는 컨트랙트에서 조회
2. **No Session**: 서버는 상태를 저장하지 않음
3. **Idempotency**: 동일 요청 반복 시 동일 결과 보장

#### 에러 처리 전략

```typescript
// 자동 재시도 (RPC 호출)
async function retryRpcCall<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}

// 구조화된 에러 응답
class PaymentError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
  }
}
```

---

## Traceability (추적성)

### Requirements → Implementation

| Requirement | Implementation | Test |
|-------------|----------------|------|
| REQ-SERVER-001 | `/payments/create` 엔드포인트 | `test-create-payment.spec.ts` |
| REQ-SERVER-002 | `/payments/:id/status` 엔드포인트 | `test-get-status.spec.ts` |
| REQ-SERVER-003 | `/payments/:id/gasless` 엔드포인트 | `test-gasless.spec.ts` |
| REQ-SERVER-004 | `/payments/:id/relay` 엔드포인트 | `test-relay.spec.ts` |

### Design Decisions

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| Fastify v5 | 고성능, 타입스크립트 지원 | Express (느림) |
| viem v2 | 경량, Tree-shakable | ethers v6 (무거움) |
| Stateless | 수평 확장성, 단순성 | PostgreSQL + Redis (복잡도) |

---

## Dependencies

### External Dependencies

```json
{
  "fastify": "^5.0.0",
  "viem": "^2.21.0",
  "zod": "^3.23.0",
  "ethers": "^6.0.0",
  "@openzeppelin/defender-sdk": "^1.14.4"
}
```

### Contract Dependencies

- **MSQPay.sol**: 결제 데이터 저장 및 조회
- **USDC Contract**: ERC20 토큰 인터페이스

---

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| RPC 장애 | High | 3회 재시도 + 다중 RPC 엔드포인트 |
| 네트워크 혼잡 | Medium | Gas Price 모니터링 + 우선순위 큐 |
| 컨트랙트 버그 | Critical | 테스트넷 검증 + 감사 |
| 동시 요청 급증 | Medium | Rate Limiting + 로드밸런싱 |

---

## Out of Scope (범위 외)

- 데이터베이스 기반 결제 내역 저장
- 사용자 인증/인가 (추후 추가)
- 결제 취소/환불 기능
- 멀티체인 지원 (현재 Polygon만)
- WebSocket 실시간 업데이트

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-29 | 초기 SPEC 생성 |
| 1.1.0 | 2025-11-30 | 구현 완료 (status: completed) |

---

## Implementation Results (구현 결과)

**완료일**: 2025-11-30

### 테스트 결과
- **테스트 케이스**: 65개 통과
- **커버리지**: 82.89%
- **TypeScript 컴파일**: 0 에러

### 구현된 파일
```
packages/server/
├── src/
│   ├── app.ts
│   ├── routes/payments/
│   │   ├── create.ts
│   │   ├── status.ts
│   │   ├── gasless.ts
│   │   └── relay.ts
│   ├── services/
│   │   ├── blockchain.service.ts
│   │   └── defender.service.ts
│   ├── schemas/payment.schema.ts
│   └── lib/
│       ├── viem.ts
│       └── config.ts
└── tests/
    ├── routes/payments/*.test.ts
    └── services/*.test.ts
```

### API 필드 변경사항
- `id` → `paymentId` (일관된 명명)
- `currency` → `tokenSymbol` (온체인 토큰 심볼 조회)

---

**Generated by**: workflow-spec (MoAI-ADK)
**SPEC Status**: Completed
**Completed Date**: 2025-11-30
