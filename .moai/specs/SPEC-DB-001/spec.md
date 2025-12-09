# SPEC-DB-001: Pay-Server 데이터베이스 통합

## 메타데이터

| 항목 | 값 |
|------|-----|
| ID | SPEC-DB-001 |
| 제목 | Pay-Server 데이터베이스 통합 (Prisma + MySQL + Redis) |
| 우선순위 | HIGH |
| 상태 | Implemented |
| 생성일 | 2025-12-03 |
| 수정일 | 2025-12-09 |
| 도메인 | Backend / Infrastructure |

---

## 1. 배경 및 문제 정의

### 1.1 현재 상태

pay-server는 현재 stateless 상태로 운영되고 있으며, 다음과 같은 제약사항이 존재합니다.

**핵심 문제점**

`packages/pay-server/src/routes/payments/status.ts` 파일에서 chainId가 하드코딩되어 있습니다.

```
// Line 4-5
// TODO: DB 추가 후 paymentId로 chainId 동적 조회로 변경
const DEFAULT_CHAIN_ID = 31337;
```

**보안 취약점**

기존 설계에서는 payments 테이블에 token_address, chain_id, recipient_address를 직접 저장하는 방식이었습니다. 이는 다음과 같은 보안 위험을 초래합니다.

- 해킹 시 recipient_address 조작 가능성
- token_address 변조를 통한 부정 결제 위험
- 데이터 무결성 검증 어려움

**영향 범위**

- 멀티체인 지원 불가: paymentId에서 chainId를 조회할 수 없어 단일 체인만 지원
- 결제 이력 관리 불가: 결제 생성 후 데이터가 저장되지 않음
- Relay 요청 추적 불가: gasless 트랜잭션 상태 추적 불가

### 1.2 목표 상태

- Prisma ORM을 통한 MySQL 8.0 데이터베이스 연동
- Redis 캐싱을 통한 성능 최적화
- paymentId 기반 동적 chainId 조회 지원
- 멀티체인/멀티토큰 결제 시스템 완성
- 보안 강화된 스키마 설계 (민감 정보 분리)

---

## 2. 요구사항 (EARS 형식)

### 2.1 환경 요구사항 (ENV)

**ENV-001**: MySQL 8.0 데이터베이스 연결

> 시스템이 시작될 때, pay-server는 MySQL 8.0 데이터베이스에 연결해야 한다.
> 환경변수: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE

**ENV-002**: Redis 7 캐시 연결

> 시스템이 시작될 때, pay-server는 Redis 7 캐시 서버에 연결해야 한다.
> 환경변수: REDIS_HOST, REDIS_PORT

**ENV-003**: Prisma Client 초기화

> 서버 시작 시, Prisma Client가 초기화되고 데이터베이스 연결 상태를 확인해야 한다.

### 2.2 항상 활성 요구사항 (UBIQUITOUS)

**UBI-001**: 결제 데이터 저장

> 시스템은 모든 결제 생성 요청 시 payments 테이블에 데이터를 저장해야 한다.

**UBI-002**: 동적 chainId 조회

> 시스템은 모든 결제 상태 조회 시 paymentId로부터 chainId를 데이터베이스에서 조회해야 한다.

**UBI-003**: 캐시 우선 조회

> 시스템은 결제 상태 조회 시 Redis 캐시를 먼저 확인하고, 캐시 미스 시에만 데이터베이스를 조회해야 한다.

**UBI-004**: 논리적 참조 무결성

> 시스템은 FK 제약조건 없이 논리적 참조를 통해 데이터 무결성을 애플리케이션 레벨에서 보장해야 한다.

### 2.3 이벤트 기반 요구사항 (EVENT-DRIVEN)

**EVT-001**: 결제 생성 이벤트

> 결제가 생성되면, 시스템은 payments 테이블에 레코드를 삽입하고, payment_events 테이블에 'CREATED' 이벤트를 기록해야 한다.

**EVT-002**: Gasless 요청 이벤트

> Gasless 트랜잭션이 제출되면, 시스템은 relay_requests 테이블에 요청 정보를 저장해야 한다.

**EVT-003**: 결제 상태 변경 이벤트

> 결제 상태가 변경되면, 시스템은 payment_events 테이블에 새 이벤트를 추가하고 Redis 캐시를 무효화해야 한다.

**EVT-004**: 캐시 갱신 이벤트

> 데이터베이스 조회 결과가 반환되면, 시스템은 해당 결과를 Redis에 캐싱해야 한다 (TTL: 5분).

### 2.4 상태 기반 요구사항 (STATE-DRIVEN)

**STA-001**: 데이터베이스 연결 실패 상태

> 데이터베이스 연결이 실패한 동안, 시스템은 health check에서 unhealthy 상태를 반환해야 한다.

**STA-002**: Redis 연결 실패 상태

> Redis 연결이 실패한 동안, 시스템은 캐시를 우회하고 데이터베이스에서 직접 조회해야 한다 (graceful degradation).

**STA-003**: 결제 pending 상태

> 결제가 pending 상태인 동안, 시스템은 블록체인 상태와 동기화를 시도해야 한다.

**STA-004**: Soft Delete 상태 관리

> is_deleted가 true인 레코드는 일반 조회에서 제외되어야 하며, is_enabled가 false인 레코드는 새로운 결제에 사용할 수 없어야 한다.

### 2.5 금지 요구사항 (UNWANTED)

**UNW-001**: 하드코딩 chainId 사용 금지

> 시스템은 status.ts에서 하드코딩된 DEFAULT_CHAIN_ID를 사용하지 않아야 한다.

**UNW-002**: 민감 정보 로깅 금지

> 시스템은 데이터베이스 비밀번호, API 키, 개인키 등 민감 정보를 로그에 출력하지 않아야 한다.

**UNW-003**: 캐시 무한 TTL 금지

> 시스템은 Redis 캐시에 무한 TTL을 설정하지 않아야 한다 (최대 TTL: 1시간).

**UNW-004**: FK 제약조건 사용 금지

> 시스템은 데이터베이스 레벨의 Foreign Key 제약조건을 사용하지 않아야 한다. 참조 무결성은 애플리케이션 레벨에서 관리한다.

**UNW-005**: Hard Delete 금지

> 시스템은 merchants, tokens, chains 테이블의 레코드를 물리적으로 삭제하지 않아야 한다. Soft Delete 패턴을 사용해야 한다.

### 2.6 선택적 요구사항 (OPTIONAL)

**OPT-001**: 연결 풀링 최적화

> 가능한 경우, Prisma 연결 풀 크기를 환경에 맞게 조정할 수 있어야 한다.

**OPT-002**: 캐시 워밍업

> 가능한 경우, 자주 조회되는 결제 데이터를 서버 시작 시 미리 캐싱할 수 있어야 한다.

**OPT-003**: RPC 백업 지원 (향후 구현)

> 향후 구현으로, chains 테이블에 backup_rpc_url 필드를 추가하여 RPC 장애 시 백업 노드 사용을 지원할 수 있어야 한다.

---

## 3. 데이터 모델

### 3.1 스키마 설계 원칙

**보안 강화 설계**

- 민감한 결제 정보(recipient_address, token_address)를 payments 테이블에 직접 저장하지 않음
- merchant_payment_methods 테이블을 통해 간접 참조하여 조작 위험 최소화
- API 키는 SHA-256 해시로 저장 (api_key_hash)

**Soft Delete 패턴**

- is_enabled: 활성/비활성 상태 (비활성화된 항목은 새 결제에 사용 불가)
- is_deleted: 삭제 여부 (삭제된 항목은 조회에서 제외)
- deleted_at: 삭제 시점 기록

**논리적 참조 (No FK)**

- 데이터베이스 레벨 FK 제약조건 없이 애플리케이션에서 참조 무결성 관리
- 유연한 데이터 마이그레이션 및 운영 가능

### 3.2 테이블 구조 (7개 테이블)

**chains 테이블** - 블록체인 네트워크 정보

- id: INT AUTO_INCREMENT PRIMARY KEY
- network_id: INT UNIQUE NOT NULL (EIP-155 체인 ID, 예: 1, 137, 31337)
- name: VARCHAR(100) NOT NULL (예: Ethereum, Polygon, Hardhat)
- rpc_url: VARCHAR(500) NOT NULL
- explorer_url: VARCHAR(500) NULL
- is_enabled: BOOLEAN DEFAULT TRUE
- is_deleted: BOOLEAN DEFAULT FALSE
- deleted_at: DATETIME NULL
- created_at: DATETIME DEFAULT NOW
- updated_at: DATETIME ON UPDATE NOW

**tokens 테이블** - 토큰 정보 (체인별)

- id: INT AUTO_INCREMENT PRIMARY KEY
- chain_id: INT NOT NULL (→ chains.id 논리적 참조)
- address: VARCHAR(42) NOT NULL (토큰 컨트랙트 주소)
- symbol: VARCHAR(20) NOT NULL (예: USDT, USDC)
- name: VARCHAR(100) NOT NULL
- decimals: INT NOT NULL (예: 6, 18)
- is_enabled: BOOLEAN DEFAULT TRUE
- is_deleted: BOOLEAN DEFAULT FALSE
- deleted_at: DATETIME NULL
- created_at: DATETIME DEFAULT NOW
- updated_at: DATETIME ON UPDATE NOW
- UNIQUE(chain_id, address)

**merchants 테이블** - 가맹점 정보

- id: INT AUTO_INCREMENT PRIMARY KEY
- merchant_key: VARCHAR(100) UNIQUE NOT NULL (외부 노출용 식별자)
- name: VARCHAR(255) NOT NULL
- api_key_hash: VARCHAR(64) NOT NULL (SHA-256 해시)
- webhook_url: VARCHAR(500) NULL
- is_enabled: BOOLEAN DEFAULT TRUE
- is_deleted: BOOLEAN DEFAULT FALSE
- deleted_at: DATETIME NULL
- created_at: DATETIME DEFAULT NOW
- updated_at: DATETIME ON UPDATE NOW

**merchant_payment_methods 테이블** - 가맹점별 결제 수단

- id: INT AUTO_INCREMENT PRIMARY KEY
- merchant_id: INT NOT NULL (→ merchants.id 논리적 참조)
- token_id: INT NOT NULL (→ tokens.id 논리적 참조)
- recipient_address: VARCHAR(42) NOT NULL (수취 지갑 주소)
- is_enabled: BOOLEAN DEFAULT TRUE
- is_deleted: BOOLEAN DEFAULT FALSE
- deleted_at: DATETIME NULL
- created_at: DATETIME DEFAULT NOW
- updated_at: DATETIME ON UPDATE NOW
- UNIQUE(merchant_id, token_id)

**payments 테이블** - 결제 정보

- id: INT AUTO_INCREMENT PRIMARY KEY
- payment_hash: VARCHAR(66) UNIQUE NOT NULL (bytes32 해시)
- payment_method_id: INT NOT NULL (→ merchant_payment_methods.id 논리적 참조)
- order_id: VARCHAR(255) NOT NULL
- amount: DECIMAL(78,0) NOT NULL (wei 단위)
- decimals: INT NOT NULL (결제 시점 토큰 decimals 스냅샷)
- status: ENUM('CREATED', 'PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED') DEFAULT 'CREATED'
- tx_hash: VARCHAR(66) NULL (트랜잭션 해시)
- expires_at: DATETIME NOT NULL (만료 시간)
- confirmed_at: DATETIME NULL (확인 시간)
- created_at: DATETIME DEFAULT NOW
- updated_at: DATETIME ON UPDATE NOW
- INDEX(payment_method_id)
- INDEX(status, created_at)

**relay_requests 테이블** - Gasless 릴레이 요청

- id: INT AUTO_INCREMENT PRIMARY KEY
- relay_ref: VARCHAR(255) UNIQUE NOT NULL (Defender/Simple-Defender 요청 ID)
- payment_id: INT NOT NULL (→ payments.id 논리적 참조)
- status: ENUM('QUEUED', 'SUBMITTED', 'CONFIRMED', 'FAILED') DEFAULT 'QUEUED'
- gas_estimate: DECIMAL(65,0) NULL (예상 가스)
- gas_used: DECIMAL(65,0) NULL (사용된 가스)
- tx_hash: VARCHAR(66) NULL
- error_message: TEXT NULL
- submitted_at: DATETIME NULL
- confirmed_at: DATETIME NULL
- created_at: DATETIME DEFAULT NOW
- updated_at: DATETIME ON UPDATE NOW
- INDEX(payment_id)

**payment_events 테이블** - 결제 이벤트 로그

- id: INT AUTO_INCREMENT PRIMARY KEY
- payment_id: INT NOT NULL (→ payments.id 논리적 참조)
- event_type: ENUM('CREATED', 'STATUS_CHANGED', 'RELAY_SUBMITTED', 'RELAY_CONFIRMED', 'EXPIRED')
- old_status: VARCHAR(50) NULL
- new_status: VARCHAR(50) NULL
- metadata: JSON NULL
- created_at: DATETIME DEFAULT NOW
- INDEX(payment_id)

### 3.3 인덱스 전략

- chains.network_id: UNIQUE INDEX
- tokens(chain_id, address): COMPOSITE UNIQUE INDEX
- merchants.merchant_key: UNIQUE INDEX
- merchant_payment_methods(merchant_id, token_id): COMPOSITE UNIQUE INDEX
- payments.payment_hash: UNIQUE INDEX
- payments(payment_method_id): INDEX
- payments(status, created_at): COMPOSITE INDEX (상태별 목록 조회용)
- relay_requests.relay_ref: UNIQUE INDEX
- relay_requests(payment_id): INDEX
- payment_events(payment_id, created_at): COMPOSITE INDEX (이벤트 이력 조회용)

### 3.4 데이터 조회 경로

**결제 생성 시 chainId 조회 경로**

payments → merchant_payment_methods → tokens → chains

**결제 상태 조회 시 전체 정보 경로**

payments JOIN merchant_payment_methods JOIN tokens JOIN chains JOIN merchants

---

## 4. 기술 스택

### 4.1 핵심 의존성

- prisma: ^6.0.0 (ORM 및 마이그레이션)
- @prisma/client: ^6.0.0 (런타임 클라이언트)
- ioredis: ^5.4.0 (Redis 클라이언트)

### 4.2 인프라스트럭처

- MySQL 8.0 (docker/docker-compose.yml에 이미 구성됨)
- Redis 7 Alpine (docker/docker-compose.yml에 이미 구성됨)

### 4.3 환경 변수

```
DATABASE_URL=mysql://msqpay:pass@localhost:3306/msqpay
REDIS_URL=redis://localhost:6379
```

---

## 5. 영향 받는 파일

### 5.1 새로 생성되는 파일

- packages/pay-server/prisma/schema.prisma
- packages/pay-server/src/db/client.ts
- packages/pay-server/src/db/redis.ts
- packages/pay-server/src/services/database.service.ts
- packages/pay-server/src/services/chain.service.ts
- packages/pay-server/src/services/merchant.service.ts
- packages/pay-server/src/services/token.service.ts

### 5.2 수정되는 파일

- packages/pay-server/package.json (의존성 추가)
- packages/pay-server/src/index.ts (DB/Redis 초기화)
- packages/pay-server/src/routes/payments/status.ts (동적 chainId 조회)
- packages/pay-server/src/routes/payments/create.ts (DB 저장)
- packages/pay-server/src/routes/payments/gasless.ts (relay_requests 저장)

---

## 6. 제약사항

### 6.1 기술적 제약

- Prisma 6.x는 Node.js 18+ 필요
- MySQL 8.0의 utf8mb4 인코딩 사용 필수
- Redis 연결 실패 시에도 서비스 가용성 유지 (graceful degradation)
- FK 제약조건 미사용 (애플리케이션 레벨 참조 무결성)

### 6.2 성능 제약

- 결제 상태 조회 응답 시간: 100ms 이하
- 데이터베이스 연결 풀: 최소 5, 최대 20
- Redis 캐시 TTL: 기본 5분, 최대 1시간

### 6.3 보안 제약

- 모든 데이터베이스 연결은 TLS 암호화 권장 (프로덕션)
- 환경 변수를 통한 자격 증명 관리
- SQL 인젝션 방지 (Prisma 기본 제공)
- API 키는 SHA-256 해시로만 저장

---

## 7. 테스트 전략

### 7.1 단위 테스트

- DatabaseService의 CRUD 메서드 테스트
- Redis 캐시 로직 테스트
- Prisma 쿼리 결과 매핑 테스트
- Soft Delete 로직 테스트
- API 키 해시 검증 테스트

### 7.2 통합 테스트

- 실제 MySQL/Redis 컨테이너를 사용한 E2E 테스트
- 결제 생성 -> 상태 조회 플로우 테스트
- Gasless 요청 저장 및 조회 테스트
- 멀티체인/멀티토큰 시나리오 테스트

### 7.3 성능 테스트

- 동시 100개 결제 상태 조회 시 응답 시간 측정
- 캐시 히트율 모니터링

---

## 8. 관련 문서

- SPEC-RELAY-001: Gasless 릴레이 시스템 (연관)
- SPEC-SERVER-001: Pay-Server 초기 설정 (선행)
- docker/docker-compose.yml: 인프라 구성

---

## 9. 향후 확장 계획

### 9.1 RPC 백업 지원

chains 테이블에 backup_rpc_url 필드를 추가하여 RPC 노드 장애 시 자동 전환 기능을 구현할 예정입니다. 현재 버전에서는 문서화만 진행하고 구현은 향후 진행합니다.

---

## TAG

```
[SPEC-DB-001]
domain: backend, infrastructure
type: feature
priority: high
dependencies: SPEC-SERVER-001
affects: pay-server
schema-version: 2.0
tables: chains, tokens, merchants, merchant_payment_methods, payments, relay_requests, payment_events
```
