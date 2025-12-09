# MSQ Pay Contracts

MSQ Pay 결제 시스템의 스마트 컨트랙트 패키지입니다.

## 지원 네트워크

| Network | Chain ID | Type | RPC Fallback |
|---------|----------|------|--------------|
| Hardhat Local | 31337 | Development | localhost:8545 |
| Polygon Amoy | 80002 | Testnet | rpc-amoy.polygon.technology |
| Polygon | 137 | Mainnet | polygon-rpc.com |
| Ethereum Sepolia | 11155111 | Testnet | rpc.sepolia.org |
| Ethereum | 1 | Mainnet | cloudflare-eth.com |
| BNB Testnet | 97 | Testnet | data-seed-prebsc-1-s1.binance.org |
| BNB | 56 | Mainnet | bsc-dataseed.binance.org |

## 설치

```bash
cd contracts
pnpm install
```

## 환경 설정

1. `.env.example`을 복사하여 `.env` 파일 생성:

```bash
cp .env.example .env
```

2. `.env` 파일에 필요한 값 설정:

```bash
# 배포용 개인키 (실제 키 사용 시 절대 커밋하지 마세요!)
PRIVATE_KEY=0x...

# RPC URLs (선택사항 - 기본값은 Public RPC 사용)
POLYGON_AMOY_RPC=https://your-alchemy-or-infura-url
POLYGON_RPC=https://your-alchemy-or-infura-url
ETHEREUM_SEPOLIA_RPC=https://your-alchemy-or-infura-url
ETHEREUM_RPC=https://your-alchemy-or-infura-url
BNB_TESTNET_RPC=https://your-rpc-url
BNB_RPC=https://your-rpc-url

# Block Explorer API Keys (컨트랙트 검증용)
POLYGONSCAN_API_KEY=your-polygonscan-api-key
ETHERSCAN_API_KEY=your-etherscan-api-key
BSCSCAN_API_KEY=your-bscscan-api-key
```

## 컴파일

```bash
pnpm compile
```

## 테스트

```bash
# 전체 테스트
pnpm test

# 커버리지 리포트
pnpm test:coverage
```

## 배포

### 로컬 개발 환경

```bash
# Hardhat 노드 시작 (별도 터미널)
npx hardhat node

# 로컬 배포
pnpm deploy:local
```

### Testnet 배포

```bash
# Polygon Amoy (권장 - 가장 빠름)
pnpm deploy:amoy

# Ethereum Sepolia
pnpm deploy:sepolia

# BNB Testnet
pnpm deploy:bnb-testnet
```

### Mainnet 배포

```bash
# Polygon Mainnet
pnpm deploy:polygon

# Ethereum Mainnet
pnpm deploy:ethereum

# BNB Mainnet
pnpm deploy:bnb
```

## 컨트랙트 검증

배포 후 Block Explorer에서 소스 코드를 검증합니다:

```bash
# Polygon Amoy
pnpm verify:amoy

# Polygon Mainnet
pnpm verify:polygon

# Ethereum Sepolia
pnpm verify:sepolia

# Ethereum Mainnet
pnpm verify:ethereum

# BNB Testnet
pnpm verify:bnb-testnet

# BNB Mainnet
pnpm verify:bnb
```

## 배포 결과 확인

배포된 컨트랙트 주소는 Hardhat Ignition이 자동으로 저장합니다:

```
contracts/ignition/deployments/
├── chain-31337/           # Hardhat Local
├── chain-80002/           # Polygon Amoy
├── chain-137/             # Polygon Mainnet
├── chain-11155111/        # Ethereum Sepolia
├── chain-1/               # Ethereum Mainnet
├── chain-97/              # BNB Testnet
└── chain-56/              # BNB Mainnet
```

각 디렉토리 내 `deployed_addresses.json` 파일에서 배포된 주소를 확인할 수 있습니다:

```json
{
  "PaymentGateway#ERC2771Forwarder": "0x...",
  "PaymentGateway#PaymentGatewayV1": "0x...",
  "PaymentGateway#PaymentGatewayProxy": "0x..."
}
```

## 배포 체크리스트

### Testnet 배포 전

- [ ] `.env` 파일에 `PRIVATE_KEY` 설정
- [ ] 배포 지갑에 테스트 토큰 보유 (Faucet 사용)
  - Polygon Amoy: [Polygon Faucet](https://faucet.polygon.technology/)
  - Sepolia: [Sepolia Faucet](https://sepoliafaucet.com/)
  - BNB Testnet: [BNB Faucet](https://testnet.bnbchain.org/faucet-smart)
- [ ] 컨트랙트 검증을 위한 Explorer API 키 설정

### Mainnet 배포 전

- [ ] Testnet에서 충분한 테스트 완료
- [ ] 배포 지갑에 충분한 네이티브 토큰 보유
- [ ] 보안 감사 완료 (권장)
- [ ] 멀티시그 지갑 설정 (권장)

## 컨트랙트 구조

```
src/
├── PaymentGatewayV1.sol      # 결제 게이트웨이 (Upgradeable)
├── PaymentGatewayProxy.sol   # 프록시 컨트랙트
└── mocks/
    └── MockERC20.sol         # 테스트용 ERC20 토큰
```

## 라이선스

MIT License
