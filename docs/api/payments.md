# 결제 API 레퍼런스

MSQPay 결제 API는 블록체인 기반 결제 시스템을 제공합니다. 모든 결제 데이터는 스마트 컨트랙트에 기록되며, 클라이언트는 API를 통해 결제를 생성하고 상태를 조회할 수 있습니다.

## 개요

| 항목 | 설명 |
|------|------|
| Base URL | `http://localhost:3000` (개발), `https://api.msqpay.io` (프로덕션) |
| Protocol | REST API (HTTP/HTTPS) |
| Content-Type | `application/json` |
| Authentication | 현재 미적용 (향후 JWT 추가 예정) |

## 에러 응답

모든 에러 응답은 다음 형식을 따릅니다:

```json
{
  "code": "ERROR_CODE",
  "message": "에러 메시지"
}
```

### 에러 코드

| 코드 | HTTP Status | 설명 |
|------|------------|------|
| `VALIDATION_ERROR` | 400 | 입력 데이터 검증 실패 |
| `INVALID_REQUEST` | 400 | 잘못된 요청 형식 |
| `INVALID_SIGNATURE` | 400 | 유효하지 않은 서명 |
| `INVALID_TRANSACTION_DATA` | 400 | 유효하지 않은 거래 데이터 |
| `INVALID_GAS_ESTIMATE` | 400 | 유효하지 않은 가스 추정치 |
| `NOT_FOUND` | 404 | 결제 정보 없음 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |

---

## 엔드포인트

### 1. 결제 생성 (Create Payment)

새로운 결제를 생성하고 스마트 컨트랙트에 기록합니다.

```http
POST /payments/create
Content-Type: application/json
```

#### 요청 (Request)

```json
{
  "userId": "user_123",
  "amount": 1000000,
  "currency": "USD",
  "tokenAddress": "0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174",
  "recipientAddress": "0x1234567890123456789012345678901234567890",
  "description": "Product purchase"
}
```

##### Request 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `userId` | string | ✅ | 사용자 ID (고유) |
| `amount` | number | ✅ | 결제 금액 (가장 작은 단위) |
| `currency` | string | ✅ | 통화 (USD, EUR, KRW) |
| `tokenAddress` | string | ✅ | ERC-20 토큰 계약 주소 |
| `recipientAddress` | string | ✅ | 수령자 지갑 주소 |
| `description` | string | ❌ | 결제 설명 |

#### 응답 (Response)

**Status: 201 Created**

```json
{
  "success": true,
  "paymentId": "payment-1732882643000",
  "transactionHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "pending"
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `paymentId` | string | 생성된 결제 ID |
| `transactionHash` | string | 트랜잭션 해시 (블록체인) |
| `status` | string | 결제 상태 (pending, confirmed, failed, completed) |

#### 에러 응답

```json
{
  "code": "VALIDATION_ERROR",
  "message": "입력 검증 실패",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "number",
      "path": ["amount"],
      "message": "Number must be greater than or equal to 1"
    }
  ]
}
```

#### 사용 예제

**cURL**
```bash
curl -X POST http://localhost:3000/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "amount": 1000000,
    "currency": "USD",
    "tokenAddress": "0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174",
    "recipientAddress": "0x1234567890123456789012345678901234567890",
    "description": "Product purchase"
  }'
```

**JavaScript/TypeScript**
```typescript
const response = await fetch('http://localhost:3000/payments/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    amount: 1000000,
    currency: 'USD',
    tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174',
    recipientAddress: '0x1234567890123456789012345678901234567890',
    description: 'Product purchase',
  }),
});

const data = await response.json();
console.log(data.paymentId); // payment-1732882643000
```

---

### 2. 결제 상태 조회 (Get Payment Status)

결제의 현재 상태를 블록체인에서 조회합니다.

```http
GET /payments/{id}/status
```

#### URL 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `id` | string | ✅ | 결제 ID |

#### 응답 (Response)

**Status: 200 OK**

```json
{
  "success": true,
  "data": {
    "id": "payment_123",
    "userId": "user_123",
    "amount": 1000000,
    "currency": "USD",
    "tokenAddress": "0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174",
    "recipientAddress": "0x1234567890123456789012345678901234567890",
    "status": "confirmed",
    "transactionHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "blockNumber": 42000000,
    "createdAt": "2024-11-29T10:00:00.000Z",
    "updatedAt": "2024-11-29T10:01:00.000Z"
  }
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 결제 ID |
| `userId` | string | 사용자 ID |
| `amount` | number | 결제 금액 |
| `currency` | string | 통화 |
| `tokenAddress` | string | 토큰 계약 주소 |
| `recipientAddress` | string | 수령자 주소 |
| `status` | string | 결제 상태 |
| `transactionHash` | string | 트랜잭션 해시 |
| `blockNumber` | number | 블록 번호 |
| `createdAt` | ISO8601 | 생성 시간 |
| `updatedAt` | ISO8601 | 수정 시간 |

#### 사용 예제

**cURL**
```bash
curl -X GET http://localhost:3000/payments/payment_123/status
```

**JavaScript**
```typescript
const response = await fetch('http://localhost:3000/payments/payment_123/status');
const data = await response.json();
console.log(data.data.status); // "confirmed"
```

---

### 3. Gasless 거래 제출 (Submit Gasless Transaction)

OpenZeppelin Defender를 사용하여 가스비 없이 거래를 실행합니다.

```http
POST /payments/{id}/gasless
Content-Type: application/json
```

#### URL 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `id` | string | ✅ | 결제 ID |

#### 요청 (Request)

```json
{
  "forwarderAddress": "0x1234567890123456789012345678901234567890",
  "signature": "0x..."
}
```

##### Request 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `forwarderAddress` | string | ✅ | Forwarder 계약 주소 |
| `signature` | string | ✅ | 트랜잭션 서명 (EIP-191) |

#### 응답 (Response)

**Status: 202 Accepted**

```json
{
  "success": true,
  "relayRequestId": "relay_request_123",
  "status": "pending",
  "message": "Gasless 거래가 제출되었습니다"
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `relayRequestId` | string | 릴레이 요청 ID |
| `status` | string | 릴레이 상태 (pending, mined, failed) |
| `message` | string | 응답 메시지 |

#### 사용 예제

**JavaScript**
```typescript
const signature = await signer.signMessage({
  message: 'Approve payment transfer',
});

const response = await fetch('http://localhost:3000/payments/payment_123/gasless', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    forwarderAddress: '0x1234567890123456789012345678901234567890',
    signature,
  }),
});

const data = await response.json();
console.log(data.relayRequestId);
```

---

### 4. 릴레이 거래 실행 (Execute Relay Transaction)

메타 트랜잭션을 사용하여 릴레이를 통해 거래를 실행합니다.

```http
POST /payments/{id}/relay
Content-Type: application/json
```

#### URL 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `id` | string | ✅ | 결제 ID |

#### 요청 (Request)

```json
{
  "transactionData": "0x...",
  "gasEstimate": 200000
}
```

##### Request 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `transactionData` | string | ✅ | 인코딩된 거래 데이터 (Hex) |
| `gasEstimate` | number | ✅ | 가스 추정치 (양수) |

#### 응답 (Response)

**Status: 200 OK**

```json
{
  "success": true,
  "relayRequestId": "relay_request_456",
  "transactionHash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "status": "mined",
  "message": "릴레이 거래가 실행되었습니다"
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `relayRequestId` | string | 릴레이 요청 ID |
| `transactionHash` | string | 실행된 거래 해시 |
| `status` | string | 거래 상태 |
| `message` | string | 응답 메시지 |

#### 사용 예제

**JavaScript**
```typescript
const response = await fetch('http://localhost:3000/payments/payment_123/relay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transactionData: '0x...',
    gasEstimate: 200000,
  }),
});

const data = await response.json();
console.log(data.transactionHash);
```

---

### 5. 결제 이력 조회 (Get Payment History)

사용자의 결제 이력을 조회합니다.

```http
GET /payments/{id}/history
```

#### URL 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `id` | string | ✅ | 결제 ID |

#### 응답 (Response)

**Status: 200 OK**

```json
{
  "success": true,
  "data": {
    "paymentId": "payment_123",
    "history": [
      {
        "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "status": "confirmed",
        "timestamp": "2024-11-29T10:01:00.000Z",
        "blockNumber": 42000000,
        "confirmations": 5
      }
    ]
  }
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `paymentId` | string | 결제 ID |
| `history` | array | 거래 이력 배열 |
| `history[].txHash` | string | 트랜잭션 해시 |
| `history[].status` | string | 거래 상태 |
| `history[].timestamp` | ISO8601 | 거래 시간 |
| `history[].blockNumber` | number | 블록 번호 |
| `history[].confirmations` | number | 확인 수 |

#### 사용 예제

```bash
curl -X GET http://localhost:3000/payments/payment_123/history
```

---

### 6. 토큰 잔액 조회 (Get Token Balance)

ERC-20 토큰의 지갑 잔액을 조회합니다.

```http
GET /tokens/balance
```

#### 쿼리 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `tokenAddress` | string | ✅ | ERC-20 토큰 계약 주소 |
| `address` | string | ✅ | 조회할 지갑 주소 |

#### 응답 (Response)

**Status: 200 OK**

```json
{
  "success": true,
  "data": {
    "tokenAddress": "0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174",
    "address": "0x1234567890123456789012345678901234567890",
    "balance": "1000000000000000000",
    "decimals": 6,
    "symbol": "USDC"
  }
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `tokenAddress` | string | 토큰 계약 주소 |
| `address` | string | 조회 지갑 주소 |
| `balance` | string | 잔액 (Wei 단위) |
| `decimals` | number | 토큰 소수점 자리수 |
| `symbol` | string | 토큰 심볼 |

#### 사용 예제

```bash
curl -X GET "http://localhost:3000/tokens/balance?tokenAddress=0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174&address=0x1234567890123456789012345678901234567890"
```

---

### 7. 토큰 Approval 조회 (Get Token Allowance)

토큰 approval 금액을 조회합니다.

```http
GET /tokens/allowance
```

#### 쿼리 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `tokenAddress` | string | ✅ | ERC-20 토큰 계약 주소 |
| `owner` | string | ✅ | 소유자 주소 |
| `spender` | string | ✅ | 승인받은 주소 (보통 Gateway Contract) |

#### 응답 (Response)

**Status: 200 OK**

```json
{
  "success": true,
  "data": {
    "tokenAddress": "0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174",
    "owner": "0x1234567890123456789012345678901234567890",
    "spender": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    "allowance": "5000000000000000000",
    "decimals": 6,
    "symbol": "USDC"
  }
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `tokenAddress` | string | 토큰 계약 주소 |
| `owner` | string | 소유자 주소 |
| `spender` | string | 승인받은 주소 |
| `allowance` | string | 승인 금액 (Wei 단위) |
| `decimals` | number | 토큰 소수점 자리수 |
| `symbol` | string | 토큰 심볼 |

#### 사용 예제

```bash
curl -X GET "http://localhost:3000/tokens/allowance?tokenAddress=0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174&owner=0x1234567890123456789012345678901234567890&spender=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
```

---

### 8. 거래 상태 조회 (Get Transaction Status)

트랜잭션 상태와 확인 정보를 조회합니다.

```http
GET /transactions/{id}/status
```

#### URL 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `id` | string | ✅ | 트랜잭션 해시 |

#### 응답 (Response)

**Status: 200 OK**

```json
{
  "success": true,
  "data": {
    "transactionHash": "0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    "status": "confirmed",
    "blockNumber": 42000000,
    "confirmations": 10,
    "from": "0x1234567890123456789012345678901234567890",
    "to": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    "gasUsed": 150000,
    "gasPrice": "25000000000",
    "timestamp": "2024-11-29T10:01:00.000Z"
  }
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `transactionHash` | string | 트랜잭션 해시 |
| `status` | string | 거래 상태 (`pending`, `confirmed`, `failed`) |
| `blockNumber` | number | 블록 번호 (미확인 시 null) |
| `confirmations` | number | 확인 수 (미확인 시 0) |
| `from` | string | 발신자 주소 |
| `to` | string | 수신자 주소 |
| `gasUsed` | number | 사용한 가스 |
| `gasPrice` | string | 가스 가격 (Wei 단위) |
| `timestamp` | ISO8601 | 거래 시간 |

#### 상태 값 설명

| 상태 | 설명 |
|------|------|
| `pending` | 트랜잭션이 채굴 대기 중 |
| `confirmed` | 트랜잭션이 확인됨 (1개 이상 블록 생성) |
| `failed` | 트랜잭션 실행 실패 |

#### 사용 예제

```bash
curl -X GET http://localhost:3000/transactions/0xabcd1234.../status
```

```typescript
const response = await fetch('http://localhost:3000/transactions/0xabcd1234.../status');
const data = await response.json();
console.log(data.data.status); // "confirmed"
console.log(data.data.confirmations); // 10
```

---

## 상태 전이 (Status Transitions)

결제는 다음과 같은 상태 전이를 거칩니다:

```
pending (생성)
  ↓
confirmed (블록체인 확인)
  ↓
completed (완료) / failed (실패)
```

| 상태 | 설명 |
|------|------|
| `pending` | 결제 생성됨, 확인 대기 중 |
| `confirmed` | 블록체인에서 확인됨 |
| `completed` | 완료됨 |
| `failed` | 실패함 |

---

## 재시도 로직

API는 다음의 경우에 자동 재시도를 수행합니다:

- RPC 네트워크 오류 (ECONNREFUSED, ETIMEDOUT)
- 임시 가스 가격 변동
- 논스(nonce) 충돌

**재시도 정책**:
- 최대 3회 재시도
- 지수 백오프: 1초, 2초, 4초

```typescript
// 자동 재시도 예제
let retries = 0;
const maxRetries = 3;

while (retries < maxRetries) {
  try {
    const result = await blockchainService.getPaymentStatus(paymentId);
    return result;
  } catch (error) {
    retries++;
    if (retries >= maxRetries) throw error;
    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
  }
}
```

---

## 레이트 제한

현재 레이트 제한이 적용되지 않습니다. 향후 다음과 같이 적용될 예정입니다:

- 10 요청/초 (클라이언트당)
- 응답 헤더: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 보안 고려사항

1. **HTTPS 사용**: 프로덕션에서는 항상 HTTPS를 사용하세요.
2. **토큰 주소 검증**: 토큰 주소가 신뢰할 수 있는 목록에 있는지 확인하세요.
3. **서명 검증**: Gasless 거래 시 클라이언트 서명을 항상 검증하세요.
4. **금액 검증**: 결제 금액이 허용 범위 내인지 확인하세요.

---

## 관련 문서

- [아키텍처 가이드](../architecture.md)
- [구현 가이드](../implementation/payments-api.md)
- [배포 가이드](../deployment/payments-setup.md)
- [기술 스펙](../technical-spec.md)
