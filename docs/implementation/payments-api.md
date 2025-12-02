# 결제 API 구현 가이드

개발자를 위한 MSQPay 결제 API 구현 및 테스트 가이드입니다. BlockchainService, ForwarderService 사용 방법, 테스트 작성 패턴을 포함합니다.

## 프로젝트 구조

```
packages/pay-server/
├── src/
│   ├── routes/
│   │   └── payments/
│   │       ├── create.ts          # POST /payments/create
│   │       ├── status.ts          # GET /payments/:id/status
│   │       ├── gasless.ts         # POST /payments/:id/gasless
│   │       └── relay.ts           # POST /payments/:id/relay
│   ├── services/
│   │   ├── blockchain.service.ts  # viem 클라이언트 래퍼
│   │   └── forwarder.service.ts   # ERC2771 Forwarder 서비스
│   └── schemas/
│       └── payment.schema.ts       # Zod 검증 스키마
├── tests/
│   ├── routes/
│   │   └── payments/
│   │       ├── create.test.ts
│   │       ├── status.test.ts
│   │       ├── gasless.test.ts
│   │       └── relay.test.ts
│   └── services/
│       ├── blockchain.service.test.ts
│       └── forwarder.service.test.ts
├── vitest.config.ts              # 테스트 설정
└── package.json                   # 의존성
```

---

## 1. BlockchainService 사용 가이드

### 초기화

```typescript
import { BlockchainService } from '../services/blockchain.service';
import { polygon } from 'viem/chains';

// BlockchainService 인스턴스 생성
const blockchainService = new BlockchainService(
  'https://polygon-rpc.com',           // RPC URL
  '0x1234567890123456789012345678901234567890'  // 스마트 컨트랙트 주소
);
```

### 결제 정보 조회 (Read)

```typescript
// 비동기 결제 상태 조회
const paymentStatus = await blockchainService.getPaymentStatus('payment_123');

if (!paymentStatus) {
  console.log('결제 정보 없음');
  return;
}

console.log(paymentStatus);
// {
//   id: 'payment_123',
//   userId: 'user_123',
//   amount: 1000000,
//   currency: 'USD',
//   status: 'confirmed',
//   blockNumber: 42000000,
//   createdAt: '2024-11-29T10:00:00.000Z',
//   updatedAt: '2024-11-29T10:01:00.000Z'
// }
```

### 결제 기록 (Write)

```typescript
import { Address } from 'viem';

const transactionHash = await blockchainService.recordPaymentOnChain({
  userId: 'user_123',
  amount: BigInt(1000000),      // Web3 금액 (가장 작은 단위)
  currency: 'USD',
  tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174' as Address,
  recipientAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address,
  description: 'Product purchase',
});

console.log('Transaction Hash:', transactionHash);
// 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

### 트랜잭션 확인

```typescript
// 트랜잭션이 확인될 때까지 대기
const receipt = await blockchainService.waitForConfirmation(
  '0xaaaa...', // 트랜잭션 해시
  1            // 필요한 확인 수
);

if (receipt) {
  console.log('트랜잭션 확인됨');
  console.log('상태:', receipt.status);     // 'success' | 'failed'
  console.log('블록:', receipt.blockNumber);
} else {
  console.log('트랜잭션 확인 실패');
}
```

### 가스 비용 추정

```typescript
// 주의: 현재는 고정값 반환 (향후 실제 추정 구현)
const gasEstimate = await blockchainService.estimateGasCost(
  '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174' as Address,
  BigInt(1000000),
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
);

console.log('가스 추정치:', gasEstimate.toString()); // "200000"
```

---

## 2. ForwarderService 사용 가이드

### OZ Defender API 호환 Relay 아키텍처 (v4.0.0)

MSQPay는 모든 환경에서 동일한 HTTP 클라이언트 기반 아키텍처를 사용합니다. `DEFENDER_API_URL` 환경변수만 변경하여 환경을 전환합니다:

| 환경 | Relay 서비스 | API URL |
|------|-------------|----------|
| **Local** | SimpleDefender HTTP 서비스 | `http://simple-defender:3001` |
| **Testnet/Mainnet** | OZ Defender API | `https://api.defender.openzeppelin.com` |

```typescript
import { DefenderService } from '../services/defender.service';

// DefenderService는 HTTP 클라이언트로 동작
// 환경에 따라 DEFENDER_API_URL만 변경
const defenderService = new DefenderService(
  process.env.DEFENDER_API_URL!,       // http://simple-defender:3001 또는 OZ Defender URL
  process.env.DEFENDER_API_KEY,         // Production에서만 필요
  process.env.DEFENDER_API_SECRET,      // Production에서만 필요
  process.env.RELAYER_ADDRESS!          // Relayer 주소
);

// Local 환경: DEFENDER_API_URL=http://simple-defender:3001
// → SimpleDefender HTTP 서비스로 요청

// Production 환경: DEFENDER_API_URL=https://api.defender.openzeppelin.com
// → OZ Defender API로 요청
```

### ForwarderService 직접 사용 (선택사항)

ForwarderService를 직접 사용할 수도 있습니다:

```typescript
import { ForwarderService } from '../services/forwarder.service';

// ForwarderService 인스턴스 생성
const forwarderService = new ForwarderService(
  process.env.BLOCKCHAIN_RPC_URL!,        // RPC URL
  process.env.FORWARDER_ADDRESS!,         // ERC2771Forwarder 컨트랙트 주소
  process.env.RELAYER_PRIVATE_KEY!        // 릴레이어 개인키
);
```

### ForwardRequest 생성

```typescript
import { Address, encodeFunctionData } from 'viem';

// pay() 함수 호출 데이터 인코딩
const callData = encodeFunctionData({
  abi: PaymentGatewayABI,
  functionName: 'pay',
  args: [paymentId, tokenAddress, amount, merchantAddress]
});

// ForwardRequest 생성
const forwardRequest = await forwarderService.createForwardRequest({
  from: userAddress,           // 사용자 주소
  to: gatewayAddress,          // PaymentGateway 주소
  value: 0n,                   // ETH 값 (0)
  gas: 200000n,                // 가스 한도
  data: callData               // 인코딩된 함수 호출
});

console.log(forwardRequest);
// {
//   from: '0x...',
//   to: '0x...',
//   value: 0n,
//   gas: 200000n,
//   nonce: 0n,
//   deadline: 1735689600n,
//   data: '0x...'
// }
```

### EIP-712 서명 검증

```typescript
// EIP-712 서명 검증
const isValid = await forwarderService.verifySignature(
  forwardRequest,
  signature  // 사용자의 EIP-712 서명
);

console.log('검증 결과:', isValid); // true | false
```

### Meta-Transaction 실행

```typescript
const result = await forwarderService.executeForwardRequest(
  forwardRequest,
  signature
);

console.log(result);
// {
//   transactionHash: '0xbbbb...',
//   status: 'submitted'
// }
```

### Nonce 조회

```typescript
const nonce = await forwarderService.getNonce(userAddress);
console.log('현재 nonce:', nonce);
// 0n (또는 이전 거래 수)
```

---

## 3. Zod 스키마 검증

### 요청 검증

```typescript
import { CreatePaymentSchema } from '../schemas/payment.schema';

try {
  const validatedData = CreatePaymentSchema.parse({
    userId: 'user_123',
    amount: 1000000,
    currency: 'USD',
    tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174',
    recipientAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    description: 'Product purchase',
  });

  console.log('검증 성공:', validatedData);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('검증 실패:', error.errors);
    // [
    //   {
    //     code: 'too_small',
    //     minimum: 1,
    //     type: 'number',
    //     path: ['amount'],
    //     message: 'Number must be greater than or equal to 1'
    //   }
    // ]
  }
}
```

---

## 4. 테스트 작성 가이드

### 테스트 설정 (vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 80,
      functions: 85,
      branches: 75,
      statements: 80,
    },
  },
});
```

### BlockchainService 테스트 예제

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockchainService } from '../services/blockchain.service';
import { PublicClient } from 'viem';

describe('BlockchainService', () => {
  let service: BlockchainService;
  let mockPublicClient: Partial<PublicClient>;

  beforeEach(() => {
    // Mock PublicClient 생성
    mockPublicClient = {
      readContract: vi.fn().mockResolvedValue({
        userId: 'user_123',
        amount: BigInt(1000000),
        currency: 'USD',
        tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174',
        recipientAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        status: 1,  // confirmed
        createdAt: BigInt(Math.floor(Date.now() / 1000)),
        updatedAt: BigInt(Math.floor(Date.now() / 1000)),
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        blockNumber: BigInt(42000000),
        status: 'success',
      }),
    };

    service = new BlockchainService('https://polygon-rpc.com', '0x...');
    // Mock 주입 (실제로는 의존성 주입 패턴 사용)
  });

  it('결제 상태를 조회해야 함', async () => {
    const result = await service.getPaymentStatus('payment_123');

    expect(result).toBeDefined();
    expect(result?.userId).toBe('user_123');
    expect(result?.status).toBe('confirmed');
  });

  it('결제 정보가 없으면 null 반환', async () => {
    mockPublicClient.readContract = vi.fn().mockResolvedValue(null);

    const result = await service.getPaymentStatus('nonexistent');

    expect(result).toBeNull();
  });

  it('RPC 오류를 처리해야 함', async () => {
    mockPublicClient.readContract = vi.fn().mockRejectedValue(
      new Error('Connection refused')
    );

    await expect(service.getPaymentStatus('payment_123')).rejects.toThrow(
      '결제 정보를 조회할 수 없습니다'
    );
  });
});
```

### 라우트 테스트 예제

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { build } from '../app';

describe('POST /payments/create', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await build();
  });

  it('올바른 요청으로 결제를 생성해야 함', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/payments/create',
      payload: {
        userId: 'user_123',
        amount: 1000000,
        currency: 'USD',
        tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174',
        recipientAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.paymentId).toBeDefined();
    expect(body.transactionHash).toBeDefined();
  });

  it('잘못된 금액으로 요청을 거부해야 함', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/payments/create',
      payload: {
        userId: 'user_123',
        amount: 0,  // 유효하지 않은 금액
        currency: 'USD',
        tokenAddress: '0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174',
        recipientAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
```

---

## 5. 로컬 개발 환경 구성

### 환경별 환경 변수 (.env)

#### Local 환경 (Docker Compose)

```bash
# Relay Configuration (SimpleDefender HTTP 서비스)
DEFENDER_API_URL=http://simple-defender:3001
DEFENDER_API_KEY=
DEFENDER_API_SECRET=
RELAYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Blockchain Configuration
BLOCKCHAIN_RPC_URL=http://hardhat:8545
GATEWAY_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
CHAIN_ID=31337

# ERC2771 Forwarder Configuration
FORWARDER_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# Server Configuration
PORT=3000
NODE_ENV=development
```

#### SimpleDefender 서비스 환경 변수

```bash
# SimpleDefender Docker 컨테이너 설정
RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC_URL=http://hardhat:8545
CHAIN_ID=31337
FORWARDER_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

#### Testnet/Mainnet 환경 (OZ Defender API)

```bash
# Relay Configuration (OZ Defender API)
DEFENDER_API_URL=https://api.defender.openzeppelin.com
DEFENDER_API_KEY=your_defender_api_key
DEFENDER_API_SECRET=your_defender_api_secret
RELAYER_ADDRESS=0x...

# Blockchain Configuration
BLOCKCHAIN_RPC_URL=https://polygon-rpc.com
GATEWAY_ADDRESS=0x...
CHAIN_ID=80002  # Amoy Testnet (또는 137 Mainnet)

# ERC2771 Forwarder Configuration
FORWARDER_ADDRESS=0x...

# Server Configuration
PORT=3000
NODE_ENV=production
```

### 로컬 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 시작 (핫 리로드)
pnpm dev

# 테스트 실행
pnpm test

# 테스트 커버리지 생성
pnpm test:coverage

# 타입 체크
pnpm exec tsc --noEmit

# Lint 실행
pnpm lint
```

---

## 6. 오류 처리 패턴

### try-catch 사용

```typescript
async function createPayment(request: CreatePaymentRequest) {
  try {
    // 입력 검증
    const validatedData = CreatePaymentSchema.parse(request);

    // 블록체인 기록
    const transactionHash = await blockchainService.recordPaymentOnChain({
      userId: validatedData.userId,
      amount: BigInt(validatedData.amount),
      currency: validatedData.currency,
      tokenAddress: validatedData.tokenAddress as Address,
      recipientAddress: validatedData.recipientAddress as Address,
      description: validatedData.description,
    });

    return {
      success: true,
      paymentId: `payment-${Date.now()}`,
      transactionHash,
      status: 'pending',
    };
  } catch (error) {
    // Zod 검증 에러
    if (error instanceof Error && error.name === 'ZodError') {
      return {
        code: 'VALIDATION_ERROR',
        message: '입력 검증 실패',
        details: (error as { errors?: unknown[] }).errors,
      };
    }

    // 다른 에러
    const message = error instanceof Error
      ? error.message
      : '결제를 생성할 수 없습니다';

    return {
      code: 'INTERNAL_ERROR',
      message,
    };
  }
}
```

### Fastify 에러 핸들러

```typescript
app.setErrorHandler((error, request, reply) => {
  if (error.name === 'ValidationError') {
    return reply.code(400).send({
      code: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  // 기본 에러 처리
  logger.error('Unhandled error:', error);
  return reply.code(500).send({
    code: 'INTERNAL_ERROR',
    message: '서버 내부 오류',
  });
});
```

---

## 7. 성능 최적화 팁

### 1. viem 클라이언트 재사용

```typescript
// ❌ 나쁜 예: 매번 새로운 클라이언트 생성
async function getPaymentStatus(paymentId: string) {
  const client = createPublicClient({
    chain: polygon,
    transport: http(),
  });
  // ... 사용
}

// ✅ 좋은 예: 싱글톤 패턴
class BlockchainService {
  private publicClient: PublicClient;

  constructor() {
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: http(),
    });
  }

  async getPaymentStatus(paymentId: string) {
    // ... this.publicClient 재사용
  }
}
```

### 2. 배치 요청

```typescript
// 여러 결제 상태를 병렬로 조회
const paymentIds = ['payment_1', 'payment_2', 'payment_3'];

const statuses = await Promise.all(
  paymentIds.map(id => blockchainService.getPaymentStatus(id))
);
```

### 3. 에러 재시도

```typescript
// 지수 백오프를 사용한 재시도
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // 지수 백오프: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

// 사용
const status = await retryWithBackoff(
  () => blockchainService.getPaymentStatus(paymentId)
);
```

---

## 8. 디버깅 팁

### 로깅 추가

```typescript
import { logger } from 'pino';

const log = logger();

async function recordPaymentOnChain(paymentData: any) {
  log.info('Recording payment', { paymentId: paymentData.userId });

  try {
    const result = await publicClient.simulateContract({
      // ...
    });
    log.debug('Simulation successful', { result });
    return result;
  } catch (error) {
    log.error('Simulation failed', { error, paymentData });
    throw error;
  }
}
```

### viem 디버그 모드

```typescript
// viem의 verbose 로깅 활성화
const client = createPublicClient({
  chain: polygon,
  transport: http(),
  // ... verbose 옵션 (향후 추가 가능)
});
```

### 로컬 테스트

```bash
# 테스트 실행 중 디버깅
node --inspect-brk ./node_modules/.bin/vitest

# Chrome DevTools에서 localhost:9229 접속
```

---

## 관련 문서

- [API 레퍼런스](../api/payments.md)
- [아키텍처 가이드](../architecture-payments.md)
- [배포 가이드](../deployment/payments-setup.md)
- [기술 스펙](../technical-spec.md)
