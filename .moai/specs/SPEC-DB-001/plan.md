# SPEC-DB-001: 구현 계획

## TAG

```
[SPEC-DB-001]
domain: backend, infrastructure
type: implementation-plan
status: draft
```

---

## 1. 구현 단계 개요

본 구현은 3개의 Phase로 구성되며, 각 Phase는 독립적으로 검증 가능합니다.

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
  - Payment 모델 정의
  - RelayRequest 모델 정의
  - PaymentEvent 모델 정의
  - 인덱스 및 관계 설정

**Task 1.2: Prisma Client 래퍼 생성**

- 파일: packages/pay-server/src/db/client.ts
- 내용
  - PrismaClient 싱글톤 패턴 구현
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

## 3. Phase 2: 핵심 로직 구현 (Core Logic)

### 3.1 목표

DatabaseService 구현 및 라우트 수정

### 3.2 작업 항목

**Task 2.1: DatabaseService 구현**

- 파일: packages/pay-server/src/services/database.service.ts
- 메서드
  - createPayment: 결제 생성 및 이벤트 기록
  - getPaymentById: paymentId로 결제 조회 (캐시 우선)
  - getPaymentChainId: paymentId로 chainId만 조회 (캐시 우선)
  - updatePaymentStatus: 상태 업데이트 및 이벤트 기록
  - createRelayRequest: relay 요청 저장
  - updateRelayRequest: relay 상태 업데이트
  - invalidateCache: 캐시 무효화

**Task 2.2: 서버 초기화 수정**

- 파일: packages/pay-server/src/index.ts
- 변경 내용
  - DatabaseService 초기화
  - 서버 시작 전 DB 연결 확인
  - 라우트에 DatabaseService 주입
  - health check에 DB/Redis 상태 포함
  - graceful shutdown 시 연결 종료

**Task 2.3: 결제 생성 라우트 수정**

- 파일: packages/pay-server/src/routes/payments/create.ts
- 변경 내용
  - DatabaseService 의존성 추가
  - 결제 생성 시 DB에 저장
  - payment_events에 CREATED 이벤트 기록
  - 응답에 DB 저장 성공 여부 포함

**Task 2.4: 결제 상태 라우트 수정**

- 파일: packages/pay-server/src/routes/payments/status.ts
- 변경 내용
  - DEFAULT_CHAIN_ID 상수 제거
  - DatabaseService에서 chainId 동적 조회
  - 캐시 히트/미스 로깅
  - 결제 정보 없음 시 404 반환

**Task 2.5: Gasless 라우트 수정**

- 파일: packages/pay-server/src/routes/payments/gasless.ts
- 변경 내용
  - DatabaseService 의존성 추가
  - relay_requests 테이블에 요청 저장
  - 결제 상태를 PROCESSING으로 업데이트

### 3.3 검증 기준

- 결제 생성 API 호출 시 DB에 데이터 저장 확인
- 결제 상태 조회 API에서 동적 chainId 반환 확인
- Gasless 요청 시 relay_requests 테이블 저장 확인

---

## 4. Phase 3: 테스트 및 검증 (Testing)

### 4.1 목표

단위 테스트 및 통합 테스트 작성

### 4.2 작업 항목

**Task 3.1: DatabaseService 단위 테스트**

- 파일: packages/pay-server/src/services/database.service.test.ts
- 테스트 케이스
  - createPayment 성공/실패
  - getPaymentById 캐시 히트/미스
  - getPaymentChainId 성공/404
  - updatePaymentStatus 및 이벤트 기록
  - createRelayRequest 성공
  - Redis 연결 실패 시 fallback

**Task 3.2: 라우트 통합 테스트**

- 파일: packages/pay-server/src/routes/payments/create.test.ts (수정)
- 파일: packages/pay-server/src/routes/payments/status.test.ts (수정)
- 테스트 케이스
  - 결제 생성 -> DB 저장 확인
  - 결제 상태 조회 -> chainId 동적 반환
  - 존재하지 않는 paymentId 조회 -> 404

**Task 3.3: E2E 테스트**

- 전체 플로우 테스트
  - 결제 생성 -> Gasless 제출 -> 상태 조회
  - 캐시 동작 확인
  - 여러 chainId에 대한 결제 생성 및 조회

### 4.3 검증 기준

- 테스트 커버리지 85% 이상
- 모든 E2E 테스트 통과
- 캐시 히트율 확인

---

## 5. 기술적 세부사항

### 5.1 Prisma 스키마 상세

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

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

model Payment {
  id               Int            @id @default(autoincrement())
  paymentId        String         @unique @map("payment_id") @db.VarChar(66)
  merchantId       String         @map("merchant_id") @db.VarChar(255)
  orderId          String         @map("order_id") @db.VarChar(255)
  chainId          Int            @map("chain_id")
  tokenAddress     String         @map("token_address") @db.VarChar(42)
  recipientAddress String         @map("recipient_address") @db.VarChar(42)
  amount           Decimal        @db.Decimal(78, 0)
  currency         String         @db.VarChar(10)
  status           PaymentStatus  @default(PENDING)
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  relayRequests RelayRequest[]
  events        PaymentEvent[]

  @@index([merchantId, orderId])
  @@index([status, createdAt])
  @@map("payments")
}

model RelayRequest {
  id              Int         @id @default(autoincrement())
  relayRequestId  String      @unique @map("relay_request_id") @db.VarChar(255)
  paymentId       String      @map("payment_id") @db.VarChar(66)
  forwarderAddress String     @map("forwarder_address") @db.VarChar(42)
  txHash          String?     @map("tx_hash") @db.VarChar(66)
  status          RelayStatus @default(SUBMITTED)
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  payment Payment @relation(fields: [paymentId], references: [paymentId])

  @@index([paymentId])
  @@map("relay_requests")
}

model PaymentEvent {
  id        Int       @id @default(autoincrement())
  paymentId String    @map("payment_id") @db.VarChar(66)
  eventType EventType @map("event_type")
  eventData Json?     @map("event_data")
  createdAt DateTime  @default(now()) @map("created_at")

  payment Payment @relation(fields: [paymentId], references: [paymentId])

  @@index([paymentId, createdAt])
  @@map("payment_events")
}
```

### 5.2 Redis 캐시 키 전략

- 결제 정보 캐시: `payment:{paymentId}`
- chainId 캐시: `payment:chainId:{paymentId}`
- TTL: 300초 (5분)

### 5.3 환경 변수

```
# Database
DATABASE_URL=mysql://msqpay:pass@mysql:3306/msqpay

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379
```

---

## 6. 마일스톤

### M1: Phase 1 완료

- Prisma 스키마 정의 완료
- 클라이언트 설정 완료
- 의존성 설치 완료

### M2: Phase 2 완료

- DatabaseService 구현 완료
- 모든 라우트 수정 완료
- DEFAULT_CHAIN_ID 제거 완료

### M3: Phase 3 완료

- 단위 테스트 작성 완료
- 통합 테스트 통과
- 커버리지 85% 달성

---

## 7. 위험 요소 및 대응

### 7.1 기술적 위험

**위험**: Prisma 6.x와 기존 코드 호환성

- 대응: Prisma 5.x로 다운그레이드 가능

**위험**: Redis 연결 불안정

- 대응: graceful degradation 구현 (캐시 우회)

**위험**: MySQL 연결 풀 고갈

- 대응: 연결 풀 크기 모니터링 및 조정

### 7.2 일정 위험

**위험**: 테스트 환경 구성 지연

- 대응: Docker Compose로 로컬 환경 사전 검증

---

## 8. 완료 정의

- 모든 Phase 작업 완료
- 테스트 커버리지 85% 이상
- DEFAULT_CHAIN_ID 하드코딩 제거
- paymentId로 chainId 동적 조회 성공
- 문서 업데이트 완료
