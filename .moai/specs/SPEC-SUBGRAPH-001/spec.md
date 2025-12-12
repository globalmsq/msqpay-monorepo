# SPEC-SUBGRAPH-001: 멀티체인 Subgraph 연동

## TAG BLOCK

- SPEC-ID: SPEC-SUBGRAPH-001
- Title: 멀티체인 Subgraph 자동 구성 및 배포
- Status: draft
- Priority: High
- Version: 1.1.0
- Created: 2025-12-09
- Updated: 2025-12-09
- Author: System Architect
- Dependencies: SPEC-DEPLOY-001

## 개요

SPEC-DEPLOY-001에서 배포된 컨트랙트 주소를 자동으로 참조하여 The Graph Subgraph를 구성하고 배포하는 시스템을 구현합니다. 템플릿 기반 설정으로 멀티체인 환경에서 일관된 Subgraph 배포를 지원합니다.

### 핵심 설계 원칙

배포 주소 자동 연동:
- Hardhat Ignition 배포 결과 파일에서 주소 읽기: `contracts/ignition/deployments/chain-{chainId}/deployed_addresses.json`
- subgraph.template.yaml을 기반으로 실제 subgraph.yaml 생성
- 수동 주소 복사 제거 (DRY 원칙)

### 지원 네트워크

The Graph Hosted Service (Testnet):
- Polygon Amoy
- Ethereum Sepolia

The Graph Decentralized Network (Mainnet):
- Polygon Mainnet
- Ethereum Mainnet

별도 솔루션 필요:
- BNB Chain (The Graph 미지원, 대안 검토 필요)

## 배경 및 동기

### 현재 상태

현재 Subgraph 설정의 문제점:
- subgraph.yaml에 하드코딩된 placeholder 주소 (0x0000...)
- 컨트랙트 배포 후 수동으로 주소 업데이트 필요
- 네트워크별 별도 설정 파일 없음
- 배포 자동화 스크립트 없음

### 목표 상태

개선된 Subgraph 워크플로우:
- 컨트랙트 배포 후 자동으로 Subgraph 설정 생성
- 단일 명령어로 네트워크별 Subgraph 배포
- 배포 주소 변경 시 자동 동기화

## Environment (환경)

### 시스템 환경

- Runtime: Node.js 20 LTS
- Package Manager: pnpm
- Graph CLI: @graphprotocol/graph-cli

### 기술 스택

- The Graph: 블록체인 인덱싱 프로토콜
- AssemblyScript: Subgraph 매핑 언어
- GraphQL: 쿼리 언어

### The Graph 서비스

Hosted Service:
- 무료 Testnet 인덱싱
- 중앙화된 인프라
- 점진적 종료 예정

Decentralized Network:
- Mainnet 인덱싱
- GRT 토큰 필요
- 완전 탈중앙화

## Assumptions (가정)

### 기술적 가정

- SPEC-DEPLOY-001이 구현되어 배포 주소가 저장됩니다
- Subgraph schema와 mapping handlers가 이미 구현되어 있습니다
- The Graph CLI가 설치되어 있습니다

### 운영 가정

- The Graph Studio 계정이 생성되어 있습니다
- GRAPH_ACCESS_TOKEN이 준비되어 있습니다
- Mainnet 배포 시 충분한 GRT가 있습니다

## Requirements (요구사항)

### REQ-001: Subgraph 템플릿

EARS 형식: **When** Subgraph를 구성할 때, **the system shall** 템플릿 파일에서 실제 설정을 생성하여 **so that** 주소 변경 시 수동 업데이트가 필요 없습니다.

템플릿 변수:
- {{network}}: 네트워크 이름
- {{address}}: 컨트랙트 주소
- {{startBlock}}: 인덱싱 시작 블록

### REQ-002: 설정 생성 스크립트

EARS 형식: **When** 개발자가 configure 명령을 실행할 때, **the system shall** 배포 주소를 읽어 subgraph.yaml을 생성하여 **so that** 올바른 주소로 Subgraph가 구성됩니다.

지원 명령어:
- pnpm subgraph:configure --network polygon-amoy
- pnpm subgraph:configure --network ethereum-sepolia
- pnpm subgraph:configure --network polygon
- pnpm subgraph:configure --network ethereum

### REQ-003: Subgraph 배포 자동화

EARS 형식: **When** 개발자가 deploy 명령을 실행할 때, **the system shall** 지정된 네트워크에 Subgraph를 배포하여 **so that** 일관된 배포 프로세스가 보장됩니다.

지원 명령어:
- pnpm subgraph:deploy --network polygon-amoy
- pnpm subgraph:deploy --network ethereum-sepolia

### REQ-004: 배포 주소 동기화

EARS 형식: **When** 컨트랙트가 새로 배포될 때, **the system shall** Subgraph 설정을 자동으로 업데이트하여 **so that** 항상 최신 주소를 참조합니다.

동기화 트리거:
- 수동: pnpm subgraph:configure 명령
- 자동: 컨트랙트 배포 스크립트 후처리 (선택적)

## Specifications (상세 명세)

### 디렉토리 구조

```
subgraph/
├── subgraph.template.yaml        # 템플릿 파일
├── subgraph.yaml                 # 생성된 설정 (gitignore)
├── schema.graphql                # GraphQL 스키마 (기존)
├── src/
│   └── payment-gateway.ts        # 매핑 핸들러 (기존)
├── scripts/
│   ├── configure.ts              # 설정 생성 스크립트
│   └── deploy.ts                 # 배포 스크립트
├── networks.json                 # 네트워크별 설정
└── package.json                  # 스크립트 추가
```

### subgraph.template.yaml

```yaml
specVersion: 1.0.0
indexerHints:
  prune: auto
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum
    name: PaymentGateway
    network: {{network}}
    source:
      address: "{{gateway_address}}"
      abi: PaymentGatewayV1
      startBlock: {{start_block}}
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
        - Payment
        - PaymentStatusChange
      abis:
        - name: PaymentGatewayV1
          file: ./abis/PaymentGatewayV1.json
      eventHandlers:
        - event: PaymentCreated(indexed bytes32,indexed address,indexed address,uint256,uint256)
          handler: handlePaymentCreated
        - event: PaymentCompleted(indexed bytes32,indexed address,bytes32)
          handler: handlePaymentCompleted
        - event: PaymentRefunded(indexed bytes32,indexed address,uint256)
          handler: handlePaymentRefunded
      file: ./src/payment-gateway.ts
```

### networks.json

```json
{
  "polygon-amoy": {
    "chainId": 80002,
    "graphNetwork": "polygon-amoy",
    "service": "hosted",
    "subgraphName": "msqpay/payment-gateway-amoy"
  },
  "polygon": {
    "chainId": 137,
    "graphNetwork": "matic",
    "service": "decentralized",
    "subgraphName": "msqpay/payment-gateway-polygon"
  },
  "ethereum-sepolia": {
    "chainId": 11155111,
    "graphNetwork": "sepolia",
    "service": "hosted",
    "subgraphName": "msqpay/payment-gateway-sepolia"
  },
  "ethereum": {
    "chainId": 1,
    "graphNetwork": "mainnet",
    "service": "decentralized",
    "subgraphName": "msqpay/payment-gateway-ethereum"
  }
}
```

### configure.ts 동작

1. 네트워크 파라미터 파싱 (예: polygon-amoy)
2. networks.json에서 chainId 조회 (80002)
3. Ignition 배포 파일 읽기: `contracts/ignition/deployments/chain-{chainId}/deployed_addresses.json`
4. subgraph.template.yaml 읽기
5. 템플릿 변수 치환:
   - {{network}} → polygon-amoy
   - {{gateway_address}} → deployed_addresses["PaymentGateway#PaymentGatewayProxy"]
   - {{start_block}} → RPC로 현재 블록 조회 또는 journal.jsonl 파싱
6. subgraph.yaml 생성

Ignition deployed_addresses.json 키 매핑:
- PaymentGateway (Proxy): "PaymentGateway#PaymentGatewayProxy"
- ERC2771Forwarder: "PaymentGateway#ERC2771Forwarder"
- MockERC20 (테스트용): "PaymentGateway#MockERC20"
- Implementation: "PaymentGateway#PaymentGatewayV1"

### deploy.ts 동작

1. 네트워크 파라미터 파싱
2. subgraph.yaml 존재 확인 (없으면 configure 실행)
3. graph codegen 실행
4. graph build 실행
5. 서비스 유형에 따라 배포:
   - Hosted: graph deploy --product hosted-service
   - Decentralized: graph deploy --studio

## 환경 변수

```bash
# The Graph 배포
GRAPH_ACCESS_TOKEN=...           # Hosted Service / Studio 인증

# Subgraph 식별자 (선택적, networks.json에서 관리 가능)
SUBGRAPH_NAME_POLYGON_AMOY=msqpay/payment-gateway-amoy
SUBGRAPH_NAME_POLYGON=msqpay/payment-gateway-polygon
```

## 보안 고려사항

### 토큰 관리

- GRAPH_ACCESS_TOKEN은 .env에만 저장
- CI/CD에서는 GitHub Secrets 사용
- 토큰 주기적 로테이션

### Subgraph 접근

- 쿼리 API는 공개 (읽기 전용)
- 배포/업데이트는 인증 필요
- Decentralized Network에서는 GRT 스테이킹 필요

## BNB Chain 대안

The Graph가 BNB Chain을 공식 지원하지 않으므로 대안 검토:

옵션 A - Self-hosted Graph Node:
- 자체 Graph Node 운영
- 인프라 관리 필요

옵션 B - 대체 인덱서:
- Goldsky
- Envio
- SubQuery

옵션 C - 커스텀 인덱서:
- 직접 이벤트 리스너 구현
- Pay-Server에 통합

권장: Phase 1에서는 Polygon, Ethereum만 지원하고 BNB Chain은 추후 검토

## 범위 외 (Out of Scope)

- BNB Chain Subgraph (별도 검토 필요)
- Subgraph 업그레이드 전략
- GRT 토큰 경제 최적화
- 쿼리 성능 최적화

## 기술적 의존성

### 내부 의존성

- SPEC-DEPLOY-001: 배포 주소 저장소
- contracts/ignition/deployments/chain-{chainId}/deployed_addresses.json: Ignition 배포 주소

### 외부 의존성

- @graphprotocol/graph-cli: ^0.80.0
- @graphprotocol/graph-ts: ^0.35.0

## 관련 문서

- SPEC-DEPLOY-001: 멀티체인 배포 인프라
- subgraph/schema.graphql: 기존 스키마
- subgraph/src/payment-gateway.ts: 기존 핸들러
- The Graph 공식 문서: https://thegraph.com/docs

## Traceability

- REQ-001 → subgraph/subgraph.template.yaml
- REQ-002 → subgraph/scripts/configure.ts
- REQ-003 → subgraph/scripts/deploy.ts
- REQ-004 → configure.ts + 배포 후처리 연동

## 변경 이력

### v1.1.0 (2025-12-09)

- Hardhat Ignition 네이티브 경로로 변경
- 배포 주소 파일 경로 수정: `contracts/ignition/deployments/chain-{chainId}/deployed_addresses.json`
- Ignition 키 매핑 추가 (PaymentGateway#PaymentGatewayProxy 등)
- startBlock 조회 방법 명확화 (RPC 조회 또는 journal.jsonl 파싱)

### v1.0.0 (2025-12-09)

- 초기 문서 작성
- 템플릿 기반 Subgraph 설정 설계
- 4개 네트워크 지원 (Polygon, Ethereum)
- BNB Chain 대안 검토 포함
