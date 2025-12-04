# SPEC-DB-001: 구현 계획

## TAG

```
[SPEC-DB-001]
domain: backend, infrastructure
type: implementation-plan
status: draft
schema-version: 2.0
```

---

## 1. 구현 단계 개요

본 구현은 4개의 Phase로 구성되며, 각 Phase는 독립적으로 검증 가능합니다.

- Phase 1: 기반 설정 (Setup) - Prisma 스키마, 클라이언트 설정
- Phase 2: 마스터 데이터 관리 (Master Data) - chains, tokens, merchants 관리
- Phase 3: 핵심 로직 구현 (Core Logic) - 결제 생성, 조회, 릴레이
- Phase 4: 테스트 및 검증 (Testing) - 단위/통합 테스트

---

## 2. Phase 1: 기반 설정 (Setup)

### 2.1 목표

Prisma 스키마 정의 및 데이터베이스/Redis 클라이언트 설정

### 2.2 작업 항목

**Task 1.1: Prisma 초기화 및 스키마 정의**

- 파일: packages/pay-server/prisma/schema.prisma
- 내용
  - datasource 설정 (mysql, DATABASE_URL)
  - generator 설정 (prisma-client-js)
  - 7개 모델 정의 (Chain, Token, Merchant, MerchantPaymentMethod, Payment, RelayRequest, PaymentEvent)
  - 인덱스 설정 (FK 없이 논리적 참조)
  - Soft Delete 필드 (is_enabled, is_deleted, deleted_at)

**Task 1.2: Prisma Client 래퍼 생성**

- 파일: packages/pay-server/src/db/client.ts
- 내용
  - PrismaClient 싱글톤 패턴 구현
  - Soft Delete 미들웨어 설정
  - 연결 상태 확인 메서드
  - graceful shutdown 핸들러

**Task 1.3: Redis Client 설정**

- 파일: packages/pay-server/src/db/redis.ts
- 내용
  - ioredis 클라이언트 설정
  - 연결 상태 확인 메서드
  - 캐시 get/set/delete 유틸리티
  - 연결 실패 시 fallback 처리

**Task 1.4: 의존성 설치**

- 파일: packages/pay-server/package.json
- 추가 의존성
  - prisma: ^6.0.0 (devDependencies)
  - @prisma/client: ^6.0.0 (dependencies)
  - ioredis: ^5.4.0 (dependencies)
- 스크립트 추가
  - db:generate: prisma generate
  - db:push: prisma db push
  - db:migrate: prisma migrate dev
  - db:studio: prisma studio

### 2.3 검증 기준

- prisma generate 명령 성공
- prisma db push 명령으로 스키마 동기화 성공
- Redis 연결 테스트 성공

---

## 3. Phase 2: 마스터 데이터 관리 (Master Data)

### 3.1 목표

chains, tokens, merchants 테이블 관리 서비스 구현

### 3.2 작업 항목

**Task 2.1: ChainService 구현**

- 파일: packages/pay-server/src/services/chain.service.ts
- 메서드
  - createChain: 체인 등록
  - getChainByNetworkId: network_id로 체인 조회
  - getChainById: id로 체인 조회
  - getActiveChains: 활성 체인 목록 조회
  - disableChain: 체인 비활성화 (soft delete)
  - deleteChain: 체인 삭제 (is_deleted = true)

**Task 2.2: TokenService 구현**

- 파일: packages/pay-server/src/services/token.service.ts
- 메서드
  - createToken: 토큰 등록 (chain_id 참조)
  - getTokenByChainAndAddress: 체인+주소로 토큰 조회
  - getTokenById: id로 토큰 조회
  - getTokensByChain: 체인별 활성 토큰 목록
  - disableToken: 토큰 비활성화
  - deleteToken: 토큰 삭제 (is_deleted = true)

**Task 2.3: MerchantService 구현**

- 파일: packages/pay-server/src/services/merchant.service.ts
- 메서드
  - createMerchant: 가맹점 등록 (API 키 해시 생성)
  - getMerchantByKey: merchant_key로 조회
  - getMerchantById: id로 조회
  - validateApiKey: API 키 검증 (SHA-256 해시 비교)
  - updateWebhookUrl: 웹훅 URL 업데이트
  - disableMerchant: 가맹점 비활성화
  - deleteMerchant: 가맹점 삭제 (is_deleted = true)

**Task 2.4: MerchantPaymentMethodService 구현**

- 파일: packages/pay-server/src/services/payment-method.service.ts
- 메서드
  - createPaymentMethod: 결제 수단 등록
  - getPaymentMethod: merchant_id + token_id로 조회
  - getPaymentMethodById: id로 조회
  - getPaymentMethodsByMerchant: 가맹점별 결제 수단 목록
  - updateRecipientAddress: 수취 주소 변경
  - disablePaymentMethod: 결제 수단 비활성화
  - deletePaymentMethod: 결제 수단 삭제 (is_deleted = true)

### 3.3 검증 기준

- 체인/토큰/가맹점 CRUD 정상 동작
- API 키 해시 검증 성공
- Soft Delete 동작 확인

---

## 4. Phase 3: 핵심 로직 구현 (Core Logic)

### 4.1 목표

DatabaseService 구현 및 라우트 수정

### 4.2 작업 항목

**Task 3.1: PaymentService 구현**

- 파일: packages/pay-server/src/services/payment.service.ts
- 메서드
  - createPayment: 결제 생성 및 이벤트 기록
    - payment_method_id로 토큰 정보 조회
    - decimals 스냅샷 저장
    - payment_events에 CREATED 이벤트 기록
  - getPaymentByHash: payment_hash로 결제 조회 (캐시 우선)
  - getPaymentChainId: payment_hash로 chainId만 조회 (캐시 우선)
    - payments → merchant_payment_methods → tokens → chains 경로
  - updatePaymentStatus: 상태 업데이트 및 이벤트 기록
  - getFullPaymentInfo: 전체 결제 정보 조회 (조인)
  - invalidateCache: 캐시 무효화

**Task 3.2: RelayService 구현**

- 파일: packages/pay-server/src/services/relay.service.ts
- 메서드
  - createRelayRequest: relay 요청 저장
  - getRelayRequestByRef: relay_ref로 조회
  - getRelayRequestsByPayment: payment_id로 요청 목록 조회
  - updateRelayRequest: relay 상태 업데이트
  - updateTxHash: 트랜잭션 해시 업데이트

**Task 3.3: 서버 초기화 수정**

- 파일: packages/pay-server/src/index.ts
- 변경 내용
  - 서비스 초기화 (ChainService, TokenService, MerchantService, PaymentService, RelayService)
  - 서버 시작 전 DB 연결 확인
  - 라우트에 서비스 주입
  - health check에 DB/Redis 상태 포함
  - graceful shutdown 시 연결 종료

**Task 3.4: 결제 생성 라우트 수정**

- 파일: packages/pay-server/src/routes/payments/create.ts
- 변경 내용
  - PaymentService 의존성 추가
  - merchant_key + token 정보로 payment_method_id 조회
  - 결제 생성 시 DB에 저장
  - payment_events에 CREATED 이벤트 기록
  - 응답에 DB 저장 성공 여부 포함

**Task 3.5: 결제 상태 라우트 수정**

- 파일: packages/pay-server/src/routes/payments/status.ts
- 변경 내용
  - DEFAULT_CHAIN_ID 상수 제거
  - PaymentService에서 chainId 동적 조회
  - 캐시 히트/미스 로깅
  - 결제 정보 없음 시 404 반환

**Task 3.6: Gasless 라우트 수정**

- 파일: packages/pay-server/src/routes/payments/gasless.ts
- 변경 내용
  - RelayService 의존성 추가
  - relay_requests 테이블에 요청 저장
  - 결제 상태를 PROCESSING으로 업데이트

### 4.3 검증 기준

- 결제 생성 API 호출 시 DB에 데이터 저장 확인
- 결제 상태 조회 API에서 동적 chainId 반환 확인
- Gasless 요청 시 relay_requests 테이블 저장 확인

---

## 5. Phase 4: 테스트 및 검증 (Testing)

### 5.1 목표

단위 테스트 및 통합 테스트 작성

### 5.2 작업 항목

**Task 4.1: 마스터 데이터 서비스 단위 테스트**

- 파일: packages/pay-server/src/services/__tests__/chain.service.test.ts
- 파일: packages/pay-server/src/services/__tests__/token.service.test.ts
- 파일: packages/pay-server/src/services/__tests__/merchant.service.test.ts
- 파일: packages/pay-server/src/services/__tests__/payment-method.service.test.ts
- 테스트 케이스
  - CRUD 정상 동작
  - Soft Delete 동작
  - 중복 체크
  - API 키 해시 검증

**Task 4.2: PaymentService 단위 테스트**

- 파일: packages/pay-server/src/services/__tests__/payment.service.test.ts
- 테스트 케이스
  - createPayment 성공/실패
  - getPaymentByHash 캐시 히트/미스
  - getPaymentChainId 성공/404
  - updatePaymentStatus 및 이벤트 기록
  - Redis 연결 실패 시 fallback

**Task 4.3: RelayService 단위 테스트**

- 파일: packages/pay-server/src/services/__tests__/relay.service.test.ts
- 테스트 케이스
  - createRelayRequest 성공
  - updateTxHash 성공
  - 상태 전이 테스트

**Task 4.4: 라우트 통합 테스트**

- 파일: packages/pay-server/src/routes/payments/__tests__/create.test.ts
- 파일: packages/pay-server/src/routes/payments/__tests__/status.test.ts
- 파일: packages/pay-server/src/routes/payments/__tests__/gasless.test.ts
- 테스트 케이스
  - 결제 생성 → DB 저장 확인
  - 결제 상태 조회 → chainId 동적 반환
  - 존재하지 않는 paymentId 조회 → 404
  - Gasless 요청 → relay_requests 저장

**Task 4.5: E2E 테스트**

- 전체 플로우 테스트
  - 결제 생성 → Gasless 제출 → 상태 조회
  - 캐시 동작 확인
  - 멀티체인/멀티토큰 시나리오

### 5.3 검증 기준

- 테스트 커버리지 85% 이상
- 모든 E2E 테스트 통과
- 캐시 히트율 확인

---

## 6. 기술적 세부사항

### 6.1 Prisma 스키마 상세

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ===== Enums =====

enum PaymentStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum RelayStatus {
  SUBMITTED
  PENDING
  CONFIRMED
  FAILED
}

enum EventType {
  CREATED
  SUBMITTED
  CONFIRMED
  FAILED
}

// ===== Master Data Models =====

model Chain {
  id          Int       @id @default(autoincrement())
  networkId   Int       @unique @map("network_id")
  name        String    @db.VarChar(100)
  rpcUrl      String    @map("rpc_url") @db.VarChar(500)
  explorerUrl String?   @map("explorer_url") @db.VarChar(500)
  isEnabled   Boolean   @default(true) @map("is_enabled")
  isDeleted   Boolean   @default(false) @map("is_deleted")
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@map("chains")
}

model Token {
  id        Int       @id @default(autoincrement())
  chainId   Int       @map("chain_id")
  address   String    @db.VarChar(42)
  symbol    String    @db.VarChar(20)
  name      String    @db.VarChar(100)
  decimals  Int
  isEnabled Boolean   @default(true) @map("is_enabled")
  isDeleted Boolean   @default(false) @map("is_deleted")
  deletedAt DateTime? @map("deleted_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  @@unique([chainId, address])
  @@index([chainId])
  @@map("tokens")
}

model Merchant {
  id          Int       @id @default(autoincrement())
  merchantKey String    @unique @map("merchant_key") @db.VarChar(100)
  name        String    @db.VarChar(255)
  apiKeyHash  String    @map("api_key_hash") @db.VarChar(64)
  webhookUrl  String?   @map("webhook_url") @db.VarChar(500)
  isEnabled   Boolean   @default(true) @map("is_enabled")
  isDeleted   Boolean   @default(false) @map("is_deleted")
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@map("merchants")
}

model MerchantPaymentMethod {
  id               Int       @id @default(autoincrement())
  merchantId       Int       @map("merchant_id")
  tokenId          Int       @map("token_id")
  recipientAddress String    @map("recipient_address") @db.VarChar(42)
  isEnabled        Boolean   @default(true) @map("is_enabled")
  isDeleted        Boolean   @default(false) @map("is_deleted")
  deletedAt        DateTime? @map("deleted_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  @@unique([merchantId, tokenId])
  @@index([merchantId])
  @@index([tokenId])
  @@map("merchant_payment_methods")
}

// ===== Transaction Models =====

model Payment {
  id              Int           @id @default(autoincrement())
  paymentHash     String        @unique @map("payment_hash") @db.VarChar(66)
  paymentMethodId Int           @map("payment_method_id")
  orderId         String        @map("order_id") @db.VarChar(255)
  amount          Decimal       @db.Decimal(78, 0)
  decimals        Int
  status          PaymentStatus @default(PENDING)
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  @@index([paymentMethodId])
  @@index([status, createdAt])
  @@map("payments")
}

model RelayRequest {
  id               Int         @id @default(autoincrement())
  relayRef         String      @unique @map("relay_ref") @db.VarChar(255)
  paymentId        Int         @map("payment_id")
  forwarderAddress String      @map("forwarder_address") @db.VarChar(42)
  txHash           String?     @map("tx_hash") @db.VarChar(66)
  status           RelayStatus @default(SUBMITTED)
  createdAt        DateTime    @default(now()) @map("created_at")
  updatedAt        DateTime    @updatedAt @map("updated_at")

  @@index([paymentId])
  @@map("relay_requests")
}

model PaymentEvent {
  id        Int       @id @default(autoincrement())
  paymentId Int       @map("payment_id")
  eventType EventType @map("event_type")
  eventData Json?     @map("event_data")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([paymentId, createdAt])
  @@map("payment_events")
}
```

### 6.2 Redis 캐시 키 전략

- 결제 정보 캐시: `payment:{paymentHash}`
- chainId 캐시: `payment:chainId:{paymentHash}`
- 가맹점 정보 캐시: `merchant:{merchantKey}`
- TTL: 300초 (5분)

### 6.3 환경 변수

```
# Database
DATABASE_URL=mysql://msqpay:pass@mysql:3306/msqpay

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
```

### 6.4 API 키 해시 알고리즘

SHA-256 해시를 사용하여 API 키를 저장합니다.

```
api_key_hash = SHA256(api_key)
```

검증 시 입력된 API 키를 동일하게 해시하여 비교합니다.

---

## 7. 마일스톤

### M1: Phase 1 완료

- Prisma 스키마 정의 완료 (7개 테이블)
- 클라이언트 설정 완료
- 의존성 설치 완료

### M2: Phase 2 완료

- ChainService 구현 완료
- TokenService 구현 완료
- MerchantService 구현 완료
- MerchantPaymentMethodService 구현 완료

### M3: Phase 3 완료

- PaymentService 구현 완료
- RelayService 구현 완료
- 모든 라우트 수정 완료
- DEFAULT_CHAIN_ID 제거 완료

### M4: Phase 4 완료

- 단위 테스트 작성 완료
- 통합 테스트 통과
- 커버리지 85% 달성

---

## 8. 위험 요소 및 대응

### 8.1 기술적 위험

**위험**: Prisma 6.x와 기존 코드 호환성

- 대응: Prisma 5.x로 다운그레이드 가능

**위험**: Redis 연결 불안정

- 대응: graceful degradation 구현 (캐시 우회)

**위험**: MySQL 연결 풀 고갈

- 대응: 연결 풀 크기 모니터링 및 조정

**위험**: 논리적 참조 무결성 위반

- 대응: 애플리케이션 레벨 검증 로직 강화, 트랜잭션 사용

### 8.2 일정 위험

**위험**: 테스트 환경 구성 지연

- 대응: Docker Compose로 로컬 환경 사전 검증

**위험**: 마스터 데이터 관리 복잡성 증가

- 대응: Phase 2에서 충분한 시간 확보

---

## 9. 완료 정의

- 모든 Phase 작업 완료
- 테스트 커버리지 85% 이상
- DEFAULT_CHAIN_ID 하드코딩 제거
- paymentId로 chainId 동적 조회 성공
- Soft Delete 동작 확인
- API 키 해시 검증 동작 확인
- 문서 업데이트 완료
