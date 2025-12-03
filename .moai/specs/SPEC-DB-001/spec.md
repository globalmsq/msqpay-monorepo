# SPEC-DB-001: Pay-Server 데이터베이스 통합

## 메타데이터

| 항목 | 값 |
|------|-----|
| ID | SPEC-DB-001 |
| 제목 | Pay-Server 데이터베이스 통합 (Prisma + MySQL + Redis) |
| 우선순위 | HIGH |
| 상태 | Draft |
| 생성일 | 2025-12-03 |
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

**영향 범위**

- 멀티체인 지원 불가: paymentId에서 chainId를 조회할 수 없어 단일 체인만 지원
- 결제 이력 관리 불가: 결제 생성 후 데이터가 저장되지 않음
- Relay 요청 추적 불가: gasless 트랜잭션 상태 추적 불가

### 1.2 목표 상태

- Prisma ORM을 통한 MySQL 8.0 데이터베이스 연동
- Redis 캐싱을 통한 성능 최적화
- paymentId 기반 동적 chainId 조회 지원
- 멀티체인 결제 시스템 완성

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

### 2.5 금지 요구사항 (UNWANTED)

**UNW-001**: 하드코딩 chainId 사용 금지

> 시스템은 status.ts에서 하드코딩된 DEFAULT_CHAIN_ID를 사용하지 않아야 한다.

**UNW-002**: 민감 정보 로깅 금지

> 시스템은 데이터베이스 비밀번호, 개인키 등 민감 정보를 로그에 출력하지 않아야 한다.

**UNW-003**: 캐시 무한 TTL 금지

> 시스템은 Redis 캐시에 무한 TTL을 설정하지 않아야 한다 (최대 TTL: 1시간).

### 2.6 선택적 요구사항 (OPTIONAL)

**OPT-001**: 연결 풀링 최적화

> 가능한 경우, Prisma 연결 풀 크기를 환경에 맞게 조정할 수 있어야 한다.

**OPT-002**: 캐시 워밍업

> 가능한 경우, 자주 조회되는 결제 데이터를 서버 시작 시 미리 캐싱할 수 있어야 한다.

---

## 3. 데이터 모델

### 3.1 Prisma 스키마 설계

**payments 테이블**

- id: 자동 증가 기본키
- payment_id: bytes32 해시 (유니크, 인덱스)
- merchant_id: 가맹점 식별자
- order_id: 주문 식별자
- chain_id: 블록체인 네트워크 ID
- token_address: ERC20 토큰 컨트랙트 주소
- recipient_address: 수취인 지갑 주소
- amount: 결제 금액 (wei 단위, Decimal)
- currency: 통화 심볼 (USDT, USDC 등)
- status: 결제 상태 (PENDING, PROCESSING, COMPLETED, FAILED)
- created_at: 생성 시간
- updated_at: 수정 시간

**relay_requests 테이블**

- id: 자동 증가 기본키
- relay_request_id: Defender/Simple-Defender 요청 ID
- payment_id: payments 테이블 참조 (외래키)
- forwarder_address: EIP-2771 Forwarder 컨트랙트 주소
- tx_hash: 트랜잭션 해시 (nullable)
- status: 릴레이 상태 (SUBMITTED, PENDING, CONFIRMED, FAILED)
- created_at: 생성 시간
- updated_at: 수정 시간

**payment_events 테이블**

- id: 자동 증가 기본키
- payment_id: payments 테이블 참조 (외래키)
- event_type: 이벤트 유형 (CREATED, SUBMITTED, CONFIRMED, FAILED)
- event_data: JSON 형식 추가 데이터
- created_at: 이벤트 발생 시간

### 3.2 인덱스 전략

- payments.payment_id: UNIQUE INDEX
- payments.merchant_id + order_id: COMPOSITE INDEX
- payments.status + created_at: COMPOSITE INDEX (상태별 목록 조회용)
- relay_requests.payment_id: INDEX (조인용)
- payment_events.payment_id + created_at: COMPOSITE INDEX (이벤트 이력 조회용)

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

### 6.2 성능 제약

- 결제 상태 조회 응답 시간: 100ms 이하
- 데이터베이스 연결 풀: 최소 5, 최대 20
- Redis 캐시 TTL: 기본 5분, 최대 1시간

### 6.3 보안 제약

- 모든 데이터베이스 연결은 TLS 암호화 권장 (프로덕션)
- 환경 변수를 통한 자격 증명 관리
- SQL 인젝션 방지 (Prisma 기본 제공)

---

## 7. 테스트 전략

### 7.1 단위 테스트

- DatabaseService의 CRUD 메서드 테스트
- Redis 캐시 로직 테스트
- Prisma 쿼리 결과 매핑 테스트

### 7.2 통합 테스트

- 실제 MySQL/Redis 컨테이너를 사용한 E2E 테스트
- 결제 생성 -> 상태 조회 플로우 테스트
- Gasless 요청 저장 및 조회 테스트

### 7.3 성능 테스트

- 동시 100개 결제 상태 조회 시 응답 시간 측정
- 캐시 히트율 모니터링

---

## 8. 관련 문서

- SPEC-RELAY-001: Gasless 릴레이 시스템 (연관)
- SPEC-SERVER-001: Pay-Server 초기 설정 (선행)
- docker/docker-compose.yml: 인프라 구성

---

## TAG

```
[SPEC-DB-001]
domain: backend, infrastructure
type: feature
priority: high
dependencies: SPEC-SERVER-001
affects: pay-server
```
