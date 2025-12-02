# SPEC-RELAY-001: OZ Defender 호환 Gasless 트랜잭션 시스템

## TAG BLOCK

- SPEC-ID: SPEC-RELAY-001
- Title: OZ Defender API 호환 Gasless 트랜잭션 시스템 구현
- Status: Implemented
- Priority: High
- Version: 4.1.0
- Created: 2025-12-01
- Updated: 2025-12-02
- Author: System Architect

## 개요

ERC2771Forwarder 컨트랙트와 EIP-712 서명을 활용한 Gasless 트랜잭션 시스템을 구현합니다. 모든 환경에서 동일한 HTTP API 기반 아키텍처를 사용하며, 환경변수 `DEFENDER_API_URL`만 변경하여 Local과 Production 환경을 전환합니다.

### 핵심 설계 원칙

Production과 Local 환경이 동일한 아키텍처를 유지합니다:
- 동일한 HTTP API 인터페이스
- 동일한 Payment Server 코드
- 환경변수 URL만 변경

### 환경별 아키텍처

Local (Docker Compose) 환경:
- Relay 서비스: SimpleDefender HTTP 서비스 (Docker 컨테이너)
- API URL: http://simple-defender:3001
- Forwarder: ERC2771Forwarder (Hardhat 배포)

Production (Testnet/Mainnet) 환경:
- Relay 서비스: OZ Defender API
- API URL: https://api.defender.openzeppelin.com
- Forwarder: ERC2771Forwarder (네트워크별 배포)

## 배경 및 동기

### 이전 아키텍처 (v3.0.0)

이전 버전에서는 환경에 따라 다른 코드 경로를 사용했습니다:
- USE_MOCK_DEFENDER=true: 인프로세스 MockDefender 라이브러리
- USE_MOCK_DEFENDER=false: OZ Defender SDK
- RelayFactory를 통한 환경별 분기

문제점:
- Production과 Local 환경의 코드 경로가 다름
- 테스트 환경과 프로덕션 환경의 동작 차이 가능
- 환경별 분기 로직으로 인한 복잡성 증가

### 새로운 아키텍처 (v4.0.0)

모든 환경에서 동일한 HTTP 클라이언트 기반 구조를 사용합니다:
- DefenderService가 HTTP fetch를 통해 Relay API와 통신
- SimpleDefender가 OZ Defender API 호환 HTTP 엔드포인트 제공
- DEFENDER_API_URL 환경변수만 변경하여 환경 전환

장점:
- Production/Local 환경 동일한 코드 경로
- 테스트와 프로덕션 동작 일관성 보장
- 환경별 분기 로직 제거로 단순화
- Mock 서비스의 독립적 테스트 가능

## Environment (환경)

### 시스템 환경

- Runtime: Node.js 20 LTS
- Framework: Fastify (Server, MockDefender)
- Blockchain:
  - Local: Hardhat Node (chainId: 31337)
  - Testnet: Polygon Amoy (chainId: 80002)
  - Mainnet: Polygon (chainId: 137)
- Container: Docker Compose

### 기술 스택

- viem: Ethereum 클라이언트 및 트랜잭션 처리
- TypeScript: 타입 안전성 보장
- Hardhat: 로컬 블록체인 및 ERC2771Forwarder 배포
- fetch API: HTTP 클라이언트 (네이티브 Node.js)

### 스마트 컨트랙트

- ERC2771Forwarder: OpenZeppelin 표준 Forwarder 컨트랙트
- PaymentGatewayV1: ERC2771ContextUpgradeable 상속 (_msgSender() 사용)

### 의존성

- viem ^2.x (walletClient, publicClient, 트랜잭션 처리)
- @openzeppelin/contracts (ERC2771Forwarder ABI)
- fastify ^5.x (MockDefender HTTP 서버)

## Assumptions (가정)

### 기술적 가정

- ERC2771Forwarder 컨트랙트가 각 네트워크에 배포되어 있습니다
  - Local: Hardhat 배포 (주소: 0x5FbDB2315678afecb367f032d93F642f64180aa3)
  - Testnet/Mainnet: 별도 배포 필요
- PaymentGatewayV1이 ERC2771ContextUpgradeable을 상속하고 trustedForwarder가 설정되어 있습니다
- SimpleDefender가 OZ Defender API와 동일한 HTTP 인터페이스를 제공합니다

### 운영 가정

- 환경별 API URL 설정:
  - Local: DEFENDER_API_URL=http://simple-defender:3001
  - Production: DEFENDER_API_URL=https://api.defender.openzeppelin.com
- Relayer 지갑에 가스비 지불을 위한 충분한 ETH/MATIC이 있습니다
- Production 환경에서는 OZ Defender API 키가 필요합니다

## Requirements (요구사항)

### REQ-001: SimpleDefender HTTP 서비스

EARS 형식: **When** Local 환경에서 Gasless 트랜잭션이 요청될 때, **the system shall** SimpleDefender HTTP 서비스를 통해 트랜잭션을 처리하여 **so that** OZ Defender API 없이도 동일한 인터페이스로 개발 및 테스트가 가능합니다.

SimpleDefender HTTP 엔드포인트:
- POST /relay: 트랜잭션 제출
- GET /relay/:id: 트랜잭션 상태 조회
- GET /relayer: Relayer 정보 조회
- GET /health: 헬스체크
- GET /ready: 준비 상태 확인

참고: Nonce 조회는 프론트엔드에서 wagmi useReadContract를 통해 ERC2771Forwarder 컨트랙트에서 직접 읽습니다. 이를 통해 API 캐싱 이슈 없이 항상 최신 nonce를 보장합니다.

### REQ-002: DefenderService HTTP 클라이언트

EARS 형식: **When** Gasless 트랜잭션이 요청될 때, **the system shall** HTTP fetch를 통해 Relay API와 통신하여 **so that** 모든 환경에서 동일한 코드 경로를 사용합니다.

DefenderService 구조:
- constructor(apiUrl, apiKey, apiSecret, relayerAddress)
- submitGaslessTransaction(): HTTP POST /relay 호출
- getRelayStatus(): HTTP GET /relay/:id 호출
- checkRelayerHealth(): HTTP GET /relayer 호출

### REQ-003: 환경 통일

EARS 형식: **When** 서버가 시작될 때, **the system shall** DEFENDER_API_URL 환경변수만으로 환경을 전환하여 **so that** 환경별 분기 로직 없이 동일한 코드로 모든 환경을 지원합니다.

환경 전환 방식:
- DEFENDER_API_URL=http://simple-defender:3001 (Local)
- DEFENDER_API_URL=https://api.defender.openzeppelin.com (Production)
- USE_MOCK_DEFENDER 환경변수 제거
- RelayFactory 제거

### REQ-004: 트랜잭션 상태 추적

EARS 형식: **When** 트랜잭션이 제출될 때, **the system shall** 트랜잭션 상태를 추적하고 조회 API를 제공하여 **so that** 클라이언트가 트랜잭션 완료를 확인할 수 있습니다.

상태 값:
- pending: 트랜잭션 제출됨, 아직 마이닝되지 않음
- sent: 트랜잭션이 네트워크에 전송됨
- mined: 블록에 포함됨
- confirmed: 확인됨
- failed: 실패

## Specifications (상세 명세)

### 서비스 구조

```
packages/
├── simple-defender/                  # SimpleDefender HTTP 서비스
│   ├── package.json
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts                  # Export
│   │   ├── server.ts                 # Fastify 서버
│   │   ├── services/
│   │   │   └── relay.service.ts      # Relay 로직
│   │   └── routes/
│   │       ├── relay.routes.ts       # Relay 엔드포인트
│   │       └── health.routes.ts      # Health 엔드포인트
│   └── tests/
│       └── relay.service.test.ts
│
└── server/src/services/
    ├── defender.service.ts           # HTTP 클라이언트
    └── tests/
        └── defender.service.test.ts
```

### SimpleDefender HTTP API

POST /relay 요청:
- to: 대상 주소
- data: 트랜잭션 데이터
- value: ETH 값 (선택)
- gasLimit: 가스 한도
- speed: 트랜잭션 속도 (safeLow, average, fast, fastest)

POST /relay 응답:
- transactionId: 내부 트랜잭션 ID
- hash: 블록체인 트랜잭션 해시
- status: 현재 상태

GET /relay/:id 응답:
- transactionId: 트랜잭션 ID
- hash: 블록체인 트랜잭션 해시
- status: 현재 상태

GET /relayer 응답:
- address: Relayer 주소
- balance: Relayer 잔액

### DefenderService 구현

HTTP 요청 헤더:
- Content-Type: application/json
- X-Api-Key: API 키 (Production)
- X-Api-Secret: API 시크릿 (Production)

상태 매핑:
- pending, sent, submitted, inmempool → pending
- mined → mined
- confirmed → confirmed
- failed → failed

### Docker Compose 설정

simple-defender 서비스:
- 포트: 3001 (내부), 3002 (외부)
- 환경변수: RELAYER_PRIVATE_KEY, RPC_URL, CHAIN_ID, FORWARDER_ADDRESS
- 의존성: hardhat

server 서비스:
- 환경변수: DEFENDER_API_URL=http://simple-defender:3001
- 환경변수: RELAYER_ADDRESS
- 의존성: simple-defender

## API 엔드포인트

### SimpleDefender 엔드포인트

POST /relay:
- 목적: Gasless 트랜잭션 제출
- 요청: { to, data, value?, gasLimit, speed }
- 응답: { transactionId, hash, status }

GET /relay/:transactionId:
- 목적: 트랜잭션 상태 조회
- 응답: { transactionId, hash, status }

GET /relayer:
- 목적: Relayer 정보 조회
- 응답: { address, balance }

GET /health:
- 목적: 서비스 헬스체크
- 응답: { status: "ok" }

GET /ready:
- 목적: 준비 상태 확인
- 응답: { ready: true, checks: [...] }

## 보안 고려사항

### API 인증

Production 환경:
- X-Api-Key와 X-Api-Secret 헤더 필수
- OZ Defender 인증 시스템 사용

Local 환경:
- 인증 없이 접근 가능 (개발 목적)
- Docker 네트워크 내부에서만 접근

### Relayer 보안

- Relayer 개인키는 환경변수로만 전달
- Docker 컨테이너 내부에서만 사용
- 로그에 개인키 노출 방지

## 범위 외 (Out of Scope)

- 프론트엔드 EIP-712 서명 UI 구현 (별도 SPEC)
- 다중 Forwarder 지원
- Relayer 로테이션 및 부하 분산
- 가스 가격 최적화 전략
- 메타트랜잭션 수수료 모델

## 기술적 의존성

### 내부 의존성

- packages/simple-defender: SimpleDefender HTTP 서비스
- packages/pay-server/src/services/defender.service.ts: HTTP 클라이언트
- packages/contracts/src/ERC2771Forwarder.sol: Forwarder 컨트랙트

### 외부 의존성

- viem: ^2.21.0 이상
- fastify: ^5.0.0 이상
- Hardhat 노드: 로컬 블록체인 및 컨트랙트 배포

## 관련 문서

- SPEC-API-001: MSQPay API 서버 구현
- SPEC-SERVER-001: Payment Server 초기 설정
- EIP-712: Typed structured data hashing and signing
- ERC-2771: Secure Protocol for Native Meta Transactions
- docker/docker-compose.yml: 컨테이너 오케스트레이션 설정

## Traceability

- REQ-001 → packages/simple-defender/
- REQ-002 → packages/pay-server/src/services/defender.service.ts
- REQ-003 → docker/docker-compose.yml
- REQ-004 → packages/simple-defender/src/services/relay.service.ts

## 변경 이력

### v4.1.0 (2025-12-02)
- Nonce API 제거: 프론트엔드에서 wagmi useReadContract로 직접 조회
- Next.js API 캐싱 이슈 해결 (stale nonce 문제)
- API 호출 단순화: 3-hop에서 1-hop으로 (Frontend → MetaMask RPC → Contract)

### v4.0.0 (2025-12-02)
- SimpleDefender를 독립 HTTP 서비스로 전환
- USE_MOCK_DEFENDER 환경변수 제거
- RelayFactory 제거
- DEFENDER_API_URL 기반 환경 전환
- OZ Defender API 호환 HTTP 엔드포인트 구현

### v3.0.0 (2025-12-01)
- 환경별 하이브리드 아키텍처 구현
- USE_MOCK_DEFENDER 기반 환경 분기
- RelayFactory를 통한 서비스 선택
