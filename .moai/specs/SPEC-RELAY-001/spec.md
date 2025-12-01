# SPEC-RELAY-001: Mock OZ Defender 패키지 구현

## TAG BLOCK

- SPEC-ID: SPEC-RELAY-001
- Title: Docker Compose 환경을 위한 Mock OZ Defender 패키지 구현
- Status: Draft
- Priority: High
- Created: 2025-12-01
- Author: System Architect

## 개요

Docker Compose 개발 환경에서 OZ Defender SDK와 100% 동일한 인터페이스로 동작하는 Mock Defender 패키지를 구현합니다. 별도의 `packages/mock-defender` 패키지로 분리하여 import 문 변경만으로 로컬/프로덕션 환경을 전환할 수 있도록 합니다.

## 배경 및 동기

### 현재 상태

현재 MSQPay 서버는 OZ Defender SDK를 사용하는 DefenderService를 통해 Gasless 트랜잭션을 처리합니다. Docker Compose 로컬 개발 환경에서는 Defender API 연결이 불가능하여 릴레이 기능 테스트에 제약이 있습니다.

### 해결 목표

- OZ Defender SDK와 동일한 인터페이스를 제공하는 Mock 패키지 구현
- 별도 패키지(`packages/mock-defender`)로 분리하여 독립성 확보
- viem을 사용하여 Hardhat 노드에 실제 트랜잭션 제출
- import 문만 변경하면 프로덕션 전환 가능 (환경변수 분기 불필요)

## Environment (환경)

### 시스템 환경

- Runtime: Node.js 20 LTS
- Framework: Fastify
- Blockchain: Hardhat Local Node (chainId: 31337)
- Container: Docker Compose

### 기술 스택

- viem: Ethereum 클라이언트 라이브러리
- TypeScript: 타입 안전성 보장
- Hardhat: 로컬 블록체인 및 테스트 계정 제공

### 의존성

- viem ^2.x (walletClient, publicClient)
- OZ Defender SDK 타입 호환성 유지

## Assumptions (가정)

### 기술적 가정

- Hardhat 노드가 Docker Compose 환경에서 8545 포트로 접근 가능합니다
- Hardhat의 첫 번째 계정(Account #0)에 충분한 ETH가 있습니다
- 로컬 환경에서는 트랜잭션 확인 시간이 매우 짧습니다(< 1초)

### 운영 가정

- MockDefender는 개발/테스트 환경에서만 사용됩니다
- 프로덕션 환경에서는 실제 OZ Defender SDK를 사용합니다
- 환경 전환은 import 문 변경으로만 이루어집니다

## Requirements (요구사항)

### REQ-001: MockDefender 클래스 구현

EARS 형식: **When** 로컬 개발 환경에서 Gasless 트랜잭션이 필요할 때, **the system shall** OZ Defender SDK의 Defender 클래스와 동일한 인터페이스를 가진 MockDefender 클래스를 제공하여 **so that** 기존 DefenderService 코드 변경 없이 사용할 수 있습니다.

MockDefender 구조:
- constructor(credentials): API 키/시크릿 파라미터 수용 (내부적으로 무시)
- relaySigner 속성: MockRelaySigner 인스턴스 제공

### REQ-002: MockRelaySigner 구현

EARS 형식: **When** MockDefender.relaySigner가 호출될 때, **the system shall** OZ Defender SDK의 relaySigner와 동일한 메서드를 제공합니다.

구현 메서드:
- sendTransaction(tx): viem walletClient로 실제 트랜잭션 제출
- getTransaction(id): 트랜잭션 상태 조회
- getRelayer(): 릴레이어 정보 반환

### REQ-003: 타입 호환성

EARS 형식: **When** MockDefender 패키지를 사용할 때, **the system shall** OZ Defender SDK와 동일한 타입을 제공하여 **so that** TypeScript 타입 검사를 통과합니다.

호환 타입:
- RelayerTransactionResponse (transactionId, hash, status)
- RelayerGetTxResponse
- Speed ('safeLow', 'average', 'fast', 'fastest')

### REQ-004: 인메모리 상태 관리

EARS 형식: **When** 트랜잭션이 제출될 때, **the system shall** 트랜잭션 정보를 인메모리 Map에 저장하여 **so that** getTransaction() 호출 시 상태를 조회할 수 있습니다.

저장 정보:
- transactionId (UUID 생성)
- hash (트랜잭션 해시)
- status (pending, mined, confirmed, failed)
- submittedAt (타임스탬프)

### REQ-005: Docker Compose 환경 설정

EARS 형식: **When** Docker Compose로 서비스를 실행할 때, **the system shall** server 컨테이너에 MockDefender용 환경 변수를 설정합니다.

환경 변수:
- RELAYER_PRIVATE_KEY: Hardhat Account #0 private key
- RELAYER_ADDRESS: Hardhat Account #0 주소
- RPC_URL: Hardhat 노드 URL

## Specifications (상세 명세)

### 패키지 구조

```
packages/mock-defender/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # MockDefender export
│   ├── mock-defender.ts      # MockDefender 클래스
│   ├── relay-signer.ts       # MockRelaySigner 클래스
│   └── types.ts              # 타입 정의
└── tests/
    └── mock-defender.test.ts
```

### 사용 패턴 (OZ Defender SDK와 동일)

```typescript
// 프로덕션 환경
import { Defender } from '@openzeppelin/defender-sdk';

// 로컬 개발 환경
import { MockDefender as Defender } from 'mock-defender';

// DefenderService 코드는 동일하게 동작
const client = new Defender({ relayerApiKey, relayerApiSecret });
const result = await client.relaySigner.sendTransaction({ to, data });
```

### 상태 매핑

MockRelaySigner의 상태 매핑:
- 트랜잭션 제출 직후: 'pending'
- receipt.status === 'success': 'mined'
- confirmations >= 1: 'confirmed'
- receipt.status === 'reverted': 'failed'

### 에러 처리

MockRelaySigner 에러 시나리오:
- RPC 연결 실패: "로컬 블록체인에 연결할 수 없습니다"
- 잔액 부족: "릴레이어 잔액이 부족합니다"
- 트랜잭션 실패: "트랜잭션 실행에 실패했습니다"

## 범위 외 (Out of Scope)

- OpenGSN 통합 (향후 SPEC으로 분리)
- 메타트랜잭션 서명 검증 로직
- 영구 저장소 기반 트랜잭션 상태 관리
- 릴레이어 잔액 자동 충전
- 런타임 환경변수 기반 전환 (import로 전환)

## 기술적 의존성

### 내부 의존성

- packages/server/src/services/defender.service.ts: MockDefender 사용 위치

### 외부 의존성

- viem: ^2.21.0 이상 (현재 프로젝트에서 사용 중)
- Hardhat 노드: 로컬 블록체인 제공

## 관련 문서

- SPEC-API-001: MSQPay API 서버 구현
- SPEC-SERVER-001: Payment Server 초기 설정
- docker/docker-compose.yml: 컨테이너 오케스트레이션 설정

## Traceability

- REQ-001 → packages/mock-defender/src/mock-defender.ts
- REQ-002 → packages/mock-defender/src/relay-signer.ts
- REQ-003 → packages/mock-defender/src/types.ts
- REQ-004 → packages/mock-defender/src/relay-signer.ts (transactions Map)
- REQ-005 → docker/docker-compose.yml
