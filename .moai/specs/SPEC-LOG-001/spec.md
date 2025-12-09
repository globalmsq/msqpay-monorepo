# SPEC-LOG-001: Console.log를 Pino 로거로 전환

---
id: SPEC-LOG-001
title: Console.log를 Pino 로거로 전환
status: completed
priority: high
created: 2025-12-09
completed: 2025-12-09
tags: [logging, pino, fastify, refactoring]
---

## 1. 개요

### 1.1 배경

pay-server 패키지에서 현재 `console.log`, `console.error`, `console.warn`을 직접 사용하고 있습니다. Fastify는 이미 Pino 로거를 내장하고 있으므로(`logger: true` 설정), 별도의 의존성 추가 없이 통합 로깅 시스템으로 전환할 수 있습니다.

### 1.2 현재 상태

**대상 파일 및 console 문 분포:**

| 파일 | log | error | warn | 합계 |
|------|-----|-------|------|------|
| src/index.ts | 5 | 2 | 0 | 7 |
| src/db/redis.ts | 0 | 0 | 3 | 3 |
| src/config/chains.config.ts | 1 | 1 | 0 | 2 |
| src/services/defender.service.ts | 3 | 5 | 2 | 10 |
| src/services/blockchain.service.ts | 1 | 6 | 2 | 9 |

**총계: 36개 console 문 (log: 10, error: 14, warn: 7)**

### 1.3 목표

- 중앙화된 로거 모듈 생성 (`src/lib/logger.ts`)
- 모든 console 문을 Pino 로거로 교체
- 환경(NODE_ENV)에 따른 로그 레벨 설정
- 구조화된 로깅으로 운영 가시성 향상
- Fastify 내장 Pino와의 일관성 유지

---

## 2. 요구사항 (EARS 형식)

### 2.1 Ubiquitous Requirements (시스템 전역)

- **[REQ-U-001]** 시스템은 모든 로그 출력에 Pino 로거를 사용해야 한다
- **[REQ-U-002]** 시스템은 console.log/error/warn을 직접 사용하지 않아야 한다
- **[REQ-U-003]** 모든 로그는 JSON 형식의 구조화된 데이터를 포함해야 한다

### 2.2 Event-Driven Requirements (이벤트 기반)

- **[REQ-E-001]** 서버 시작 시, 로거는 환경 변수(NODE_ENV)에 따라 로그 레벨을 설정해야 한다
  - development: debug
  - production: info
  - test: silent
- **[REQ-E-002]** 에러 발생 시, 로거는 에러 객체를 구조화된 형태로 기록해야 한다
- **[REQ-E-003]** 서비스 작업 수행 시, 로거는 서비스명과 작업명을 컨텍스트에 포함해야 한다

### 2.3 State-Driven Requirements (상태 기반)

- **[REQ-S-001]** Redis 연결 불가 상태에서, 로거는 warn 레벨로 연결 실패를 기록해야 한다
- **[REQ-S-002]** 릴레이어 잔액 부족 상태에서, 로거는 error 레벨로 경고를 기록해야 한다

### 2.4 Unwanted Behavior Requirements (금지 사항)

- **[REQ-X-001]** 프로덕션 환경에서 debug 레벨 로그가 출력되어서는 안 된다
- **[REQ-X-002]** 민감한 정보(API 키, 시크릿)가 로그에 포함되어서는 안 된다

### 2.5 Optional Requirements (선택 사항)

- **[REQ-O-001]** 가능한 경우, 로그에 요청 ID(request-id)를 포함할 수 있다
- **[REQ-O-002]** 가능한 경우, 로그에 체인 ID를 컨텍스트로 포함할 수 있다

---

## 3. 기술 명세

### 3.1 로거 모듈 구조

**파일 위치**: `src/lib/logger.ts`

**핵심 기능:**

1. **createLogger(name: string)**: 서비스별 child 로거 생성
2. **getLogLevel()**: NODE_ENV 기반 로그 레벨 결정
3. **rootLogger**: 애플리케이션 루트 로거 인스턴스

### 3.2 로그 레벨 매핑

| console 메서드 | Pino 레벨 |
|---------------|-----------|
| console.log | logger.info |
| console.error | logger.error |
| console.warn | logger.warn |

### 3.3 구조화된 로그 형식

```
{
  "level": 30,
  "time": 1702123456789,
  "pid": 12345,
  "hostname": "pay-server",
  "service": "BlockchainService",
  "operation": "getPaymentStatus",
  "chainId": 1,
  "msg": "결제 상태 조회 실패"
}
```

### 3.4 이모지 처리

현재 로그 메시지에 사용된 이모지는 그대로 유지합니다:
- 시각적 명확성을 위해 이모지 접두사 보존
- 예: `logger.info('Server running on...')` (이모지 포함 메시지)

### 3.5 한국어 메시지 처리

현재 에러 메시지의 한국어 텍스트는 그대로 유지합니다:
- 사용자/개발자 친화적인 메시지 보존
- 예: `logger.error({ err }, '릴레이 상태 조회 실패')`

---

## 4. 아키텍처 설계

### 4.1 의존성

```
Fastify (logger: true)
    └── Pino (내장)
            └── src/lib/logger.ts (child logger factory)
                    ├── src/index.ts
                    ├── src/db/redis.ts
                    ├── src/config/chains.config.ts
                    ├── src/services/defender.service.ts
                    └── src/services/blockchain.service.ts
```

### 4.2 Fastify 통합

- Fastify 인스턴스의 `server.log`를 rootLogger로 재사용
- 라우트 핸들러에서는 `request.log` 사용 (자동 request-id 포함)
- 서비스 레이어에서는 `createLogger('ServiceName')` 사용

---

## 5. 제약 조건

### 5.1 기술적 제약

- 새로운 npm 의존성 추가 금지 (Pino는 Fastify에 내장)
- 기존 로그 메시지의 의미 변경 금지
- 이모지 및 한국어 메시지 보존

### 5.2 호환성 제약

- Node.js 18+ 호환
- Fastify 5.x 호환
- TypeScript strict 모드 준수

---

## 6. 추적성

| 요구사항 ID | 구현 위치 | 테스트 케이스 |
|------------|----------|--------------|
| REQ-U-001 | src/lib/logger.ts | TC-001 |
| REQ-U-002 | 모든 대상 파일 | TC-002 |
| REQ-U-003 | createLogger() | TC-003 |
| REQ-E-001 | getLogLevel() | TC-004 |
| REQ-E-002 | 에러 로깅 패턴 | TC-005 |
| REQ-E-003 | child logger 생성 | TC-006 |
| REQ-S-001 | src/db/redis.ts | TC-007 |
| REQ-S-002 | src/services/defender.service.ts | TC-008 |
| REQ-X-001 | getLogLevel() | TC-009 |
| REQ-X-002 | 코드 리뷰 | TC-010 |

---

## 7. 관련 문서

- Fastify Logging 문서: https://fastify.dev/docs/latest/Reference/Logging/
- Pino 문서: https://getpino.io/
- SPEC-SERVER-001: Pay Server 초기 구현
