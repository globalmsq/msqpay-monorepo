# SPEC-RELAY-001: 인수 기준

## TAG BLOCK

- SPEC-ID: SPEC-RELAY-001
- Document: Acceptance Criteria
- Version: 2.0
- Created: 2025-12-01
- Updated: 2025-12-01

## 인수 기준 개요

MockDefender 패키지 구현의 완료 조건과 품질 검증 기준을 정의합니다. 모든 인수 기준은 Given-When-Then 형식으로 작성됩니다.

## 기능 인수 기준

### AC-001: OZ Defender SDK 인터페이스 호환

Given: DefenderService가 OZ Defender SDK를 사용하고 있을 때
When: import 문을 MockDefender로 변경하면
Then: 타입 에러 없이 컴파일되어야 합니다
And: 기존 DefenderService 코드 변경 없이 동작해야 합니다

검증 방법:
- TypeScript 컴파일 성공 확인
- tsc --noEmit 명령 실행 시 에러 없음

### AC-002: 트랜잭션 제출 성공

Given: MockDefender가 Hardhat 노드에 연결되어 있고
And: 유효한 트랜잭션 데이터가 준비되어 있을 때
When: relaySigner.sendTransaction() 메서드를 호출하면
Then: transactionId와 hash를 포함한 RelayerTransactionResponse를 반환해야 합니다
And: status는 'pending'이어야 합니다

검증 방법:
- 단위 테스트 통과
- 통합 테스트에서 실제 트랜잭션 제출 확인

### AC-003: 트랜잭션 상태 조회

Given: sendTransaction()으로 트랜잭션이 제출되었을 때
When: 반환된 transactionId로 getTransaction()을 호출하면
Then: 현재 트랜잭션 상태를 포함한 RelayerGetTxResponse를 반환해야 합니다
And: hash가 제출 시 반환된 값과 동일해야 합니다

검증 방법:
- 단위 테스트 통과
- 상태 변화 추적 테스트

### AC-004: 릴레이어 정보 조회

Given: MockDefender가 초기화되어 있을 때
When: relaySigner.getRelayer()를 호출하면
Then: 설정된 Hardhat Account #0 주소를 포함한 정보를 반환해야 합니다
And: 반환 값은 유효한 Ethereum 주소 형식이어야 합니다

검증 방법:
- 0x로 시작하는 42자 문자열 확인
- Hardhat 기본 계정 주소와 일치 확인

### AC-005: 응답 형식 호환성

Given: OZ Defender SDK의 응답 형식이 정의되어 있을 때
When: MockDefender의 각 메서드를 호출하면
Then: OZ Defender SDK와 동일한 필드와 타입을 가진 응답을 반환해야 합니다

검증 케이스:
- sendTransaction() → RelayerTransactionResponse (transactionId, hash, status)
- getTransaction() → RelayerGetTxResponse (transactionId, hash, status, ...)
- getRelayer() → RelayerInfo (address, ...)

### AC-006: MockDefender 초기화

Given: API 키와 시크릿이 파라미터로 제공될 때
When: new MockDefender({ relayerApiKey, relayerApiSecret })를 호출하면
Then: 에러 없이 인스턴스가 생성되어야 합니다
And: relaySigner 속성이 MockRelaySigner 인스턴스여야 합니다

검증 방법:
- 인스턴스 생성 테스트
- relaySigner 타입 검증

### AC-007: 에러 처리

Given: 잘못된 트랜잭션 데이터가 제공될 때
When: sendTransaction()을 호출하면
Then: 적절한 에러 메시지와 함께 예외가 발생해야 합니다

검증 케이스:
- 잘못된 주소 형식 → 에러 발생
- 잔액 부족 → 에러 발생
- RPC 연결 실패 → 에러 발생

## 패키지 구조 인수 기준

### AC-008: 패키지 독립성

Given: mock-defender 패키지가 생성되어 있을 때
When: 패키지를 빌드하면
Then: packages/mock-defender/dist/ 디렉토리에 빌드 결과물이 생성되어야 합니다
And: 다른 패키지에서 import 가능해야 합니다

검증 방법:
- pnpm build 성공
- packages/server에서 import 성공

### AC-009: 타입 정의 export

Given: mock-defender 패키지가 빌드되어 있을 때
When: 패키지를 import하면
Then: MockDefender, MockRelaySigner, 관련 타입들이 export되어야 합니다

검증 방법:
- import { MockDefender } from 'mock-defender' 성공
- TypeScript 타입 추론 정상 동작

## Docker Compose 통합 인수 기준

### AC-010: 환경 변수 설정

Given: docker-compose.yml이 업데이트되어 있을 때
When: docker-compose up 명령을 실행하면
Then: server 컨테이너에 RELAYER_PRIVATE_KEY 환경 변수가 설정되어야 합니다
And: RELAYER_ADDRESS와 RPC_URL이 설정되어야 합니다

검증 방법:
- docker exec로 환경 변수 확인
- docker-compose config로 설정 검증

### AC-011: 전체 플로우 테스트

Given: Docker Compose 환경이 실행 중이고
And: 서버가 MockDefender를 사용하도록 설정되어 있을 때
When: /payments/gasless 엔드포인트로 트랜잭션 요청을 보내면
Then: 트랜잭션이 Hardhat 노드에 제출되어야 합니다
And: 트랜잭션 해시가 응답으로 반환되어야 합니다

검증 방법:
- curl 또는 Postman으로 API 호출
- Hardhat 노드 로그에서 트랜잭션 확인

## 비기능 인수 기준

### AC-012: 타입 안전성

Given: TypeScript strict 모드가 활성화되어 있을 때
When: 전체 프로젝트를 빌드하면
Then: 타입 에러 없이 빌드가 완료되어야 합니다

검증 방법:
- pnpm build 성공
- tsc --noEmit 성공

### AC-013: 테스트 커버리지

Given: MockDefender 테스트가 작성되어 있을 때
When: 테스트 커버리지를 측정하면
Then: 새로 작성된 코드의 커버리지가 80% 이상이어야 합니다

검증 방법:
- vitest --coverage 실행
- 커버리지 리포트 확인

### AC-014: 문서화

Given: MockDefender가 구현되어 있을 때
When: 코드를 검토하면
Then: 모든 공개 메서드에 JSDoc 주석이 있어야 합니다
And: 주요 로직에 인라인 주석이 있어야 합니다

검증 방법:
- 코드 리뷰
- JSDoc 생성 도구로 문서 확인

## Quality Gate 체크리스트

### 필수 통과 항목

코드 품질:
- TypeScript 컴파일 에러 없음
- ESLint 경고/에러 없음
- Prettier 포맷팅 적용

테스트:
- 단위 테스트 100% 통과
- 통합 테스트 100% 통과
- 새 코드 커버리지 80% 이상

기능:
- AC-001 ~ AC-011 모든 인수 기준 충족

문서:
- JSDoc 주석 완료
- SPEC 문서 최종 업데이트

## Definition of Done

SPEC-RELAY-001 완료 조건:

구현 완료:
- packages/mock-defender 패키지 생성 완료
- MockDefender 클래스 구현 완료
- MockRelaySigner 클래스 구현 완료
- 타입 정의 완료
- DefenderService import 변경 완료
- Docker Compose 환경 변수 설정 완료

테스트 완료:
- 단위 테스트 작성 및 통과
- 통합 테스트 작성 및 통과
- Docker Compose 환경 E2E 테스트 통과

문서 완료:
- spec.md 최종 검토 완료
- plan.md 구현 결과 반영 완료
- acceptance.md 검증 결과 기록 완료

배포 준비:
- main 브랜치 머지 가능 상태
- CI/CD 파이프라인 통과
