# SPEC-DB-001: 인수 기준

## TAG

```
[SPEC-DB-001]
domain: backend, infrastructure
type: acceptance-criteria
status: draft
schema-version: 2.0
```

---

## 1. 마스터 데이터 관리 시나리오

### 1.1 체인 관리

**Given-When-Then 시나리오**

```gherkin
Feature: 블록체인 네트워크 관리
  체인 정보를 등록하고 관리할 수 있어야 한다

  Scenario: 새로운 체인 등록
    Given 유효한 체인 정보가 존재한다
      | network_id | name     | rpc_url                        |
      | 137        | Polygon  | https://polygon-rpc.com        |
    When ChainService.createChain을 호출한다
    Then chains 테이블에 해당 체인이 저장되어야 한다
    And is_enabled는 true이어야 한다
    And is_deleted는 false이어야 한다

  Scenario: 중복 network_id로 체인 등록 시도
    Given network_id 137인 체인이 이미 존재한다
    When 동일한 network_id로 createChain을 호출한다
    Then 에러가 발생해야 한다
    And 에러 코드는 DUPLICATE_NETWORK_ID이어야 한다

  Scenario: 체인 비활성화 (Soft Delete)
    Given network_id 137인 체인이 활성 상태로 존재한다
    When ChainService.disableChain을 호출한다
    Then is_enabled가 false로 변경되어야 한다
    And is_deleted는 false로 유지되어야 한다

  Scenario: 체인 삭제 (Soft Delete)
    Given network_id 137인 체인이 존재한다
    When ChainService.deleteChain을 호출한다
    Then is_deleted가 true로 변경되어야 한다
    And deleted_at에 현재 시간이 기록되어야 한다
    And 일반 조회에서 제외되어야 한다
```

### 1.2 토큰 관리

**Given-When-Then 시나리오**

```gherkin
Feature: 토큰 정보 관리
  체인별 토큰을 등록하고 관리할 수 있어야 한다

  Scenario: 새로운 토큰 등록
    Given chains 테이블에 network_id 137(Polygon)이 존재한다
      | chain_id | address                                    | symbol | decimals |
      | 1        | 0xc2132D05D31c914a87C6611C10748AEb04B58e8F | USDT   | 6        |
    When TokenService.createToken을 호출한다
    Then tokens 테이블에 해당 토큰이 저장되어야 한다
    And chain_id가 chains.id를 참조해야 한다

  Scenario: 동일 체인에 중복 토큰 주소 등록 시도
    Given Polygon 체인에 USDT 토큰이 이미 존재한다
    When 동일한 chain_id와 address로 createToken을 호출한다
    Then 에러가 발생해야 한다
    And 에러 코드는 DUPLICATE_TOKEN이어야 한다

  Scenario: 다른 체인에 동일 토큰 심볼 등록
    Given Polygon 체인에 USDT 토큰이 존재한다
    And Ethereum 체인(network_id: 1)이 존재한다
    When Ethereum 체인에 USDT 토큰을 등록한다
    Then 정상적으로 등록되어야 한다 (다른 체인이므로)
```

### 1.3 가맹점 관리

**Given-When-Then 시나리오**

```gherkin
Feature: 가맹점 정보 관리
  가맹점을 등록하고 API 키를 관리할 수 있어야 한다

  Scenario: 새로운 가맹점 등록
    Given 유효한 가맹점 정보와 API 키가 존재한다
      | merchant_key | name        | api_key           |
      | merchant1    | Test Store  | sk_test_abc123... |
    When MerchantService.createMerchant을 호출한다
    Then merchants 테이블에 해당 가맹점이 저장되어야 한다
    And api_key_hash에 SHA-256 해시가 저장되어야 한다
    And 원본 API 키는 저장되지 않아야 한다

  Scenario: API 키 검증 성공
    Given merchant_key "merchant1"인 가맹점이 존재한다
    And 해당 가맹점의 API 키가 "sk_test_abc123..."이다
    When MerchantService.validateApiKey를 호출한다
    Then 검증 결과가 true이어야 한다

  Scenario: API 키 검증 실패
    Given merchant_key "merchant1"인 가맹점이 존재한다
    When 잘못된 API 키로 validateApiKey를 호출한다
    Then 검증 결과가 false이어야 한다
```

### 1.4 결제 수단 관리

**Given-When-Then 시나리오**

```gherkin
Feature: 가맹점별 결제 수단 관리
  가맹점이 수취할 토큰과 지갑 주소를 관리할 수 있어야 한다

  Scenario: 결제 수단 등록
    Given merchant_key "merchant1"인 가맹점이 존재한다
    And Polygon USDT 토큰이 존재한다
      | merchant_id | token_id | recipient_address                          |
      | 1           | 1        | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |
    When PaymentMethodService.createPaymentMethod을 호출한다
    Then merchant_payment_methods 테이블에 저장되어야 한다

  Scenario: 동일 가맹점에 동일 토큰 중복 등록 시도
    Given merchant1이 Polygon USDT를 이미 등록했다
    When 동일한 merchant_id와 token_id로 등록을 시도한다
    Then 에러가 발생해야 한다
    And 에러 코드는 DUPLICATE_PAYMENT_METHOD이어야 한다

  Scenario: 수취 주소 변경
    Given merchant1의 Polygon USDT 결제 수단이 존재한다
    When PaymentMethodService.updateRecipientAddress를 호출한다
    Then recipient_address가 새 주소로 변경되어야 한다
    And 기존 결제에는 영향이 없어야 한다
```

---

## 2. 결제 생성 및 DB 저장

### 2.1 결제 생성 시나리오

**Given-When-Then 시나리오**

```gherkin
Feature: 결제 생성 시 데이터베이스 저장
  결제가 생성되면 payments 테이블에 저장되어야 한다

  Scenario: 정상적인 결제 생성
    Given merchant_key "merchant1"인 가맹점이 존재한다
    And 해당 가맹점의 Polygon USDT 결제 수단이 존재한다
    And 유효한 결제 요청 데이터가 존재한다
      | merchant_key | order_id | amount | token_symbol | network_id |
      | merchant1    | order1   | 100    | USDT         | 137        |
    When POST /payments/create API를 호출한다
    Then 응답 상태 코드는 201이어야 한다
    And 응답에 payment_hash가 포함되어야 한다
    And payments 테이블에 해당 결제 정보가 저장되어야 한다
    And payment_method_id가 올바르게 참조되어야 한다
    And decimals에 토큰의 decimals가 스냅샷되어야 한다
    And payment_events 테이블에 CREATED 이벤트가 기록되어야 한다

  Scenario: 비활성화된 결제 수단으로 결제 생성 시도
    Given merchant1의 Polygon USDT 결제 수단이 is_enabled=false이다
    When POST /payments/create API를 호출한다
    Then 응답 상태 코드는 400이어야 한다
    And 에러 코드는 PAYMENT_METHOD_DISABLED이어야 한다

  Scenario: 삭제된 토큰으로 결제 생성 시도
    Given Polygon USDT 토큰이 is_deleted=true이다
    When POST /payments/create API를 호출한다
    Then 응답 상태 코드는 400이어야 한다
    And 에러 코드는 TOKEN_NOT_FOUND이어야 한다
```

### 2.2 결제 상태 조회 및 동적 chainId

**Given-When-Then 시나리오**

```gherkin
Feature: payment_hash로 동적 chainId 조회
  결제 상태 조회 시 DB에서 chainId를 동적으로 조회해야 한다

  Scenario: 존재하는 결제 상태 조회 (캐시 미스)
    Given payment_hash "0xabc123..."인 결제가 Polygon(network_id: 137)으로 DB에 저장되어 있다
    And Redis 캐시에 해당 데이터가 없다
    When GET /payments/0xabc123.../status API를 호출한다
    Then 응답 상태 코드는 200이어야 한다
    And 응답의 chainId는 137이어야 한다
    And 조회 결과가 Redis에 캐싱되어야 한다 (TTL: 5분)

  Scenario: 존재하는 결제 상태 조회 (캐시 히트)
    Given payment_hash "0xdef456..."인 결제 정보가 Redis 캐시에 존재한다
    When GET /payments/0xdef456.../status API를 호출한다
    Then 응답 상태 코드는 200이어야 한다
    And DB 조회 없이 캐시에서 데이터가 반환되어야 한다

  Scenario: 존재하지 않는 결제 상태 조회
    Given payment_hash "0x999..."인 결제가 DB에 존재하지 않는다
    When GET /payments/0x999.../status API를 호출한다
    Then 응답 상태 코드는 404이어야 한다
    And 에러 코드는 NOT_FOUND이어야 한다

  Scenario: chainId 조회 경로 검증
    Given payment_hash "0xabc..."인 결제가 존재한다
    When chainId를 조회한다
    Then payments → merchant_payment_methods → tokens → chains 경로로 조회되어야 한다
    And chains.network_id가 반환되어야 한다
```

---

## 3. Redis 캐싱 동작

### 3.1 캐시 정상 동작

**Given-When-Then 시나리오**

```gherkin
Feature: Redis 캐시 정상 동작
  결제 데이터 조회 시 캐시가 정상 동작해야 한다

  Scenario: 캐시 만료 후 재조회
    Given payment_hash "0xabc..."인 결제가 캐시에 존재한다
    And 캐시 TTL이 만료되었다
    When GET /payments/0xabc.../status API를 호출한다
    Then DB에서 데이터를 조회해야 한다
    And 새로운 캐시가 생성되어야 한다

  Scenario: 결제 상태 변경 시 캐시 무효화
    Given payment_hash "0xabc..."인 결제가 캐시에 존재한다
    When 해당 결제의 상태가 COMPLETED로 변경된다
    Then Redis 캐시가 무효화되어야 한다
    And 다음 조회 시 DB에서 최신 데이터를 가져와야 한다
```

---

## 4. Gasless 요청 추적

### 4.1 Gasless 요청 저장

**Given-When-Then 시나리오**

```gherkin
Feature: Gasless 트랜잭션 요청 저장
  Gasless 요청이 제출되면 relay_requests 테이블에 저장되어야 한다

  Scenario: Gasless 요청 제출 성공
    Given payment_hash "0xabc..."인 결제가 PENDING 상태로 존재한다
    And 유효한 ForwardRequest 데이터가 준비되어 있다
    When POST /payments/0xabc.../gasless API를 호출한다
    Then 응답 상태 코드는 202이어야 한다
    And relay_requests 테이블에 요청이 저장되어야 한다
    And relay_ref가 유니크하게 생성되어야 한다
    And payment_id가 payments.id를 참조해야 한다
    And 결제 상태가 PROCESSING으로 변경되어야 한다
    And payment_events에 SUBMITTED 이벤트가 기록되어야 한다

  Scenario: 존재하지 않는 결제에 Gasless 요청
    Given payment_hash "0x999..."인 결제가 존재하지 않는다
    When POST /payments/0x999.../gasless API를 호출한다
    Then 응답 상태 코드는 404이어야 한다
```

---

## 5. 에러 처리 시나리오

### 5.1 데이터베이스 연결 실패

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

### 5.2 Redis 연결 실패 (Graceful Degradation)

```gherkin
Feature: Redis 연결 실패 시 fallback
  Redis 연결이 실패해도 서비스가 정상 동작해야 한다

  Scenario: Redis 연결 실패 시 DB 직접 조회
    Given Redis 연결이 불가능한 상태이다
    And payment_hash "0xabc..."인 결제가 DB에 존재한다
    When GET /payments/0xabc.../status API를 호출한다
    Then 응답 상태 코드는 200이어야 한다
    And DB에서 직접 데이터가 반환되어야 한다

  Scenario: Health Check에서 Redis 상태 반영
    Given Redis 연결이 불가능한 상태이다
    When GET /health API를 호출한다
    Then 응답에 redis: unhealthy가 포함되어야 한다
    And 전체 상태는 degraded이어야 한다 (ok가 아님)
```

### 5.3 논리적 참조 무결성 위반

```gherkin
Feature: 논리적 참조 무결성 검증
  FK 없이 애플리케이션 레벨에서 참조 무결성을 보장해야 한다

  Scenario: 존재하지 않는 chain_id로 토큰 등록 시도
    Given chain_id 999가 chains 테이블에 존재하지 않는다
    When TokenService.createToken을 호출한다
    Then 에러가 발생해야 한다
    And 에러 코드는 CHAIN_NOT_FOUND이어야 한다

  Scenario: 존재하지 않는 token_id로 결제 수단 등록 시도
    Given token_id 999가 tokens 테이블에 존재하지 않는다
    When PaymentMethodService.createPaymentMethod을 호출한다
    Then 에러가 발생해야 한다
    And 에러 코드는 TOKEN_NOT_FOUND이어야 한다
```

---

## 6. 성능 기준

### 6.1 응답 시간

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

### 6.2 동시성

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

## 7. 데이터 무결성 기준

### 7.1 트랜잭션 일관성

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

### 7.2 Soft Delete 일관성

```gherkin
Feature: Soft Delete 일관성
  삭제된 레코드가 일관되게 처리되어야 한다

  Scenario: 삭제된 체인의 토큰 조회 불가
    Given network_id 137 체인이 is_deleted=true이다
    When 해당 체인의 토큰 목록을 조회한다
    Then 빈 목록이 반환되어야 한다

  Scenario: 비활성화된 토큰으로 결제 불가
    Given Polygon USDT 토큰이 is_enabled=false이다
    When 해당 토큰으로 결제를 생성하려고 한다
    Then 에러가 발생해야 한다
```

---

## 8. 보안 기준

### 8.1 민감 정보 보호

```gherkin
Feature: 민감 정보 로깅 금지
  데이터베이스 자격 증명과 API 키가 로그에 노출되지 않아야 한다

  Scenario: 에러 로그에서 자격 증명 제외
    Given 데이터베이스 연결 오류가 발생한다
    When 에러 로그가 출력된다
    Then 로그에 비밀번호나 연결 문자열이 포함되지 않아야 한다

  Scenario: API 키 로깅 금지
    Given API 키 검증이 실패한다
    When 에러 로그가 출력된다
    Then 로그에 API 키 값이 포함되지 않아야 한다
```

### 8.2 API 키 해시 보안

```gherkin
Feature: API 키 해시 보안
  API 키는 해시로만 저장되고 복원 불가능해야 한다

  Scenario: API 키 원본 저장 금지
    Given 가맹점을 등록한다
    When merchants 테이블을 직접 조회한다
    Then api_key_hash만 존재해야 한다
    And 원본 API 키는 어디에도 저장되지 않아야 한다

  Scenario: 해시 충돌 방지
    Given 서로 다른 두 API 키가 존재한다
    When 각각 SHA-256 해시를 생성한다
    Then 해시 값이 서로 달라야 한다
```

---

## 9. 코드 품질 기준

### 9.1 테스트 커버리지

- 단위 테스트 커버리지: 85% 이상
- 마스터 데이터 서비스 메서드: 100% 커버리지
- PaymentService 메서드: 100% 커버리지
- 라우트 핸들러: 80% 이상 커버리지

### 9.2 코드 스타일

- ESLint 경고 0개
- TypeScript strict 모드 통과
- Prisma Client 타입 안전성 보장

---

## 10. 검증 체크리스트

### 10.1 마스터 데이터 관리 검증

- [ ] chains 테이블 CRUD 정상 동작
- [ ] tokens 테이블 CRUD 정상 동작
- [ ] merchants 테이블 CRUD 정상 동작
- [ ] merchant_payment_methods 테이블 CRUD 정상 동작
- [ ] Soft Delete (is_enabled, is_deleted, deleted_at) 정상 동작
- [ ] API 키 해시 저장 및 검증 정상 동작

### 10.2 결제 처리 검증

- [ ] DEFAULT_CHAIN_ID 하드코딩이 완전히 제거되었는가
- [ ] 모든 결제 생성이 DB에 저장되는가
- [ ] payment_hash로 chainId 조회가 정상 동작하는가
- [ ] decimals 스냅샷이 저장되는가
- [ ] Redis 캐시가 정상 동작하는가
- [ ] Redis 실패 시 fallback이 동작하는가
- [ ] relay_requests 테이블에 gasless 요청이 저장되는가
- [ ] payment_events 테이블에 이벤트가 기록되는가
- [ ] health check에 DB/Redis 상태가 포함되는가

### 10.3 참조 무결성 검증

- [ ] 존재하지 않는 chain_id로 토큰 생성 불가
- [ ] 존재하지 않는 token_id로 결제 수단 생성 불가
- [ ] 존재하지 않는 merchant_id로 결제 수단 생성 불가
- [ ] 존재하지 않는 payment_method_id로 결제 생성 불가
- [ ] 비활성화된 결제 수단으로 결제 생성 불가
- [ ] 삭제된 토큰으로 결제 생성 불가

### 10.4 성능 검증 항목

- [ ] 캐시 히트 시 응답 시간 50ms 이내
- [ ] 캐시 미스 시 응답 시간 100ms 이내
- [ ] 동시 100개 요청 처리 성공

### 10.5 보안 검증 항목

- [ ] 로그에 민감 정보 미노출
- [ ] API 키 원본 미저장
- [ ] SQL 인젝션 방지 (Prisma 파라미터화)
- [ ] 환경 변수로 자격 증명 관리

---

## 11. Definition of Done

SPEC-DB-001이 완료되었다고 판단하기 위한 조건

1. 모든 필수 검증 항목 통과
2. 테스트 커버리지 85% 이상
3. CI/CD 파이프라인 통과
4. 코드 리뷰 완료
5. 문서 업데이트 완료 (README, API 문서)
6. 개발 환경(Docker Compose)에서 E2E 테스트 통과
7. 7개 테이블 스키마 정상 동작
8. Soft Delete 패턴 정상 동작
9. API 키 해시 검증 정상 동작
10. 논리적 참조 무결성 검증 정상 동작
