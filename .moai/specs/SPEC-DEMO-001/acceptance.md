---
id: SPEC-DEMO-001
tag: SPEC-DEMO-001
version: "1.0.0"
status: "draft"
created: "2025-11-30"
updated: "2025-11-30"
---

# SPEC-DEMO-001 수락 기준 (Acceptance Criteria)

## 개요

이 문서는 SPEC-DEMO-001 (Next.js API Routes를 통한 MSQPay SDK 통합)의 상세 수락 기준을 정의합니다.

모든 시나리오는 Given-When-Then 형식으로 작성되며, 기능 검증을 위한 구체적인 테스트 케이스를 포함합니다.

---

## 기능 수락 기준

### AC-DEMO-001-001: Payment Status 조회 성공

#### Given (전제 조건)
- Payment Server가 http://localhost:3001에서 실행 중
- Demo App이 http://localhost:3000에서 실행 중
- MSQPay SDK가 `workspace:*`로 설치됨
- 결제가 생성된 상태 (paymentId 존재)

#### When (실행 조건)
- Frontend가 `GET /api/payments/{paymentId}/status` 호출

#### Then (예상 결과)
- API Routes가 `getMSQPayClient()` 호출
- SDK의 `client.getPaymentStatus(paymentId)` 메서드 실행
- Payment Server로부터 결제 상태 수신
- Frontend에 200 status code 반환
- 응답 body에 결제 상태 객체 포함:
  ```json
  {
    "success": true,
    "payment": {
      "id": "{paymentId}",
      "status": "pending" | "completed" | "failed",
      "amount": "1000000000000000000",
      "payer": "0x...",
      "timestamp": 1234567890
    }
  }
  ```
- DevTools Network 탭에서 `/api/payments/{id}/status` 요청 확인 가능
- UI에 결제 상태 정상 표시

#### 검증 방법
1. 브라우저에서 http://localhost:3000 접속
2. 상품 구매 → 결제 진행
3. DevTools Network 탭 확인:
   - Request URL: `/api/payments/{id}/status`
   - Status: 200
   - Response Type: JSON
4. UI에서 결제 상태 확인 (Pending/Completed/Failed)

---

### AC-DEMO-001-002: Payment History 확인 성공

#### Given (전제 조건)
- Payment Server가 http://localhost:3001에서 실행 중
- Demo App이 http://localhost:3000에서 실행 중
- payer 주소 (예: 0x1234...abcd)로 결제 이력이 1개 이상 존재

#### When (실행 조건)
- Frontend가 `GET /api/payments/history?payer={address}` 호출

#### Then (예상 결과)
- API Routes가 Payment Server API 직접 호출 (현재 SDK 메서드 없음)
- `http://localhost:3001/api/payments/history?payer={address}` 요청 전송
- payer 주소 기반 결제 이력 수신
- Frontend에 200 status code 반환
- 응답 body에 결제 이력 배열 포함:
  ```json
  {
    "success": true,
    "payments": [
      {
        "id": "payment-1",
        "status": "completed",
        "amount": "1000000000000000000",
        "payer": "0x1234...abcd",
        "timestamp": 1234567890
      },
      {
        "id": "payment-2",
        "status": "pending",
        "amount": "500000000000000000",
        "payer": "0x1234...abcd",
        "timestamp": 1234567900
      }
    ]
  }
  ```
- UI의 이력 섹션에 결제 목록 표시

#### 검증 방법
1. 브라우저에서 http://localhost:3000 접속
2. Payment History 섹션 확인
3. DevTools Network 탭 확인:
   - Request URL: `/api/payments/history?payer={address}`
   - Status: 200
   - Response Type: JSON
4. UI에서 결제 이력 목록 확인 (최소 1개 이상)

---

### AC-DEMO-001-003: Payment Server 연결 실패 시 에러 처리

#### Given (전제 조건)
- Payment Server가 중단된 상태 (http://localhost:3001 응답 없음)
- Demo App이 http://localhost:3000에서 실행 중

#### When (실행 조건)
- Frontend가 `/api/payments/*` 호출 (status, history, gasless, relay 모두 해당)

#### Then (예상 결과)
- SDK가 연결 실패 에러 발생 (ECONNREFUSED 또는 타임아웃)
- API Routes의 try-catch 블록이 에러 catch
- Frontend에 500 status code 반환
- 응답 body에 에러 메시지 포함:
  ```json
  {
    "success": false,
    "message": "Failed to connect to Payment Server"
  }
  ```
- 사용자에게 에러 알림 표시 (UI Toast/Modal)

#### 검증 방법
1. Payment Server 종료 (Terminal에서 Ctrl+C)
2. 브라우저에서 결제 시도
3. DevTools Network 탭 확인:
   - Request URL: `/api/payments/{id}/status`
   - Status: 500
   - Response Type: JSON
4. UI에서 에러 메시지 확인 ("Connection failed" 또는 유사 메시지)
5. Payment Server 재시작 → 결제 복구 확인

---

### AC-DEMO-001-004: Frontend 코드 무수정 동작

#### Given (전제 조건)
- `apps/demo/src/lib/api.ts`에서 `API_URL = '/api'`로 변경됨
- React 컴포넌트 코드는 **수정되지 않음**

#### When (실행 조건)
- 기존 React 컴포넌트가 결제 기능 실행:
  - `createPayment()` 함수 호출
  - `getPaymentStatus()` 함수 호출
  - `getPaymentHistory()` 함수 호출

#### Then (예상 결과)
- 기존 함수 시그니처 100% 호환 유지
- React 컴포넌트 코드 무수정
- 결제 플로우 정상 동작:
  1. 상품 선택 → 결제 생성
  2. 결제 상태 조회 (polling)
  3. 결제 이력 표시
- UI에 결제 상태 정상 표시
- 콘솔 에러 없음

#### 검증 방법
1. `apps/demo/src/components/` 디렉토리의 React 컴포넌트 코드 확인
   - 결제 관련 컴포넌트가 수정되지 않았는지 git diff 확인
2. 브라우저에서 전체 결제 플로우 실행:
   - 상품 선택 → 결제 생성 → 상태 조회 → 이력 확인
3. DevTools Console 탭 확인:
   - 에러 없음
   - 경고 없음
4. UI 정상 동작 확인

---

## 비기능 수락 기준

### AC-DEMO-001-NF01: 성능 요구사항

#### Given (전제 조건)
- Payment Server가 정상 응답 중 (평균 응답 시간 100ms)
- Demo App이 실행 중

#### When (실행 조건)
- Frontend가 `/api/payments/*/status` 호출

#### Then (예상 결과)
- API Routes 처리 시간 < 50ms (SDK overhead)
- 전체 응답 시간 < 200ms (Payment Server 응답 시간 포함)
- 레이턴시 증가 < 50ms (기존 직접 호출 대비)

#### 검증 방법
1. DevTools Network 탭에서 Timing 확인:
   - Waiting (TTFB): < 200ms
2. 10회 반복 호출 후 평균 응답 시간 측정

---

### AC-DEMO-001-NF02: 무상태성 (Stateless)

#### Given (전제 조건)
- Demo App이 실행 중

#### When (실행 조건)
- API Routes 호출 (status, history, gasless, relay)

#### Then (예상 결과)
- 데이터베이스 연결 없음
- 메모리 캐시 사용 없음 (SDK Singleton만 유지)
- 세션 상태 저장 없음
- API Routes는 무상태 wrapper로만 동작

#### 검증 방법
1. 코드 리뷰:
   - `route.ts` 파일들에 DB 연결 코드 없음 확인
   - 메모리 캐시 라이브러리 import 없음 확인
2. 서버 재시작 후 기능 정상 동작 확인 (상태 유지 안 됨)

---

### AC-DEMO-001-NF03: 보안 요구사항

#### Given (전제 조건)
- `.env.local`에 `MSQPAY_API_KEY` 설정됨

#### When (실행 조건)
- Frontend 코드 실행

#### Then (예상 결과)
- Frontend에서 `MSQPAY_API_KEY` 접근 불가
- 브라우저 DevTools에서 환경 변수 노출 안 됨
- API Routes에서만 `process.env.MSQPAY_API_KEY` 사용

#### 검증 방법
1. 브라우저 DevTools Console에서 환경 변수 접근 시도:
   ```javascript
   console.log(process.env.MSQPAY_API_KEY); // undefined 반환
   ```
2. Network 탭에서 Request Headers 확인:
   - Authorization 헤더 없음 (API Key 노출 안 됨)
3. API Routes 코드에서만 `process.env` 사용 확인

---

## 엣지 케이스 (Edge Cases)

### Edge Case 1: paymentId 누락

#### Given (전제 조건)
- Demo App이 실행 중

#### When (실행 조건)
- Frontend가 `GET /api/payments/[empty]/status` 호출 (paymentId 누락)

#### Then (예상 결과)
- Next.js가 404 반환 (존재하지 않는 route)
- 또는 SDK가 400 Bad Request 반환

#### 검증 방법
1. 브라우저에서 http://localhost:3000/api/payments//status 직접 호출
2. Status code 확인: 404 또는 400

---

### Edge Case 2: payer 파라미터 누락

#### Given (전제 조건)
- Demo App이 실행 중

#### When (실행 조건)
- Frontend가 `GET /api/payments/history` 호출 (payer 파라미터 없음)

#### Then (예상 결과)
- API Routes가 400 Bad Request 반환
- 응답 body에 에러 메시지 포함:
  ```json
  {
    "success": false,
    "message": "payer address required"
  }
  ```

#### 검증 방법
1. 브라우저에서 http://localhost:3000/api/payments/history 직접 호출
2. Status code 확인: 400
3. Response body 확인: "payer address required"

---

### Edge Case 3: SDK 메서드 에러

#### Given (전제 조건)
- Payment Server가 유효하지 않은 응답 반환 (예: 500 Internal Server Error)

#### When (실행 조건)
- Frontend가 `/api/payments/*/status` 호출

#### Then (예상 결과)
- SDK가 에러 throw
- API Routes의 try-catch가 에러 catch
- Frontend에 500 status code 반환
- 응답 body에 에러 메시지 포함

#### 검증 방법
1. Payment Server 코드를 임시로 수정하여 500 에러 발생시킴
2. Frontend에서 결제 시도
3. DevTools Network 탭 확인: 500 status
4. UI 에러 메시지 확인

---

## 통합 테스트 시나리오

### 통합 시나리오 1: 전체 결제 플로우

#### Given (전제 조건)
- Payment Server 실행 중 (http://localhost:3001)
- Demo App 실행 중 (http://localhost:3000)
- MetaMask 연결됨

#### When (실행 조건)
1. 상품 선택
2. 결제 생성
3. MetaMask 서명
4. 결제 상태 조회 (polling)
5. 결제 완료
6. 결제 이력 확인

#### Then (예상 결과)
- 모든 단계가 에러 없이 실행됨
- API Routes가 모든 요청 처리 (`/api/payments/*`)
- SDK가 Payment Server와 정상 통신
- UI에 결제 상태 실시간 업데이트
- 이력 섹션에 완료된 결제 표시

#### 검증 방법
1. 브라우저에서 전체 플로우 실행
2. DevTools Network 탭에서 모든 요청 확인:
   - `POST /api/payments/create`
   - `GET /api/payments/{id}/status` (polling)
   - `POST /api/payments/{id}/gasless` 또는 `/relay`
   - `GET /api/payments/history?payer={address}`
3. UI 상태 변화 확인:
   - Pending → Processing → Completed
4. 이력 섹션에 결제 표시 확인

---

### 통합 시나리오 2: 에러 복구

#### Given (전제 조건)
- Payment Server 실행 중
- Demo App 실행 중
- 결제 진행 중 (Status: Pending)

#### When (실행 조건)
1. Payment Server 종료
2. Frontend가 상태 조회 시도 → 에러 발생
3. Payment Server 재시작
4. Frontend가 상태 조회 재시도 → 성공

#### Then (예상 결과)
- 서버 종료 시 에러 메시지 표시
- 서버 재시작 후 자동 복구 (polling 재개)
- 결제 상태 정상 업데이트

#### 검증 방법
1. 결제 진행 중 Payment Server 종료
2. UI 에러 메시지 확인
3. Payment Server 재시작
4. UI 자동 복구 확인 (polling 재개)
5. 결제 상태 정상 업데이트 확인

---

## Quality Gate 기준

### 코드 품질
- ✅ TypeScript 타입 에러 없음 (`tsc --noEmit`)
- ✅ ESLint 경고 없음 (`eslint . --ext .ts,.tsx`)
- ✅ Prettier 포맷팅 완료 (`prettier --check .`)

### 빌드 및 실행
- ✅ 빌드 성공 (`pnpm build`)
- ✅ 개발 서버 실행 성공 (`pnpm dev`)
- ✅ 프로덕션 빌드 성공 (`pnpm build && pnpm start`)

### 기능 검증
- ✅ 모든 수락 기준 (AC-DEMO-001-001 ~ 004) 통과
- ✅ 모든 엣지 케이스 통과
- ✅ 통합 시나리오 1, 2 통과

### 성능 검증
- ✅ API Routes 응답 시간 < 200ms
- ✅ 레이턴시 증가 < 50ms (기존 대비)

### 보안 검증
- ✅ 환경 변수 Frontend 노출 안 됨
- ✅ API Key 브라우저 노출 안 됨

---

## Definition of Done

다음 조건이 모두 충족되면 SPEC-DEMO-001 완료로 간주합니다:

1. ✅ 모든 파일 생성 완료 (6개 신규, 2개 수정)
2. ✅ 의존성 설치 완료 (`pnpm install` 성공)
3. ✅ 빌드 성공 (`pnpm build` 에러 없음)
4. ✅ 개발 서버 실행 성공 (http://localhost:3000)
5. ✅ 모든 수락 기준 통과 (AC-DEMO-001-001 ~ 004, NF01 ~ NF03)
6. ✅ 엣지 케이스 처리 완료 (Edge Case 1 ~ 3)
7. ✅ 통합 시나리오 검증 완료 (시나리오 1 ~ 2)
8. ✅ Quality Gate 기준 충족
9. ✅ 코드 리뷰 완료 (TypeScript, ESLint, Prettier)
10. ✅ 문서화 완료 (README.md 업데이트, 필요시)

---

## 테스트 실행 가이드

### 환경 준비

```bash
# Terminal 1: Payment Server 실행
cd packages/server
pnpm dev  # Port 3001

# Terminal 2: Demo App 실행
cd apps/demo
pnpm install  # SDK 의존성 설치
pnpm dev      # Port 3000
```

### 수동 테스트 실행 순서

1. **AC-DEMO-001-001**: Payment Status 조회
   - http://localhost:3000 접속
   - 상품 구매 → 결제 진행
   - DevTools Network 탭 확인

2. **AC-DEMO-001-002**: Payment History 확인
   - 이력 섹션 확인
   - Network 탭에서 `/api/payments/history` 확인

3. **AC-DEMO-001-003**: 에러 처리
   - Payment Server 종료
   - 에러 메시지 확인
   - Payment Server 재시작 → 복구 확인

4. **AC-DEMO-001-004**: Frontend 무수정
   - `git diff apps/demo/src/components/` 실행
   - 수정 사항 없음 확인

5. **Edge Cases**: 엣지 케이스 검증
   - paymentId 누락 시나리오
   - payer 파라미터 누락 시나리오
   - SDK 에러 시나리오

6. **통합 시나리오**: 전체 플로우 검증
   - 시나리오 1: 전체 결제 플로우
   - 시나리오 2: 에러 복구

---

## 보고서 템플릿

### 테스트 결과 보고서

```markdown
## SPEC-DEMO-001 테스트 결과

**테스트 일자**: YYYY-MM-DD
**테스터**: [이름]

### 수락 기준 결과

| ID | 수락 기준 | 결과 | 비고 |
|----|-----------|------|------|
| AC-DEMO-001-001 | Payment Status 조회 | ✅ Pass / ❌ Fail | |
| AC-DEMO-001-002 | Payment History 확인 | ✅ Pass / ❌ Fail | |
| AC-DEMO-001-003 | 에러 처리 | ✅ Pass / ❌ Fail | |
| AC-DEMO-001-004 | Frontend 무수정 | ✅ Pass / ❌ Fail | |
| AC-DEMO-001-NF01 | 성능 요구사항 | ✅ Pass / ❌ Fail | 평균 응답 시간: XXms |
| AC-DEMO-001-NF02 | 무상태성 | ✅ Pass / ❌ Fail | |
| AC-DEMO-001-NF03 | 보안 요구사항 | ✅ Pass / ❌ Fail | |

### 엣지 케이스 결과

| 케이스 | 결과 | 비고 |
|--------|------|------|
| paymentId 누락 | ✅ Pass / ❌ Fail | |
| payer 파라미터 누락 | ✅ Pass / ❌ Fail | |
| SDK 에러 | ✅ Pass / ❌ Fail | |

### 통합 시나리오 결과

| 시나리오 | 결과 | 비고 |
|----------|------|------|
| 전체 결제 플로우 | ✅ Pass / ❌ Fail | |
| 에러 복구 | ✅ Pass / ❌ Fail | |

### 전체 평가

- **총 테스트 케이스**: XX개
- **통과**: XX개
- **실패**: XX개
- **통과율**: XX%

### 발견된 이슈

1. [이슈 제목]: [설명]
2. ...

### 권장 사항

1. [권장 사항 1]
2. ...
```

---

## 요약

SPEC-DEMO-001의 완료를 위해 총 **10개의 수락 기준**과 **3개의 엣지 케이스**, **2개의 통합 시나리오**를 검증해야 합니다.

모든 테스트 케이스가 통과하고 Quality Gate 기준을 충족하면 SPEC-DEMO-001은 완료됩니다.
