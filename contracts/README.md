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

# 네트워크 설정 (배포할 체인에 맞게 설정)
RPC_URL=https://rpc-amoy.polygon.technology
CHAIN_ID=80002

# Block Explorer API Key (Etherscan API v2)
# 단일 API 키로 60개 이상의 체인 지원
ETHERSCAN_API_KEY=your-etherscan-api-key
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
npx hardhat ignition deploy ./ignition/modules/PaymentGateway.ts --network localhost
```

### 네트워크 배포

`.env` 파일에 `RPC_URL`과 `CHAIN_ID`를 설정한 후 배포합니다:

```bash
npx hardhat ignition deploy ./ignition/modules/PaymentGateway.ts --network default
```

## 컨트랙트 검증

배포 후 Block Explorer에서 소스 코드를 검증합니다:

```bash
npx hardhat ignition verify chain-{CHAIN_ID}
```

## 배포된 컨트랙트

### Polygon Amoy (Testnet)

| Contract | Address |
|----------|---------|
| PaymentGatewayProxy | `0x2256bedB57869AF4fadF16e1ebD534A7d47513d7` |
| PaymentGatewayV1 | `0xDc40C3735163fEd63c198c3920B65B66DB54b1Bf` |
| ERC2771Forwarder | `0x0d9A0fAf9a8101368aa01B88442B38f82180520E` |
| SUT Token | `0xE4C687167705Abf55d709395f92e254bdF5825a2` |

> [Polygonscan에서 확인](https://amoy.polygonscan.com/address/0x2256bedB57869AF4fadF16e1ebD534A7d47513d7)

## 배포 결과 확인

배포된 컨트랙트 주소는 `ignition/deployments/chain-{CHAIN_ID}/deployed_addresses.json`에 저장됩니다.

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
