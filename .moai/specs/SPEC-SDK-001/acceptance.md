# SPEC-SDK-001 Acceptance Criteria

## Overview

상점서버용 결제 SDK (`@globalmsq/msqpay`) 인수 조건입니다.

---

## Acceptance Criteria

### AC-001: API 메서드 타입 일치

**조건**: 모든 API 메서드가 서버 응답 타입과 일치해야 한다.

| 메서드 | 서버 엔드포인트 | 응답 타입 일치 |
|--------|---------------|---------------|
| createPayment() | POST /payments/create | ✅ |
| getPaymentStatus() | GET /payments/:id/status | ✅ |
| submitGasless() | POST /payments/:id/gasless | ✅ |
| executeRelay() | POST /payments/:id/relay | ✅ |

**검증 방법**:
```typescript
// TypeScript 컴파일 에러 없이 빌드
pnpm build

// 타입 테스트
const response = await client.createPayment(params);
// response.paymentId (string) ✅
// response.success (true) ✅
// response.status ('pending') ✅
```

---

### AC-002: 에러 처리

**조건**: 에러 발생 시 MSQPayError 인스턴스를 throw해야 한다.

**검증 방법**:
```typescript
try {
  await client.createPayment(invalidParams);
} catch (error) {
  expect(error).toBeInstanceOf(MSQPayError);
  expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.statusCode).toBe(400);
}
```

**에러 코드 목록**:
| 에러 코드 | HTTP 상태 | 설명 |
|----------|----------|------|
| VALIDATION_ERROR | 400 | 입력 검증 실패 |
| INVALID_REQUEST | 400 | 잘못된 요청 |
| INVALID_SIGNATURE | 400 | 잘못된 서명 형식 |
| INVALID_TRANSACTION_DATA | 400 | 잘못된 트랜잭션 데이터 |
| INVALID_GAS_ESTIMATE | 400 | 잘못된 가스 추정치 |
| NOT_FOUND | 404 | 결제 정보 없음 |
| INTERNAL_ERROR | 500 | 서버 내부 오류 |

---

### AC-003: 테스트 커버리지

**조건**: 테스트 커버리지 ≥ 90%

**검증 방법**:
```bash
pnpm test:coverage
```

**커버리지 기준**:
| 항목 | 최소 기준 |
|------|----------|
| Statements | ≥ 90% |
| Branches | ≥ 85% |
| Functions | ≥ 90% |
| Lines | ≥ 90% |

---

### AC-004: 의존성 최소화

**조건**: Node 18+ native fetch 사용 (외부 HTTP 라이브러리 의존성 없음)

**검증 방법**:
```bash
# package.json dependencies 확인
cat packages/sdk/package.json | jq '.dependencies'
# 결과: {} (빈 객체)

# 코드에서 axios, got, node-fetch 등 미사용 확인
grep -r "axios\|node-fetch\|got\|superagent" packages/sdk/src/
# 결과: (없음)
```

---

## Test Cases

### TC-001: createPayment 성공

```typescript
describe('createPayment', () => {
  it('should create payment successfully', async () => {
    mockFetch({ success: true, paymentId: 'pay-123', transactionHash: '0x...', status: 'pending' });

    const result = await client.createPayment({
      userId: 'user-1',
      amount: 1000,
      tokenAddress: '0x...',
      recipientAddress: '0x...'
    });

    expect(result.success).toBe(true);
    expect(result.paymentId).toBe('pay-123');
  });
});
```

### TC-002: createPayment VALIDATION_ERROR

```typescript
it('should throw MSQPayError on validation failure', async () => {
  mockFetchError(400, { code: 'VALIDATION_ERROR', message: '입력 검증 실패' });

  await expect(client.createPayment(invalidParams))
    .rejects.toThrow(MSQPayError);
});
```

### TC-003: getPaymentStatus 성공

```typescript
it('should get payment status successfully', async () => {
  mockFetch({ success: true, data: { id: 'pay-123', status: 'completed' } });

  const result = await client.getPaymentStatus('pay-123');

  expect(result.success).toBe(true);
  expect(result.data.status).toBe('completed');
});
```

### TC-004: getPaymentStatus NOT_FOUND

```typescript
it('should throw MSQPayError when payment not found', async () => {
  mockFetchError(404, { code: 'NOT_FOUND', message: '결제 정보를 찾을 수 없습니다' });

  await expect(client.getPaymentStatus('invalid-id'))
    .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
});
```

### TC-005: submitGasless 성공

```typescript
it('should submit gasless transaction successfully', async () => {
  mockFetch({ success: true, relayRequestId: 'relay-123', status: 'submitted' });

  const result = await client.submitGasless({
    paymentId: 'pay-123',
    forwarderAddress: '0x...',
    signature: '0x...'
  });

  expect(result.success).toBe(true);
  expect(result.status).toBe('submitted');
});
```

### TC-006: executeRelay 성공

```typescript
it('should execute relay successfully', async () => {
  mockFetch({ success: true, relayRequestId: 'relay-123', status: 'mined', transactionHash: '0x...' });

  const result = await client.executeRelay({
    paymentId: 'pay-123',
    transactionData: '0x...',
    gasEstimate: 100000
  });

  expect(result.success).toBe(true);
  expect(result.transactionHash).toBeDefined();
});
```

### TC-007: Environment URL 설정

```typescript
describe('environment', () => {
  it('should use development URL', () => {
    const client = new MSQPayClient({ environment: 'development', apiKey: 'test' });
    expect(client.getApiUrl()).toBe('http://localhost:3001');
  });

  it('should use custom URL', () => {
    const client = new MSQPayClient({ environment: 'custom', apiKey: 'test', apiUrl: 'https://custom.api.com' });
    expect(client.getApiUrl()).toBe('https://custom.api.com');
  });

  it('should throw error when custom environment without apiUrl', () => {
    expect(() => new MSQPayClient({ environment: 'custom', apiKey: 'test' }))
      .toThrow();
  });
});
```

### TC-008: setApiUrl / getApiUrl

```typescript
describe('URL management', () => {
  it('should change API URL', () => {
    const client = new MSQPayClient({ environment: 'development', apiKey: 'test' });
    client.setApiUrl('https://new.api.com');
    expect(client.getApiUrl()).toBe('https://new.api.com');
  });
});
```

---

## Definition of Done

- [x] 모든 테스트 케이스 통과 (26/26 ✅)
- [x] 테스트 커버리지 ≥ 90% (100% ✅)
- [x] TypeScript 컴파일 에러 0개 ✅
- [x] package.json dependencies 비어있음 ✅
- [x] README.md 문서화 완료 ✅
- [x] Git 브랜치 생성 및 커밋 ✅

---

## Sign-off

| 항목 | 완료 | 검증 |
|------|------|------|
| 코드 구현 | ✅ 2025-11-29 | 26개 테스트 통과 |
| 테스트 | ✅ 2025-11-29 | 100% 커버리지 달성 |
| 문서화 | ✅ 2025-11-29 | README & SPEC 완성 |
| 코드 리뷰 | ✅ 2025-11-29 | TRUST 5 검증 통과 |

---

**SPEC ID**: SPEC-SDK-001
**Created**: 2025-11-29
**Completed**: 2025-11-29
**Status**: Completed ✅
