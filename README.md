# MSQPay Monorepo

Multi-Service Blockchain Payment Gateway - ERC-20 토큰 결제 게이트웨이

## Overview

여러 서비스가 통합할 수 있는 블록체인 결제 시스템입니다.

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **Contract = Source of Truth** | 결제 완료 여부는 오직 스마트 컨트랙트만 신뢰 |
| **DB 통합 아키텍처** | MySQL + Redis 캐싱 통합, Contract = Source of Truth 유지 |
| **동일 API 인터페이스** | MVP와 Production 모두 같은 API 형태 |
| **서버 발급 paymentId** | 결제서버가 유일한 paymentId 생성자 |
| **상점서버 ↔ 블록체인 분리** | 상점서버는 결제서버 API만 호출, 블록체인 접근 불가 |

### Features

- **Direct Payment**: 사용자가 가스비를 직접 지불
- **Gasless Payment**: Meta-transaction을 통한 가스비 대납 (OZ Defender Relay)
- **TypeScript SDK**: 상점서버용 API 클라이언트 (`@globalmsq/msqpay`)
- **결제서버**: paymentId 발급, Contract 상태 조회, Gasless Relay
- **Demo App**: 테스트용 웹앱

## System Architecture

```
프론트엔드 → 상점서버 → 결제서버 → Contract
           (SDK)      (API)    (Source of Truth)
```

## Project Structure

```
msqpay-monorepo/
├── contracts/          # Smart Contracts (Hardhat)
├── packages/
│   ├── sdk/           # TypeScript SDK (@globalmsq/msqpay)
│   └── server/        # 결제서버 (Fastify)
├── apps/
│   └── demo/          # Demo Web App (Next.js)
└── docs/              # Documentation
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose (권장)

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Docker Development (Recommended)

Docker Compose를 사용한 원클릭 개발 환경:

### Quick Start

```bash
# 전체 스택 시작
cd docker && docker-compose up -d

# 로그 확인
docker-compose logs -f server

# 접속
# Demo: http://localhost:3000
# API:  http://localhost:3001/health
# Hardhat: http://localhost:8545
```

### Services

| 서비스 | 포트 | 설명 |
|--------|------|------|
| mysql | 3306 | 결제 데이터 (root/pass) |
| redis | 6379 | 캐싱 |
| hardhat | 8545 | 로컬 블록체인 |
| server | 3001 | Payment API |
| demo | 3000 | 프론트엔드 |

### Commands

```bash
# 서비스 재시작
docker-compose restart server

# 리빌드
docker-compose up -d --build server

# MySQL 접속
docker-compose exec mysql mysql -u root -ppass msqpay

# 전체 초기화
docker-compose down -v
```

## Manual Development

Docker 없이 수동으로 개발하는 경우:

```bash
# Terminal 1: Start Hardhat node
cd contracts
npx hardhat node

# Terminal 2: Deploy contracts
cd contracts
pnpm deploy:local

# Terminal 3: Start Payment Server
cd packages/pay-server
pnpm dev

# Terminal 4: Start Demo App
cd apps/demo
pnpm dev
```

## Configuration

### Network

- **Chain**: Polygon Amoy Testnet (Chain ID: 80002)
- **RPC**: https://rpc-amoy.polygon.technology

### Token

- **SUT Token**: `0xE4C687167705Abf55d709395f92e254bdF5825a2`

### Contracts (TBD after deployment)

```
PaymentGateway: 0x...
ERC2771Forwarder: 0x...
```

## SDK Usage (@globalmsq/msqpay)

```typescript
import { MSQPayClient } from '@globalmsq/msqpay';

// 초기화
const client = new MSQPayClient({
  environment: 'development', // 또는 'custom' + apiUrl
  apiKey: 'sk_test_abc123'
});

// 결제 생성 (상점서버에서 호출)
const payment = await client.createPayment({
  merchantId: 'merchant_001',
  orderId: 'ORD-12345',
  amount: 100,
  currency: 'TEST',
  chainId: 31337,
  recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2'
});

// 상태 조회 (chainId 불필요 - 서버에서 자동 결정)
const status = await client.getPaymentStatus(payment.paymentId);
console.log(status.data.status); // "pending" | "completed"

// Gasless 거래 제출 (EIP-712 서명 필요)
const gaslessResult = await client.submitGasless({
  paymentId: payment.paymentId,
  forwardRequest: { from, to, value, gas, nonce, deadline, data },
  signature: '0x...'
});

// Relay 거래 실행
const relayResult = await client.executeRelay({
  paymentId: payment.paymentId,
  forwardRequest: { from, to, value, gas, nonce, deadline, data },
  signature: '0x...'
});
```

**상세 문서**: [SDK README](./packages/sdk/README.md)

## Payment Server API

### 엔드포인트

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/payments/create` | POST | 결제 생성, paymentId 발급 |
| `/api/checkout` | POST | 상품 기반 결제 (Demo App API Route) |
| `/payments/:id/status` | GET | 결제 상태 조회 (chainId 자동 결정) |
| `/payments/:id/gasless` | POST | Gasless 거래 제출 |
| `/payments/:id/relay` | POST | 릴레이 거래 실행 |
| `/payments/history` | GET | 결제 이력 조회 (payer 기반) |
| `/tokens/balance` | GET | 토큰 잔액 조회 |
| `/tokens/allowance` | GET | 토큰 approval 금액 조회 |
| `/transactions/:id/status` | GET | 거래 상태 조회 |

### 최근 추가 기능

#### Payment History API
사용자의 결제 이력을 블록체인 이벤트와 DB에서 조회합니다:
- **엔드포인트**: `GET /payments/history?chainId={}&payer={}&limit={}`
- **기능**: 결제자(payer) 주소 기반 이력 조회
- **응답**: 결제 목록 (Gasless 여부, Relay ID, Token decimals/symbol 포함)

#### Token Balance/Allowance API
ERC-20 토큰의 지갑 상태를 조회합니다:
- **엔드포인트**: `GET /tokens/balance?tokenAddress={addr}&address={wallet}`
- **기능**: 사용자 지갑의 토큰 잔액 조회
- **엔드포인트**: `GET /tokens/allowance?tokenAddress={addr}&owner={addr}&spender={addr}`
- **기능**: 토큰 approval 금액 조회

#### Transaction Status API
거래 상태와 확인 정보를 조회합니다:
- **엔드포인트**: `GET /transactions/:id/status`
- **기능**: 트랜잭션 해시로 상태, 블록 번호, 확인 수 조회
- **상태값**: `pending` (대기), `confirmed` (확인됨), `failed` (실패)

### 환경 변수 통일

결제 서버의 환경 변수는 다음과 같이 통일되었습니다:

| 변수 | 용도 | 예시 |
|------|------|------|
| `BLOCKCHAIN_RPC_URL` | 블록체인 RPC 엔드포인트 | `https://polygon-rpc.com` |
| `CHAINS_CONFIG_PATH` | 멀티체인 설정 파일 경로 | `chains.json` |
| `GATEWAY_ADDRESS` | PaymentGateway 계약 주소 | `0x...` |
| `DEFENDER_RELAYER_ADDRESS` | OpenZeppelin Defender 릴레이 주소 | `0x...` |
| `DEFENDER_API_KEY` | Defender API 키 | `sk_...` |
| `DEFENDER_API_SECRET` | Defender API 시크릿 | `secret_...` |

### 상세 문서

- **[API 레퍼런스](./docs/api/payments.md)** - 모든 엔드포인트의 요청/응답 포맷, 사용 예제
- **[아키텍처 가이드](./docs/architecture-payments.md)** - 시스템 설계, Mermaid 다이어그램, 무상태 설계 원칙
- **[구현 가이드](./docs/implementation/payments-api.md)** - BlockchainService, DefenderService 사용 방법, 테스트 작성 패턴
- **[배포 가이드](./docs/deployment/payments-setup.md)** - 프로덕션 배포, 환경 설정, Docker, 클라우드 배포

## Documentation

- [PRD (요구사항)](./docs/prd.md)
- [Technical Specification](./docs/technical-spec.md)
- [Architecture](./docs/architecture.md)
- [Implementation Plan](./docs/implementation-plan.md)
- **[Payment API Documentation](./docs/api/payments.md)** ⭐ (New - SPEC-SERVER-002)
- **[Payment Architecture](./docs/architecture-payments.md)** ⭐ (New - SPEC-SERVER-002)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Smart Contract | Solidity 0.8.24, OpenZeppelin 5.x |
| Contract Framework | Hardhat |
| Payment Server | Node.js, Fastify v5, viem v2.21 |
| Payment Server Tests | Vitest, 243 test cases, Pino structured logging |
| SDK | TypeScript, Node 18+ native fetch (no dependencies) |
| SDK Tests | Vitest, 32+ test cases, 100% coverage |
| Relay | OpenZeppelin Defender |
| Demo App | Next.js 14, wagmi, RainbowKit |
| Package Manager | pnpm |

## License

MIT
