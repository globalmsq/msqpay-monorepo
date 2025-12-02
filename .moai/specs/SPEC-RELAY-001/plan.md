# SPEC-RELAY-001: 구현 계획

## TAG BLOCK

- SPEC-ID: SPEC-RELAY-001
- Document: Implementation Plan
- Version: 4.1.0
- Created: 2025-12-01
- Updated: 2025-12-02
- Status: Completed

## 구현 개요

OZ Defender API 호환 HTTP 서비스 기반의 Gasless 트랜잭션 시스템을 구현합니다. 모든 환경에서 동일한 HTTP 클라이언트 코드를 사용하며, `DEFENDER_API_URL` 환경변수만 변경하여 환경을 전환합니다.

### 핵심 아키텍처 변경 (v3.0.0 → v4.0.0)

이전 아키텍처 (v3.0.0):
- USE_MOCK_DEFENDER 환경변수로 분기
- RelayFactory를 통한 서비스 선택
- MockDefender: 인프로세스 라이브러리
- Production과 Local 코드 경로 분리

새로운 아키텍처 (v4.0.0):
- DEFENDER_API_URL 환경변수로 통일
- RelayFactory 제거
- SimpleDefender: 독립 HTTP 서비스 (Docker 컨테이너)
- Production과 Local 동일한 코드 경로

## 완료된 마일스톤

### Milestone 1: SimpleDefender HTTP 서비스 전환

목표: SimpleDefender를 인프로세스 라이브러리에서 독립 HTTP 서비스로 전환

완료된 작업:

Task 1.1: HTTP 서버 구현
- 파일: packages/simple-defender/src/server.ts
- Fastify 기반 HTTP 서버
- 포트 3001에서 실행

Task 1.2: Relay 엔드포인트 구현
- 파일: packages/simple-defender/src/routes/relay.routes.ts
- POST /relay: 트랜잭션 제출
- GET /relay/:id: 트랜잭션 상태 조회
- GET /relayer: Relayer 정보 조회
- GET /nonce/:address: Nonce 조회

Task 1.3: Health 엔드포인트 구현
- 파일: packages/simple-defender/src/routes/health.routes.ts
- GET /health: 헬스체크
- GET /ready: 준비 상태 확인

Task 1.4: RelayService 구현
- 파일: packages/simple-defender/src/services/relay.service.ts
- viem walletClient/publicClient 사용
- 트랜잭션 제출 및 상태 추적

Task 1.5: Dockerfile 통합
- 파일: docker/Dockerfile.packages (simple-defender target 추가)
- Node.js 20 Alpine 기반
- 통합 멀티스테이지 빌드

### Milestone 2: DefenderService HTTP 클라이언트 전환

목표: DefenderService를 OZ SDK 기반에서 HTTP 클라이언트로 전환

완료된 작업:

Task 2.1: HTTP 클라이언트 구현
- 파일: packages/pay-server/src/services/defender.service.ts
- fetch API 사용
- constructor(apiUrl, apiKey, apiSecret, relayerAddress)

Task 2.2: API 메서드 구현
- submitGaslessTransaction(): POST /relay
- getRelayStatus(): GET /relay/:id
- checkRelayerHealth(): GET /relayer

Task 2.3: 상태 매핑 구현
- OZ Defender 상태를 내부 상태로 매핑
- pending, sent, submitted → pending
- mined, confirmed, failed → 그대로 유지

### Milestone 3: Docker Compose 설정 업데이트

목표: SimpleDefender를 별도 컨테이너로 실행하고 서비스 간 연결 설정

완료된 작업:

Task 3.1: simple-defender 서비스 추가
- 파일: docker/docker-compose.yml
- 포트: 3002:3001 (외부:내부)
- 의존성: hardhat
- 환경변수: RELAYER_PRIVATE_KEY, RPC_URL, CHAIN_ID, FORWARDER_ADDRESS

Task 3.2: server 서비스 업데이트
- DEFENDER_API_URL=http://simple-defender:3001
- RELAYER_ADDRESS 환경변수 추가
- simple-defender 의존성 추가

### Milestone 4: 불필요 코드 삭제

목표: v3.0.0 아키텍처의 레거시 코드 제거

완료된 작업:

Task 4.1: RelayFactory 삭제
- 삭제된 파일: packages/pay-server/src/services/relay.factory.ts
- 삭제된 파일: packages/pay-server/src/services/__tests__/relay.factory.test.ts

Task 4.2: SimpleDefender 라이브러리 파일 삭제
- 삭제된 파일: packages/simple-defender/src/mock-defender.ts
- 삭제된 파일: packages/simple-defender/src/relay-signer.ts
- 삭제된 파일: packages/simple-defender/src/types.ts
- 삭제된 파일: packages/simple-defender/src/mock-defender.test.ts
- 삭제된 파일: packages/simple-defender/src/relay-signer.test.ts

Task 4.3: OZ Defender SDK 의존성 제거
- 파일: packages/pay-server/package.json
- @openzeppelin/defender-sdk 삭제

### Milestone 5: 테스트 및 검증

목표: 전환된 아키텍처의 정상 동작 확인

완료된 작업:

Task 5.1: SimpleDefender 테스트 작성
- 파일: packages/simple-defender/tests/relay.service.test.ts
- RelayService 단위 테스트
- 10개 테스트 통과

Task 5.2: DefenderService 테스트 업데이트
- 파일: packages/pay-server/tests/services/defender.service.test.ts
- fetch mock 기반 테스트
- HTTP 클라이언트 동작 검증

Task 5.3: 전체 테스트 실행
- packages/pay-server: 169개 테스트 통과
- packages/simple-defender: 10개 테스트 통과

### Milestone 6: Nonce 직접 조회 리팩토링 (v4.1.0)

목표: Next.js API 캐싱 이슈 해결을 위해 프론트엔드에서 nonce를 컨트랙트에서 직접 조회

완료된 작업:

Task 6.1: PaymentModal에 wagmi useReadContract 추가
- 파일: apps/demo/src/components/PaymentModal.tsx
- FORWARDER_ABI 상수 추가 (nonces 함수)
- useReadContract 훅으로 Forwarder nonce 조회
- refetchNonce()로 결제 시 fresh nonce 보장

Task 6.2: API에서 nonce 조회 함수 제거
- 파일: apps/demo/src/lib/api.ts
- getForwarderNonce 함수 삭제
- ForwarderNonceResponseSchema 삭제

Task 6.3: Next.js API route 삭제
- 삭제된 파일: apps/demo/src/app/api/forwarder/nonce/[address]/route.ts
- 캐싱 이슈 원인 제거

Task 6.4: pay-server nonce 엔드포인트 삭제
- 삭제된 파일: packages/pay-server/src/routes/forwarder/nonce.ts
- 파일: packages/pay-server/src/index.ts에서 nonce route 제거

## 아키텍처 설계

### 최종 패키지 구조

```
packages/
├── simple-defender/                  # SimpleDefender HTTP 서비스
│   ├── package.json
│   ├── Dockerfile
│   ├── vitest.config.ts
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

### 데이터 흐름

```
클라이언트
    │
    │ POST /api/payments/gasless
    ▼
Payment Server (DefenderService)
    │
    │ HTTP POST /relay
    ▼
SimpleDefender (Local) 또는 OZ Defender API (Production)
    │
    │ Forwarder.execute() 또는 OZ Relay
    ▼
ERC2771Forwarder
    │
    │ 트랜잭션 실행
    ▼
PaymentGatewayV1 (_msgSender() = 사용자 주소)
```

### 환경 변수

Local 환경 (Docker Compose):
- DEFENDER_API_URL=http://simple-defender:3001
- DEFENDER_API_KEY= (빈 값)
- DEFENDER_API_SECRET= (빈 값)
- RELAYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

Production 환경:
- DEFENDER_API_URL=https://api.defender.openzeppelin.com
- DEFENDER_API_KEY=<OZ Defender API 키>
- DEFENDER_API_SECRET=<OZ Defender API 시크릿>
- RELAYER_ADDRESS=<OZ Defender Relayer 주소>

SimpleDefender 서비스 환경 변수:
- RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
- RPC_URL=http://hardhat:8545
- CHAIN_ID=31337
- FORWARDER_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

## 검증 체크리스트

기능 검증:
- SimpleDefender HTTP 서비스 정상 시작 확인
- POST /relay 트랜잭션 제출 성공
- GET /relay/:id 상태 조회 성공
- GET /relayer Relayer 정보 조회 성공
- DefenderService HTTP 클라이언트 정상 동작
- 상태 매핑 정확성 확인

통합 검증:
- Docker Compose 환경에서 전체 플로우 동작
- Payment Server → SimpleDefender 통신 성공
- SimpleDefender → Hardhat 노드 통신 성공

테스트 검증:
- packages/pay-server: 169개 테스트 통과
- packages/simple-defender: 10개 테스트 통과
- TypeScript 컴파일 에러 없음

## 변경 이력

### v4.1.0 (2025-12-02)
- Milestone 6: Nonce 직접 조회 리팩토링 완료
- wagmi useReadContract로 Forwarder nonce 직접 조회
- Next.js API route 및 pay-server nonce 엔드포인트 제거
- API 캐싱 이슈 해결 (stale nonce → fresh nonce)

### v4.0.0 (2025-12-02)
- SimpleDefender를 독립 HTTP 서비스로 전환
- DefenderService를 HTTP 클라이언트로 변경
- Docker Compose 설정 업데이트
- USE_MOCK_DEFENDER 환경변수 제거
- RelayFactory 제거
- @openzeppelin/defender-sdk 의존성 제거
- 전체 테스트 통과 확인

### v3.0.0 (2025-12-01)
- 환경별 하이브리드 아키텍처 구현
- MockDefender 인프로세스 라이브러리 구현
- RelayFactory를 통한 서비스 선택
