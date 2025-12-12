# SPEC-DEPLOY-001: 멀티체인 배포 인프라

## TAG BLOCK

- SPEC-ID: SPEC-DEPLOY-001
- Title: 멀티체인 컨트랙트 배포 및 주소 관리 시스템
- Status: completed
- Priority: High
- Version: 1.3.0
- Created: 2025-12-09
- Updated: 2025-12-12
- Completed: 2025-12-12
- Author: System Architect

## 개요

6개 체인(Polygon, Ethereum, BNB Chain의 Testnet/Mainnet)에 대한 스마트 컨트랙트 배포 자동화 시스템을 구현합니다. Hardhat Ignition의 기본 배포 관리 기능을 활용하여 별도의 주소 저장소 없이 체인별 배포를 관리합니다.

### 핵심 설계 원칙

Hardhat Ignition 기본 기능 활용:
- Ignition이 자동 생성하는 `ignition/deployments/chain-{chainId}/` 디렉토리 사용
- `deployed_addresses.json`을 통한 주소 관리
- 별도의 커스텀 저장소 불필요

RPC Provider 독립성:
- 환경변수로 RPC URL 직접 설정
- 특정 Provider(Alchemy, Infura 등)에 종속되지 않음
- Public RPC를 fallback으로 제공

### 지원 체인 목록

Testnet 환경:
- Polygon Amoy (chainId: 80002)
- Ethereum Sepolia (chainId: 11155111)
- BNB Chain Testnet (chainId: 97)

Mainnet 환경:
- Polygon Mainnet (chainId: 137)
- Ethereum Mainnet (chainId: 1)
- BNB Chain (chainId: 56)

Local 환경:
- Hardhat Local (chainId: 31337)

## 배경 및 동기

### 현재 상태

현재 배포 프로세스:
- Local Hardhat 배포는 docker-compose로 자동화됨
- Ignition이 `ignition/deployments/chain-31337/`에 배포 정보 자동 저장
- Testnet/Mainnet 네트워크 설정이 불완전함 (polygonAmoy만 설정됨)

현재 Ignition 배포 구조 (chain-31337 예시):
```
contracts/ignition/deployments/chain-31337/
├── deployed_addresses.json    # 배포된 컨트랙트 주소
├── journal.jsonl              # 배포 히스토리/트랜잭션 로그
├── artifacts/                 # 컨트랙트 아티팩트
└── build-info/               # 빌드 정보
```

### 목표 상태

개선된 배포 프로세스:
- hardhat.config.ts에 6개 체인 네트워크 설정 완료
- 단일 명령어로 Testnet/Mainnet 배포
- Ignition 기본 구조 그대로 활용
- Block Explorer verify 자동화

## Environment (환경)

### 시스템 환경

- Runtime: Node.js 20 LTS
- Package Manager: pnpm
- Smart Contract Framework: Hardhat + Ignition
- Language: TypeScript

### 기술 스택

- Hardhat: 스마트 컨트랙트 개발 및 배포
- Hardhat Ignition: 선언적 배포 모듈
- hardhat-verify: Block Explorer 자동 verify
- dotenv: 환경변수 관리

### RPC Provider

환경변수로 자유롭게 설정 가능:
- Alchemy, Infura, QuickNode 등 유료 Provider
- Public RPC (fallback)

Public RPC (fallback용):
- Polygon Amoy: https://rpc-amoy.polygon.technology
- Polygon Mainnet: https://polygon-rpc.com
- Ethereum Sepolia: https://rpc.sepolia.org
- Ethereum Mainnet: https://eth.drpc.org
- BNB Testnet: https://data-seed-prebsc-1-s1.binance.org:8545
- BNB Mainnet: https://bsc-dataseed.binance.org

### Block Explorer API

- Polygonscan: Polygon Amoy, Polygon Mainnet
- Etherscan: Ethereum Sepolia, Ethereum Mainnet
- BSCScan: BNB Chain Testnet, BNB Chain

## Assumptions (가정)

### 기술적 가정

- Hardhat Ignition 모듈이 이미 구현되어 있습니다 (PaymentGateway.ts)
- ERC2771Forwarder, PaymentGatewayV1, MockERC20 컨트랙트가 준비되어 있습니다
- 각 체인의 RPC 엔드포인트에 접근 가능합니다

### 운영 가정

- 배포자 개인키(PRIVATE_KEY)가 안전하게 관리됩니다
- 배포자 계정에 각 체인의 네이티브 토큰이 충분히 있습니다
- Block Explorer API 키가 준비되어 있습니다

## Requirements (요구사항)

### REQ-001: Ignition 기본 배포 구조 활용

EARS 형식: **When** 컨트랙트가 배포될 때, **the system shall** Hardhat Ignition의 기본 디렉토리 구조를 사용하여 **so that** 별도의 커스텀 저장소 없이 배포 주소를 관리할 수 있습니다.

Ignition 자동 생성 구조:
- ignition/deployments/chain-{chainId}/deployed_addresses.json
- ignition/deployments/chain-{chainId}/journal.jsonl
- ignition/deployments/chain-{chainId}/artifacts/

deployed_addresses.json 형식 (Ignition 기본):
```json
{
  "PaymentGateway#ERC2771Forwarder": "0x...",
  "PaymentGateway#MockERC20": "0x...",
  "PaymentGateway#PaymentGatewayV1": "0x...",
  "PaymentGateway#PaymentGatewayProxy": "0x..."
}
```

### REQ-002: Hardhat 네트워크 설정

EARS 형식: **When** Hardhat이 초기화될 때, **the system shall** 6개 체인의 네트워크 설정을 로드하여 **so that** 모든 지원 체인에 배포할 수 있습니다.

네트워크 설정 항목:
- chainId
- RPC URL (환경변수, Public RPC fallback)
- 배포자 계정
- Block Explorer API 키 (etherscan 설정)

### REQ-003: 배포 명령어

EARS 형식: **When** 개발자가 배포 명령을 실행할 때, **the system shall** Hardhat Ignition을 통해 지정된 네트워크에 배포하여 **so that** 일관된 배포 프로세스가 보장됩니다.

지원 명령어:
- pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network polygonAmoy
- pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network sepolia
- pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network bscTestnet
- pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network polygon
- pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network mainnet
- pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network bsc

package.json 스크립트 (선택적):
- pnpm deploy:amoy
- pnpm deploy:sepolia
- pnpm deploy:bsc-testnet

### REQ-004: 컨트랙트 Verify

EARS 형식: **When** 컨트랙트가 배포된 후, **the system shall** Hardhat Ignition의 verify 기능을 통해 Block Explorer에 소스코드를 verify하여 **so that** 컨트랙트의 투명성이 보장됩니다.

verify 명령어:
- pnpm hardhat ignition verify chain-{chainId} --network {network}

지원 Explorer:
- Polygonscan (Polygon Amoy, Mainnet)
- Etherscan (Sepolia, Mainnet)
- BSCScan (BNB Testnet, Mainnet)

## Specifications (상세 명세)

### 디렉토리 구조

배포 후 Ignition이 자동 생성하는 구조:
```
contracts/ignition/deployments/
├── chain-31337/                 # Hardhat Local
│   ├── deployed_addresses.json
│   ├── journal.jsonl
│   ├── artifacts/
│   └── build-info/
├── chain-80002/                 # Polygon Amoy (배포 후 생성)
│   ├── deployed_addresses.json
│   ├── journal.jsonl
│   ├── artifacts/
│   └── build-info/
├── chain-137/                   # Polygon Mainnet (배포 후 생성)
├── chain-11155111/              # Ethereum Sepolia (배포 후 생성)
├── chain-1/                     # Ethereum Mainnet (배포 후 생성)
├── chain-97/                    # BNB Chain Testnet (배포 후 생성)
└── chain-56/                    # BNB Chain Mainnet (배포 후 생성)
```

### hardhat.config.ts 네트워크 설정

```typescript
networks: {
  // Local
  hardhat: {
    chainId: 31337,
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },

  // Testnet
  polygonAmoy: {
    url: process.env.POLYGON_AMOY_RPC || "https://rpc-amoy.polygon.technology",
    chainId: 80002,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
    chainId: 11155111,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
  bscTestnet: {
    url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
    chainId: 97,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },

  // Mainnet
  polygon: {
    url: process.env.POLYGON_RPC || "https://polygon-rpc.com",
    chainId: 137,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
  mainnet: {
    url: process.env.MAINNET_RPC || "https://eth.drpc.org",
    chainId: 1,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
  bsc: {
    url: process.env.BSC_RPC || "https://bsc-dataseed.binance.org",
    chainId: 56,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  },
},

etherscan: {
  apiKey: {
    polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    polygon: process.env.POLYGONSCAN_API_KEY || "",
    sepolia: process.env.ETHERSCAN_API_KEY || "",
    mainnet: process.env.ETHERSCAN_API_KEY || "",
    bscTestnet: process.env.BSCSCAN_API_KEY || "",
    bsc: process.env.BSCSCAN_API_KEY || "",
  },
  customChains: [
    {
      network: "polygonAmoy",
      chainId: 80002,
      urls: {
        apiURL: "https://api-amoy.polygonscan.com/api",
        browserURL: "https://amoy.polygonscan.com",
      },
    },
  ],
},
```

### 배포 흐름

1. 환경변수 설정 (.env)
2. 배포 명령 실행: `pnpm hardhat ignition deploy ignition/modules/PaymentGateway.ts --network polygonAmoy`
3. Ignition이 자동으로:
   - 컨트랙트 배포
   - `ignition/deployments/chain-80002/` 디렉토리 생성
   - `deployed_addresses.json` 생성
   - `journal.jsonl`에 트랜잭션 기록
4. Verify 실행: `pnpm hardhat ignition verify chain-80002 --network polygonAmoy`

### 다른 서비스에서 주소 참조

Subgraph, Pay-Server 등에서 배포 주소 참조 방법:

경로: `contracts/ignition/deployments/chain-{chainId}/deployed_addresses.json`

주소 키 매핑:
- Forwarder: `PaymentGateway#ERC2771Forwarder`
- Gateway Proxy: `PaymentGateway#PaymentGatewayProxy`
- Gateway Implementation: `PaymentGateway#PaymentGatewayV1`
- Mock Token: `PaymentGateway#MockERC20`

## 환경 변수

```bash
# 필수
PRIVATE_KEY=0x...                    # 배포자 개인키

# RPC URL (선택 - 없으면 Public RPC 사용)
POLYGON_AMOY_RPC=https://...         # Polygon Amoy
POLYGON_RPC=https://...              # Polygon Mainnet
SEPOLIA_RPC=https://...              # Ethereum Sepolia
MAINNET_RPC=https://...              # Ethereum Mainnet
BSC_TESTNET_RPC=https://...          # BNB Chain Testnet
BSC_RPC=https://...                  # BNB Chain Mainnet

# Block Explorer API Keys (verify용)
POLYGONSCAN_API_KEY=...
ETHERSCAN_API_KEY=...
BSCSCAN_API_KEY=...
```

## 보안 고려사항

### 개인키 관리

- PRIVATE_KEY는 .env 파일에만 저장
- .env 파일은 .gitignore에 포함
- CI/CD에서는 GitHub Secrets 또는 환경변수 사용
- Mainnet 배포 시 Hardware Wallet 사용 권장

### 배포 검증

- Testnet에서 충분한 테스트 후 Mainnet 배포
- 배포 후 Block Explorer에서 verify 확인
- journal.jsonl로 배포 히스토리 추적

### RPC 보안

- Production 환경에서는 유료 RPC Provider 권장
- Public RPC는 rate limit 및 안정성 이슈 가능
- RPC URL에 API 키가 포함된 경우 환경변수로 관리

## 범위 외 (Out of Scope)

- 프록시 업그레이드 메커니즘 (별도 SPEC 필요)
- 멀티시그 배포 (추후 고려)
- 자동 가스 가격 최적화
- 배포 롤백 메커니즘
- 커스텀 배포 주소 저장소 (Ignition 기본 사용)

## 기술적 의존성

### 내부 의존성

- contracts/ignition/modules/PaymentGateway.ts: 기존 Ignition 모듈
- contracts/src/: 스마트 컨트랙트 소스코드

### 외부 의존성

- hardhat: ^2.22.0
- @nomicfoundation/hardhat-toolbox: ^5.0.0
- @nomicfoundation/hardhat-ignition: ^0.15.0
- @openzeppelin/hardhat-upgrades: ^3.0.0
- dotenv: ^16.0.0

## 관련 문서

- SPEC-RELAY-001: Gasless 트랜잭션 시스템
- SPEC-SUBGRAPH-001: Subgraph 연동
- contracts/ignition/modules/PaymentGateway.ts

## Traceability

- REQ-001 → contracts/ignition/deployments/chain-{chainId}/
- REQ-002 → contracts/hardhat.config.ts
- REQ-003 → contracts/package.json (scripts)
- REQ-004 → hardhat ignition verify 명령

## 변경 이력

### v1.3.0 (2025-12-12)

- SPEC 상태 completed로 변경
- Polygon Amoy 배포 완료
- Etherscan API v2 단일 키 방식으로 구현 단순화
- 동적 RPC_URL/CHAIN_ID 환경변수 방식으로 구현

### v1.2.0 (2025-12-09)

- RPC Provider 종속성 제거
- 환경변수명을 현재 config와 일치하도록 수정 (POLYGON_AMOY_RPC 등)
- Public RPC fallback URL 추가
- 모든 네트워크에 일관된 fallback 패턴 적용
- 외부 의존성 목록 현재 package.json과 일치하도록 수정

### v1.1.0 (2025-12-09)

- 커스텀 배포 저장소 제거
- Hardhat Ignition 기본 구조 활용으로 변경
- deployed_addresses.json 스키마를 Ignition 기본 형식으로 변경
- 배포 명령어를 Ignition 기본 명령어로 통일

### v1.0.0 (2025-12-09)

- 초기 문서 작성
- 6개 체인 지원 정의
- 배포 인프라 구조 설계
