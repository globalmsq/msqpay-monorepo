# 토큰 API 레퍼런스

MSQPay 토큰 API는 ERC-20 토큰의 잔액, 승인 금액, 기타 상태를 조회합니다.

## 개요

| 항목 | 설명 |
|------|------|
| Base URL | `http://localhost:3000` (개발), `https://api.msqpay.io` (프로덕션) |
| Protocol | REST API (HTTP/HTTPS) |
| Content-Type | `application/json` |
| 목적 | ERC-20 토큰 상태 조회 |

---

## 엔드포인트

### 1. 토큰 잔액 조회 (Get Token Balance)

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
| `success` | boolean | 요청 성공 여부 |
| `data` | object | 응답 데이터 |
| `data.tokenAddress` | string | 토큰 계약 주소 |
| `data.address` | string | 조회 지갑 주소 |
| `data.balance` | string | 잔액 (Wei 단위) |
| `data.decimals` | number | 토큰 소수점 자리수 |
| `data.symbol` | string | 토큰 심볼 |

#### 에러 응답

```json
{
  "code": "INVALID_REQUEST",
  "message": "Invalid token address or wallet address"
}
```

#### 사용 예제

**cURL**
```bash
curl -X GET "http://localhost:3000/tokens/balance?tokenAddress=0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174&address=0x1234567890123456789012345678901234567890"
```

**JavaScript**
```typescript
const response = await fetch(
  'http://localhost:3000/tokens/balance?' +
  'tokenAddress=0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174&' +
  'address=0x1234567890123456789012345678901234567890'
);

const data = await response.json();
console.log(data.data.balance); // "1000000000000000000"
console.log(data.data.symbol);  // "USDC"
```

---

### 2. 토큰 Approval 조회 (Get Token Allowance)

토큰 approval 금액을 조회합니다. 특정 주소(spender)가 소유자(owner)의 토큰을 전송할 수 있는 금액을 확인합니다.

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
| `success` | boolean | 요청 성공 여부 |
| `data` | object | 응답 데이터 |
| `data.tokenAddress` | string | 토큰 계약 주소 |
| `data.owner` | string | 소유자 주소 |
| `data.spender` | string | 승인받은 주소 |
| `data.allowance` | string | 승인 금액 (Wei 단위) |
| `data.decimals` | number | 토큰 소수점 자리수 |
| `data.symbol` | string | 토큰 심볼 |

#### 에러 응답

```json
{
  "code": "INVALID_REQUEST",
  "message": "Invalid token address, owner address, or spender address"
}
```

#### 사용 예제

**cURL**
```bash
curl -X GET "http://localhost:3000/tokens/allowance?tokenAddress=0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174&owner=0x1234567890123456789012345678901234567890&spender=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
```

**JavaScript**
```typescript
const params = new URLSearchParams({
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174',
  owner: '0x1234567890123456789012345678901234567890',
  spender: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
});

const response = await fetch(`http://localhost:3000/tokens/allowance?${params}`);
const data = await response.json();

console.log(data.data.allowance); // "5000000000000000000"
console.log(data.data.symbol);    // "USDC"
```

---

## 사용 시나리오

### 시나리오 1: 사용자 잔액 확인

사용자가 결제에 충분한 토큰을 보유하고 있는지 확인합니다.

```typescript
// 1. 사용자 지갑 주소와 토큰 주소 확인
const userAddress = '0x1234567890123456789012345678901234567890';
const tokenAddress = '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174';
const requiredAmount = '1000000000000000000'; // 1 USDC (6 decimals)

// 2. 잔액 조회
const response = await fetch(
  `http://localhost:3000/tokens/balance?tokenAddress=${tokenAddress}&address=${userAddress}`
);
const data = await response.json();

// 3. 충분한지 확인
if (BigInt(data.data.balance) >= BigInt(requiredAmount)) {
  console.log('충분한 잔액이 있습니다');
} else {
  console.log('잔액이 부족합니다');
}
```

### 시나리오 2: Approval 확인 후 결제

PaymentGateway 계약을 사용하기 전에 approval을 확인합니다.

```typescript
// 1. 사용자와 Gateway Contract 주소
const userAddress = '0x1234567890123456789012345678901234567890';
const gatewayAddress = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';
const tokenAddress = '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174';
const paymentAmount = '1000000000000000000';

// 2. Approval 확인
const response = await fetch(
  `http://localhost:3000/tokens/allowance?` +
  `tokenAddress=${tokenAddress}&` +
  `owner=${userAddress}&` +
  `spender=${gatewayAddress}`
);
const data = await response.json();

// 3. Approval이 충분한지 확인
if (BigInt(data.data.allowance) >= BigInt(paymentAmount)) {
  // 4. 결제 진행
  await fetch('http://localhost:3000/payments/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'user_123',
      amount: paymentAmount,
      currency: 'USD',
      tokenAddress: tokenAddress,
      recipientAddress: '0x...'
    })
  });
} else {
  console.log('토큰 Approval이 부족합니다. 먼저 approve() 호출이 필요합니다.');
}
```

---

## 관련 문서

- [결제 API 레퍼런스](./payments.md)
- [아키텍처 가이드](../architecture-payments.md)
- [배포 가이드](../deployment/payments-setup.md)
