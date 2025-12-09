# SPEC-LOG-001: 구현 계획

---
id: SPEC-LOG-001
title: Console.log를 Pino 로거로 전환 - 구현 계획
status: completed
---

## 1. 구현 개요

### 1.1 범위

- 중앙화된 로거 모듈 생성
- 5개 파일의 36개 console 문 교체
- Fastify 로거와의 통합

### 1.2 변경 영향도

| 구분 | 내용 |
|------|------|
| 변경 파일 수 | 6개 (1개 신규 + 5개 수정) |
| 변경 라인 수 | 약 80-100 라인 |
| 위험도 | 낮음 (로깅만 변경, 비즈니스 로직 유지) |
| 의존성 추가 | 없음 (Fastify 내장 Pino 사용) |

---

## 2. 마일스톤

### Phase 1: 로거 모듈 생성 (Primary)

**목표**: 중앙화된 로거 팩토리 모듈 생성

**작업 항목:**

1. `src/lib/logger.ts` 파일 생성
2. getLogLevel() 함수 구현 (NODE_ENV 기반)
3. createLogger(name) 함수 구현 (child logger 팩토리)
4. rootLogger 인스턴스 export

**산출물:**
- `/packages/pay-server/src/lib/logger.ts`

### Phase 2: 서비스 레이어 전환 (Primary)

**목표**: 서비스 파일의 console 문을 로거로 교체

**대상 파일:**

1. `src/services/blockchain.service.ts` (9개 문)
   - console.log: 1개
   - console.error: 6개
   - console.warn: 2개

2. `src/services/defender.service.ts` (10개 문)
   - console.log: 3개
   - console.error: 5개
   - console.warn: 2개

**변환 패턴:**
- `console.log(msg)` -> `logger.info(msg)`
- `console.error(msg, err)` -> `logger.error({ err }, msg)`
- `console.warn(msg)` -> `logger.warn(msg)`

### Phase 3: 인프라 레이어 전환 (Secondary)

**목표**: DB/설정 파일의 console 문 교체

**대상 파일:**

1. `src/db/redis.ts` (3개 문)
   - console.warn: 3개

2. `src/config/chains.config.ts` (2개 문)
   - console.log: 1개
   - console.error: 1개

### Phase 4: 진입점 전환 (Secondary)

**목표**: 메인 진입점 파일의 console 문 교체

**대상 파일:**

1. `src/index.ts` (7개 문)
   - console.log: 5개
   - console.error: 2개

**특이 사항:**
- Fastify 인스턴스의 `server.log` 활용 가능
- 서버 시작/종료 로그는 server.log 사용 권장

### Phase 5: 검증 및 정리 (Final)

**목표**: 전환 완료 확인 및 잔여 console 문 제거

**작업 항목:**

1. 전체 프로젝트에서 console.log/error/warn 검색
2. 누락된 console 문 교체
3. 로깅 동작 수동 테스트
4. 코드 리뷰

---

## 3. 기술적 접근

### 3.1 로거 모듈 설계

```typescript
// src/lib/logger.ts 구조 개요

// 1. 로그 레벨 결정 함수
function getLogLevel(): string {
  // NODE_ENV에 따라 debug/info/silent 반환
}

// 2. 루트 로거 생성
const rootLogger = pino({
  level: getLogLevel(),
  // 추가 옵션...
});

// 3. 서비스별 child 로거 팩토리
function createLogger(name: string): Logger {
  return rootLogger.child({ service: name });
}
```

### 3.2 서비스별 로거 사용 패턴

```typescript
// 서비스 파일 상단
import { createLogger } from '../lib/logger';

const logger = createLogger('ServiceName');

// 사용 예시
logger.info('작업 시작');
logger.error({ err }, '작업 실패');
logger.warn('경고 메시지');
```

### 3.3 구조화된 에러 로깅

```typescript
// Before
console.error('[DefenderService] Gasless 거래 제출 실패:', error);

// After
logger.error({ err: error, paymentId }, 'Gasless 거래 제출 실패');
```

### 3.4 컨텍스트 포함 로깅

```typescript
// Before
console.log(`[DefenderService] 트랜잭션 제출됨: paymentId=${paymentId}, txId=${tx.transactionId}`);

// After
logger.info({ paymentId, txId: tx.transactionId }, '트랜잭션 제출됨');
```

---

## 4. 파일별 변환 상세

### 4.1 src/services/defender.service.ts

| 라인 | 현재 | 변환 후 |
|------|------|---------|
| 172-174 | console.log | logger.info({ paymentId, txId }) |
| 182 | console.error | logger.error({ err, paymentId }) |
| 259-261 | console.log | logger.info({ paymentId, txId }) |
| 269 | console.error | logger.error({ err, paymentId }) |
| 327 | console.error | logger.error({ err, relayRequestId }) |
| 354-355 | console.warn | logger.warn({ relayRequestId }) |
| 366-368 | console.warn | logger.warn({ relayRequestId }) |
| 371 | console.error | logger.error({ err, relayRequestId }) |
| 442 | console.error | logger.error({ err, gasLimit }) |
| 469 | console.error | logger.error({ err, address }) |
| 505 | console.error | logger.error({ err }) |

### 4.2 src/services/blockchain.service.ts

| 라인 | 현재 | 변환 후 |
|------|------|---------|
| 111 | console.log | logger.info({ chainId, name, rpcUrl }) |
| 257 | console.error | logger.error({ err, paymentId }) |
| 328 | console.error | logger.error({ err, paymentId }) |
| 354 | console.error | logger.error({ err }) |
| 383 | console.error | logger.error({ err, txHash }) |
| 402 | console.error | logger.error({ err }) |
| 422 | console.error | logger.error({ err, tokenAddress }) |
| 447 | console.error | logger.error({ err, tokenAddress }) |
| 467 | console.error | logger.error({ err, tokenAddress }) |
| 556 | console.error | logger.error({ err, payerAddress }) |
| 575 | console.warn | logger.warn({ tokenAddress }) |

### 4.3 src/index.ts

| 라인 | 현재 | 변환 후 |
|------|------|---------|
| 33 | console.log | logger.info({ configPath }) |
| 38 | console.log | logger.info({ chains }) |
| 40-41 | console.error | logger.error({ err, configPath }) |
| 112 | console.log | logger.info({ signal }) |
| 117 | console.log | logger.info() |
| 120 | console.error | logger.error({ err }) |
| 137 | console.log | logger.info({ host, port }) |

### 4.4 src/db/redis.ts

| 라인 | 현재 | 변환 후 |
|------|------|---------|
| 29 | console.warn | logger.warn({ err }) |
| 64 | console.warn | logger.warn({ key, err }) |
| 78 | console.warn | logger.warn({ key, err }) |
| 91 | console.warn | logger.warn({ key, err }) |

### 4.5 src/config/chains.config.ts

| 라인 | 현재 | 변환 후 |
|------|------|---------|
| 60-61 | console.error | logger.error({ errors }) |

---

## 5. 리스크 및 대응

### 5.1 잠재적 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 로그 출력 형식 변경으로 모니터링 도구 호환성 문제 | 낮음 | 중간 | 기존 이모지/메시지 보존 |
| 성능 저하 (구조화 로깅 오버헤드) | 매우 낮음 | 낮음 | Pino는 고성능, 무시 가능 수준 |
| 누락된 console 문 존재 | 중간 | 낮음 | grep으로 전체 검색 후 처리 |

### 5.2 롤백 계획

1. Git 커밋 단위로 작업 (Phase별 커밋)
2. 문제 발생 시 해당 Phase만 롤백 가능
3. 모든 변경은 로깅 레이어에 한정되어 비즈니스 로직 영향 없음

---

## 6. 의존성

### 6.1 선행 조건

- Fastify 인스턴스가 `logger: true`로 설정됨 (확인 완료)
- pino 패키지는 Fastify에 내장되어 별도 설치 불필요

### 6.2 후속 작업

- 운영 환경에서 로그 수집/분석 도구 연동 검토 (선택)
- request-id 기반 분산 추적 구현 (선택)

---

## 7. 완료 기준

### 7.1 Phase별 완료 기준

| Phase | 완료 기준 |
|-------|----------|
| Phase 1 | logger.ts 생성, createLogger 동작 확인 |
| Phase 2 | 서비스 파일 console 문 0개 |
| Phase 3 | 인프라 파일 console 문 0개 |
| Phase 4 | index.ts console 문 0개 |
| Phase 5 | 전체 프로젝트 console 문 0개, 수동 테스트 통과 |

### 7.2 전체 완료 기준

- `grep -r "console\.(log\|error\|warn)" src/` 결과 0건
- 서버 정상 시작 확인
- 로그 출력 형식 검증 (JSON 구조화)
- 환경별 로그 레벨 동작 확인
