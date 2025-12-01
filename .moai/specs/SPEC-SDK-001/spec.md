# SPEC-SDK-001: 상점서버용 결제 SDK (@globalmsq/msqpay)

## TAG BLOCK

```yaml
id: SPEC-SDK-001
title: 상점서버용 결제 SDK (@globalmsq/msqpay)
category: sdk
domain: SDK
priority: high
status: completed
created_at: 2025-11-29
completed_at: 2025-11-29
author: workflow-spec
language: typescript
conversation_language: ko
tags:
  - http-client
  - store-server
  - typescript
  - payment-api
  - fetch
dependencies:
  - SPEC-SERVER-002
related_specs:
  - SPEC-SERVER-001
  - SPEC-SERVER-002
traceability:
  requirements:
    - REQ-SDK-001: 결제 생성 메서드
    - REQ-SDK-002: 결제 상태 조회 메서드
    - REQ-SDK-003: Gasless 제출 메서드
    - REQ-SDK-004: Relay 실행 메서드
  design:
    - DESIGN-001: HTTP API 클라이언트 아키텍처
    - DESIGN-002: 환경별 URL 관리
    - DESIGN-003: 에러 처리 전략
  implementation:
    - IMPL-001: MSQPayClient.createPayment()
    - IMPL-002: MSQPayClient.getPaymentStatus()
    - IMPL-003: MSQPayClient.submitGasless()
    - IMPL-004: MSQPayClient.executeRelay()
  test:
    - TEST-001: 성공 케이스 테스트
    - TEST-002: 에러 핸들링 테스트
    - TEST-003: 환경별 URL 테스트
acceptance_criteria:
  - AC-001: 모든 API 메서드가 서버 응답 타입과 일치
  - AC-002: 에러 발생 시 MSQPayError 인스턴스 throw
  - AC-003: 테스트 커버리지 ≥ 90%
  - AC-004: Node 18+ native fetch 사용 (외부 의존성 없음)
```

---

## Environment (환경)

### Ubiquitous Requirements (시스템 전역 요구사항)

**E1. 런타임 환경**
SDK는 Node.js 18+ 환경에서 실행되어야 한다 (native fetch 지원).

**E2. 기술 스택**
- TypeScript 5.x (타입 안전성)
- Native fetch (HTTP 클라이언트)
- Vitest (테스트 프레임워크)

**E3. 패키지 정보**
- 패키지명: `@globalmsq/msqpay`
- 버전: `0.1.0`
- 라이선스: MIT

**E4. 아키텍처 제약**
- **의존성 최소화**: 외부 HTTP 라이브러리 사용 금지 (axios, got 등)
- **타입 안전성**: 서버 스키마와 1:1 매칭
- **환경별 URL 관리**: development, staging, production, custom
- **인증 방식**: HTTP 헤더 `X-API-Key: {apiKey}` 사용

---

## Assumptions (가정)

**A1. 결제 서버 배포**
결제 서버 (SPEC-SERVER-002)가 이미 배포되어 있으며, API 엔드포인트가 접근 가능하다고 가정한다.

**A2. API Key 제공**
상점별 API Key가 사전에 발급되어 있다고 가정한다.

**A3. 네트워크 환경**
- Development: `http://localhost:3001`
- Staging: `https://pay-api.staging.msq.com`
- Production: `https://pay-api.msq.com`

**A4. HTTPS 통신**
Production 환경에서는 HTTPS 통신이 보장된다고 가정한다.

---

## Requirements (요구사항)

### Functional Requirements (기능 요구사항)

#### FR1. 결제 생성 (createPayment)
**Event**: 상점서버가 결제를 생성할 때
**System**: SDK가 결제서버 API를 호출하여 paymentId를 반환해야 한다.

**Input**:
```typescript
interface CreatePaymentParams {
  userId: string;
  amount: number;
  currency?: 'USD' | 'EUR' | 'KRW';
  tokenAddress: string;      // 0x + 40 hex
  recipientAddress: string;  // 0x + 40 hex
  description?: string;
}
```

**Output**:
```typescript
interface CreatePaymentResponse {
  success: true;
  paymentId: string;
  transactionHash: string;
  status: 'pending';
}
```

#### FR2. 결제 상태 조회 (getPaymentStatus)
**Event**: 상점서버가 결제 상태를 조회할 때
**System**: SDK가 결제서버 API를 호출하여 최신 상태를 반환해야 한다.

**Input**: `paymentId: string`

**Output**:
```typescript
interface PaymentStatusResponse {
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

#### FR3. Gasless 제출 (submitGasless)
**Event**: 상점서버가 Gasless 서명을 제출할 때
**System**: SDK가 결제서버 API를 호출하여 릴레이 결과를 반환해야 한다.

**Input**:
```typescript
interface GaslessParams {
  paymentId: string;
  forwarderAddress: string;  // 0x + 40 hex
  signature: string;         // 0x hex
}
```

**Output**:
```typescript
interface GaslessResponse {
  success: true;
  relayRequestId: string;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}
```

#### FR4. Relay 실행 (executeRelay)
**Event**: 상점서버가 릴레이를 실행할 때
**System**: SDK가 결제서버 API를 호출하여 트랜잭션 결과를 반환해야 한다.

**Input**:
```typescript
interface RelayParams {
  paymentId: string;
  transactionData: string;  // 0x hex
  gasEstimate: number;
}
```

**Output**:
```typescript
interface RelayResponse {
  success: true;
  relayRequestId: string;
  transactionHash?: string;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}
```

### Non-Functional Requirements (비기능 요구사항)

#### NFR1. 의존성 최소화
- 외부 HTTP 클라이언트 라이브러리 사용 금지 (axios, got 등)
- Node 18+ native fetch 사용
- 런타임 의존성 0개

#### NFR2. 타입 안전성
- 모든 API 응답에 대해 TypeScript 타입 제공
- 서버 Zod 스키마와 1:1 매칭
- strict mode 활성화

#### NFR3. 에러 처리
- 모든 API 에러를 MSQPayError로 래핑
- 에러 코드, HTTP 상태 코드, 상세 정보 포함
- 서버 에러 코드와 일치

#### NFR4. 테스트
- 테스트 커버리지 ≥ 90%
- 단위 테스트: fetch mock 사용
- 에러 케이스 전수 테스트

---

## Specifications (상세 명세)

### SDK 클래스 구조

```typescript
class MSQPayClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: MSQPayConfig);

  // URL 관리
  setApiUrl(url: string): void;
  getApiUrl(): string;

  // 결제 생성
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse>;

  // 상태 조회
  getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse>;

  // Gasless 제출
  submitGasless(params: GaslessParams): Promise<GaslessResponse>;

  // Relay 실행
  executeRelay(params: RelayParams): Promise<RelayResponse>;

  // Private
  private request<T>(method: string, path: string, body?: unknown): Promise<T>;
}
```

**request() 메서드 인증**:
```typescript
private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': this.apiKey  // API Key 인증 헤더
  };

  const response = await fetch(`${this.apiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  // ... error handling
}
```

### 환경별 URL 관리

```typescript
type Environment = 'development' | 'staging' | 'production' | 'custom';

const API_URLS: Record<Environment, string> = {
  development: 'http://localhost:3001',
  staging: 'https://pay-api.staging.msq.com',
  production: 'https://pay-api.msq.com',
  custom: ''  // Must be set via config.apiUrl
};
```

### 에러 처리

```typescript
class MSQPayError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(code: string, message: string, statusCode: number, details?: unknown);
}

// 서버 에러 코드 매핑
const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  INVALID_REQUEST: 400,
  INVALID_TRANSACTION_DATA: 400,
  INVALID_GAS_ESTIMATE: 400,
  INVALID_SIGNATURE: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500
};
```

### API 엔드포인트 매핑

| SDK 메서드 | HTTP 메서드 | 엔드포인트 |
|-----------|------------|------------|
| createPayment() | POST | /payments/create |
| getPaymentStatus() | GET | /payments/:id/status |
| submitGasless() | POST | /payments/:id/gasless |
| executeRelay() | POST | /payments/:id/relay |

---

## Traceability (추적성)

### Requirements → Implementation

| Requirement | Implementation | Test |
|-------------|----------------|------|
| REQ-SDK-001 | `MSQPayClient.createPayment()` | `createPayment.test.ts` |
| REQ-SDK-002 | `MSQPayClient.getPaymentStatus()` | `getPaymentStatus.test.ts` |
| REQ-SDK-003 | `MSQPayClient.submitGasless()` | `submitGasless.test.ts` |
| REQ-SDK-004 | `MSQPayClient.executeRelay()` | `executeRelay.test.ts` |

### Design Decisions

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| Native fetch | 의존성 최소화, Node 18+ 표준 | axios (외부 의존성) |
| 클래스 기반 | 상태 관리 용이, API Key 캡슐화 | 함수 기반 (상태 관리 어려움) |
| Environment enum | 타입 안전성, 자동완성 지원 | string literal (오타 가능성) |

---

## Dependencies

### Runtime Dependencies
```json
{
  "dependencies": {}
}
```

### Dev Dependencies
```json
{
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.0"
  }
}
```

### Server Dependencies
- SPEC-SERVER-002: Payment API Server

---

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| fetch 미지원 환경 | High | Node 18+ 요구사항 명시 |
| 서버 API 변경 | Medium | 버전 관리, 호환성 테스트 |
| 네트워크 오류 | Medium | 에러 처리, 재시도 로직 (optional) |

---

## Out of Scope (범위 외)

- WebSocket 실시간 알림
- 자동 재시도 로직
- 캐싱
- 로깅/모니터링
- Rate limiting 처리
- 브라우저 환경 지원 (Node.js 전용)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-29 | 초기 SPEC 생성 |

---

**Generated by**: workflow-spec (MoAI-ADK)
**SPEC Status**: Completed ✅
**Implementation Status**:
- ✅ Phase 1 (Cleanup): 기존 SDK 삭제
- ✅ Phase 2 (Package Setup): 5개 소스 파일 + 설정 파일 생성
- ✅ Phase 3 (Core Implementation): MSQPayClient & 타입 정의 완료
- ✅ Phase 4 (Testing): 26개 테스트 케이스, 100% 커버리지
- ✅ Phase 5 (Documentation): README.md 및 SPEC 문서 완성
- ✅ Phase 6 (Git Operations): feature/SPEC-SDK-001 브랜치 & 커밋 완료

**Quality Metrics**:
- Test Coverage: 100%
- TypeScript Errors: 0
- External Dependencies: 0
- Code Review: PASS (TRUST 5 validation)
