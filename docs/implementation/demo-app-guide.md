# Demo App 사용 가이드

MSQPay Demo App은 결제 시스템의 실제 동작을 확인할 수 있는 웹 기반 테스트 애플리케이션입니다.

> **⚠️ 보안 필수사항 - 금액 조작 방지**
>
> Demo App에서도 프론트엔드에서 `amount`를 직접 서버로 전송하면 안됩니다!
>
> **올바른 구현**:
> 1. 프론트엔드: `productId`만 Next.js API Route로 전송
> 2. Next.js API Route: 상품 가격 조회 후 결제서버 호출
> 3. 결제서버: paymentId 생성 및 응답
>
> **Demo App 특수 사항**:
> - 상점서버가 없으므로 Next.js API Routes가 상점서버 역할 수행
> - 상품 가격은 서버에서 조회 (constants 또는 DB)
> - 프론트엔드는 절대 `amount`를 직접 전송하지 않음

## 개요

Demo App은 Next.js 14, wagmi, RainbowKit으로 구성되어 있으며, 다음과 같은 기능을 제공합니다:

- 지갑 연결 (MetaMask, WalletConnect 등)
- 결제 생성 및 상태 조회
- Payment History 조회
- 토큰 잔액/Approval 확인
- 거래 상태 추적

## 시작하기

### 1. 개발 환경 설정

```bash
# Demo 앱 디렉토리로 이동
cd apps/demo

# 의존성 설치
pnpm install

# 개발 서버 시작
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속

### 2. 환경 변수 설정

`.env.local` 파일 생성:

```bash
# Blockchain RPC
NEXT_PUBLIC_RPC_URL=https://polygon-rpc.com

# PaymentGateway 계약 주소
NEXT_PUBLIC_GATEWAY_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

# Demo 토큰 주소
NEXT_PUBLIC_TOKEN_ADDRESS=0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174

# 결제 API 기본 URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# wagmi/RainbowKit 설정
NEXT_PUBLIC_WC_PROJECT_ID=your_wallet_connect_project_id
```

## 주요 기능

### Payment History (결제 이력 조회)

PaymentHistory 컴포넌트는 현재 연결된 지갑의 모든 결제 이력을 표시합니다.

#### 동작 방식

1. 사용자가 지갑 연결
2. PaymentHistory 컴포넌트가 사용자 주소로 API 호출
3. 서버에서 Payment History 조회
4. 결제 이력 표시

#### 구현

```typescript
// components/PaymentHistory.tsx
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

export function PaymentHistory() {
  const { address } = useAccount();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/payments/history?payer=${address}`
        );
        const data = await response.json();
        setHistory(data.data || []);
      } catch (error) {
        console.error('Failed to fetch payment history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [address]);

  return (
    <div>
      <h2>결제 이력</h2>
      {loading ? (
        <p>로딩 중...</p>
      ) : history.length === 0 ? (
        <p>결제 이력이 없습니다</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>결제 ID</th>
              <th>금액</th>
              <th>상태</th>
              <th>시간</th>
            </tr>
          </thead>
          <tbody>
            {history.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.id}</td>
                <td>{payment.amount}</td>
                <td>{payment.status}</td>
                <td>{new Date(payment.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

#### API 호출

```bash
# 지갑 주소로 결제 이력 조회
GET /payments/history?payer={userAddress}

# 응답
{
  "success": true,
  "data": [
    {
      "id": "payment_123",
      "paymentId": "0x...",
      "payer": "0x...",
      "merchant": "0x...",
      "amount": "100000000000000000",
      "timestamp": "1234567890",
      "transactionHash": "0x...",
      "status": "completed"
    }
  ]
}
```

### 토큰 잔액 및 Approval 확인

TokenInfo 컴포넌트는 현재 지갑의 토큰 상태를 표시합니다.

#### 구현

```typescript
// components/TokenInfo.tsx
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';

export function TokenInfo() {
  const { address } = useAccount();
  const [balance, setBalance] = useState('0');
  const [allowance, setAllowance] = useState('0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    const fetchTokenInfo = async () => {
      setLoading(true);
      try {
        // 잔액 조회
        const balanceResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/tokens/balance?` +
          `tokenAddress=${process.env.NEXT_PUBLIC_TOKEN_ADDRESS}&` +
          `address=${address}`
        );
        const balanceData = await balanceResponse.json();
        setBalance(balanceData.data?.balance || '0');

        // Approval 조회
        const allowanceResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/tokens/allowance?` +
          `tokenAddress=${process.env.NEXT_PUBLIC_TOKEN_ADDRESS}&` +
          `owner=${address}&` +
          `spender=${process.env.NEXT_PUBLIC_GATEWAY_ADDRESS}`
        );
        const allowanceData = await allowanceResponse.json();
        setAllowance(allowanceData.data?.allowance || '0');
      } catch (error) {
        console.error('Failed to fetch token info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenInfo();
  }, [address]);

  return (
    <div>
      <h2>토큰 정보</h2>
      {loading ? (
        <p>로딩 중...</p>
      ) : (
        <div>
          <p>잔액: {balance}</p>
          <p>Approval: {allowance}</p>
        </div>
      )}
    </div>
  );
}
```

### Payment Modal (PaymentModal 폴링)

PaymentModal 컴포넌트는 결제를 생성한 후 서버 API 폴링으로 상태를 확인합니다.

> **⚠️ 중요**: 아래 동작 방식에서 프론트엔드는 `productId`만 전송합니다.
> 금액은 Next.js API Route(상점서버 역할)에서 조회합니다.

#### 동작 방식

```
1. 사용자가 상품 선택
   └─ 프론트엔드: productId만 Next.js API로 전송 (⚠️ amount 절대 불가!)

2. Next.js API Route (상점서버 역할)
   └─ 상품 가격 조회 (constants/DB)
   └─ 조회된 가격으로 결제서버 API 호출

3. 결제서버에서 paymentId 반환
   └─ 클라이언트는 paymentId로 2초 간격 폴링

4. GET /payments/:id/status 폴링
   └─ 상태: pending → confirmed → completed

5. 최종 상태 확인 후 모달 닫음
   └─ 사용자에게 결과 표시
```

#### 구현 예제

```typescript
// components/PaymentModal.tsx
import { useState } from 'react';
import { useAccount } from 'wagmi';

export function PaymentModal({ onClose }) {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'completed' | 'failed'>('pending');
  const [paymentId, setPaymentId] = useState('');

  const createPayment = async (amount: string, recipient: string) => {
    setLoading(true);

    try {
      // 1. 결제 생성
      const createResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/payments/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: address,
            amount: Number(amount),
            currency: 'USD',
            tokenAddress: process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
            recipientAddress: recipient
          })
        }
      );

      const createData = await createResponse.json();
      const newPaymentId = createData.data.paymentId;
      setPaymentId(newPaymentId);

      // 2. 2초 간격으로 폴링 (최대 30회)
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        const statusResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/payments/${newPaymentId}/status`
        );
        const statusData = await statusResponse.json();
        const currentStatus = statusData.data?.status || 'pending';

        setStatus(currentStatus);

        if (currentStatus === 'completed' || currentStatus === 'failed') {
          break;
        }

        // 2초 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }
    } catch (error) {
      console.error('Payment failed:', error);
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>결제</h2>
      {!paymentId ? (
        // 결제 입력 폼
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          createPayment(
            formData.get('amount') as string,
            formData.get('recipient') as string
          );
        }}>
          <input name="amount" type="number" placeholder="금액" required />
          <input name="recipient" type="text" placeholder="수령자 주소" required />
          <button type="submit" disabled={loading}>
            {loading ? '처리 중...' : '결제'}
          </button>
        </form>
      ) : (
        // 상태 표시
        <div>
          <p>결제 ID: {paymentId}</p>
          <p>상태: {status}</p>
          {(status === 'completed' || status === 'failed') && (
            <button onClick={onClose}>닫기</button>
          )}
        </div>
      )}
    </div>
  );
}
```

## 테스트 시나리오

### 시나리오 1: 기본 결제 흐름

1. **지갑 연결**
   - RainbowKit에서 "Connect Wallet" 클릭
   - MetaMask 또는 다른 지갑 선택

2. **토큰 확인**
   - TokenInfo에서 현재 잔액 확인
   - Approval 금액 확인

3. **결제 생성**
   - PaymentModal에서 금액 입력
   - 수령자 주소 입력
   - "결제" 버튼 클릭

4. **상태 모니터링**
   - 모달에서 상태 변화 관찰
   - pending → confirmed → completed

5. **결제 이력 확인**
   - PaymentHistory에서 새 결제 확인

### 시나리오 2: 다중 결제

여러 결제를 빠르게 진행합니다:

```typescript
async function testMultiplePayments() {
  const recipients = [
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  ];

  for (const recipient of recipients) {
    await createPayment('100', recipient);
  }

  // 결제 이력 조회
  const historyResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/payments/history?payer=${address}`
  );
  const history = await historyResponse.json();

  console.log('결제 이력:', history.data);
}
```

## 디버깅

### 브라우저 콘솔

```javascript
// 현재 연결된 지갑 확인
const { address } = useAccount();
console.log('Current address:', address);

// API 응답 확인
const response = await fetch('http://localhost:3001/payments/health');
const data = await response.json();
console.log('API Status:', data);
```

### 네트워크 탭 (DevTools)

- API 요청/응답 확인
- 상태 코드 및 응답 페이로드 확인
- 폴링 간격 모니터링

## 프로덕션 배포

### Next.js 빌드

```bash
# 프로덕션 빌드
pnpm build

# 빌드 결과 테스트
pnpm start
```

### Vercel 배포

```bash
# Vercel CLI 설치
npm install -g vercel

# 배포
vercel
```

## 관련 문서

- [API 레퍼런스](../api/payments.md)
- [토큰 API](../api/tokens.md)
- [거래 조회 API](../api/transactions.md)
- [아키텍처 가이드](../architecture-payments.md)
