# SPEC-RELAY-001: 구현 계획

## TAG BLOCK

- SPEC-ID: SPEC-RELAY-001
- Document: Implementation Plan
- Version: 2.0
- Created: 2025-12-01
- Updated: 2025-12-01

## 구현 개요

OZ Defender SDK와 100% 호환되는 MockDefender 패키지를 별도 패키지로 구현합니다. import 문 변경만으로 로컬/프로덕션 환경을 전환할 수 있도록 설계합니다.

## 마일스톤

### Milestone 1: mock-defender 패키지 생성 (Primary Goal)

목표: 독립적인 mock-defender 패키지 구조 생성

#### Task 1.1: 패키지 초기화

파일 위치: packages/mock-defender/

구현 내용:
- package.json 생성 (name: mock-defender, version: 0.1.0)
- tsconfig.json 생성 (strict mode, declaration 활성화)
- vitest.config.ts 생성
- pnpm-workspace.yaml에 패키지 등록

#### Task 1.2: 타입 정의

파일 위치: packages/mock-defender/src/types.ts

구현 내용:
- RelayerTransactionResponse 인터페이스 (OZ Defender SDK 호환)
- RelayerGetTxResponse 인터페이스
- RelayerParams 인터페이스
- Speed 타입 정의 ('safeLow', 'average', 'fast', 'fastest')

### Milestone 2: MockDefender 구현 (Secondary Goal)

목표: OZ Defender SDK와 동일한 인터페이스를 가진 Mock 클래스 구현

#### Task 2.1: MockRelaySigner 클래스 생성

파일 위치: packages/mock-defender/src/relay-signer.ts

구현 내용:
- viem walletClient 초기화 (환경변수에서 private key 사용)
- viem publicClient 초기화 (환경변수에서 RPC URL 사용)
- 인메모리 트랜잭션 저장소 (Map<string, TransactionRecord>)

#### Task 2.2: sendTransaction 구현

구현 내용:
- UUID 기반 transactionId 생성
- walletClient.sendTransaction() 호출
- 트랜잭션 정보를 인메모리 Map에 저장
- RelayerTransactionResponse 형식으로 결과 반환

#### Task 2.3: getTransaction 구현

구현 내용:
- 인메모리 Map에서 트랜잭션 조회
- publicClient.getTransactionReceipt() 호출
- 상태 매핑 및 업데이트
- RelayerGetTxResponse 형식으로 반환

#### Task 2.4: getRelayer 구현

구현 내용:
- 환경변수에서 RELAYER_ADDRESS 읽기
- 릴레이어 정보 반환

#### Task 2.5: MockDefender 클래스 생성

파일 위치: packages/mock-defender/src/mock-defender.ts

구현 내용:
- constructor(credentials): 파라미터 수용 (내부적으로 무시)
- relaySigner 속성: MockRelaySigner 인스턴스 제공
- OZ Defender SDK의 Defender 클래스와 동일한 구조

### Milestone 3: 통합 및 테스트 (Final Goal)

목표: DefenderService에서 MockDefender 사용 및 테스트

#### Task 3.1: DefenderService import 변경

파일 위치: packages/server/src/services/defender.service.ts

구현 내용:
- import 문만 변경 (1줄)
- 나머지 코드 변경 없음

변경 전:
```typescript
import { Defender } from '@openzeppelin/defender-sdk';
```

변경 후:
```typescript
import { MockDefender as Defender } from 'mock-defender';
```

#### Task 3.2: Docker Compose 환경 변수 추가

파일 위치: docker/docker-compose.yml

구현 내용:
- RELAYER_PRIVATE_KEY: Hardhat Account #0 키 추가
- RELAYER_ADDRESS: Hardhat Account #0 주소 추가
- RPC_URL: http://hardhat:8545 추가

### Milestone 4: 테스트 작성 (Quality Gate)

목표: MockDefender의 안정성 검증을 위한 테스트 코드 작성

#### Task 4.1: 단위 테스트 작성

파일 위치: packages/mock-defender/tests/mock-defender.test.ts

테스트 케이스:
- MockDefender 초기화 검증
- sendTransaction 성공 케이스
- sendTransaction 실패 케이스 (잘못된 데이터)
- getTransaction 존재하는 트랜잭션
- getTransaction 존재하지 않는 트랜잭션
- getRelayer 정보 반환
- OZ Defender SDK와 동일한 응답 형식 검증

## 기술적 접근 방식

### OZ Defender SDK 호환 설계

- Defender 클래스와 동일한 constructor 시그니처
- relaySigner 속성과 동일한 메서드 시그니처
- 동일한 응답 타입 (RelayerTransactionResponse 등)

### 의존성 주입 패턴

- 환경 변수 기반 설정 (RELAYER_PRIVATE_KEY, RPC_URL)
- 테스트 시 Mock 주입 용이

### 에러 처리 전략

- OZ Defender SDK와 유사한 에러 메시지 형식
- 사용자 친화적 한글 에러 메시지
- 로깅을 통한 디버깅 지원

## 아키텍처 설계

### 파일 구조

```
packages/mock-defender/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # export { MockDefender, MockRelaySigner }
│   ├── mock-defender.ts      # MockDefender 클래스
│   ├── relay-signer.ts       # MockRelaySigner 클래스
│   └── types.ts              # 타입 정의
└── tests/
    └── mock-defender.test.ts
```

### 의존성 관계

```
packages/server/src/services/defender.service.ts
    └── import { MockDefender as Defender } from 'mock-defender'
            └── packages/mock-defender/src/index.ts
                    ├── MockDefender (mock-defender.ts)
                    └── MockRelaySigner (relay-signer.ts)
                            └── viem (walletClient, publicClient)
```

## 리스크 및 대응 방안

### 리스크 1: OZ Defender SDK 타입 호환성

위험: SDK 업데이트 시 타입 불일치 발생 가능
대응: SDK 버전 고정 및 타입 테스트 작성

### 리스크 2: viem 버전 호환성

위험: viem API 변경으로 인한 구현 차이
대응: 현재 사용 중인 viem 버전(2.21.x) 기준 구현

### 리스크 3: Hardhat 노드 연결 불안정

위험: Docker 네트워크 환경에서 연결 지연
대응: 재시도 로직 및 연결 상태 확인 구현

## 구현 순서 권장사항

권장 구현 순서:
1. Task 1.1, 1.2: 패키지 및 타입 정의 (기반 작업)
2. Task 2.1-2.5: MockRelaySigner, MockDefender 구현 (핵심 기능)
3. Task 4.1: 테스트 작성 (품질 검증)
4. Task 3.1, 3.2: 통합 및 환경 설정 (최종 적용)

## 검증 체크리스트

기능 검증:
- MockDefender가 OZ Defender SDK와 동일한 인터페이스 제공
- sendTransaction으로 Hardhat에 트랜잭션 제출 성공
- getTransaction으로 상태 조회 정확성 확인

통합 검증:
- Docker Compose 환경에서 전체 플로우 테스트
- Hardhat 노드와 서버 간 통신 확인
- DefenderService import 변경만으로 동작 확인
