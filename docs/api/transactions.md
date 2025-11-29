# 거래 조회 API 레퍼런스

MSQPay 거래 조회 API는 블록체인 트랜잭션의 상태, 확인 정보, 가스비 등을 조회합니다.

## 개요

| 항목 | 설명 |
|------|------|
| Base URL | `http://localhost:3000` (개발), `https://api.msqpay.io` (프로덕션) |
| Protocol | REST API (HTTP/HTTPS) |
| Content-Type | `application/json` |
| 목적 | 블록체인 트랜잭션 상태 조회 |

---

## 엔드포인트

### 1. 거래 상태 조회 (Get Transaction Status)

트랜잭션의 현재 상태, 확인 정보, 가스비 등을 조회합니다.

```http
GET /transactions/{id}/status
```

#### URL 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `id` | string | ✅ | 트랜잭션 해시 (0x로 시작하는 64자 16진수) |

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
    "value": "0",
    "timestamp": "2024-11-29T10:01:00.000Z"
  }
}
```

##### Response 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | boolean | 요청 성공 여부 |
| `data` | object | 거래 정보 |
| `data.transactionHash` | string | 트랜잭션 해시 |
| `data.status` | string | 거래 상태 (`pending`, `confirmed`, `failed`) |
| `data.blockNumber` | number \| null | 블록 번호 (미확인 시 null) |
| `data.confirmations` | number | 확인 수 (미확인 시 0) |
| `data.from` | string | 발신자 주소 |
| `data.to` | string | 수신자 주소 |
| `data.gasUsed` | number | 사용한 가스 |
| `data.gasPrice` | string | 가스 가격 (Wei 단위) |
| `data.value` | string | 전송 금액 (Wei 단위) |
| `data.timestamp` | ISO8601 | 거래 시간 |

#### 상태 값 설명

| 상태 | 설명 | `blockNumber` | `confirmations` |
|------|------|---------------|-----------------|
| `pending` | 트랜잭션이 채굴 대기 중 | null | 0 |
| `confirmed` | 트랜잭션이 1개 이상 블록에 포함되어 확인됨 | number | ≥1 |
| `failed` | 트랜잭션 실행 실패 | number | number |

#### 에러 응답

**Status: 400 Bad Request**

```json
{
  "code": "INVALID_REQUEST",
  "message": "Invalid transaction hash format"
}
```

**Status: 404 Not Found**

```json
{
  "code": "NOT_FOUND",
  "message": "Transaction not found on the blockchain"
}
```

#### 사용 예제

**cURL**
```bash
curl -X GET http://localhost:3000/transactions/0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234/status
```

**JavaScript**
```typescript
const txHash = '0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';

const response = await fetch(`http://localhost:3000/transactions/${txHash}/status`);
const data = await response.json();

if (data.success) {
  console.log('상태:', data.data.status);           // "confirmed"
  console.log('확인 수:', data.data.confirmations); // 10
  console.log('가스 사용:', data.data.gasUsed);     // 150000
} else {
  console.error('오류:', data.message);
}
```

---

## 사용 시나리오

### 시나리오 1: 결제 결과 확인

사용자가 결제를 제출한 후 상태를 확인합니다.

```typescript
// 1. 결제 생성
const createResponse = await fetch('http://localhost:3000/payments/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user_123',
    amount: 1000000,
    currency: 'USD',
    tokenAddress: '0x...',
    recipientAddress: '0x...'
  })
});

const createData = await createResponse.json();
const txHash = createData.data.transactionHash;

// 2. 거래 상태 폴링 (2초 간격)
let confirmed = false;
let attempts = 0;

while (!confirmed && attempts < 30) {
  const statusResponse = await fetch(
    `http://localhost:3000/transactions/${txHash}/status`
  );
  const statusData = await statusResponse.json();

  console.log(`시도 ${attempts + 1}: ${statusData.data.status}`);

  if (statusData.data.status === 'confirmed') {
    console.log(`거래가 확인되었습니다! (${statusData.data.confirmations} confirmations)`);
    confirmed = true;
  } else if (statusData.data.status === 'failed') {
    console.error('거래가 실패했습니다');
    break;
  }

  // 2초 대기
  await new Promise(resolve => setTimeout(resolve, 2000));
  attempts++;
}
```

### 시나리오 2: 고급 거래 추적

거래의 세부 정보를 분석하고 저장합니다.

```typescript
async function trackTransaction(txHash: string) {
  const response = await fetch(
    `http://localhost:3000/transactions/${txHash}/status`
  );
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message);
  }

  const tx = data.data;

  // 거래 정보 분석
  const gasCostInWei = BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
  const gasCostInPOL = Number(gasCostInWei) / 1e18; // POL 단위로 변환

  console.log('거래 분석:');
  console.log(`  해시: ${tx.transactionHash}`);
  console.log(`  상태: ${tx.status}`);
  console.log(`  블록: ${tx.blockNumber || 'pending'}`);
  console.log(`  발신자: ${tx.from}`);
  console.log(`  수신자: ${tx.to}`);
  console.log(`  가스 사용: ${tx.gasUsed}`);
  console.log(`  가스 비용: ${gasCostInPOL} POL`);
  console.log(`  시간: ${tx.timestamp}`);

  // 확인 수에 따른 신뢰도 평가
  let confidence = '낮음';
  if (tx.confirmations >= 12) {
    confidence = '높음 (최종화됨)';
  } else if (tx.confirmations >= 1) {
    confidence = '중간 (확인됨)';
  }

  console.log(`  신뢰도: ${confidence}`);

  return {
    hash: tx.transactionHash,
    status: tx.status,
    gasCost: gasCostInPOL,
    confidence: confidence
  };
}

// 사용
await trackTransaction('0xabcd1234...');
```

### 시나리오 3: 거래 상태 대시보드

여러 거래의 상태를 모니터링합니다.

```typescript
async function monitorTransactions(txHashes: string[]) {
  const statusMap = new Map<string, string>();

  // 모든 거래 상태 조회
  const responses = await Promise.all(
    txHashes.map(hash =>
      fetch(`http://localhost:3000/transactions/${hash}/status`)
        .then(r => r.json())
    )
  );

  // 상태 매핑
  responses.forEach((data, index) => {
    if (data.success) {
      statusMap.set(
        txHashes[index],
        `${data.data.status} (${data.data.confirmations} confirmations)`
      );
    } else {
      statusMap.set(txHashes[index], 'ERROR');
    }
  });

  // 결과 출력
  console.log('거래 상태 대시보드:');
  statusMap.forEach((status, hash) => {
    const shortHash = `${hash.slice(0, 10)}...${hash.slice(-8)}`;
    console.log(`  ${shortHash}: ${status}`);
  });

  return statusMap;
}

// 사용
const hashes = [
  '0xabcd1234...',
  '0xefgh5678...',
  '0xijkl9012...'
];

await monitorTransactions(hashes);
```

---

## 폴링 전략 (Polling Strategy)

거래 상태를 모니터링할 때는 다음의 폴링 전략을 권장합니다:

### 권장 설정

```typescript
const pollingConfig = {
  initialDelay: 2000,     // 2초
  maxDelay: 30000,        // 30초
  maxAttempts: 50,        // 최대 50회
  backoffMultiplier: 1.1  // 10% 증가
};

async function pollTransactionStatus(
  txHash: string,
  config = pollingConfig
) {
  let delay = config.initialDelay;
  let attempts = 0;

  while (attempts < config.maxAttempts) {
    try {
      const response = await fetch(
        `http://localhost:3000/transactions/${txHash}/status`
      );
      const data = await response.json();

      if (data.data.status === 'confirmed' || data.data.status === 'failed') {
        return data.data;
      }

      attempts++;
      console.log(`대기 중... (${attempts}/${config.maxAttempts})`);

      // 지수 백오프로 대기
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);

    } catch (error) {
      console.error('폴링 오류:', error);
      throw error;
    }
  }

  throw new Error('타임아웃: 거래가 확인되지 않았습니다');
}
```

---

## 성능 팁

1. **배치 조회**: 여러 거래를 동시에 조회하려면 `Promise.all()`을 사용하세요
2. **캐싱**: 이미 최종화된 거래(확인 수가 많은)는 캐시하세요
3. **폴링 간격**: 개발 환경은 2초, 프로덕션은 5~10초 권장
4. **타임아웃**: 거래는 보통 1~2분 내에 확인되므로, 5분 이상 대기하지 마세요

---

## 관련 문서

- [결제 API 레퍼런스](./payments.md)
- [토큰 API 레퍼런스](./tokens.md)
- [아키텍처 가이드](../architecture-payments.md)
- [배포 가이드](../deployment/payments-setup.md)
