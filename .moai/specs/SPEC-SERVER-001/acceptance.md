---
id: SPEC-SERVER-001
title: MSQPay 결제 서버 수용 테스트 시나리오 (Acceptance Test Scenarios)
created_at: 2025-11-28
updated_at: 2025-11-28
status: draft
---

# SPEC-SERVER-001 수용 테스트 시나리오 (Acceptance Test Scenarios)

## 1. 개요 (Overview)

이 문서는 SPEC-SERVER-001 (MSQPay 결제 서버)의 수용 기준을 Given-When-Then 형식의 테스트 시나리오로 정의합니다. 모든 시나리오는 자동화된 테스트로 구현되어야 합니다.

---

## 2. 결제 생성 API (POST /api/payments)

### 시나리오 2.1: 유효한 입력으로 결제 생성 성공

**Given**: 유효한 storeAddress, tokenAddress, amount가 제공됨
```typescript
const validPayload = {
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000' // 1 MATIC
};
```

**When**: POST /api/payments 요청 전송
```typescript
const response = await server.inject({
  method: 'POST',
  url: '/api/payments',
  payload: validPayload
});
```

**Then**:
- HTTP 201 Created 응답
- paymentId가 UUID v4 형식
- status가 "pending"
- expiresAt이 현재 시간 + 15분 (Unix timestamp)
- createdAt이 현재 시간 (Unix timestamp)

```typescript
expect(response.statusCode).toBe(201);
expect(response.json()).toMatchObject({
  paymentId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  storeAddress: validPayload.storeAddress,
  tokenAddress: validPayload.tokenAddress,
  amount: validPayload.amount,
  status: 'pending',
  expiresAt: expect.any(Number),
  createdAt: expect.any(Number)
});

// expiresAt 검증 (15분 = 900초)
const now = Date.now();
const expiresAt = response.json().expiresAt;
expect(expiresAt).toBeGreaterThan(now);
expect(expiresAt).toBeLessThan(now + 910000); // 15분 + 10초 여유
```

---

### 시나리오 2.2: 잘못된 storeAddress로 결제 생성 실패

**Given**: 잘못된 형식의 storeAddress 제공
```typescript
const invalidPayload = {
  storeAddress: 'invalid-address', // 유효하지 않은 Ethereum 주소
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000'
};
```

**When**: POST /api/payments 요청 전송

**Then**:
- HTTP 400 Bad Request 응답
- 에러 코드 "PAYMENT_STORE_INVALID_ADDRESS" 반환
- 에러 타입 "validation_error"
- 에러 메시지에 "address" 포함

```typescript
expect(response.statusCode).toBe(400);
const error = response.json().error;
expect(error.code).toBe('PAYMENT_STORE_INVALID_ADDRESS');
expect(error.type).toBe('validation_error');
expect(error.message).toContain('address');
expect(error.field).toBe('storeAddress');
```

---

### 시나리오 2.3: amount가 0인 경우 결제 생성 실패

**Given**: amount가 0인 요청
```typescript
const zeroAmountPayload = {
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '0'
};
```

**When**: POST /api/payments 요청 전송

**Then**:
- HTTP 400 Bad Request 응답
- 에러 코드 "PAYMENT_AMOUNT_INVALID_ZERO" 반환
- 에러 타입 "validation_error"
- 에러 메시지에 "amount" 포함

```typescript
expect(response.statusCode).toBe(400);
const error = response.json().error;
expect(error.code).toBe('PAYMENT_AMOUNT_INVALID_ZERO');
expect(error.type).toBe('validation_error');
expect(error.message).toContain('amount');
expect(error.field).toBe('amount');
```

---

### 시나리오 2.4: 선택적 필드 (customerEmail, metadata) 포함 결제 생성

**Given**: customerEmail과 metadata가 포함된 요청
```typescript
const payloadWithOptionals = {
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  customerEmail: 'customer@example.com',
  metadata: { orderId: 'ORD-12345', productName: 'Premium Plan' }
};
```

**When**: POST /api/payments 요청 전송

**Then**:
- HTTP 201 Created 응답
- 응답에 customerEmail과 metadata는 포함되지 않음 (서버 내부 저장만)
- 데이터베이스에 customerEmail과 metadata 저장 확인

```typescript
expect(response.statusCode).toBe(201);
const paymentId = response.json().paymentId;

// DB에서 확인
const payment = await paymentRepository.findById(paymentId);
expect(payment.customerEmail).toBe('customer@example.com');
expect(payment.metadata).toEqual({ orderId: 'ORD-12345', productName: 'Premium Plan' });
```

---

## 3. 결제 조회 API (GET /api/payments/:paymentId)

### 시나리오 3.1: 존재하는 결제 조회 성공

**Given**: 데이터베이스에 결제 정보가 저장되어 있음
```typescript
const paymentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
await paymentRepository.create({
  paymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'pending',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});
```

**When**: GET /api/payments/:paymentId 요청 전송
```typescript
const response = await server.inject({
  method: 'GET',
  url: `/api/payments/${paymentId}`
});
```

**Then**:
- HTTP 200 OK 응답
- paymentId, storeAddress, tokenAddress, amount, status, expiresAt, createdAt 반환

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject({
  paymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'pending'
});
```

---

### 시나리오 3.2: 존재하지 않는 paymentId 조회 시 404 반환

**Given**: 데이터베이스에 결제 정보가 없음

**When**: GET /api/payments/:paymentId 요청 전송
```typescript
const nonExistentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d999';
const response = await server.inject({
  method: 'GET',
  url: `/api/payments/${nonExistentId}`
});
```

**Then**:
- HTTP 404 Not Found 응답
- 에러 메시지에 "Payment not found" 포함

```typescript
expect(response.statusCode).toBe(404);
expect(response.json().message).toContain('Payment not found');
```

---

### 시나리오 3.3: Redis 캐시에서 결제 조회 성공

**Given**: Redis 캐시에 결제 정보가 저장되어 있음
```typescript
const paymentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const cachedPayment = {
  paymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  status: 'completed',
  txHash: '0xabc123...'
};
await redisClient.set(`payment:${paymentId}`, JSON.stringify(cachedPayment), 60);
```

**When**: GET /api/payments/:paymentId 요청 전송

**Then**:
- HTTP 200 OK 응답
- Redis에서 조회 (DB 미조회 확인)
- status가 "completed", txHash 포함

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject(cachedPayment);

// DB 조회 미발생 확인 (mock spy 사용)
expect(paymentRepository.findById).not.toHaveBeenCalled();
```

---

## 4. Gasless 결제 실행 API (POST /api/payments/:paymentId/execute)

### 시나리오 4.1: 유효한 서명으로 Gasless 결제 실행 성공

**Given**:
- "pending" 상태의 결제가 존재
- 유효한 EIP-712 서명 생성
```typescript
const paymentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
await paymentRepository.create({
  paymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'pending',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});

const customerAddress = '0x9876543210987654321098765432109876543210';
const message = {
  paymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  customerAddress
};
const signature = await wallet.signTypedData({
  domain: EIP712_DOMAIN,
  types: PAYMENT_TYPE,
  primaryType: 'Payment',
  message
});
```

**When**: POST /api/payments/:paymentId/execute 요청 전송
```typescript
const response = await server.inject({
  method: 'POST',
  url: `/api/payments/${paymentId}/execute`,
  payload: { customerAddress, signature }
});
```

**Then**:
- HTTP 200 OK 응답
- status가 "processing"
- txHash가 존재 (0x로 시작하는 64자리 hex)
- estimatedConfirmationTime이 존재

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject({
  paymentId,
  status: 'processing',
  txHash: expect.stringMatching(/^0x[a-fA-F0-9]{64}$/),
  estimatedConfirmationTime: expect.any(Number)
});

// DB 상태 업데이트 확인
const payment = await paymentRepository.findById(paymentId);
expect(payment.status).toBe('processing');
expect(payment.customerAddress).toBe(customerAddress);
expect(payment.txHash).toBeTruthy();

// Redis 캐시 무효화 확인
const cached = await redisClient.get(`payment:${paymentId}`);
expect(cached).toBeNull();
```

---

### 시나리오 4.2: 잘못된 서명으로 결제 실행 실패 (401 Unauthorized)

**Given**: 유효하지 않은 서명 제공
```typescript
const paymentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const invalidSignature = '0xinvalid-signature';
```

**When**: POST /api/payments/:paymentId/execute 요청 전송

**Then**:
- HTTP 401 Unauthorized 응답
- 에러 메시지에 "Invalid signature" 포함

```typescript
expect(response.statusCode).toBe(401);
expect(response.json().message).toContain('Invalid signature');
```

---

### 시나리오 4.3: 만료된 결제 실행 시도 (410 Gone)

**Given**: expiresAt이 과거인 결제
```typescript
const expiredPaymentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d999';
await paymentRepository.create({
  paymentId: expiredPaymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'pending',
  expiresAt: Date.now() - 1000, // 이미 만료
  createdAt: Date.now() - 900000
});
```

**When**: POST /api/payments/:paymentId/execute 요청 전송

**Then**:
- HTTP 410 Gone 응답
- 에러 메시지에 "Payment expired" 포함

```typescript
expect(response.statusCode).toBe(410);
expect(response.json().message).toContain('Payment expired');
```

---

### 시나리오 4.4: 이미 처리된 결제 재실행 시도 (400 Bad Request)

**Given**: status가 "completed"인 결제
```typescript
const completedPaymentId = 'f47ac10b-58cc-4372-a567-0e02b2c3d888';
await paymentRepository.create({
  paymentId: completedPaymentId,
  storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'completed',
  txHash: '0xabc123...',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});
```

**When**: POST /api/payments/:paymentId/execute 요청 전송

**Then**:
- HTTP 400 Bad Request 응답
- 에러 메시지에 "Payment already processed" 포함

```typescript
expect(response.statusCode).toBe(400);
expect(response.json().message).toContain('Payment already processed');
```

---

### 시나리오 4.5: OZ Defender Relayer를 통한 메타 트랜잭션 제출 확인

**Given**: Gasless 실행 요청이 유효함

**When**: POST /api/payments/:paymentId/execute 요청 전송

**Then**:
- OZ Defender API가 호출되어야 함
- PaymentProcessor 컨트랙트의 executePayment 함수가 호출되어야 함

```typescript
// SimpleDefender API 호출 확인
expect(simpleDefenderRelaySigner.sendTransaction).toHaveBeenCalledWith({
  to: PAYMENT_PROCESSOR_ADDRESS,
  data: expect.stringContaining('executePayment')
});
```

---

## 5. 결제 목록 조회 API (GET /api/payments)

### 시나리오 5.1: 페이지네이션을 사용한 결제 목록 조회

**Given**: 데이터베이스에 50개의 결제 정보가 저장되어 있음
```typescript
for (let i = 0; i < 50; i++) {
  await paymentRepository.create({
    paymentId: `payment-${i}`,
    storeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
    tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    amount: '1000000000000000000',
    status: 'pending',
    expiresAt: Date.now() + 900000,
    createdAt: Date.now() - i * 1000 // 시간순 정렬용
  });
}
```

**When**: GET /api/payments?limit=10&offset=0 요청 전송
```typescript
const response = await server.inject({
  method: 'GET',
  url: '/api/payments?limit=10&offset=0'
});
```

**Then**:
- HTTP 200 OK 응답
- payments 배열 길이가 10
- total이 50
- limit이 10
- offset이 0

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject({
  payments: expect.arrayContaining([
    expect.objectContaining({ paymentId: expect.any(String) })
  ]),
  total: 50,
  limit: 10,
  offset: 0
});
expect(response.json().payments).toHaveLength(10);
```

---

### 시나리오 5.2: storeAddress 필터링

**Given**: 서로 다른 상점의 결제 정보가 저장되어 있음
```typescript
await paymentRepository.create({
  paymentId: 'payment-store-a-1',
  storeAddress: '0xStoreA',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'pending',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});

await paymentRepository.create({
  paymentId: 'payment-store-b-1',
  storeAddress: '0xStoreB',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '2000000000000000000',
  status: 'completed',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});
```

**When**: GET /api/payments?storeAddress=0xStoreA 요청 전송

**Then**:
- HTTP 200 OK 응답
- payments 배열의 모든 항목이 storeAddress가 "0xStoreA"

```typescript
expect(response.statusCode).toBe(200);
const payments = response.json().payments;
expect(payments.every(p => p.storeAddress === '0xStoreA')).toBe(true);
```

---

### 시나리오 5.3: status 필터링

**Given**: 다양한 상태의 결제 정보가 저장되어 있음

**When**: GET /api/payments?status=completed 요청 전송

**Then**:
- HTTP 200 OK 응답
- payments 배열의 모든 항목이 status가 "completed"

```typescript
expect(response.statusCode).toBe(200);
const payments = response.json().payments;
expect(payments.every(p => p.status === 'completed')).toBe(true);
```

---

## 6. 상점 통계 조회 API (GET /api/stores/:storeAddress/stats)

### 시나리오 6.1: 상점 통계 조회 성공

**Given**: 특정 상점의 결제 정보가 저장되어 있음
```typescript
const storeAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
await paymentRepository.create({
  paymentId: 'payment-1',
  storeAddress,
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '1000000000000000000',
  status: 'completed',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});

await paymentRepository.create({
  paymentId: 'payment-2',
  storeAddress,
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '2000000000000000000',
  status: 'failed',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});

await paymentRepository.create({
  paymentId: 'payment-3',
  storeAddress,
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  amount: '3000000000000000000',
  status: 'completed',
  expiresAt: Date.now() + 900000,
  createdAt: Date.now()
});
```

**When**: GET /api/stores/:storeAddress/stats 요청 전송
```typescript
const response = await server.inject({
  method: 'GET',
  url: `/api/stores/${storeAddress}/stats`
});
```

**Then**:
- HTTP 200 OK 응답
- totalPayments가 3
- completedPayments가 2
- totalVolume이 "6000000000000000000" (4 MATIC: 1 + 2 + 3)
- successRate가 66.67 (2/3 * 100)

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject({
  storeAddress,
  totalPayments: 3,
  completedPayments: 2,
  totalVolume: '6000000000000000000',
  successRate: expect.closeTo(66.67, 0.01)
});
```

---

### 시나리오 6.2: Redis 캐시를 통한 통계 조회

**Given**: Redis 캐시에 통계가 저장되어 있음
```typescript
const storeAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
const cachedStats = {
  storeAddress,
  totalPayments: 10,
  completedPayments: 8,
  totalVolume: '10000000000000000000',
  successRate: 80
};
await redisClient.set(`store_stats:${storeAddress}`, JSON.stringify(cachedStats), 300);
```

**When**: GET /api/stores/:storeAddress/stats 요청 전송

**Then**:
- HTTP 200 OK 응답
- Redis에서 조회 (DB 미조회 확인)

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject(cachedStats);

// DB 조회 미발생 확인
expect(paymentRepository.getStoreStats).not.toHaveBeenCalled();
```

---

## 7. 보안 및 성능 테스트

### 시나리오 7.1: Rate Limiting (분당 100 요청 제한)

**Given**: 동일 IP에서 101개의 요청 전송

**When**: 101번째 요청 전송

**Then**:
- HTTP 429 Too Many Requests 응답
- 에러 메시지에 "Rate limit exceeded" 포함

```typescript
for (let i = 0; i < 100; i++) {
  await server.inject({ method: 'GET', url: '/api/payments' });
}

const response = await server.inject({ method: 'GET', url: '/api/payments' });
expect(response.statusCode).toBe(429);
expect(response.json().message).toContain('Rate limit exceeded');
```

---

### 시나리오 7.2: 동시 100개 요청 처리 (성능 테스트)

**Given**: 100개의 유효한 결제 생성 요청 준비

**When**: 동시에 100개 요청 전송

**Then**:
- 95% 이상의 성공률 (≥95개 성공)
- 평균 응답 시간 <500ms

```typescript
const requests = Array(100).fill(null).map(() =>
  server.inject({
    method: 'POST',
    url: '/api/payments',
    payload: validPayload
  })
);

const startTime = Date.now();
const responses = await Promise.all(requests);
const endTime = Date.now();

const successCount = responses.filter(r => r.statusCode === 201).length;
const avgResponseTime = (endTime - startTime) / 100;

expect(successCount).toBeGreaterThanOrEqual(95);
expect(avgResponseTime).toBeLessThan(500);
```

---

## 8. 데이터베이스 장애 처리

### 시나리오 8.1: PostgreSQL 연결 실패 시 503 응답

**Given**: PostgreSQL 연결이 끊어진 상태
```typescript
await paymentRepository.disconnect();
```

**When**: POST /api/payments 요청 전송

**Then**:
- HTTP 503 Service Unavailable 응답
- 에러 메시지에 "Database unavailable" 포함

```typescript
expect(response.statusCode).toBe(503);
expect(response.json().message).toContain('Database unavailable');
```

---

### 시나리오 8.2: Redis 연결 실패 시 DB로 폴백 (Graceful Degradation)

**Given**: Redis 연결이 끊어진 상태
```typescript
await redisClient.disconnect();
```

**When**: GET /api/payments/:paymentId 요청 전송

**Then**:
- HTTP 200 OK 응답 (Redis 미사용, DB에서 조회)
- 정상적으로 결제 정보 반환

```typescript
expect(response.statusCode).toBe(200);
expect(response.json()).toHaveProperty('paymentId');

// DB 조회 발생 확인
expect(paymentRepository.findById).toHaveBeenCalled();
```

---

## 9. E2E 통합 테스트

### 시나리오 9.1: 전체 결제 플로우 (생성 → 조회 → 실행 → 완료)

**Given**: 시스템이 정상 작동 중

**When**:
1. 결제 생성 (POST /api/payments)
2. 결제 조회 (GET /api/payments/:paymentId)
3. Gasless 실행 (POST /api/payments/:paymentId/execute)
4. 트랜잭션 완료 대기
5. 최종 상태 조회

**Then**:
- 모든 단계가 성공적으로 완료
- 최종 상태가 "completed"
- txHash가 존재

```typescript
// Step 1: 결제 생성
const createResponse = await server.inject({
  method: 'POST',
  url: '/api/payments',
  payload: validPayload
});
const { paymentId } = createResponse.json();

// Step 2: 결제 조회
const getResponse = await server.inject({
  method: 'GET',
  url: `/api/payments/${paymentId}`
});
expect(getResponse.json().status).toBe('pending');

// Step 3: Gasless 실행
const executeResponse = await server.inject({
  method: 'POST',
  url: `/api/payments/${paymentId}/execute`,
  payload: { customerAddress, signature }
});
expect(executeResponse.json().status).toBe('processing');

// Step 4: 트랜잭션 완료 대기 (폴링)
await waitForTransactionConfirmation(executeResponse.json().txHash);

// Step 5: 최종 상태 조회
const finalResponse = await server.inject({
  method: 'GET',
  url: `/api/payments/${paymentId}`
});
expect(finalResponse.json().status).toBe('completed');
expect(finalResponse.json()).toHaveProperty('txHash');
expect(finalResponse.json()).toHaveProperty('completedAt');
```

---

## 10. Definition of Done (완료 정의)

모든 수용 테스트가 다음 조건을 만족해야 합니다:

### ✅ 기능 완료 기준
- [ ] 모든 Given-When-Then 시나리오가 자동화된 테스트로 구현됨
- [ ] 모든 테스트가 통과 (100% pass rate)
- [ ] 테스트 커버리지 ≥90%

### ✅ 품질 기준 (TRUST 5)
- [ ] **Test-first**: RED-GREEN-REFACTOR 사이클 준수
- [ ] **Readable**: 테스트 코드가 명확하고 이해하기 쉬움
- [ ] **Unified**: 일관된 테스트 패턴 사용
- [ ] **Secured**: 보안 테스트 포함 (서명 검증, Rate Limiting 등)
- [ ] **Trackable**: 각 테스트가 명확한 요구사항과 매핑됨

### ✅ 성능 기준
- [ ] API 응답 시간 p95 <500ms
- [ ] 동시 100개 요청 처리 성공률 ≥95%

### ✅ 문서화
- [ ] 모든 API 엔드포인트에 대한 OpenAPI 문서 생성
- [ ] 각 테스트 시나리오가 SPEC 요구사항과 연결됨

---

**작성 도구**: MoAI-ADK workflow-spec
**준수 프레임워크**: TRUST 5, SPEC-First TDD
**테스트 형식**: Given-When-Then (Behavior-Driven Development)
