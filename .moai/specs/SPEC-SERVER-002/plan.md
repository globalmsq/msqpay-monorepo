# SPEC-SERVER-002: Implementation Plan

## TAG BLOCK

```yaml
id: SPEC-SERVER-002
type: implementation-plan
phase: planning
created_at: 2025-11-29
```

---

## Overview

무상태(Stateless) 아키텍처 기반 결제 서버 구현 계획.

**핵심 원칙**:
- Contract as Source of Truth
- No Database, No Redis
- RESTful API with Fastify v5
- TDD (Test-Driven Development)

---

## Implementation Order (우선순위별 마일스톤)

### Phase 1: 프로젝트 기반 구축 (Primary Goal)

**목표**: Fastify 서버 초기 설정 및 개발 환경 구성

**Tasks**:
1. **프로젝트 구조 생성**
   - `packages/server/` 디렉토리 생성
   - `package.json` 설정 (Fastify, viem, zod, ethers, OZ Defender SDK)
   - TypeScript 설정 (`tsconfig.json`)

2. **Fastify 서버 초기화**
   - `src/app.ts`: Fastify 앱 인스턴스 생성
   - `src/server.ts`: 서버 엔트리 포인트
   - CORS, Rate Limiting 플러그인 설정

3. **개발 환경 설정**
   - `.env.example`: 환경 변수 템플릿
   - `nodemon.config.json`: Hot Reload 설정
   - ESLint + Prettier 설정

**Deliverables**:
- ✅ Fastify 서버가 로컬 3000 포트에서 실행
- ✅ TypeScript 컴파일 성공
- ✅ 헬스체크 엔드포인트 (`GET /health`) 응답

**Dependencies**: 없음

---

### Phase 2: 블록체인 클라이언트 설정 (Primary Goal)

**목표**: viem 기반 컨트랙트 연결 및 RPC 클라이언트 설정

**Tasks**:
1. **viem 클라이언트 초기화**
   - `src/blockchain/client.ts`: Public Client 생성
   - Polygon Mumbai RPC 연결
   - 재시도 로직 구현 (exponential backoff)

2. **컨트랙트 인터페이스 정의**
   - `src/blockchain/contracts/MSQPay.ts`: ABI 정의
   - `getPayment()`, `createPayment()` 함수 래핑

3. **환경 변수 검증**
   - `src/config/env.ts`: Zod 스키마로 환경 변수 검증
   - `POLYGON_RPC_URL`, `MSQPAY_CONTRACT_ADDRESS` 필수 체크

**Deliverables**:
- ✅ viem 클라이언트로 Polygon Mumbai 블록 높이 조회 성공
- ✅ MSQPay 컨트랙트 ABI 로드 완료
- ✅ 환경 변수 검증 통과

**Dependencies**: Phase 1 완료

---

### Phase 3: API 엔드포인트 구현 - TDD (Secondary Goal)

**목표**: 4개 엔드포인트를 TDD 방식으로 구현

#### 3-1. POST /payments/create

**TDD Workflow**:
1. **RED**: `tests/payments/create.spec.ts` 작성
   - 정상 케이스: 결제 생성 성공
   - 실패 케이스: 잘못된 merchantId, amount 형식

2. **GREEN**: `src/routes/payments/create.ts` 구현
   - Zod 스키마로 입력 검증
   - `createPayment()` 컨트랙트 호출
   - 트랜잭션 해시 반환

3. **REFACTOR**: 공통 로직 분리
   - `src/utils/validation.ts`: 공통 검증 함수
   - `src/utils/errors.ts`: 커스텀 에러 클래스

**Acceptance Criteria**:
- ✅ 유효한 입력으로 결제 생성 성공
- ✅ 잘못된 입력 시 400 에러 반환
- ✅ 테스트 커버리지 ≥ 90%

#### 3-2. GET /payments/:id/status

**TDD Workflow**:
1. **RED**: `tests/payments/status.spec.ts` 작성
   - 정상 케이스: 결제 상태 조회 성공
   - 실패 케이스: 존재하지 않는 paymentId

2. **GREEN**: `src/routes/payments/status.ts` 구현
   - `getPayment()` 컨트랙트 호출
   - 결제 상태 매핑 (pending, confirmed, failed)

3. **REFACTOR**: 응답 형식 표준화
   - `src/types/responses.ts`: 공통 응답 타입

**Acceptance Criteria**:
- ✅ 존재하는 결제 ID로 상태 조회 성공
- ✅ 존재하지 않는 ID는 404 반환
- ✅ 응답 시간 < 500ms (RPC 호출 포함)

#### 3-3. POST /payments/:id/gasless

**TDD Workflow**:
1. **RED**: `tests/payments/gasless.spec.ts` 작성
   - 정상 케이스: Gasless 트랜잭션 실행
   - 실패 케이스: 잘못된 서명

2. **GREEN**: `src/routes/payments/gasless.ts` 구현
   - `verifySignature()`: 사용자 서명 검증
   - OZ Defender Relayer 호출
   - 릴레이 트랜잭션 해시 반환

3. **REFACTOR**: Relayer 로직 분리
   - `src/blockchain/relayer.ts`: OZ Defender SDK 래핑

**Acceptance Criteria**:
- ✅ 유효한 서명으로 Gasless 실행 성공
- ✅ 잘못된 서명 시 401 에러
- ✅ 릴레이 실행 결과 추적 가능

#### 3-4. POST /payments/:id/relay

**TDD Workflow**:
1. **RED**: `tests/payments/relay.spec.ts` 작성
   - 정상 케이스: 백엔드에서 릴레이 실행
   - 실패 케이스: 네트워크 에러

2. **GREEN**: `src/routes/payments/relay.ts` 구현
   - OZ Defender Relayer 직접 호출
   - 트랜잭션 완료 대기 (waitForTransaction)

3. **REFACTOR**: 에러 핸들링 강화
   - `src/middleware/errorHandler.ts`: 전역 에러 핸들러

**Acceptance Criteria**:
- ✅ 릴레이 실행 성공 및 완료 확인
- ✅ 네트워크 장애 시 3회 재시도
- ✅ 타임아웃 시 적절한 에러 반환

**Dependencies**: Phase 2 완료

---

### Phase 4: 통합 테스트 및 검증 (Secondary Goal)

**목표**: 무상태 아키텍처 검증 및 성능 테스트

**Tasks**:
1. **통합 테스트 작성**
   - `tests/integration/stateless.spec.ts`: 무상태 검증
   - 서버 재시작 후 상태 조회 가능 확인

2. **성능 테스트**
   - `tests/performance/load.spec.ts`: 100 req/s 부하 테스트
   - 95 percentile 응답 시간 측정

3. **E2E 테스트 (Mumbai 테스트넷)**
   - `tests/e2e/payment-flow.spec.ts`: 전체 결제 플로우
   - 결제 생성 → 상태 조회 → Gasless 실행

**Deliverables**:
- ✅ 무상태 아키텍처 검증 완료
- ✅ 성능 기준 충족 (< 500ms)
- ✅ E2E 테스트 통과

**Dependencies**: Phase 3 완료

---

### Phase 5: 문서화 및 배포 준비 (Final Goal)

**목표**: OpenAPI 문서 생성 및 Docker 컨테이너화

**Tasks**:
1. **OpenAPI 스펙 생성**
   - `src/swagger.ts`: Fastify Swagger 플러그인
   - `/docs` 엔드포인트에서 API 문서 제공

2. **Docker 설정**
   - `Dockerfile`: Node.js 22 Alpine 이미지
   - `docker-compose.yml`: 로컬 개발 환경
   - `.dockerignore`: 불필요 파일 제외

3. **배포 가이드**
   - `README.md`: 설치 및 실행 가이드
   - `DEPLOYMENT.md`: 프로덕션 배포 절차

**Deliverables**:
- ✅ OpenAPI 문서 자동 생성
- ✅ Docker 이미지 빌드 성공
- ✅ 배포 가이드 문서 작성

**Dependencies**: Phase 4 완료

---

## Technical Approach

### Architecture Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Fastify v5** | 고성능, TypeScript 지원 | Express 대비 플러그인 생태계 작음 |
| **viem v2** | 경량, Tree-shakable | ethers v6 대비 레거시 코드 부족 |
| **Stateless** | 수평 확장성, 단순성 | DB 기반 복잡 쿼리 불가 |
| **Zod** | 런타임 타입 검증 | joi, yup 대비 번들 크기 작음 |
| **OZ Defender** | 안정적인 릴레이 | 자체 구현 대비 비용 발생 |

### Directory Structure

```
packages/server/
├── src/
│   ├── app.ts                  # Fastify 앱 인스턴스
│   ├── server.ts               # 엔트리 포인트
│   ├── blockchain/
│   │   ├── client.ts           # viem Public Client
│   │   ├── relayer.ts          # OZ Defender Relayer
│   │   └── contracts/
│   │       └── MSQPay.ts       # 컨트랙트 ABI & 함수
│   ├── routes/
│   │   └── payments/
│   │       ├── create.ts       # POST /payments/create
│   │       ├── status.ts       # GET /payments/:id/status
│   │       ├── gasless.ts      # POST /payments/:id/gasless
│   │       └── relay.ts        # POST /payments/:id/relay
│   ├── middleware/
│   │   ├── errorHandler.ts    # 전역 에러 핸들러
│   │   └── validation.ts      # Zod 검증 미들웨어
│   ├── config/
│   │   └── env.ts              # 환경 변수 검증
│   ├── types/
│   │   ├── requests.ts         # 요청 타입
│   │   └── responses.ts        # 응답 타입
│   └── utils/
│       ├── retry.ts            # 재시도 로직
│       └── errors.ts           # 커스텀 에러
├── tests/
│   ├── payments/
│   │   ├── create.spec.ts
│   │   ├── status.spec.ts
│   │   ├── gasless.spec.ts
│   │   └── relay.spec.ts
│   ├── integration/
│   │   └── stateless.spec.ts
│   ├── performance/
│   │   └── load.spec.ts
│   └── e2e/
│       └── payment-flow.spec.ts
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

---

## Dependencies

### Internal Dependencies

- **@msq-pay/sdk**: 클라이언트와 타입 공유
- **@msq-pay/contracts**: MSQPay.sol ABI

### External Dependencies

```json
{
  "fastify": "^5.0.0",
  "@fastify/cors": "^10.0.0",
  "@fastify/rate-limit": "^10.0.0",
  "@fastify/swagger": "^9.0.0",
  "viem": "^2.21.0",
  "zod": "^3.23.0",
  "ethers": "^6.0.0",
  "@openzeppelin/defender-sdk": "^1.14.4"
}
```

---

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| RPC 장애 | Medium | High | 다중 RPC 엔드포인트 + 재시도 |
| 네트워크 혼잡 | High | Medium | Gas Price 모니터링 |
| 컨트랙트 버그 | Low | Critical | 테스트넷 검증 + 감사 |
| 동시 요청 급증 | Medium | Medium | Rate Limiting + 로드밸런싱 |

---

## Testing Strategy

### Unit Tests
- **Coverage Target**: ≥ 90%
- **Framework**: Vitest
- **Focus**: 개별 함수 및 유틸리티

### Integration Tests
- **Environment**: 로컬 Hardhat 네트워크
- **Focus**: 컨트랤트 연동 및 무상태 아키텍처

### E2E Tests
- **Environment**: Polygon Mumbai 테스트넷
- **Focus**: 전체 결제 플로우

### Performance Tests
- **Tool**: Artillery
- **Metrics**:
  - 응답 시간: 95 percentile < 500ms
  - 처리량: 100 req/s

---

## Quality Gates

- ✅ 모든 테스트 통과 (Unit + Integration + E2E)
- ✅ 테스트 커버리지 ≥ 90%
- ✅ TypeScript 컴파일 에러 0개
- ✅ ESLint 경고 0개
- ✅ 성능 기준 충족 (< 500ms)

---

## Next Steps

1. **Phase 1 시작**: Fastify 서버 초기화
2. **Phase 2 진행**: viem 클라이언트 설정
3. **Phase 3 TDD 실행**: 4개 엔드포인트 구현
4. **Phase 4 검증**: 통합 테스트 및 성능 테스트
5. **Phase 5 마무리**: 문서화 및 Docker 배포

**Implementation Command**: `/moai:2-run SPEC-SERVER-002`

---

**Generated by**: workflow-spec (MoAI-ADK)
**Plan Status**: Ready for Implementation
