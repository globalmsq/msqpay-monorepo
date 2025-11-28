# MSQPay Monorepo

Multi-Service Blockchain Payment Gateway - ERC-20 토큰 결제 게이트웨이

## Overview

여러 서비스가 통합할 수 있는 블록체인 결제 시스템입니다.

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **Contract = Source of Truth** | 결제 완료 여부는 오직 스마트 컨트랙트만 신뢰 |
| **Stateless MVP** | DB/Redis/이벤트 모니터링 없이 Contract 직접 조회 |
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
cd packages/server
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

## SDK Usage

```typescript
import { MSQPayClient } from '@globalmsq/msqpay';

// 초기화
const client = new MSQPayClient({
  environment: 'development',
  apiKey: 'sk_test_abc123'
});

// 결제 생성
const payment = await client.createPayment({
  orderId: 'order_123',
  amount: '1000000000000000000',
  token: '0xE4C...',
  merchant: '0x...'
});

// 상태 조회
const status = await client.getPaymentStatus(payment.paymentId);

// Gasless 데이터 요청
const gaslessData = await client.getGaslessData(payment.paymentId, userAddress);

// 서명 제출
const result = await client.submitGaslessSignature(
  payment.paymentId,
  signature,
  gaslessData.forwardRequest
);
```

## Payment Server API

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/payments/create` | POST | 결제 생성, paymentId 발급 |
| `/payments/:id/status` | GET | 결제 상태 조회 (Contract 조회) |
| `/payments/:id/gasless` | GET | Gasless 서명 데이터 조회 |
| `/payments/:id/relay` | POST | Gasless 서명 제출 → Relay |

## Documentation

- [PRD (요구사항)](./docs/prd.md)
- [Technical Specification](./docs/technical-spec.md)
- [Architecture](./docs/architecture.md)
- [Implementation Plan](./docs/implementation-plan.md)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Smart Contract | Solidity 0.8.24, OpenZeppelin 5.x |
| Contract Framework | Hardhat |
| Payment Server | Node.js, Fastify |
| SDK | TypeScript, axios |
| Relay | OpenZeppelin Defender |
| Demo App | Next.js 14, wagmi, RainbowKit |
| Package Manager | pnpm |

## License

MIT
