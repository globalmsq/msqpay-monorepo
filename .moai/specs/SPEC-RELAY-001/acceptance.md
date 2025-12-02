# SPEC-RELAY-001: 인수 기준

## TAG BLOCK

- SPEC-ID: SPEC-RELAY-001
- Document: Acceptance Criteria
- Version: 4.1.0
- Created: 2025-12-01
- Updated: 2025-12-02
- Status: Verified

## 인수 기준 개요

OZ Defender API 호환 Gasless 트랜잭션 시스템 구현의 완료 조건과 품질 검증 기준을 정의합니다. 모든 인수 기준은 Given-When-Then 형식으로 작성됩니다.

## SimpleDefender HTTP 서비스 인수 기준

### AC-001: SimpleDefender 서버 시작

Given: SimpleDefender 패키지가 빌드되어 있고
And: 필수 환경변수 (RELAYER_PRIVATE_KEY, RPC_URL, CHAIN_ID, FORWARDER_ADDRESS)가 설정되어 있을 때
When: SimpleDefender 서버를 시작하면
Then: 포트 3001에서 HTTP 서버가 시작되어야 합니다
And: /health 엔드포인트가 { status: "ok" }를 반환해야 합니다

검증 결과: ✅ 통과
- Fastify 서버 정상 시작 확인
- 헬스체크 엔드포인트 동작 확인

### AC-002: POST /relay 트랜잭션 제출

Given: SimpleDefender 서버가 실행 중이고
And: 유효한 트랜잭션 데이터 (to, data, gasLimit)가 준비되어 있을 때
When: POST /relay 엔드포인트에 요청을 보내면
Then: transactionId, hash, status를 포함한 응답을 반환해야 합니다
And: 트랜잭션이 블록체인에 제출되어야 합니다

검증 결과: ✅ 통과
- 단위 테스트: packages/simple-defender/tests/relay.service.test.ts
- 트랜잭션 제출 및 응답 형식 확인

### AC-003: GET /relay/:id 상태 조회

Given: 트랜잭션이 제출되어 있을 때
When: GET /relay/:transactionId 엔드포인트에 요청을 보내면
Then: 현재 트랜잭션 상태를 반환해야 합니다

상태별 검증:
- pending: 트랜잭션이 아직 마이닝되지 않음
- sent: 트랜잭션이 네트워크에 전송됨
- mined: 트랜잭션이 블록에 포함됨
- confirmed: 1개 이상의 confirmation
- failed: 트랜잭션이 revert됨

검증 결과: ✅ 통과
- 단위 테스트: getTransaction 테스트 케이스 통과

### AC-004: GET /relayer 정보 조회

Given: MockDefender 서버가 실행 중일 때
When: GET /relayer 엔드포인트에 요청을 보내면
Then: Relayer의 address와 balance를 반환해야 합니다

검증 결과: ✅ 통과
- 단위 테스트: getRelayerInfo 테스트 케이스 통과

## DefenderService HTTP 클라이언트 인수 기준

### AC-005: DefenderService 초기화

Given: DEFENDER_API_URL 환경변수가 설정되어 있을 때
When: DefenderService 인스턴스를 생성하면
Then: HTTP 클라이언트가 초기화되어야 합니다
And: apiUrl이 없으면 에러가 발생해야 합니다

검증 결과: ✅ 통과
- 단위 테스트: packages/pay-server/tests/services/defender.service.test.ts
- constructor 테스트 케이스 통과

### AC-006: submitGaslessTransaction HTTP 요청

Given: DefenderService가 초기화되어 있고
And: 유효한 트랜잭션 데이터가 준비되어 있을 때
When: submitGaslessTransaction()을 호출하면
Then: HTTP POST /relay 요청이 전송되어야 합니다
And: relayRequestId, transactionHash, status를 반환해야 합니다

검증 결과: ✅ 통과
- fetch mock 테스트 통과
- 요청 형식 및 응답 매핑 확인

### AC-007: getRelayStatus HTTP 요청

Given: 트랜잭션이 제출되어 있을 때
When: getRelayStatus(relayRequestId)를 호출하면
Then: HTTP GET /relay/:id 요청이 전송되어야 합니다
And: 현재 트랜잭션 상태를 반환해야 합니다

검증 결과: ✅ 통과
- 단위 테스트 통과

### AC-008: 상태 매핑

Given: SimpleDefender 또는 OZ Defender API가 상태를 반환할 때
When: DefenderService가 상태를 매핑하면
Then: 다음과 같이 매핑되어야 합니다:
- pending, sent, submitted, inmempool → pending
- mined → mined
- confirmed → confirmed
- failed → failed

검증 결과: ✅ 통과
- 상태 매핑 테스트 케이스 통과

### AC-009: 에러 처리

Given: API 요청이 실패할 때
When: 특정 에러가 발생하면
Then: 적절한 에러 메시지가 반환되어야 합니다:
- insufficient funds → "릴레이어 잔액이 부족합니다"
- nonce 충돌 → "트랜잭션 nonce 충돌이 발생했습니다"
- 401 → "Defender API 인증에 실패했습니다"
- 404 → "릴레이 요청을 찾을 수 없습니다"

검증 결과: ✅ 통과
- 에러 처리 테스트 케이스 통과

## Docker Compose 통합 인수 기준

### AC-010: simple-defender 서비스 설정

Given: docker-compose.yml이 업데이트되어 있을 때
When: docker-compose config 명령을 실행하면
Then: simple-defender 서비스가 다음 설정을 가져야 합니다:
- 포트: 3002:3001
- 환경변수: RELAYER_PRIVATE_KEY, RPC_URL, CHAIN_ID, FORWARDER_ADDRESS
- 의존성: hardhat

검증 결과: ✅ 통과
- docker/docker-compose.yml 설정 확인

### AC-011: server 서비스 설정

Given: docker-compose.yml이 업데이트되어 있을 때
When: docker-compose config 명령을 실행하면
Then: server 서비스가 다음 설정을 가져야 합니다:
- DEFENDER_API_URL=http://simple-defender:3001
- RELAYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
- 의존성: simple-defender

검증 결과: ✅ 통과
- docker/docker-compose.yml 설정 확인

### AC-012: 환경 변수 통일

Given: 서버가 시작될 때
When: 환경 변수를 확인하면
Then: USE_MOCK_DEFENDER 환경변수가 없어야 합니다
And: DEFENDER_API_URL 환경변수만으로 환경을 구분해야 합니다

검증 결과: ✅ 통과
- USE_MOCK_DEFENDER 제거 확인
- DEFENDER_API_URL 기반 환경 전환 확인

## 코드 정리 인수 기준

### AC-013: RelayFactory 제거

Given: 코드베이스를 검사할 때
When: relay.factory.ts 파일을 찾으면
Then: 파일이 존재하지 않아야 합니다
And: RelayFactory 참조가 없어야 합니다

검증 결과: ✅ 통과
- packages/pay-server/src/services/relay.factory.ts 삭제 확인
- 관련 테스트 파일 삭제 확인

### AC-014: SimpleDefender 라이브러리 파일 제거

Given: 코드베이스를 검사할 때
When: simple-defender/src 디렉토리를 확인하면
Then: 다음 파일들이 존재하지 않아야 합니다:
- mock-defender.ts
- relay-signer.ts
- types.ts

검증 결과: ✅ 통과
- 라이브러리 파일 삭제 확인
- HTTP 서비스 파일만 존재 확인

### AC-015: OZ Defender SDK 의존성 제거

Given: packages/pay-server/package.json을 확인할 때
When: dependencies를 검사하면
Then: @openzeppelin/defender-sdk가 없어야 합니다

검증 결과: ✅ 통과
- package.json에서 의존성 제거 확인

## 테스트 인수 기준

### AC-016: SimpleDefender 단위 테스트

Given: packages/simple-defender/tests 디렉토리가 있을 때
When: pnpm test를 실행하면
Then: 모든 테스트가 통과해야 합니다

검증 결과: ✅ 통과
- 10개 테스트 통과

### AC-017: DefenderService 단위 테스트

Given: packages/pay-server/tests/services/defender.service.test.ts가 있을 때
When: pnpm test를 실행하면
Then: HTTP 클라이언트 기반 테스트가 모두 통과해야 합니다

검증 결과: ✅ 통과
- fetch mock 기반 테스트 통과

### AC-018: 전체 테스트 통과

Given: 모든 패키지가 빌드되어 있을 때
When: 전체 테스트를 실행하면
Then: 모든 테스트가 통과해야 합니다:
- packages/pay-server: 169개 테스트
- packages/simple-defender: 10개 테스트

검증 결과: ✅ 통과
- 전체 179개 테스트 통과

### AC-019: Nonce 직접 조회 (v4.1.0)

Given: 프론트엔드에서 Gasless 결제를 시작할 때
And: wagmi useReadContract 훅이 ERC2771Forwarder 컨트랙트에 연결되어 있을 때
When: 사용자가 Gasless 결제를 요청하면
Then: refetchNonce()를 통해 최신 nonce를 컨트랙트에서 직접 조회해야 합니다
And: API 캐싱으로 인한 stale nonce 문제가 발생하지 않아야 합니다

검증 결과: ✅ 통과
- PaymentModal.tsx에서 useReadContract 훅 사용 확인
- refetchNonce() 호출로 fresh nonce 보장
- Next.js API route 및 pay-server nonce 엔드포인트 제거 완료

## Quality Gate 체크리스트

### 필수 통과 항목

코드 품질:
- ✅ TypeScript 컴파일 에러 없음
- ✅ ESLint 경고/에러 없음 (해당 시)
- ✅ Prettier 포맷팅 적용 (해당 시)

테스트:
- ✅ 단위 테스트 100% 통과
- ✅ SimpleDefender HTTP 서비스 테스트 통과
- ✅ DefenderService HTTP 클라이언트 테스트 통과

기능:
- ✅ AC-001 ~ AC-019 모든 인수 기준 충족

코드 정리:
- ✅ USE_MOCK_DEFENDER 환경변수 제거
- ✅ RelayFactory 제거
- ✅ OZ Defender SDK 의존성 제거
- ✅ 레거시 라이브러리 파일 제거
- ✅ Nonce API 제거 (프론트엔드 직접 조회로 대체)

## Definition of Done

SPEC-RELAY-001 v4.1.0 완료 조건:

구현 완료:
- ✅ SimpleDefender HTTP 서비스 구현
- ✅ DefenderService HTTP 클라이언트 구현
- ✅ Docker Compose 설정 업데이트
- ✅ DEFENDER_API_URL 기반 환경 전환

코드 정리 완료:
- ✅ USE_MOCK_DEFENDER 환경변수 제거
- ✅ RelayFactory 제거
- ✅ OZ Defender SDK 의존성 제거
- ✅ 레거시 파일 삭제

테스트 완료:
- ✅ SimpleDefender 단위 테스트 작성 및 통과 (10개)
- ✅ DefenderService 단위 테스트 업데이트 및 통과
- ✅ 전체 테스트 통과 (179개)

문서 완료:
- ✅ spec.md v4.0.0 업데이트
- ✅ plan.md v4.0.0 업데이트
- ✅ acceptance.md v4.0.0 업데이트

## 변경 이력

### v4.1.0 (2025-12-02)
- AC-019 추가: Nonce 직접 조회 인수 기준
- 프론트엔드 wagmi useReadContract 기반 nonce 조회
- Next.js API 캐싱 이슈 해결 검증 완료

### v4.0.0 (2025-12-02)
- HTTP 서비스 기반 인수 기준으로 전면 개정
- USE_MOCK_DEFENDER 관련 기준 제거
- RelayFactory 관련 기준 제거
- DEFENDER_API_URL 기반 환경 전환 기준 추가
- 모든 인수 기준 검증 완료

### v3.0.0 (2025-12-01)
- 환경별 하이브리드 아키텍처 인수 기준
- USE_MOCK_DEFENDER 기반 환경 분기 기준
- RelayFactory 인수 기준
