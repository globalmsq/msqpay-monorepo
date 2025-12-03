---
id: SPEC-SERVER-001
title: MSQPay 결제 서버 (Payment Server)
category: backend
status: superseded
superseded_by: SPEC-SERVER-002
created_at: 2025-11-28
updated_at: 2025-12-03
author: @user
tags:
  - backend
  - blockchain
  - payment-gateway
  - gasless-transaction
  - polygon-amoy
---

# SPEC-SERVER-001: MSQPay 결제 서버 (Payment Server)

> **Note**: 이 SPEC은 SPEC-SERVER-002로 대체되었습니다. 최신 결제 서버 사양은 SPEC-SERVER-002를 참조하세요.

## 1. 개요 (Overview)

### 1.1 목적 (Purpose)

MSQPay 블록체인 결제 게이트웨이의 백엔드 API 서버를 구현합니다. 결제 생성, 상태 조회, Gasless 트랜잭션 실행, 통계 조회 기능을 제공하며, Polygon Amoy Testnet 기반의 PaymentProcessor 스마트 컨트랙트와 상호작용합니다.

### 1.2 범위 (Scope)

**포함 사항**:
- 5개 REST API 엔드포인트 (결제 생성, 조회, 실행, 목록, 통계)
- EIP-712 서명 검증 및 Gasless 트랜잭션 실행 (OpenZeppelin Defender Relayer)
- PostgreSQL 기반 결제 의도 저장 (payment_intents 테이블)
- Redis 기반 결제 상태 캐싱
- Zod 기반 입력 검증
- viem 2.0+ 기반 블록체인 상호작용

**제외 사항**:
- 프론트엔드 UI 구현
- 스마트 컨트랙트 개발 (PaymentProcessor는 기존 배포된 컨트랙트 사용)
- 실제 토큰 배포 (테스트 환경에서는 mock ERC-20 사용)
- 실제 결제 게이트웨이 통합 (Stripe, PayPal 등)

### 1.3 용어 정의 (Terminology)

| 용어 | 정의 |
|------|------|
| **paymentId** | 서버에서 발급하는 UUID 형식의 결제 고유 식별자 |
| **Gasless Payment** | 사용자가 가스비를 지불하지 않는 메타 트랜잭션 (OZ Defender Relayer 사용) |
| **Direct Payment** | 사용자가 직접 가스비를 지불하는 일반 트랜잭션 |
| **EIP-712** | 구조화된 데이터 서명을 위한 Ethereum 표준 |
| **payment_intents** | 결제 의도를 저장하는 PostgreSQL 테이블 |
| **Polygon Amoy** | Polygon PoS 테스트넷 (Chain ID: 80002) |

---

## 2. EARS 요구사항 명세 (EARS Requirements Specification)

### 2.1 환경 (Environment)

**ENV-001**: 시스템은 **Polygon Amoy Testnet (Chain ID: 80002)** 환경에서 실행되어야 한다.

**ENV-002**: 시스템은 **Node.js 20 LTS 이상** 환경에서 실행되어야 한다.

**ENV-003**: 시스템은 **MySQL 8.0 이상** 데이터베이스를 사용해야 한다.

**ENV-004**: 시스템은 **Redis 7 이상** 캐시 서버를 사용해야 한다.

**ENV-005**: 시스템은 **OpenZeppelin Defender Relayer**가 설정되어 있어야 한다.

**ENV-006**: 시스템은 **PaymentProcessor 스마트 컨트랙트**가 Polygon Amoy에 배포되어 있어야 한다.

**ENV-007**: 시스템은 다음 환경 변수가 설정되어 있어야 한다:
- `DEFENDER_API_KEY`: OpenZeppelin Defender API 키
- `DEFENDER_SECRET_KEY`: OpenZeppelin Defender Secret 키
- `PAYMENT_PROCESSOR_ADDRESS`: PaymentProcessor 컨트랙트 주소
- `POLYGON_RPC_URL`: Polygon Amoy RPC 엔드포인트
- `DATABASE_URL`: MySQL 연결 문자열
- `REDIS_URL`: Redis 연결 문자열

### 2.2 가정 (Assumptions)

**ASM-001**: PaymentProcessor 컨트랙트는 EIP-2771 (Trusted Forwarder) 호환 컨트랙트이다.

**ASM-002**: OpenZeppelin Defender Relayer는 충분한 MATIC 잔액을 보유하고 있다.

**ASM-003**: 클라이언트는 EIP-712 서명을 생성할 수 있는 지갑을 사용한다.

**ASM-004**: 테스트 환경에서 사용하는 ERC-20 토큰은 이미 배포되어 있다.

**ASM-005**: Store 주소는 유효한 Ethereum 주소이며, PaymentProcessor 컨트랙트에 등록되어 있다.

### 2.3 기능 요구사항 (Functional Requirements)

#### 2.3.1 결제 생성 API (Ubiquitous - 항상 활성)

**REQ-F001**: 시스템은 **POST /api/payments** 엔드포인트를 제공해야 한다.

**REQ-F002**: 시스템은 다음 필드를 포함하는 결제 생성 요청을 수신해야 한다:
- `storeAddress` (string, required): 상점 Ethereum 주소
- `tokenAddress` (string, required): ERC-20 토큰 주소
- `amount` (string, required): Wei 단위 결제 금액
- `customerEmail` (string, optional): 고객 이메일
- `metadata` (object, optional): 추가 메타데이터

**REQ-F003**: 시스템은 요청 검증 시 다음을 확인해야 한다:
- `storeAddress`가 유효한 Ethereum 주소인지
- `tokenAddress`가 유효한 Ethereum 주소인지
- `amount`가 양수인지 (> 0)

**REQ-F004**: 시스템은 검증 통과 시 다음을 수행해야 한다:
- UUID v4 형식의 `paymentId` 생성
- `payment_intents` 테이블에 결제 의도 저장
- 응답으로 다음 필드 반환:
  - `paymentId` (string): UUID 형식 결제 ID
  - `storeAddress` (string): 상점 주소
  - `tokenAddress` (string): 토큰 주소
  - `amount` (string): 결제 금액
  - `status` (string): "pending"
  - `expiresAt` (number): 만료 시간 (Unix timestamp, 생성 시간 + 15분)
  - `createdAt` (number): 생성 시간 (Unix timestamp)

**REQ-F005**: 시스템은 검증 실패 시 HTTP 400 Bad Request를 반환해야 한다.

#### 2.3.2 결제 조회 API (Ubiquitous - 항상 활성)

**REQ-F006**: 시스템은 **GET /api/payments/:paymentId** 엔드포인트를 제공해야 한다.

**REQ-F007**: 시스템은 다음 순서로 결제 상태를 조회해야 한다:
1. Redis 캐시에서 조회 시도
2. 캐시 미스 시 MySQL `payment_intents` 테이블에서 조회
3. 조회 성공 시 Redis에 캐싱 (TTL: 60초)

**REQ-F008**: 시스템은 조회 성공 시 다음 필드를 반환해야 한다:
- `paymentId` (string): 결제 ID
- `storeAddress` (string): 상점 주소
- `tokenAddress` (string): 토큰 주소
- `amount` (string): 결제 금액
- `status` (string): "pending" | "processing" | "completed" | "failed" | "expired"
- `txHash` (string, optional): 트랜잭션 해시
- `customerAddress` (string, optional): 고객 지갑 주소
- `expiresAt` (number): 만료 시간
- `createdAt` (number): 생성 시간
- `completedAt` (number, optional): 완료 시간

**REQ-F009**: 시스템은 존재하지 않는 `paymentId` 요청 시 HTTP 404 Not Found를 반환해야 한다.

#### 2.3.3 Gasless 결제 실행 API (Event-Driven - 사용자 서명 제출 시)

**REQ-F010**: 시스템은 **POST /api/payments/:paymentId/execute** 엔드포인트를 제공해야 한다.

**REQ-F011**: 시스템은 다음 필드를 포함하는 요청을 수신해야 한다:
- `customerAddress` (string, required): 고객 Ethereum 주소
- `signature` (string, required): EIP-712 서명

**REQ-F012**: 시스템은 요청 검증 시 다음을 확인해야 한다:
- `paymentId`가 존재하는지
- 결제 상태가 "pending"인지
- 결제가 만료되지 않았는지 (현재 시간 < expiresAt)
- EIP-712 서명이 유효한지 (서명자가 customerAddress와 일치)

**REQ-F013**: 시스템은 검증 통과 시 다음을 수행해야 한다:
- 결제 상태를 "processing"으로 업데이트
- OpenZeppelin Defender Relayer를 통해 메타 트랜잭션 제출
- Redis 캐시 무효화
- 응답으로 다음 필드 반환:
  - `paymentId` (string): 결제 ID
  - `status` (string): "processing"
  - `txHash` (string): 트랜잭션 해시
  - `estimatedConfirmationTime` (number): 예상 확인 시간 (초 단위)

**REQ-F014**: 시스템은 검증 실패 시 다음을 반환해야 한다:
- 존재하지 않는 결제 → HTTP 404 Not Found
- 잘못된 상태 → HTTP 400 Bad Request (에러 메시지: "Payment already processed or expired")
- 만료된 결제 → HTTP 410 Gone
- 잘못된 서명 → HTTP 401 Unauthorized

#### 2.3.4 결제 목록 조회 API (Ubiquitous - 항상 활성)

**REQ-F015**: 시스템은 **GET /api/payments** 엔드포인트를 제공해야 한다.

**REQ-F016**: 시스템은 다음 쿼리 파라미터를 지원해야 한다:
- `storeAddress` (string, optional): 특정 상점의 결제만 조회
- `status` (string, optional): 특정 상태의 결제만 조회 (pending | processing | completed | failed | expired)
- `limit` (number, optional): 최대 결과 수 (기본값: 50, 최대: 100)
- `offset` (number, optional): 페이지네이션 오프셋 (기본값: 0)

**REQ-F017**: 시스템은 조회 결과를 다음 형식으로 반환해야 한다:
```typescript
{
  payments: Payment[];
  total: number;
  limit: number;
  offset: number;
}
```

#### 2.3.5 상점 통계 조회 API (Ubiquitous - 항상 활성)

**REQ-F018**: 시스템은 **GET /api/stores/:storeAddress/stats** 엔드포인트를 제공해야 한다.

**REQ-F019**: 시스템은 다음 통계 정보를 반환해야 한다:
- `storeAddress` (string): 상점 주소
- `totalPayments` (number): 총 결제 건수
- `completedPayments` (number): 완료된 결제 건수
- `totalVolume` (string): 총 결제 금액 (Wei)
- `successRate` (number): 성공률 (0-100)

**REQ-F020**: 시스템은 Redis 캐시를 활용하여 통계를 제공해야 한다 (TTL: 300초).

### 2.4 비기능 요구사항 (Non-Functional Requirements)

#### 2.4.1 성능 (Performance)

**REQ-NF001**: 시스템은 모든 API 요청에 대해 **p95 응답 시간 500ms 이하**를 달성해야 한다.

**REQ-NF002**: 시스템은 **초당 100개의 동시 요청**을 처리할 수 있어야 한다.

**REQ-NF003**: 시스템은 **최대 10개의 동시 Gasless 트랜잭션**을 처리할 수 있어야 한다 (OZ Defender 제한).

#### 2.4.2 보안 (Security)

**REQ-NF004**: 시스템은 **모든 입력에 대해 Zod 스키마 검증**을 수행해야 한다.

**REQ-NF005**: 시스템은 **EIP-712 서명 검증**을 통해 요청 출처를 확인해야 한다.

**REQ-NF006**: 시스템은 **IP당 분당 100개 요청**으로 Rate Limiting을 적용해야 한다.

**REQ-NF007**: 시스템은 **CORS를 설정**하여 허용된 도메인만 접근하도록 해야 한다.

**REQ-NF008**: 시스템은 **환경 변수를 통해 민감 정보를 관리**해야 한다 (`.env` 파일, Defender API Key 등).

#### 2.4.3 신뢰성 (Reliability)

**REQ-NF009**: 시스템은 **블록체인 트랜잭션 실패 시 상태를 "failed"로 업데이트**해야 한다.

**REQ-NF010**: 시스템은 **만료 시간 경과 시 결제 상태를 "expired"로 자동 전환**해야 한다.

**REQ-NF011**: 시스템은 **데이터베이스 연결 실패 시 HTTP 503 Service Unavailable을 반환**해야 한다.

#### 2.4.4 확장성 (Scalability)

**REQ-NF012**: 시스템은 **상태 비저장 (Stateless) 아키텍처**를 유지해야 한다.

**REQ-NF013**: 시스템은 **수평 확장 (Horizontal Scaling)**을 지원해야 한다 (다중 인스턴스 배포 가능).

#### 2.4.5 테스트 가능성 (Testability)

**REQ-NF014**: 시스템은 **90% 이상의 테스트 커버리지**를 달성해야 한다.

**REQ-NF015**: 시스템은 **TDD (Test-Driven Development) 방법론**을 따라 개발되어야 한다 (RED-GREEN-REFACTOR).

---

## 3. 인터페이스 명세 (Interface Specifications)

### 3.1 API 엔드포인트 상세

#### 3.1.1 POST /api/payments

**Request**:
```typescript
{
  storeAddress: string; // Ethereum address
  tokenAddress: string; // ERC-20 token address
  amount: string; // Wei amount
  customerEmail?: string; // Optional email
  metadata?: Record<string, any>; // Optional metadata
}
```

**Response (201 Created)**:
```typescript
{
  paymentId: string; // UUID v4
  storeAddress: string;
  tokenAddress: string;
  amount: string;
  status: "pending";
  expiresAt: number; // Unix timestamp
  createdAt: number; // Unix timestamp
}
```

**Error Responses**:
- 400 Bad Request: 입력 검증 실패
  ```typescript
  {
    error: {
      type: "validation_error",
      code: "PAYMENT_STORE_INVALID_ADDRESS",
      message: "Store address must be a valid Ethereum address",
      field: "storeAddress",
      value: "invalid-address"
    }
  }
  ```
- 500 Internal Server Error: 서버 오류
  ```typescript
  {
    error: {
      type: "internal_error",
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create payment"
    }
  }
  ```

#### 3.1.2 GET /api/payments/:paymentId

**Response (200 OK)**:
```typescript
{
  paymentId: string;
  storeAddress: string;
  tokenAddress: string;
  amount: string;
  status: "pending" | "processing" | "completed" | "failed" | "expired";
  txHash?: string;
  customerAddress?: string;
  expiresAt: number;
  createdAt: number;
  completedAt?: number;
}
```

**Error Responses**:
- 404 Not Found: 결제 정보 없음
- 500 Internal Server Error: 서버 오류

#### 3.1.3 POST /api/payments/:paymentId/execute

**Request**:
```typescript
{
  customerAddress: string; // Ethereum address
  signature: string; // EIP-712 signature
}
```

**Response (200 OK)**:
```typescript
{
  paymentId: string;
  status: "processing";
  txHash: string;
  estimatedConfirmationTime: number; // seconds
}
```

**Error Responses**:
- 400 Bad Request: 잘못된 상태 또는 입력
- 401 Unauthorized: 서명 검증 실패
- 404 Not Found: 결제 정보 없음
- 410 Gone: 만료된 결제
- 500 Internal Server Error: 서버 오류

#### 3.1.4 GET /api/payments

**Query Parameters**:
- `storeAddress` (optional): string
- `status` (optional): "pending" | "processing" | "completed" | "failed" | "expired"
- `limit` (optional): number (default: 50, max: 100)
- `offset` (optional): number (default: 0)

**Response (200 OK)**:
```typescript
{
  payments: Payment[];
  total: number;
  limit: number;
  offset: number;
}
```

#### 3.1.5 GET /api/stores/:storeAddress/stats

**Response (200 OK)**:
```typescript
{
  storeAddress: string;
  totalPayments: number;
  completedPayments: number;
  totalVolume: string; // Wei
  successRate: number; // 0-100
}
```

### 3.2 데이터베이스 스키마

#### payment_intents 테이블

```sql
CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id VARCHAR(36) UNIQUE NOT NULL,
  store_address VARCHAR(42) NOT NULL,
  token_address VARCHAR(42) NOT NULL,
  amount VARCHAR(78) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  customer_address VARCHAR(42),
  customer_email VARCHAR(255),
  tx_hash VARCHAR(66),
  metadata JSONB,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  INDEX idx_payment_id (payment_id),
  INDEX idx_store_address (store_address),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

### 3.3 Redis 캐시 키 구조

- **결제 상태**: `payment:{paymentId}` → Payment 객체 (TTL: 60초)
- **상점 통계**: `store_stats:{storeAddress}` → StoreStats 객체 (TTL: 300초)

### 3.4 블록체인 인터페이스

#### PaymentProcessor 컨트랙트 ABI (주요 함수)

```solidity
interface IPaymentProcessor {
  function executePayment(
    address storeAddress,
    address tokenAddress,
    uint256 amount,
    address customerAddress
  ) external returns (bool);
}
```

#### EIP-712 타입 정의

```typescript
const EIP712_DOMAIN = {
  name: 'MSQPay',
  version: '1',
  chainId: 80002,
  verifyingContract: PAYMENT_PROCESSOR_ADDRESS
};

const PAYMENT_TYPE = {
  Payment: [
    { name: 'paymentId', type: 'string' },
    { name: 'storeAddress', type: 'address' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'customerAddress', type: 'address' }
  ]
};
```

---

## 4. 설계 제약사항 (Design Constraints)

**DC-001**: 시스템은 **Fastify 프레임워크**를 사용해야 한다.

**DC-002**: 시스템은 **viem 2.0 이상**을 사용하여 블록체인과 상호작용해야 한다.

**DC-003**: 시스템은 **@openzeppelin/defender-sdk**를 사용하여 Gasless 트랜잭션을 처리해야 한다.

**DC-004**: 시스템은 **Zod**를 사용하여 입력 검증을 수행해야 한다.

**DC-005**: 시스템은 **MySQL**을 사용하여 결제 의도를 저장해야 한다.

**DC-006**: 시스템은 **Redis**를 사용하여 결제 상태를 캐싱해야 한다.

**DC-007**: 시스템은 **결제 만료 시간을 생성 시점으로부터 15분**으로 설정해야 한다.

**DC-008**: 시스템은 **최대 10개의 동시 Gasless 트랜잭션**을 처리하도록 제한해야 한다 (OZ Defender 제한).

---

## 4.5 에러 코드 표준 (Error Code Standards)

시스템은 Self-Descriptive 에러 코드 체계를 사용해야 한다:

| HTTP 상태 | 에러 타입 | 에러 코드 | 설명 | 원인 |
|-----------|----------|----------|------|------|
| 400 | validation_error | PAYMENT_STORE_INVALID_ADDRESS | 상점 주소 형식 오류 | storeAddress가 유효한 Ethereum 주소 아님 |
| 400 | validation_error | PAYMENT_TOKEN_INVALID_ADDRESS | 토큰 주소 형식 오류 | tokenAddress가 유효한 Ethereum 주소 아님 |
| 400 | validation_error | PAYMENT_AMOUNT_INVALID_ZERO | 금액이 0 | amount ≤ 0 |
| 401 | authentication_error | SIGNATURE_INVALID | 서명 검증 실패 | EIP-712 서명이 유효하지 않음 |
| 401 | authentication_error | SIGNATURE_SIGNER_MISMATCH | 서명자 불일치 | 서명자 주소 ≠ customerAddress |
| 404 | not_found_error | PAYMENT_NOT_FOUND | 결제 정보 없음 | paymentId가 존재하지 않음 |
| 400 | state_error | PAYMENT_ALREADY_PROCESSED | 이미 처리된 결제 | status ≠ 'pending' |
| 410 | expired_error | PAYMENT_EXPIRED | 결제 만료 | expiresAt < 현재 시간 |
| 429 | rate_limit_error | RATE_LIMIT_EXCEEDED | Rate Limiting 초과 | IP당 100 req/min 초과 |
| 503 | service_unavailable_error | DATABASE_CONNECTION_FAILED | DB 연결 실패 | MySQL 연결 불가 |
| 503 | service_unavailable_error | REDIS_CONNECTION_FAILED | Redis 연결 실패 | Redis 연결 불가 |
| 503 | service_unavailable_error | BLOCKCHAIN_RPC_ERROR | 블록체인 RPC 오류 | viem RPC 호출 실패 |
| 503 | service_unavailable_error | DEFENDER_API_ERROR | OZ Defender API 오류 | Defender API 호출 실패 |
| 503 | service_unavailable_error | GASLESS_LIMIT_EXCEEDED | Gasless TX 제한 초과 | 동시 10개 초과 |
| 500 | internal_error | INTERNAL_SERVER_ERROR | 내부 서버 오류 | 예상치 못한 오류 |

**에러 응답 형식** (GitHub API + Stripe 스타일):
```typescript
{
  error: {
    type: string; // 에러 타입 (예: "validation_error", "authentication_error")
    code: string; // Self-descriptive 에러 코드 (예: "PAYMENT_STORE_INVALID_ADDRESS")
    message: string; // 사용자 친화적 메시지
    field?: string; // 문제가 발생한 필드 (선택적)
    value?: any; // 실제 입력값 (디버깅용, 선택적)
    docs_url?: string; // 문서 링크 (선택적)
  }
}
```

---

## 4.6 MySQL 스키마 (Database Schema)

### payment_intents 테이블

```sql
CREATE TABLE payment_intents (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()), -- MySQL 8.0+ UUID()
  payment_id VARCHAR(36) UNIQUE NOT NULL, -- UUID v4 (서버 발급)
  store_address VARCHAR(42) NOT NULL, -- Ethereum address (0x...)
  token_address VARCHAR(42) NOT NULL, -- ERC-20 token address
  amount DECIMAL(78, 0) NOT NULL, -- Wei amount (uint256, max 2^256-1)
  customer_email VARCHAR(255), -- Optional
  customer_address VARCHAR(42), -- Set after execute
  metadata JSON, -- Optional metadata (MySQL JSON type)
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, expired
  tx_hash VARCHAR(66), -- Transaction hash (0x...)
  expires_at DATETIME(3) NOT NULL, -- 생성 시간 + 15분 (millisecond precision)
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  -- Constraints
  CONSTRAINT check_amount_positive CHECK (amount > 0),
  CONSTRAINT check_status_valid CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes
CREATE INDEX idx_payment_intents_payment_id ON payment_intents(payment_id);
CREATE INDEX idx_payment_intents_store_address ON payment_intents(store_address);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_created_at ON payment_intents(created_at DESC);
CREATE INDEX idx_payment_intents_expires_at_pending ON payment_intents(expires_at) WHERE status = 'pending'; -- MySQL 8.0.13+ 지원

-- 테이블 및 컬럼 설명
ALTER TABLE payment_intents COMMENT = 'MSQPay 결제 의도 저장 테이블 (Payment Intents)';
ALTER TABLE payment_intents MODIFY payment_id VARCHAR(36) COMMENT '서버 발급 UUID (클라이언트에 노출되는 ID)';
ALTER TABLE payment_intents MODIFY amount DECIMAL(78, 0) COMMENT 'Wei 단위 결제 금액 (uint256 compatible)';
ALTER TABLE payment_intents MODIFY status VARCHAR(20) COMMENT '결제 상태: pending, processing, completed, failed, expired';
ALTER TABLE payment_intents MODIFY expires_at DATETIME(3) COMMENT '결제 만료 시간 (생성 시간 + 15분)';
```

---

## 4.7 모니터링 메트릭 (Monitoring Metrics)

시스템은 다음 메트릭을 Prometheus 형식으로 노출해야 한다 (선택적, 향후 구현):

### 비즈니스 메트릭
- `msqpay_payments_total{status}`: 결제 건수 (status별)
- `msqpay_payment_amount_total{token_address}`: 총 결제 금액 (토큰별)
- `msqpay_payment_success_rate`: 결제 성공률 (completed / total)
- `msqpay_payment_expiration_rate`: 결제 만료율 (expired / total)

### 성능 메트릭
- `msqpay_api_request_duration_seconds{endpoint, method}`: API 응답 시간 (히스토그램)
- `msqpay_api_requests_total{endpoint, method, status}`: API 요청 수
- `msqpay_gasless_execution_duration_seconds`: Gasless TX 실행 시간

### 시스템 메트릭
- `msqpay_db_connections_active`: MySQL 활성 연결 수
- `msqpay_redis_cache_hit_rate`: Redis 캐시 적중률
- `msqpay_oz_defender_requests_total{status}`: OZ Defender API 호출 수

---

## 5. 수용 기준 (Acceptance Criteria)

### 5.1 기능 수용 기준

**AC-F001**: 유효한 입력으로 POST /api/payments 호출 시 201 Created 응답과 함께 paymentId, status "pending", expiresAt, createdAt이 반환된다.

**AC-F002**: 잘못된 storeAddress로 POST /api/payments 호출 시 400 Bad Request가 반환된다.

**AC-F003**: 존재하는 paymentId로 GET /api/payments/:paymentId 호출 시 200 OK 응답과 함께 결제 정보가 반환된다.

**AC-F004**: 존재하지 않는 paymentId로 GET /api/payments/:paymentId 호출 시 404 Not Found가 반환된다.

**AC-F005**: 유효한 서명으로 POST /api/payments/:paymentId/execute 호출 시 200 OK 응답과 함께 status "processing", txHash가 반환된다.

**AC-F006**: 잘못된 서명으로 POST /api/payments/:paymentId/execute 호출 시 401 Unauthorized가 반환된다.

**AC-F007**: 만료된 결제로 POST /api/payments/:paymentId/execute 호출 시 410 Gone이 반환된다.

**AC-F008**: GET /api/payments?storeAddress=0x123&limit=10 호출 시 최대 10개의 결제 정보가 반환된다.

**AC-F009**: GET /api/stores/:storeAddress/stats 호출 시 totalPayments, completedPayments, totalVolume, successRate이 반환된다.

### 5.2 비기능 수용 기준

**AC-NF001**: 모든 API 엔드포인트는 p95 응답 시간 500ms 이하를 달성한다.

**AC-NF002**: 100개 동시 요청 시 모든 요청이 성공적으로 처리된다.

**AC-NF003**: 테스트 커버리지는 90% 이상이다.

**AC-NF004**: 동일 IP에서 분당 100개 초과 요청 시 HTTP 429 Too Many Requests가 반환된다.

**AC-NF005**: 데이터베이스 연결 실패 시 HTTP 503 Service Unavailable이 반환된다.

---

## 6. 추적성 (Traceability)

| 요구사항 ID | 관련 파일 | 테스트 파일 |
|------------|----------|-----------|
| REQ-F001-F005 | `src/routes/payments/create.ts` | `tests/routes/payments/create.test.ts` |
| REQ-F006-F009 | `src/routes/payments/get.ts` | `tests/routes/payments/get.test.ts` |
| REQ-F010-F014 | `src/routes/payments/execute.ts` | `tests/routes/payments/execute.test.ts` |
| REQ-F015-F017 | `src/routes/payments/list.ts` | `tests/routes/payments/list.test.ts` |
| REQ-F018-F020 | `src/routes/stores/stats.ts` | `tests/routes/stores/stats.test.ts` |
| REQ-NF001-NF003 | `src/server.ts` | `tests/performance.test.ts` |
| REQ-NF004-NF008 | `src/middleware/validation.ts`, `src/middleware/security.ts` | `tests/middleware/security.test.ts` |

---

## 7. 참조 문서 (References)

- [MSQPay Architecture Documentation](../../../docs/architecture.md)
- [MSQPay Implementation Plan](../../../docs/implementation-plan.md)
- [MSQPay PRD](../../../docs/prd.md)
- [Fastify Documentation](https://fastify.dev/)
- [viem 2.0 Documentation](https://viem.sh/)
- [OpenZeppelin Defender SDK](https://docs.openzeppelin.com/defender/sdk)
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-2771: Secure Protocol for Native Meta Transactions](https://eips.ethereum.org/EIPS/eip-2771)

---

**문서 종류**: EARS 형식 요구사항 명세서
**작성 도구**: MoAI-ADK workflow-spec
**준수 프레임워크**: TRUST 5, SPEC-First TDD
