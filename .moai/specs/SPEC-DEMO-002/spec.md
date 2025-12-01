---
id: SPEC-DEMO-002
version: "1.0.0"
status: "draft"
created: "2025-12-01"
updated: "2025-12-01"
author: "Harry"
priority: "high"
parent: "SPEC-API-001"
---

# HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-01 | Harry | Initial draft |

---

# Demo App 서버 기반 블록체인 설정 적용

## 📋 개요

SPEC-API-001의 서버 기반 블록체인 설정을 Demo App에 적용합니다.

**문제점**:
- PaymentModal.tsx가 레거시 하드코딩 함수 사용 중 (`getContractsForChain()`)
- wagmi.ts에 DEPRECATED 코드 존재 (`LEGACY_CONTRACTS`, `getContractsForChain()`)
- 서버 Single Source of Truth 미반영 (클라이언트가 여전히 하드코딩 주소 사용)

**해결 방안**:
- 서버 API 호출로 블록체인 설정 로드 (`/payments/create` POST)
- 레거시 코드 완전 제거 (하드코딩 제거)
- 에러 처리 및 성능 최적화 강화 (재시도, 캐싱)

---

## 🎯 EARS 요구사항

### Functional Requirements (기능 요구사항)

**FR-1**: Demo App MUST 서버 `/payments/create` API를 호출하여 블록체인 설정을 로드해야 한다.

**FR-2**: PaymentModal MUST 서버 응답의 tokenAddress, gatewayAddress를 사용하여 트랜잭션을 생성해야 한다.

**FR-3**: API 클라이언트 MUST Zod 스키마로 요청/응답 데이터를 검증해야 한다.

**FR-4**: API 클라이언트 MUST 네트워크 에러 발생 시 최대 3회까지 재시도해야 한다.

**FR-5**: PaymentModal MUST 서버 설정 로딩 중 사용자에게 로딩 상태를 표시해야 한다.

### Non-Functional Requirements (비기능 요구사항)

**NFR-1**: API 응답 시간 SHOULD 3초 이내여야 한다.

**NFR-2**: 테스트 커버리지 SHOULD 90% 이상이어야 한다.

**NFR-3**: TypeScript 컴파일 에러 SHOULD 0개여야 한다.

**NFR-4**: 번들 크기 증가 SHOULD 5KB 미만이어야 한다.

### Interface Requirements (인터페이스 요구사항)

**IR-1**: createPayment() 함수 SHALL CreatePaymentRequest 타입을 파라미터로 받는다.

**IR-2**: createPayment() 응답 SHALL ApiResponse<CreatePaymentResponse> 타입이어야 한다.

**IR-3**: PaymentModal SHALL 서버 설정 에러 시 재시도 버튼을 제공해야 한다.

### Design Constraints (설계 제약사항)

**DC-1**: MUST wagmi.ts의 LEGACY_CONTRACTS와 getContractsForChain()을 완전히 삭제해야 한다.

**DC-2**: MUST getTokenForChain()은 UI 표시용으로 유지해야 한다.

**DC-3**: MUST 기존 SPEC-API-001 서버 구현과 호환되어야 한다.

---

## ✅ Acceptance Criteria

### AC-1: API 클라이언트 함수 추가

**GIVEN** api.ts 파일에 createPayment() 함수가 구현되어 있고
**WHEN** 유효한 CreatePaymentRequest로 호출하면
**THEN** 서버로부터 CreatePaymentResponse를 성공적으로 받는다.

### AC-2: Zod 스키마 검증

**GIVEN** 잘못된 chainId (-1)로 createPayment() 호출 시
**WHEN** Zod 스키마 검증이 실행되면
**THEN** VALIDATION_ERROR 코드와 함께 실패한다.

### AC-3: API 재시도 로직

**GIVEN** 서버가 500 에러를 2회 반환한 후 성공하는 경우
**WHEN** createPayment() 호출 시
**THEN** 최대 3회 재시도하여 최종적으로 성공한다.

### AC-4: PaymentModal 서버 설정 로드

**GIVEN** PaymentModal이 마운트되고
**WHEN** 지갑이 연결되어 있으면
**THEN** 자동으로 서버 API를 호출하여 블록체인 설정을 로드한다.

### AC-5: 서버 주소로 트랜잭션 생성

**GIVEN** 서버 설정이 로드된 상태에서
**WHEN** Approve 버튼을 클릭하면
**THEN** serverConfig.tokenAddress와 serverConfig.gatewayAddress를 사용하여 트랜잭션을 생성한다.

### AC-6: 레거시 코드 완전 제거

**GIVEN** wagmi.ts 파일을 검토할 때
**WHEN** LEGACY_CONTRACTS를 검색하면
**THEN** 검색 결과가 0개여야 한다.

### AC-7: 테스트 커버리지 90% 달성

**GIVEN** 전체 테스트를 실행하고
**WHEN** 커버리지 리포트를 확인하면
**THEN** api.ts 95%+, PaymentModal.tsx 90%+, wagmi.ts 85%+ 커버리지를 달성한다.

---

## 🔗 Dependencies

- **Parent**: SPEC-API-001 (서버/SDK 구현 완료)
- **Libraries**: Zod, Wagmi, Viem, React
- **Services**: MSQPay Server (packages/server)

---

## 📚 References

- `.moai/specs/SPEC-API-001/spec.md`
- `.moai/specs/SPEC-API-001/demo-app-plan.md` (기존 계획)
- `packages/server/src/routes/payments/create.ts`
- `packages/server/src/services/blockchain.service.ts`
