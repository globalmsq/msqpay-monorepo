# SPEC-DB-001: 인수 기준

## TAG

```
[SPEC-DB-001]
domain: backend, infrastructure
type: acceptance-criteria
status: draft
```

---

## 1. 핵심 시나리오

### 1.1 결제 생성 및 DB 저장

**Given-When-Then 시나리오**

```gherkin
Feature: 결제 생성 시 데이터베이스 저장
  결제가 생성되면 payments 테이블에 저장되어야 한다

  Scenario: 정상적인 결제 생성
    Given 유효한 결제 요청 데이터가 존재한다
      | merchantId | orderId | amount | currency | chainId | tokenAddress | recipientAddress |
      | merchant1  | order1  | 100    | USDT     | 31337   | 0xe7f17...   | 0xf39Fd...       |
    When POST /payments/create API를 호출한다
    Then 응답 상태 코드는 201이어야 한다
    And 응답에 paymentId가 포함되어야 한다
    And payments 테이블에 해당 결제 정보가 저장되어야 한다
    And payment_events 테이블에 CREATED 이벤트가 기록되어야 한다

  Scenario: 중복 주문 ID로 결제 생성 시도
    Given 동일한 merchantId와 orderId로 이미 결제가 존재한다
    When POST /payments/create API를 호출한다
    Then 새로운 paymentId가 생성되어야 한다 (timestamp 포함으로 유니크 보장)
```

### 1.2 결제 상태 조회 및 동적 chainId

**Given-When-Then 시나리오**

```gherkin
Feature: paymentId로 동적 chainId 조회
  결제 상태 조회 시 DB에서 chainId를 동적으로 조회해야 한다

  Scenario: 존재하는 결제 상태 조회 (캐시 미스)
    Given paymentId "0xabc123..."인 결제가 chainId 137(Polygon)으로 DB에 저장되어 있다
    And Redis 캐시에 해당 데이터가 없다
    When GET /payments/0xabc123.../status API를 호출한다
    Then 응답 상태 코드는 200이어야 한다
    And 응답의 chainId는 137이어야 한다
    And 조회 결과가 Redis에 캐싱되어야 한다 (TTL: 5분)

  Scenario: 존재하는 결제 상태 조회 (캐시 히트)
    Given paymentId "0xdef456..."인 결제 정보가 Redis 캐시에 존재한다
    When GET /payments/0xdef456.../status API를 호출한다
    Then 응답 상태 코드는 200이어야 한다
    And DB 조회 없이 캐시에서 데이터가 반환되어야 한다

  Scenario: 존재하지 않는 결제 상태 조회
    Given paymentId "0x999..."인 결제가 DB에 존재하지 않는다
    When GET /payments/0x999.../status API를 호출한다
    Then 응답 상태 코드는 404이어야 한다
    And 에러 코드는 NOT_FOUND이어야 한다
```

### 1.3 Redis 캐싱 동작

**Given-When-Then 시나리오**

```gherkin
Feature: Redis 캐시 정상 동작
  결제 데이터 조회 시 캐시가 정상 동작해야 한다

  Scenario: 캐시 만료 후 재조회
    Given paymentId "0xabc..."인 결제가 캐시에 존재한다
    And 캐시 TTL이 만료되었다
    When GET /payments/0xabc.../status API를 호출한다
    Then DB에서 데이터를 조회해야 한다
    And 새로운 캐시가 생성되어야 한다

  Scenario: 결제 상태 변경 시 캐시 무효화
    Given paymentId "0xabc..."인 결제가 캐시에 존재한다
    When 해당 결제의 상태가 COMPLETED로 변경된다
    Then Redis 캐시가 무효화되어야 한다
    And 다음 조회 시 DB에서 최신 데이터를 가져와야 한다
```

### 1.4 Gasless 요청 추적

**Given-When-Then 시나리오**

```gherkin
Feature: Gasless 트랜잭션 요청 저장
  Gasless 요청이 제출되면 relay_requests 테이블에 저장되어야 한다

  Scenario: Gasless 요청 제출 성공
    Given paymentId "0xabc..."인 결제가 PENDING 상태로 존재한다
    And 유효한 ForwardRequest 데이터가 준비되어 있다
    When POST /payments/0xabc.../gasless API를 호출한다
    Then 응답 상태 코드는 202이어야 한다
    And relay_requests 테이블에 요청이 저장되어야 한다
    And 결제 상태가 PROCESSING으로 변경되어야 한다
    And payment_events에 SUBMITTED 이벤트가 기록되어야 한다

  Scenario: 존재하지 않는 결제에 Gasless 요청
    Given paymentId "0x999..."인 결제가 존재하지 않는다
    When POST /payments/0x999.../gasless API를 호출한다
    Then 응답 상태 코드는 404이어야 한다
```

---

## 2. 에러 처리 시나리오

### 2.1 데이터베이스 연결 실패

```gherkin
Feature: 데이터베이스 연결 실패 처리
  DB 연결이 실패해도 적절한 에러 응답을 반환해야 한다

  Scenario: DB 연결 실패 시 API 응답
    Given 데이터베이스 연결이 불가능한 상태이다
    When GET /payments/0xabc.../status API를 호출한다
    Then 응답 상태 코드는 500이어야 한다
    And 에러 코드는 INTERNAL_ERROR이어야 한다
    And 에러 메시지는 사용자 친화적이어야 한다

  Scenario: Health Check에서 DB 상태 반영
    Given 데이터베이스 연결이 불가능한 상태이다
    When GET /health API를 호출한다
    Then 응답에 database: unhealthy가 포함되어야 한다
```

### 2.2 Redis 연결 실패 (Graceful Degradation)

```gherkin
Feature: Redis 연결 실패 시 fallback
  Redis 연결이 실패해도 서비스가 정상 동작해야 한다

  Scenario: Redis 연결 실패 시 DB 직접 조회
    Given Redis 연결이 불가능한 상태이다
    And paymentId "0xabc..."인 결제가 DB에 존재한다
    When GET /payments/0xabc.../status API를 호출한다
    Then 응답 상태 코드는 200이어야 한다
    And DB에서 직접 데이터가 반환되어야 한다

  Scenario: Health Check에서 Redis 상태 반영
    Given Redis 연결이 불가능한 상태이다
    When GET /health API를 호출한다
    Then 응답에 redis: unhealthy가 포함되어야 한다
    And 전체 상태는 degraded이어야 한다 (ok가 아님)
```

---

## 3. 성능 기준

### 3.1 응답 시간

```gherkin
Feature: API 응답 시간 기준
  결제 상태 조회는 100ms 이내에 응답해야 한다

  Scenario: 캐시 히트 시 응답 시간
    Given 결제 데이터가 캐시에 존재한다
    When 결제 상태 조회 API를 호출한다
    Then 응답 시간은 50ms 이내이어야 한다

  Scenario: 캐시 미스 시 응답 시간
    Given 결제 데이터가 캐시에 없고 DB에만 존재한다
    When 결제 상태 조회 API를 호출한다
    Then 응답 시간은 100ms 이내이어야 한다
```

### 3.2 동시성

```gherkin
Feature: 동시 요청 처리
  다수의 동시 요청을 안정적으로 처리해야 한다

  Scenario: 동시 100개 결제 상태 조회
    Given 100개의 서로 다른 결제가 DB에 존재한다
    When 100개의 상태 조회 요청을 동시에 전송한다
    Then 모든 요청이 성공적으로 응답되어야 한다
    And 평균 응답 시간은 200ms 이내이어야 한다
```

---

## 4. 데이터 무결성 기준

### 4.1 트랜잭션 일관성

```gherkin
Feature: 데이터 일관성 보장
  결제 생성 시 모든 관련 데이터가 일관되게 저장되어야 한다

  Scenario: 결제 생성 트랜잭션 성공
    Given 유효한 결제 요청 데이터가 존재한다
    When 결제 생성 API를 호출한다
    Then payments 테이블과 payment_events 테이블에 동시에 저장되어야 한다

  Scenario: 부분 실패 시 롤백
    Given 유효한 결제 요청 데이터가 존재한다
    And payment_events 테이블 삽입이 실패하도록 설정되어 있다
    When 결제 생성 API를 호출한다
    Then payments 테이블에도 데이터가 저장되지 않아야 한다 (롤백)
```

---

## 5. 보안 기준

### 5.1 민감 정보 보호

```gherkin
Feature: 민감 정보 로깅 금지
  데이터베이스 자격 증명이 로그에 노출되지 않아야 한다

  Scenario: 에러 로그에서 자격 증명 제외
    Given 데이터베이스 연결 오류가 발생한다
    When 에러 로그가 출력된다
    Then 로그에 비밀번호나 연결 문자열이 포함되지 않아야 한다
```

---

## 6. 코드 품질 기준

### 6.1 테스트 커버리지

- 단위 테스트 커버리지: 85% 이상
- DatabaseService 메서드: 100% 커버리지
- 라우트 핸들러: 80% 이상 커버리지

### 6.2 코드 스타일

- ESLint 경고 0개
- TypeScript strict 모드 통과
- Prisma Client 타입 안전성 보장

---

## 7. 검증 체크리스트

### 7.1 필수 검증 항목

- [ ] DEFAULT_CHAIN_ID 하드코딩이 완전히 제거되었는가
- [ ] 모든 결제 생성이 DB에 저장되는가
- [ ] paymentId로 chainId 조회가 정상 동작하는가
- [ ] Redis 캐시가 정상 동작하는가
- [ ] Redis 실패 시 fallback이 동작하는가
- [ ] relay_requests 테이블에 gasless 요청이 저장되는가
- [ ] payment_events 테이블에 이벤트가 기록되는가
- [ ] health check에 DB/Redis 상태가 포함되는가

### 7.2 성능 검증 항목

- [ ] 캐시 히트 시 응답 시간 50ms 이내
- [ ] 캐시 미스 시 응답 시간 100ms 이내
- [ ] 동시 100개 요청 처리 성공

### 7.3 보안 검증 항목

- [ ] 로그에 민감 정보 미노출
- [ ] SQL 인젝션 방지 (Prisma 파라미터화)
- [ ] 환경 변수로 자격 증명 관리

---

## 8. Definition of Done

SPEC-DB-001이 완료되었다고 판단하기 위한 조건

1. 모든 필수 검증 항목 통과
2. 테스트 커버리지 85% 이상
3. CI/CD 파이프라인 통과
4. 코드 리뷰 완료
5. 문서 업데이트 완료 (README, API 문서)
6. 개발 환경(Docker Compose)에서 E2E 테스트 통과
