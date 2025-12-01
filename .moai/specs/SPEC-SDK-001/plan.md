# SPEC-SDK-001 Implementation Plan

## Overview

상점서버용 결제 SDK (`@globalmsq/msqpay`) 구현 계획입니다.

---

## Phase 1: Cleanup (기존 SDK 삭제)

### 작업 내용
1. `packages/sdk/` 디렉토리 전체 삭제
2. 기존 viem 기반 SDK 제거

### 명령어
```bash
rm -rf packages/sdk/
```

---

## Phase 2: Package Setup

### 2.1 디렉토리 구조 생성

```
packages/sdk/
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── types.ts
│   ├── constants.ts
│   └── errors.ts
├── tests/
│   └── client.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 2.2 package.json

```json
{
  "name": "@globalmsq/msqpay",
  "version": "0.1.0",
  "description": "MSQPay SDK for store servers",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "MIT"
}
```

### 2.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 2.4 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData'
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      }
    }
  }
});
```

---

## Phase 3: Core Implementation

### 3.1 types.ts (타입 정의)

**내용**:
- Environment 타입
- MSQPayConfig 인터페이스
- CreatePaymentParams/Response
- PaymentStatusResponse
- GaslessParams/Response
- RelayParams/Response
- ErrorResponse

### 3.2 constants.ts (상수)

**내용**:
- API_URLS (환경별 URL 매핑)
- DEFAULT_HEADERS

### 3.3 errors.ts (에러 클래스)

**내용**:
- MSQPayError 클래스
- 에러 코드 상수

### 3.4 client.ts (메인 클라이언트)

**내용**:
- MSQPayClient 클래스
- constructor (config 처리)
- setApiUrl / getApiUrl
- createPayment
- getPaymentStatus
- submitGasless
- executeRelay
- private request 메서드

### 3.5 index.ts (진입점)

**내용**:
- 모든 타입 export
- MSQPayClient export
- MSQPayError export

---

## Phase 4: Testing

### 4.1 테스트 케이스

| 메서드 | 성공 케이스 | 실패 케이스 |
|--------|-----------|-----------|
| constructor | 환경별 URL 설정 | custom 환경 apiUrl 누락 |
| createPayment | 정상 응답 | VALIDATION_ERROR |
| getPaymentStatus | 정상 응답 | NOT_FOUND |
| submitGasless | 정상 응답 | INVALID_SIGNATURE |
| executeRelay | 정상 응답 | INVALID_TRANSACTION_DATA |
| setApiUrl | URL 변경 | - |
| getApiUrl | URL 반환 | - |

### 4.2 Mock 전략

```typescript
// vi.mock 사용
vi.stubGlobal('fetch', vi.fn());

// 성공 응답
vi.mocked(fetch).mockResolvedValueOnce({
  ok: true,
  json: async () => ({ success: true, paymentId: 'test-id' })
});

// 에러 응답
vi.mocked(fetch).mockResolvedValueOnce({
  ok: false,
  status: 400,
  json: async () => ({ code: 'VALIDATION_ERROR', message: '검증 실패' })
});
```

### 4.3 커버리지 목표

- Statements: ≥ 90%
- Branches: ≥ 85%
- Functions: ≥ 90%
- Lines: ≥ 90%

---

## Phase 5: Documentation

### 5.1 README.md 내용

1. 설치 방법
2. 초기화 예제
3. API 메서드 사용 예제
4. 에러 처리 예제
5. TypeScript 타입 참조

---

## Phase 6: Git Operations

### 6.1 브랜치 생성

```bash
git checkout -b feature/SPEC-SDK-001
```

### 6.2 커밋

```bash
git add packages/sdk/
git commit -m "feat(sdk): implement @globalmsq/msqpay HTTP client

- Add MSQPayClient class with 4 API methods
- createPayment, getPaymentStatus, submitGasless, executeRelay
- Native fetch (no external dependencies)
- 90%+ test coverage
- TypeScript types matching server schemas

Implements: SPEC-SDK-001"
```

---

## Summary

| Phase | 작업 |
|-------|------|
| 1 | Cleanup |
| 2 | Package Setup |
| 3 | Core Implementation |
| 4 | Testing |
| 5 | Documentation |
| 6 | Git Operations |

---

## Dependencies

- SPEC-SERVER-002 완료 (결제 서버 API)

## Risks

| Risk | Mitigation |
|------|------------|
| 서버 API 스키마 변경 | 타입 테스트로 조기 감지 |
| fetch mock 이슈 | vitest 최신 버전 사용 |

---

**Next Step**: `/moai:2-run SPEC-SDK-001`
