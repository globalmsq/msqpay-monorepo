# SPEC-SERVER-002: Acceptance Criteria

## TAG BLOCK

```yaml
id: SPEC-SERVER-002
type: acceptance-criteria
phase: planning
created_at: 2025-11-29
```

---

## Overview

무상태(Stateless) 결제 서버의 수락 기준 및 테스트 시나리오.

**핵심 검증 항목**:
1. 무상태 아키텍처 검증 (DB/Redis 없음)
2. 4개 API 엔드포인트 정상 동작
3. 성능 기준 충족 (< 500ms)
4. 테스트 커버리지 ≥ 90%

---

## Acceptance Criteria

### AC-001: 무상태 아키텍처 검증

**Criteria**: 서버는 데이터베이스나 Redis 없이 동작해야 한다.

**Given-When-Then**:

**Scenario 1: 서버 재시작 후 상태 조회**
```gherkin
Given 결제가 컨트랙트에 생성되었을 때
When 서버를 재시작한 후
Then GET /payments/:id/status로 결제 상태를 조회할 수 있어야 한다
And 응답은 컨트랙트에서 직접 조회한 데이터여야 한다
```

**Validation Method**:
- Integration Test: `tests/integration/stateless.spec.ts`
- 검증 절차:
  1. POST /payments/create로 결제 생성
  2. 서버 프로세스 종료 (SIGTERM)
  3. 서버 재시작
  4. GET /payments/:id/status로 상태 조회
  5. 응답 데이터와 컨트랙트 데이터 일치 확인

**Success Criteria**:
- ✅ 서버 재시작 후 결제 데이터 조회 성공
- ✅ 응답 시간 < 500ms
- ✅ 컨트랙트 데이터와 100% 일치

---

### AC-002: API 엔드포인트 정상 동작

**Criteria**: 4개 API 엔드포인트가 명세대로 동작해야 한다.

#### AC-002-1: POST /payments/create

**Given-When-Then**:

**Scenario 1: 정상 결제 생성**
```gherkin
Given 유효한 merchantId와 amount가 주어졌을 때
When POST /payments/create를 호출하면
Then 201 상태 코드와 paymentId, txHash를 반환해야 한다
And 컨트랙트에 결제 데이터가 기록되어야 한다
```

**Scenario 2: 잘못된 입력 검증**
```gherkin
Given merchantId가 잘못된 형식일 때 (예: "invalid")
When POST /payments/create를 호출하면
Then 400 상태 코드와 ValidationError를 반환해야 한다
```

**Validation Method**:
- Unit Test: `tests/payments/create.spec.ts`
- 검증 항목:
  - Zod 스키마 검증 성공
  - 트랜잭션 해시 반환
  - 컨트랙트 이벤트 발생 확인

**Success Criteria**:
- ✅ 정상 입력 시 결제 생성 성공
- ✅ 잘못된 입력 시 400 에러
- ✅ 테스트 커버리지 ≥ 90%

#### AC-002-2: GET /payments/:id/status

**Given-When-Then**:

**Scenario 1: 존재하는 결제 조회**
```gherkin
Given 결제가 컨트랙트에 존재할 때
When GET /payments/:id/status를 호출하면
Then 200 상태 코드와 결제 상태를 반환해야 한다
And 응답은 paymentId, status, amount, merchantId를 포함해야 한다
```

**Scenario 2: 존재하지 않는 결제 조회**
```gherkin
Given 결제가 컨트랙트에 존재하지 않을 때
When GET /payments/:id/status를 호출하면
Then 404 상태 코드와 "Payment not found" 메시지를 반환해야 한다
```

**Validation Method**:
- Unit Test: `tests/payments/status.spec.ts`
- 검증 항목:
  - 컨트랙트 데이터 조회 성공
  - 응답 형식 검증
  - 에러 핸들링

**Success Criteria**:
- ✅ 존재하는 결제 조회 성공
- ✅ 존재하지 않는 결제는 404 반환
- ✅ 응답 시간 < 500ms

#### AC-002-3: POST /payments/:id/gasless

**Given-When-Then**:

**Scenario 1: 유효한 서명으로 Gasless 실행**
```gherkin
Given 유효한 사용자 서명이 주어졌을 때
When POST /payments/:id/gasless를 호출하면
Then 200 상태 코드와 relayTxHash를 반환해야 한다
And OZ Defender Relayer를 통해 트랜잭션이 실행되어야 한다
```

**Scenario 2: 잘못된 서명 검증**
```gherkin
Given 잘못된 서명이 주어졌을 때
When POST /payments/:id/gasless를 호출하면
Then 401 상태 코드와 "Invalid signature" 메시지를 반환해야 한다
```

**Validation Method**:
- Unit Test: `tests/payments/gasless.spec.ts`
- 검증 항목:
  - 서명 검증 로직
  - OZ Defender Relayer 호출
  - 릴레이 트랜잭션 추적

**Success Criteria**:
- ✅ 유효한 서명으로 Gasless 실행 성공
- ✅ 잘못된 서명 시 401 에러
- ✅ 릴레이 실행 결과 추적 가능

#### AC-002-4: POST /payments/:id/relay

**Given-When-Then**:

**Scenario 1: 백엔드에서 릴레이 실행**
```gherkin
Given 백엔드에서 릴레이 실행 요청이 주어졌을 때
When POST /payments/:id/relay를 호출하면
Then 200 상태 코드와 relayTxHash, status를 반환해야 한다
And 트랜잭션 완료를 대기해야 한다
```

**Scenario 2: 네트워크 에러 처리**
```gherkin
Given RPC 네트워크 장애가 발생했을 때
When POST /payments/:id/relay를 호출하면
Then 3회까지 자동으로 재시도해야 한다
And 3회 실패 시 503 상태 코드를 반환해야 한다
```

**Validation Method**:
- Unit Test: `tests/payments/relay.spec.ts`
- Integration Test: RPC 장애 시뮬레이션
- 검증 항목:
  - 릴레이 실행 성공
  - 재시도 로직 검증
  - 타임아웃 처리

**Success Criteria**:
- ✅ 릴레이 실행 및 완료 확인
- ✅ 네트워크 장애 시 3회 재시도
- ✅ 타임아웃 시 적절한 에러 반환

---

### AC-003: 성능 기준 충족

**Criteria**: API 응답 시간이 95 percentile 기준 500ms 이하여야 한다.

**Given-When-Then**:

**Scenario 1: 정상 부하 테스트 (100 req/s)**
```gherkin
Given 100 req/s의 동시 요청이 발생할 때
When 1분간 부하 테스트를 실행하면
Then 95 percentile 응답 시간이 500ms 이하여야 한다
And 에러율이 1% 이하여야 한다
```

**Validation Method**:
- Performance Test: `tests/performance/load.spec.ts`
- Tool: Artillery
- 측정 항목:
  - p50, p95, p99 응답 시간
  - 처리량 (requests per second)
  - 에러율

**Success Criteria**:
- ✅ p95 응답 시간 < 500ms
- ✅ 처리량 ≥ 100 req/s
- ✅ 에러율 < 1%

---

### AC-004: 테스트 커버리지 ≥ 90%

**Criteria**: 전체 코드 테스트 커버리지가 90% 이상이어야 한다.

**Given-When-Then**:

**Scenario 1: 테스트 커버리지 측정**
```gherkin
Given 모든 테스트가 작성되었을 때
When npm run test:coverage를 실행하면
Then Line Coverage가 90% 이상이어야 한다
And Branch Coverage가 85% 이상이어야 한다
```

**Validation Method**:
- Coverage Tool: Vitest Coverage (c8)
- 측정 대상:
  - Line Coverage
  - Branch Coverage
  - Function Coverage
  - Statement Coverage

**Success Criteria**:
- ✅ Line Coverage ≥ 90%
- ✅ Branch Coverage ≥ 85%
- ✅ Function Coverage ≥ 90%

---

## Test Scenarios

### Scenario 1: End-to-End 결제 플로우

**Given-When-Then**:

```gherkin
Given 사용자가 결제를 시작할 때

When 다음 단계를 순차적으로 실행하면:
  1. POST /payments/create로 결제 생성
  2. GET /payments/:id/status로 상태 확인 (pending)
  3. POST /payments/:id/gasless로 Gasless 실행
  4. GET /payments/:id/status로 상태 확인 (confirmed)

Then 모든 단계가 성공해야 하며
And 최종 상태가 "confirmed"여야 한다
And 전체 프로세스가 5초 이내에 완료되어야 한다
```

**Validation Method**:
- E2E Test: `tests/e2e/payment-flow.spec.ts`
- Environment: Polygon Mumbai 테스트넷
- 검증 항목:
  - 각 단계별 응답 검증
  - 트랜잭션 완료 확인
  - 전체 플로우 소요 시간

**Success Criteria**:
- ✅ 전체 플로우 성공
- ✅ 최종 상태 "confirmed"
- ✅ 소요 시간 < 5초

---

### Scenario 2: 무상태 아키텍처 검증

**Given-When-Then**:

```gherkin
Given 다음 조건이 충족되었을 때:
  - PostgreSQL 데이터베이스가 설치되지 않음
  - Redis 서버가 실행되지 않음

When 서버를 시작하고 결제 생성 후 서버를 재시작하면

Then 서버가 정상적으로 시작되어야 하며
And 재시작 후에도 결제 상태를 조회할 수 있어야 한다
And 모든 데이터는 컨트랙트에서 직접 조회되어야 한다
```

**Validation Method**:
- Integration Test: `tests/integration/stateless.spec.ts`
- 검증 절차:
  1. 환경 변수에서 DB/Redis URL 제거
  2. 서버 시작 확인
  3. 결제 생성
  4. 서버 재시작
  5. 결제 상태 조회
  6. 컨트랙트 직접 조회와 비교

**Success Criteria**:
- ✅ DB/Redis 없이 서버 시작 성공
- ✅ 재시작 후 데이터 조회 성공
- ✅ 컨트랙트 데이터와 100% 일치

---

### Scenario 3: 에러 복구 및 재시도

**Given-When-Then**:

```gherkin
Given RPC 네트워크가 일시적으로 불안정할 때

When POST /payments/create를 호출하면

Then 시스템은 자동으로 3회까지 재시도해야 하며
And Exponential Backoff 전략을 사용해야 한다
And 3회 실패 시 503 에러를 반환해야 한다
```

**Validation Method**:
- Unit Test: `tests/utils/retry.spec.ts`
- Mock 시나리오:
  - 1차 시도: 실패
  - 2차 시도: 실패
  - 3차 시도: 성공

**Success Criteria**:
- ✅ 자동 재시도 3회 실행
- ✅ Exponential Backoff 적용
- ✅ 3회 실패 시 503 에러

---

## Quality Gates

### Definition of Done

다음 조건을 모두 충족해야 SPEC-SERVER-002가 완료된 것으로 간주:

- [ ] **AC-001**: 무상태 아키텍처 검증 통과
- [ ] **AC-002**: 4개 API 엔드포인트 정상 동작
- [ ] **AC-003**: 성능 기준 충족 (< 500ms)
- [ ] **AC-004**: 테스트 커버리지 ≥ 90%
- [ ] **E2E Test**: 전체 결제 플로우 성공
- [ ] **Integration Test**: 무상태 아키텍처 검증 성공
- [ ] **Performance Test**: 100 req/s 부하 테스트 통과
- [ ] **Documentation**: OpenAPI 문서 생성 완료
- [ ] **Deployment**: Docker 이미지 빌드 성공

---

## Verification Methods

### Automated Testing

1. **Unit Tests** (`npm run test:unit`)
   - 각 함수별 테스트
   - Mocking 활용

2. **Integration Tests** (`npm run test:integration`)
   - 로컬 Hardhat 네트워크 사용
   - 컨트랙트 연동 테스트

3. **E2E Tests** (`npm run test:e2e`)
   - Polygon Mumbai 테스트넷
   - 전체 플로우 검증

4. **Performance Tests** (`npm run test:perf`)
   - Artillery 부하 테스트
   - 응답 시간 측정

### Manual Verification

1. **Postman Collection**: API 엔드포인트 수동 테스트
2. **Mumbai Explorer**: 트랜잭션 확인
3. **Logs Review**: 에러 로그 검토

---

## Test Data

### Sample Payment Data

```json
{
  "merchantId": "0x1234567890123456789012345678901234567890",
  "amount": "1000000000000000000",
  "currency": "USDC",
  "metadata": {
    "orderId": "order-test-001",
    "customerId": "customer-001"
  }
}
```

### Sample Gasless Request

```json
{
  "paymentId": "0xabc123...",
  "userSignature": "0x789abc..."
}
```

---

## Acceptance Sign-off

### Checklist

- [ ] 모든 AC (AC-001 ~ AC-004) 통과
- [ ] 모든 테스트 시나리오 성공
- [ ] Quality Gate 조건 충족
- [ ] Code Review 완료
- [ ] Documentation 작성 완료
- [ ] Deployment 가이드 검증

### Approvers

- **Technical Lead**: [Name]
- **QA Engineer**: [Name]
- **Product Owner**: [Name]

---

**Generated by**: workflow-spec (MoAI-ADK)
**Acceptance Status**: Ready for Validation
**Next Phase**: `/moai:2-run SPEC-SERVER-002` → TDD Implementation
