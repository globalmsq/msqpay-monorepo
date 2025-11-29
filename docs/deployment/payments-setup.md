# 결제 API 배포 가이드

MSQPay 결제 API를 프로덕션 환경에 배포하기 위한 단계별 가이드입니다. OpenZeppelin Defender, Polygon RPC, 환경 설정을 포함합니다.

## 배포 전 체크리스트

- [ ] Polygon 네트워크 스마트 컨트랙트 배포 완료
- [ ] OpenZeppelin Defender 계정 생성 및 설정
- [ ] RPC 프로바이더 선택 및 엔드포인트 확보
- [ ] 환경 변수 준비 (.env.production)
- [ ] 테스트 커버리지 >= 85%
- [ ] 타입스크립트 컴파일 성공
- [ ] 보안 감시 완료

---

## 1단계: 환경 설정

### 1.1 필수 환경 변수

프로덕션 환경에 다음 변수를 설정하세요:

```bash
# ============================================
# Blockchain Configuration (Required)
# ============================================

# PaymentGateway 컨트랙트 주소 (필수)
# 서버 시작 시 이 값이 없으면 에러 발생
GATEWAY_ADDRESS=0x1234567890123456789012345678901234567890

# Blockchain RPC 엔드포인트 (선택, 기본값: https://polygon-rpc.com)
BLOCKCHAIN_RPC_URL=https://polygon-rpc.com
# 또는 전용 RPC:
# BLOCKCHAIN_RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID
# BLOCKCHAIN_RPC_URL=https://polygon.llamarpc.com
# BLOCKCHAIN_RPC_URL=https://rpc.ankr.com/polygon

# ============================================
# OpenZeppelin Defender Configuration
# ============================================
DEFENDER_API_KEY=your_defender_api_key_here
# Defender 대시보드 > Settings > API Keys에서 생성

DEFENDER_API_SECRET=your_defender_api_secret_here
# 안전하게 보관하세요 (절대 커밋하지 마세요)

DEFENDER_RELAYER_ADDRESS=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
# Defender에서 설정한 릴레이어 주소

# ============================================
# Server Configuration
# ============================================
PORT=3000
NODE_ENV=production

# ============================================
# Logging Configuration (선택사항)
# ============================================
LOG_LEVEL=info
# debug, info, warn, error 중 선택

# ============================================
# CORS Configuration (선택사항)
# ============================================
CORS_ORIGIN=https://app.msqpay.io
# 클라이언트 도메인
```

### 1.2 .env.production 파일 작성

```bash
# Linux/macOS
touch .env.production
chmod 600 .env.production
# 이 파일에 위의 환경 변수 추가
```

### 1.3 보안 고려사항

```bash
# ❌ 절대 커밋하지 마세요
git add .env.production  # 금지!

# ✅ .gitignore에 추가
echo ".env.production" >> .gitignore
echo ".env.*.local" >> .gitignore
git add .gitignore
git commit -m "chore: add .env files to gitignore"
```

---

## 2단계: OpenZeppelin Defender 설정

### 2.1 Defender 계정 생성

1. https://defender.openzeppelin.com 방문
2. 계정 생성 또는 로그인
3. Team 생성 (조직 단위)

### 2.2 릴레이어 생성

**웹 콘솔에서**:
1. Defender > Relayers 메뉴 접속
2. "Create Relayer" 버튼 클릭
3. 네트워크 선택: **Polygon**
4. 릴레이어 이름 입력: `msqpay-relay` (예)
5. "Create Relayer" 버튼 클릭
6. **Relayer Address** 복사 (DEFENDER_RELAYER_ADDRESS)

### 2.3 API 키 생성

**웹 콘솔에서**:
1. Settings > API Keys 접속
2. "Create API Key" 버튼 클릭
3. 키 이름 입력: `msqpay-api` (예)
4. **API Key** 복사 (DEFENDER_API_KEY)
5. **Secret Key** 복사 (DEFENDER_API_SECRET) - 한 번만 표시됨!

### 2.4 Relayer 자금 확인

1. Relayers 메뉴에서 생성한 릴레이어 선택
2. 지갑 주소와 POL 잔액 확인
3. 필요시 POL 전송 (Gasless 거래용)

---

## 3단계: RPC 프로바이더 선택

### 3.1 공개 RPC 비교

| 제공자 | URL | 속도 | 안정성 | 비용 |
|--------|-----|------|--------|------|
| **Polygon RPC** | `https://polygon-rpc.com` | 중간 | 높음 | 무료 |
| **Infura** | `https://mainnet.infura.io/v3/{PROJECT_ID}` | 빠름 | 높음 | 유료 |
| **Alchemy** | `https://polygon-mainnet.g.alchemy.com/v2/{API_KEY}` | 매우빠름 | 매우높음 | 유료 |
| **QuickNode** | `https://polished-responsive-diagram.quiknode.pro/...` | 빠름 | 높음 | 유료 |
| **Ankr** | `https://rpc.ankr.com/polygon` | 중간 | 중간 | 무료 |

### 3.2 RPC 선택 기준

```bash
# 개발/테스트용: 공개 RPC 사용 (무료)
BLOCKCHAIN_RPC_URL=https://polygon-rpc.com

# 프로덕션 (저볼륨): 공개 RPC 또는 Infura
BLOCKCHAIN_RPC_URL=https://mainnet.infura.io/v3/YOUR-PROJECT-ID

# 프로덕션 (고볼륨): Alchemy 또는 QuickNode (권장)
BLOCKCHAIN_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR-API-KEY
```

### 3.3 RPC 건강성 확인

```bash
# RPC 연결 테스트
curl -X POST https://polygon-rpc.com \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "web3_clientVersion",
    "params": [],
    "id": 1
  }'

# 성공 응답 예:
# {"jsonrpc":"2.0","result":"Geth/v1.11.0-stable","id":1}
```

---

## 4단계: 배포 준비

### 4.1 빌드 및 테스트

```bash
# 1. 의존성 설치
pnpm install --frozen-lockfile

# 2. TypeScript 컴파일 확인
pnpm exec tsc --noEmit

# 3. 린트 검사
pnpm lint

# 4. 테스트 실행
pnpm test

# 5. 테스트 커버리지 확인 (최소 85%)
pnpm test:coverage
# 결과:
# Lines       : 82.89% ( 65/78 )
# Functions   : 85% ( 34/40 )
# Branches    : 75% ( 18/24 )
# Statements  : 82.89% ( 65/78 )
```

### 4.2 프로덕션 빌드

```bash
# 프로덕션 빌드 생성
pnpm build

# 빌드 결과 확인
ls -la dist/

# 혹은 직접 실행
NODE_ENV=production pnpm start
```

### 4.3 배포 전 검증

```bash
# 환경 변수 검증
cat > check-env.js << 'EOF'
const required = [
  'BLOCKCHAIN_RPC_URL',
  'GATEWAY_ADDRESS',
  'DEFENDER_API_KEY',
  'DEFENDER_API_SECRET',
  'DEFENDER_RELAYER_ADDRESS',
  'PORT',
  'NODE_ENV'
];

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing environment variables:', missing);
  process.exit(1);
}

console.log('✅ All required environment variables are set');
EOF

node check-env.js
rm check-env.js
```

---

## 5단계: Docker 배포 (선택사항)

### 5.1 Dockerfile 작성

```dockerfile
# /Dockerfile
FROM node:20-alpine

WORKDIR /app

# 의존성 설치
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# 빌드
RUN pnpm build

# 포트 노출
EXPOSE 3000

# 환경 변수
ENV NODE_ENV=production

# 실행
CMD ["pnpm", "start"]
```

### 5.2 Docker 이미지 빌드

```bash
# 이미지 빌드
docker build -t msqpay-api:latest .

# 이미지 테스트 (로컬)
docker run -p 3000:3000 \
  -e BLOCKCHAIN_RPC_URL=https://polygon-rpc.com \
  -e GATEWAY_ADDRESS=0x... \
  -e DEFENDER_API_KEY=xxx \
  -e DEFENDER_API_SECRET=xxx \
  -e DEFENDER_RELAYER_ADDRESS=0x... \
  msqpay-api:latest

# 연결 테스트
curl http://localhost:3000/health
```

### 5.3 Docker Compose (다중 서비스)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      BLOCKCHAIN_RPC_URL: https://polygon-rpc.com
      GATEWAY_ADDRESS: 0x...
      DEFENDER_API_KEY: ${DEFENDER_API_KEY}
      DEFENDER_API_SECRET: ${DEFENDER_API_SECRET}
      DEFENDER_RELAYER_ADDRESS: 0x...
      NODE_ENV: production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## 6단계: 클라우드 배포

### 6.1 Railway 배포

```bash
# 1. Railway CLI 설치
npm install -g @railway/cli

# 2. 로그인
railway login

# 3. 프로젝트 생성
railway init

# 4. 환경 변수 설정
railway variable set BLOCKCHAIN_RPC_URL https://polygon-rpc.com
railway variable set GATEWAY_ADDRESS 0x...
railway variable set DEFENDER_API_KEY xxx
railway variable set DEFENDER_API_SECRET xxx
railway variable set DEFENDER_RELAYER_ADDRESS 0x...

# 5. 배포
railway up
```

### 6.2 Vercel 배포 (Functions API)

```bash
# 1. Vercel CLI 설치
npm install -g vercel

# 2. 로그인
vercel login

# 3. 배포
vercel

# 4. 환경 변수 설정
# Vercel 대시보드 > Settings > Environment Variables에서 설정:
# - BLOCKCHAIN_RPC_URL
# - GATEWAY_ADDRESS
# - DEFENDER_API_KEY
# - DEFENDER_API_SECRET
# - DEFENDER_RELAYER_ADDRESS
```

### 6.3 AWS Lambda 배포

```bash
# 1. Serverless Framework 설치
npm install -g serverless

# 2. AWS 자격증명 설정
aws configure

# 3. serverless.yml 작성
cat > serverless.yml << 'EOF'
service: msqpay-api

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  environment:
    BLOCKCHAIN_RPC_URL: ${env:BLOCKCHAIN_RPC_URL}
    GATEWAY_ADDRESS: ${env:GATEWAY_ADDRESS}
    DEFENDER_API_KEY: ${env:DEFENDER_API_KEY}
    DEFENDER_API_SECRET: ${env:DEFENDER_API_SECRET}
    DEFENDER_RELAYER_ADDRESS: ${env:DEFENDER_RELAYER_ADDRESS}

functions:
  api:
    handler: dist/index.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY

package:
  exclude:
    - node_modules/**
    - .env*
EOF

# 4. 배포
serverless deploy
```

---

## 7단계: 모니터링 및 로깅

### 7.1 로그 수집

```typescript
// src/logger.ts
import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev ? { target: 'pino-pretty' } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// 사용
logger.info('Payment created', { paymentId: 'payment_123' });
logger.error('RPC error', { error: 'Connection refused' });
```

### 7.2 에러 추적 (Sentry)

```bash
# Sentry 클라이언트 설치
npm install @sentry/node

# 초기화
```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

// 에러 캡처
try {
  // ... 코드
} catch (error) {
  Sentry.captureException(error);
}
```

### 7.3 메트릭 수집 (Prometheus)

```typescript
import client from 'prom-client';

// 메트릭 정의
const paymentCounter = new client.Counter({
  name: 'payments_created_total',
  help: 'Total payments created',
  labelNames: ['currency'],
});

// 메트릭 사용
paymentCounter.inc({ currency: 'USD' });

// Prometheus 엔드포인트 제공
app.get('/metrics', (request, reply) => {
  reply.type('text/plain');
  return client.register.metrics();
});
```

---

## 8단계: 보안 감시

### 8.1 HTTPS 설정

```typescript
import fs from 'fs';
import https from 'https';

const options = {
  key: fs.readFileSync('/path/to/key.pem'),
  cert: fs.readFileSync('/path/to/cert.pem'),
};

if (process.env.NODE_ENV === 'production') {
  https.createServer(options, app).listen(3000);
} else {
  app.listen({ port: 3000 });
}
```

### 8.2 요청 검증

```typescript
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';

app.register(helmet);
app.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
});
```

### 8.3 레이트 제한

```typescript
import rateLimit from '@fastify/rate-limit';

app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
});
```

---

## 9단계: 배포 후 검증

### 9.1 헬스 체크

```bash
# 헬스 체크 엔드포인트
curl https://api.msqpay.io/health

# 기대 응답:
# {"status":"ok","timestamp":"2024-11-29T10:00:00.000Z"}
```

### 9.2 API 테스트

```bash
# 결제 생성 테스트
curl -X POST https://api.msqpay.io/payments/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "amount": 1000000,
    "currency": "USD",
    "tokenAddress": "0x...",
    "recipientAddress": "0x..."
  }'
```

### 9.3 모니터링 대시보드 설정

- Sentry: 에러 추적
- Prometheus + Grafana: 메트릭 시각화
- DataDog/New Relic: APM (Application Performance Monitoring)

---

## 프로덕션 체크리스트 (최종)

- [ ] 모든 환경 변수 설정됨
- [ ] OpenZeppelin Defender 릴레이어 자금 충전
- [ ] RPC 엔드포인트 테스트 완료
- [ ] HTTPS 설정 완료
- [ ] 로깅/모니터링 설정 완료
- [ ] 백업/복구 계획 수립
- [ ] 에러 처리 검증
- [ ] 보안 감사 완료
- [ ] 성능 테스트 완료
- [ ] 배포 후 헬스 체크 통과

---

## 트러블슈팅

### RPC 연결 오류

```
Error: Connection refused at POLYGON_RPC_URL
```

해결책:
1. RPC URL 확인
2. 네트워크 연결 확인
3. 방화벽 설정 확인
4. 다른 RPC 프로바이더로 시도

### Defender 인증 오류

```
Error: Unauthorized - Invalid API key
```

해결책:
1. API Key/Secret 확인
2. 만료되지 않았는지 확인
3. 새 키 재생성
4. 권한 확인

### 가스비 부족

```
Error: Insufficient balance for gas
```

해결책:
1. Relayer 지갑에 POL 전송
2. 충분한 잔액 확인 (최소 0.1 POL)
3. 거래 볼륨 재평가

---

## 관련 문서

- [API 레퍼런스](../api/payments.md)
- [아키텍처 가이드](../architecture-payments.md)
- [구현 가이드](../implementation/payments-api.md)
