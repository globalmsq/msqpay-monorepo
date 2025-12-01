---
id: SPEC-DEMO-002
version: "1.1.0"
status: "completed"
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
| 1.0.2 | 2025-12-01 | Harry | 금액 조작 방지 보안 요구사항 추가 |
| 1.0.3 | 2025-12-01 | Harry | Decimals 동적 처리 요구사항 추가 |
| 1.1.0 | 2025-12-01 | Harry | 구현 완료 - 서버 기반 블록체인 설정, 토큰 심볼 수정, Hardhat 체인 설정 |

---

# Demo App 서버 기반 블록체인 설정 적용

## 📋 개요

SPEC-API-001의 서버 기반 블록체인 설정을 Demo App에 적용합니다.

> **⚠️ 보안 필수사항 - 금액 조작 방지**
>
> Demo App에서도 프론트엔드에서 `amount`를 직접 서버로 전송하면 안됩니다!
>
> **올바른 구현**:
> 1. 프론트엔드: `productId`만 Next.js API Route로 전송
> 2. Next.js API Route: 상품 가격 조회 후 결제서버 호출
> 3. 결제서버: paymentId 생성 및 응답
>
> **Demo App 특수 사항**:
> - 상점서버가 없으므로 Next.js API Routes가 상점서버 역할 수행
> - 상품 가격은 서버에서 조회 (constants 또는 DB)
> - 프론트엔드는 절대 `amount`를 직접 전송하지 않음

**문제점**:
- PaymentModal.tsx가 레거시 하드코딩 함수 사용 중 (`getContractsForChain()`)
- wagmi.ts에 DEPRECATED 코드 존재 (`LEGACY_CONTRACTS`, `getContractsForChain()`)
- 서버 Single Source of Truth 미반영 (클라이언트가 여전히 하드코딩 주소 사용)
- **[보안] 프론트엔드에서 amount를 직접 전송하여 금액 조작 가능**

**해결 방안**:
- 서버 API 호출로 블록체인 설정 로드 (`/payments/create` POST)
- 레거시 코드 완전 제거 (하드코딩 제거)
- 에러 처리 및 성능 최적화 강화 (재시도, 캐싱)
- **[보안] productId만 전송하고 서버에서 가격 조회**

---

## 🎯 EARS 요구사항

### Functional Requirements (기능 요구사항)

**FR-1**: Demo App MUST 서버 `/payments/create` API를 호출하여 블록체인 설정을 로드해야 한다.

**FR-2**: PaymentModal MUST 서버 응답의 tokenAddress, gatewayAddress를 사용하여 트랜잭션을 생성해야 한다.

**FR-3**: API 클라이언트 MUST Zod 스키마로 요청/응답 데이터를 검증해야 한다.

**FR-4**: API 클라이언트 MUST 네트워크 에러 발생 시 최대 3회까지 재시도해야 한다.

**FR-5**: PaymentModal MUST 서버 설정 로딩 중 사용자에게 로딩 상태를 표시해야 한다.

**FR-6**: 상품 데이터 MUST 토큰 decimals 정보를 포함해야 한다.

**FR-7**: Checkout API 응답 MUST decimals 필드를 포함해야 한다.

**FR-8**: PaymentModal MUST 서버 응답의 decimals를 사용하여 금액을 wei 단위로 변환해야 한다.

### Non-Functional Requirements (비기능 요구사항)

**NFR-1**: API 응답 시간 SHOULD 3초 이내여야 한다.

**NFR-2**: 테스트 커버리지 SHOULD 90% 이상이어야 한다.

**NFR-3**: TypeScript 컴파일 에러 SHOULD 0개여야 한다.

**NFR-4**: 번들 크기 증가 SHOULD 5KB 미만이어야 한다.

### Interface Requirements (인터페이스 요구사항)

**IR-1**: createPayment() 함수 SHALL CreatePaymentRequest 타입을 파라미터로 받는다.

**IR-2**: createPayment() 응답 SHALL ApiResponse<CreatePaymentResponse> 타입이어야 한다.

**IR-3**: PaymentModal SHALL 서버 설정 에러 시 재시도 버튼을 제공해야 한다.

### Security Requirements (보안 요구사항)

**SR-1**: PaymentModal MUST NOT 프론트엔드에서 `amount`를 직접 서버로 전송해서는 안된다.

**SR-2**: 프론트엔드 MUST `productId`만 Next.js API Route로 전송해야 한다.

**SR-3**: Next.js API Route MUST 상품 가격을 서버 측에서 조회하여 결제서버 API를 호출해야 한다.

**SR-4**: 상품 가격 정보는 MUST constants 또는 DB에서 서버 측에서만 조회해야 한다.

### Design Constraints (설계 제약사항)

**DC-1**: MUST wagmi.ts의 LEGACY_CONTRACTS와 getContractsForChain()을 완전히 삭제해야 한다.

**DC-2**: MUST getTokenForChain()은 UI 표시용으로 유지해야 한다.

**DC-3**: MUST 기존 SPEC-API-001 서버 구현과 호환되어야 한다.

**DC-4**: MUST PaymentModal은 `amount` props를 받지 않고 `productId`를 받아야 한다.

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

### AC-8: 금액 조작 방지 검증 (보안)

**GIVEN** PaymentModal 컴포넌트 코드를 검토할 때
**WHEN** props 인터페이스를 확인하면
**THEN** `amount` props가 없고 `productId` props만 존재해야 한다.

### AC-9: 서버 측 가격 조회 검증 (보안)

**GIVEN** Next.js API Route `/api/checkout` 코드를 검토할 때
**WHEN** 결제서버 API 호출 로직을 확인하면
**THEN** `amount`는 서버에서 조회한 가격을 사용하고, 클라이언트에서 받은 값을 사용하지 않아야 한다.

### AC-10: 상품 데이터에 decimals 포함

**GIVEN** products.ts 파일을 검토할 때
**WHEN** Product 인터페이스를 확인하면
**THEN** `decimals` 필드가 존재하고 모든 상품에 decimals 값이 설정되어 있어야 한다.

### AC-11: Checkout API 응답에 decimals 포함

**GIVEN** `/api/checkout` API를 호출할 때
**WHEN** 성공 응답을 받으면
**THEN** 응답에 `decimals` 필드가 포함되어 있어야 한다.

### AC-12: PaymentModal에서 동적 decimals 사용

**GIVEN** PaymentModal.tsx 코드를 검토할 때
**WHEN** parseUnits() 호출을 확인하면
**THEN** 하드코딩된 18 대신 serverConfig.decimals를 사용해야 한다.

---

## 🔗 Dependencies

- **Parent**: SPEC-API-001 (서버/SDK 구현 완료)
- **Libraries**: Zod (⚠️ 설치 필요), Wagmi, Viem, React
- **Services**: MSQPay Server (packages/server)

---

## 📚 References

- `.moai/specs/SPEC-API-001/spec.md`
- `.moai/specs/SPEC-API-001/demo-app-plan.md` (기존 계획)
- `packages/server/src/routes/payments/create.ts`
- `packages/server/src/services/blockchain.service.ts`
