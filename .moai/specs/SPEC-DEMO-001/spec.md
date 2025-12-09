---
id: SPEC-DEMO-001
version: "1.1.0"
status: "completed"
created: "2025-11-30"
updated: "2025-12-09"
author: "manager-spec"
priority: "high"
---

# HISTORY

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| 1.0.0 | 2025-11-30 | 초기 SPEC 생성 | manager-spec |
| 1.1.0 | 2025-12-09 | 구현 완료 - 5개 API Routes, SDK Singleton, Frontend 통합 | System |

---

# SPEC-DEMO-001: Next.js API Routes를 통한 MSQPay SDK 통합

## 1. 개요

### 1.1 목적
Demo Application에 Next.js API Routes 레이어를 추가하여 MSQPay SDK를 서버사이드에서 안전하게 사용할 수 있도록 통합합니다.

### 1.2 배경
현재 Demo App의 Frontend는 Payment Server API를 직접 호출하고 있습니다. 이를 Next.js API Routes를 통해 간접 호출하도록 변경하여 다음과 같은 이점을 얻습니다:

- MSQPay SDK (@globalmsq/msqpay)를 서버사이드에서 사용
- 무상태(Stateless) 아키텍처 유지
- 모노리포 내에서 간단히 처리 (별도 서버 프로세스 불필요)
- 타입 안정성 향상 및 환경 변수 보안 강화

### 1.3 범위
- **포함**: Next.js API Routes 생성, SDK Singleton 패턴, Frontend API URL 변경
- **제외**: Payment Server 수정, Smart Contract 변경, 새로운 결제 기능 추가

---

## 2. 아키텍처

### 2.1 현재 상태 (Current State)
```
Browser Frontend → Payment Server API (직접 호출)
                   http://localhost:3001
```

### 2.2 목표 상태 (Target State)
```
Browser Frontend → Next.js API Routes → MSQPayClient (SDK) → Payment Server
                   /api/payments/*                             http://localhost:3001
```

### 2.3 데이터 흐름
1. Frontend가 `/api/payments/*` 호출 (Next.js API Routes)
2. API Routes가 `MSQPayClient` (SDK)로 요청 처리
3. SDK가 Payment Server로 HTTP 요청 전송
4. Payment Server 응답 → SDK → API Routes → Frontend

### 2.4 핵심 설계 원칙
- **Minimal Change**: 기존 코드 최소 수정 (2줄)
- **Zero Frontend Impact**: React 컴포넌트 무수정
- **Thin Wrapper**: API Routes는 SDK 단순 forwarding
- **Singleton Pattern**: SDK 인스턴스 재사용
- **Backward Compatible**: 기존 API 100% 호환

---

## 3. EARS 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

#### REQ-DEMO-001-F01: SDK 의존성 관리
**UBIQUITOUS** 시스템은 MSQPay SDK (@globalmsq/msqpay)를 workspace 의존성으로 추가해야 한다.

**수락 기준**:
- `apps/demo/package.json`에 `"@globalmsq/msqpay": "workspace:*"` 추가
- 모노리포 루트에서 `pnpm install` 실행 성공
- `node_modules/@globalmsq/msqpay` symlink 생성 확인

#### REQ-DEMO-001-F02: SDK Singleton 초기화
**UBIQUITOUS** 시스템은 MSQPayClient 인스턴스를 Singleton 패턴으로 관리해야 한다.

**수락 기준**:
- `apps/demo/src/lib/msqpay-server.ts` 파일 생성
- `getMSQPayClient()` 함수가 단일 인스턴스 반환
- `environment: 'development'` 설정으로 localhost:3001 연결

#### REQ-DEMO-001-F03: Payment Status API Route
**EVENT-DRIVEN** Frontend가 결제 상태 조회를 요청하면, 시스템은 SDK를 통해 Payment Server에 상태를 조회하고 결과를 반환해야 한다.

**수락 기준**:
- `GET /api/payments/[paymentId]/status` endpoint 생성
- SDK의 `client.getPaymentStatus()` 메서드 호출
- 성공 시 `NextResponse.json(response)` 반환
- 실패 시 500 status와 에러 메시지 반환

#### REQ-DEMO-001-F04: Payment History API Route
**EVENT-DRIVEN** Frontend가 결제 이력 조회를 요청하면, 시스템은 Payment Server에서 payer 주소 기반 이력을 조회하고 결과를 반환해야 한다.

**수락 기준**:
- `GET /api/payments/history?payer={address}` endpoint 생성
- Payment Server API 직접 호출 (SDK 메서드 없음)
- 성공 시 결제 이력 배열 반환
- 실패 시 500 status와 에러 메시지 반환

#### REQ-DEMO-001-F05: Gasless Transaction API Route
**EVENT-DRIVEN** Frontend가 Gasless 거래 제출을 요청하면, 시스템은 SDK를 통해 거래를 Payment Server에 전달해야 한다.

**수락 기준**:
- `POST /api/payments/[paymentId]/gasless` endpoint 생성
- SDK의 `client.submitGasless()` 메서드 호출
- Request body로 거래 데이터 전달
- 성공 시 거래 결과 반환

#### REQ-DEMO-001-F06: Relay Transaction API Route
**EVENT-DRIVEN** Frontend가 Relay 거래 실행을 요청하면, 시스템은 SDK를 통해 거래를 Payment Server에 전달해야 한다.

**수락 기준**:
- `POST /api/payments/[paymentId]/relay` endpoint 생성
- SDK의 `client.executeRelay()` 메서드 호출
- Request body로 거래 데이터 전달
- 성공 시 거래 결과 반환

#### REQ-DEMO-001-F07: Frontend API URL 변경
**UBIQUITOUS** Frontend는 Payment Server를 직접 호출하는 대신 Next.js API Routes를 호출해야 한다.

**수락 기준**:
- `apps/demo/src/lib/api.ts`에서 `API_URL` 변경
- `const API_URL = '/api'`로 수정 (same-origin 호출)
- 기존 React 컴포넌트 코드 무수정
- 기존 함수 시그니처 100% 호환

---

### 3.2 비기능 요구사항 (Non-Functional Requirements)

#### REQ-DEMO-001-NF01: 성능
**UBIQUITOUS** API Routes는 SDK를 통한 forwarding 방식으로 추가 레이턴시를 최소화해야 한다.

**수락 기준**:
- API Routes 처리 시간 < 50ms (SDK overhead)
- Payment Server 응답 시간 동일 유지

#### REQ-DEMO-001-NF02: 무상태성 (Stateless)
**UBIQUITOUS** API Routes는 무상태(Stateless)로 동작해야 하며, 세션이나 데이터베이스 없이 실행되어야 한다.

**수락 기준**:
- 데이터베이스 연결 없음
- 메모리 캐시 사용 없음
- SDK Singleton만 유지 (무상태 wrapper)

#### REQ-DEMO-001-NF03: 보안
**UBIQUITOUS** 서버사이드 환경 변수는 Frontend에 노출되지 않아야 한다.

**수락 기준**:
- `.env.local`에 `MSQPAY_API_KEY` 저장
- Frontend에서 환경 변수 접근 불가
- API Routes에서만 `process.env` 사용

---

### 3.3 인터페이스 요구사항 (Interface Requirements)

#### REQ-DEMO-001-I01: API Routes Directory 구조
**UBIQUITOUS** API Routes는 Next.js 14 App Router 규약을 준수해야 한다.

```
apps/demo/src/app/api/payments/
├── [paymentId]/
│   ├── status/route.ts    # GET - 결제 상태 조회
│   ├── gasless/route.ts   # POST - Gasless 거래 제출
│   └── relay/route.ts     # POST - Relay 거래 실행
└── history/route.ts       # GET - 결제 이력 조회
```

#### REQ-DEMO-001-I02: SDK Type Safety
**UBIQUITOUS** 모든 API Routes는 TypeScript로 작성되고 SDK 타입을 활용해야 한다.

**수락 기준**:
- `MSQPayClient` import 사용
- SDK 메서드 타입 추론 활용
- `NextRequest`, `NextResponse` 타입 사용

---

### 3.4 설계 제약사항 (Design Constraints)

#### REQ-DEMO-001-C01: 기술 스택
**UBIQUITOUS** 다음 기술 스택을 사용해야 한다:
- Next.js 14.2.5 (App Router)
- TypeScript
- MSQPayClient SDK (@globalmsq/msqpay)
- pnpm workspace

#### REQ-DEMO-001-C02: 코드 변경 최소화
**UBIQUITOUS** 기존 코드 변경은 최소화해야 한다.

**수락 기준**:
- 신규 파일: 6개 (~140 lines)
- 수정 파일: 2개 (2 lines)
- React 컴포넌트: 무수정

#### REQ-DEMO-001-C03: 환경 설정
**UBIQUITOUS** 환경 변수는 `.env.local` 파일로 관리해야 한다.

**수락 기준**:
- `.env.local`에 `MSQPAY_API_KEY` 설정
- Payment Server URL은 SDK에서 자동 설정 (http://localhost:3001)

---

### 3.5 수락 기준 (Acceptance Criteria)

#### AC-DEMO-001-001: Payment Status 조회 성공

**GIVEN** Payment Server가 실행 중이고 결제가 생성된 상태에서

**WHEN** Frontend가 `GET /api/payments/{id}/status`를 호출하면

**THEN**
- API Routes가 SDK의 `getPaymentStatus()` 호출
- Payment Server로부터 결제 상태 수신
- Frontend에 200 status와 결제 상태 반환
- Network 탭에서 `/api/payments/{id}/status` 확인 가능

#### AC-DEMO-001-002: Payment History 확인 성공

**GIVEN** Payment Server가 실행 중이고 payer 주소로 결제 이력이 존재하는 상태에서

**WHEN** Frontend가 `GET /api/payments/history?payer={address}`를 호출하면

**THEN**
- API Routes가 Payment Server API 직접 호출
- payer 주소 기반 결제 이력 수신
- Frontend에 200 status와 결제 이력 배열 반환
- 이력 섹션에 결제 목록 표시

#### AC-DEMO-001-003: Payment Server 연결 실패 시 에러 처리

**GIVEN** Payment Server가 중단된 상태에서

**WHEN** Frontend가 `/api/payments/*` 호출하면

**THEN**
- SDK가 연결 실패 에러 발생
- API Routes가 에러 catch
- Frontend에 500 status와 에러 메시지 반환
- 사용자에게 에러 알림 표시

#### AC-DEMO-001-004: Frontend 코드 무수정 동작

**GIVEN** `apps/demo/src/lib/api.ts`에서 `API_URL = '/api'`로 변경된 상태에서

**WHEN** 기존 React 컴포넌트가 결제 기능을 실행하면

**THEN**
- 기존 함수 시그니처 100% 호환
- React 컴포넌트 코드 무수정
- 결제 플로우 정상 동작
- UI에 결제 상태 정상 표시

---

## 4. 파일 변경 요약

### 4.1 생성할 파일 (6개)

| 파일 경로 | 용도 | 라인 수 |
|-----------|------|---------|
| `src/lib/msqpay-server.ts` | SDK singleton | 20 |
| `src/app/api/payments/[paymentId]/status/route.ts` | 상태 조회 | 25 |
| `src/app/api/payments/history/route.ts` | 이력 조회 | 30 |
| `src/app/api/payments/[paymentId]/gasless/route.ts` | Gasless | 30 |
| `src/app/api/payments/[paymentId]/relay/route.ts` | Relay | 30 |
| `.env.local` | 환경 설정 | 5 |

**총 신규 코드**: ~140 lines

### 4.2 수정할 파일 (2개)

| 파일 경로 | 변경 내용 | 라인 수 |
|-----------|-----------|---------|
| `package.json` | SDK 의존성 추가 | 1 |
| `src/lib/api.ts` | API_URL 변경 | 1 |

**총 수정**: 2 lines

---

## 5. 리스크 분석

### 5.1 Risk 1: Monorepo Workspace 의존성
**문제**: `workspace:*` 링크 해결 실패 가능성

**해결**:
- 모노리포 루트에서 `pnpm install` 실행
- symlink 확인 (`node_modules/@globalmsq/msqpay`)

**롤백**: 필요시 `"file:../../packages/sdk"` 사용

### 5.2 Risk 2: SDK 메서드 부족
**문제**: SDK에 `getPaymentHistory()` 메서드 없음

**현재 해결**: Route에서 Payment Server API 직접 호출 (임시)

**향후 개선**: SDK에 메서드 추가 후 route 업데이트

### 5.3 Risk 3: Payment Server 연결 실패
**문제**: SDK가 `http://localhost:3001` 접근 불가

**완화**:
- `http://localhost:3001/health` 브라우저 확인
- Payment Server 실행 확인
- API Routes에 에러 처리 포함

---

## 6. 추적성 (Traceability)

### 6.1 관련 SPEC
- **SPEC-SDK-001**: MSQPay SDK 구현 (의존성)
- **SPEC-SERVER-002**: 무상태 결제 서버 API (연동 대상)

### 6.2 관련 문서
- Next.js 14 API Routes 공식 문서
- MSQPay SDK 문서 (packages/sdk/README.md)

### 6.3 관련 코드
- `packages/sdk/src/index.ts` - MSQPayClient 클래스
- `packages/pay-server/src/routes/payment.ts` - Payment Server API

---

## 7. 성공 기준

- ✅ Frontend가 `/api/payments/*` 호출
- ✅ API Routes가 `MSQPayClient` 사용
- ✅ 기존 결제 플로우 무수정 동작
- ✅ Payment History 정상 표시
- ✅ 에러 처리 유지

---

**예상 시간**: 1-2시간 (단순 wrapper 구현)
