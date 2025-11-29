# 결제 시스템 아키텍처 (SPEC-SERVER-002)

MSQPay 결제 시스템의 아키텍처 설계 및 구현 내용입니다. 무상태 설계를 통해 스마트 컨트랙트를 단일 진실 공급원(Single Source of Truth)으로 사용합니다.

## 시스템 아키텍처 개요

### C4 Context 다이어그램

```mermaid
C4Context
    title MSQPay 결제 시스템 아키텍처

    Person(user, "사용자", "모바일/웹 클라이언트")
    System(msqpay, "MSQPay 결제 API", "Fastify 서버\nviem 클라이언트")
    System_Ext(polygon, "Polygon 네트워크", "EVM 기반 블록체인\n스마트 컨트랙트")
    System_Ext(defender, "OpenZeppelin Defender", "릴레이 서비스\nGasless 트랜잭션")
    System_Ext(rpc, "RPC 프로바이더", "Polygon RPC\nArithmetic 프로바이더")

    Rel(user, msqpay, "REST API\nHTTP/HTTPS")
    Rel(msqpay, polygon, "읽기/쓰기\nviem")
    Rel(msqpay, defender, "API 호출\nDefender SDK")
    Rel(defender, polygon, "거래 제출\nRPC")
    Rel(msqpay, rpc, "RPC 호출\nviem Transport")
```

### C4 Container 다이어그램

```mermaid
C4Container
    title MSQPay 결제 API - 컨테이너 구조

    Container(fastify, "Fastify 서버", "Node.js", "HTTP 서버\nv5.0 이상")
    Container(routes, "라우트 계층", "TypeScript", "결제 API\n4개 엔드포인트")
    Container(services, "서비스 계층", "TypeScript", "BlockchainService\nDefenderService")
    Container(validation, "검증 계층", "Zod", "요청/응답 스키마\n타입 안전성")

    Container(blockchain, "블록체인 클라이언트", "viem", "스마트 컨트랙트 상호작용\nread/write 함수")
    Container(defender_sdk, "Defender SDK", "OpenZeppelin", "릴레이 서비스\nAPI 인증")

    System_Ext(polygon_sc, "스마트 컨트랙트", "Solidity", "결제 저장소\nstruct PaymentData")
    System_Ext(polygon_node, "Polygon 노드", "EVM", "거래 검증\n블록 생성")

    Rel(routes, services, "호출")
    Rel(services, blockchain, "사용")
    Rel(services, defender_sdk, "사용")
    Rel(services, validation, "사용")

    Rel(blockchain, polygon_node, "RPC 호출")
    Rel(defender_sdk, polygon_node, "릴레이 거래")
    Rel(polygon_node, polygon_sc, "스마트 컨트랙트 실행")
```

---

## 결제 흐름 (Payment Flow)

### 1. 결제 생성 플로우 (Create Payment)

```mermaid
sequenceDiagram
    participant Client as 클라이언트
    participant API as Fastify API
    participant Validation as Zod 검증
    participant Service as BlockchainService
    participant viem as viem Client
    participant Contract as 스마트 컨트랙트

    Client->>API: POST /payments/create
    Note over API: JSON 요청 수신

    API->>Validation: CreatePaymentSchema.parse()
    Note over Validation: 입력 검증 (금액, 주소 등)
    Validation-->>API: ✓ 검증 성공

    API->>Service: recordPaymentOnChain()
    Note over Service: 데이터 정리 및 변환

    Service->>viem: publicClient.readContract()
    Note over viem: 선택사항: 기존 결제 확인
    viem-->>Service: null (새 결제)

    Service->>Service: validate inputs
    Note over Service: userId, amount, tokenAddress 검증

    Service->>viem: 향후: publicClient.simulateContract()
    Note over viem: 거래 시뮬레이션 (비용 추정)

    viem-->>API: 트랜잭션 해시 반환
    Note over API: 임시 해시 생성

    API-->>Client: 201 Created
    Note over Client: paymentId, transactionHash, status

    Note over viem,Contract: 백그라운드: 블록체인 기록 (향후 웹훅)
```

### 2. 결제 상태 조회 플로우 (Get Payment Status)

```mermaid
sequenceDiagram
    participant Client as 클라이언트
    participant API as Fastify API
    participant Service as BlockchainService
    participant viem as viem Client
    participant Contract as 스마트 컨트랙트

    Client->>API: GET /payments/:id/status
    Note over API: 결제 ID 파라미터 검증

    API->>Service: getPaymentStatus(paymentId)
    Note over Service: 블록체인 조회 시작

    Service->>viem: publicClient.readContract()
    Note over viem: getPayment(paymentId) 함수 호출

    Contract-->>viem: ContractPaymentData 구조체 반환
    viem-->>Service: 계약 데이터 수신

    Service->>viem: publicClient.getTransactionReceipt()
    Note over viem: 트랜잭션 영수증 조회
    viem-->>Service: blockNumber, status 등

    Service->>Service: 데이터 변환
    Note over Service: timestamp → ISO8601<br/>contractStatus → enum

    Service-->>API: PaymentStatus 객체

    API-->>Client: 200 OK
    Note over Client: status, blockNumber, createdAt 등
```

### 3. Gasless 거래 플로우 (Gasless Transaction)

```mermaid
sequenceDiagram
    participant User as 사용자
    participant Client as 클라이언트 (DApp)
    participant API as Fastify API
    participant Validation as Zod 검증
    participant Defender as DefenderService
    participant DefenderSDK as Defender SDK
    participant Defender_API as OZ Defender API
    participant Contract as 스마트 컨트랙트

    User->>Client: Gasless 거래 시작
    Note over Client: 지갑 연결, 메시지 서명

    Client->>Client: 메시지 해싱 (EIP-191)
    Client->>User: 서명 요청
    User->>Client: ✓ 서명 완료
    Note over Client: signature = signMessage()

    Client->>API: POST /payments/:id/gasless
    Note over API: forwarderAddress, signature 전송

    API->>Validation: GaslessRequestSchema.parse()
    Validation-->>API: ✓ 검증 성공

    API->>Defender: validateTransactionData(signature)
    Note over Defender: 서명 형식 검증 (0x...)
    Defender-->>API: ✓ 유효함

    API->>Defender: submitGaslessTransaction()
    Note over Defender: 릴레이 요청 생성

    Defender->>DefenderSDK: Defender SDK 초기화
    Note over DefenderSDK: API 키/시크릿으로 인증

    DefenderSDK->>Defender_API: /v1/relayer/relay-requests
    Note over Defender_API: 거래 제출

    Defender_API-->>DefenderSDK: relayRequestId 반환
    DefenderSDK-->>Defender: 요청 ID 저장

    Defender-->>API: { relayRequestId, status }

    API-->>Client: 202 Accepted
    Note over Client: relayRequestId로 폴링

    Defender_API->>Defender_API: 거래 대기열 처리
    Note over Defender_API: nonce 관리<br/>가스비 최적화<br/>배치 처리

    Defender_API->>Contract: submitTransaction()
    Note over Contract: 가스비 없이 실행

    Contract-->>Defender_API: 거래 완료
    Note over Contract: 블록 확정

    Defender_API-->>Defender: 상태 업데이트
    Note over Defender: status = "mined"

    Client->>API: GET /payments/:id/status
    Note over Client: 상태 조회 폴링
    API-->>Client: status = "completed"
```

### 4. 릴레이 거래 플로우 (Relay Transaction)

```mermaid
sequenceDiagram
    participant Client as 클라이언트
    participant API as Fastify API
    participant Validation as Zod 검증
    participant Defender as DefenderService
    participant Contract as 스마트 컨트랙트

    Client->>API: POST /payments/:id/relay
    Note over API: transactionData, gasEstimate 전송

    API->>Validation: RelayExecutionSchema.parse()
    Validation-->>API: ✓ 검증 성공

    API->>Defender: validateTransactionData(txData)
    Note over Defender: 거래 데이터 형식 검증 (0x...)
    Defender-->>API: ✓ 유효함

    API->>API: 가스 추정치 검증
    Note over API: gasEstimate > 0 확인

    API->>Defender: submitGaslessTransaction()
    Note over Defender: 릴레이 요청 생성
    Defender-->>API: { relayRequestId, transactionHash }

    API-->>Client: 200 OK
    Note over Client: 거래 완료

    Defender->>Contract: 거래 실행
    Note over Contract: meta-transaction
    Contract-->>Defender: 완료
```

---

## 데이터 모델

### ContractPaymentData (스마트 컨트랙트)

```typescript
interface ContractPaymentData {
  userId: string;              // 사용자 ID (indexed)
  amount: bigint;              // 결제 금액 (Wei/token units)
  currency: 'USD' | 'EUR' | 'KRW';  // 통화 코드
  tokenAddress: string;        // ERC-20 토큰 계약 주소
  recipientAddress: string;    // 수령자 지갑 주소
  status: number;              // 상태 (0=pending, 1=confirmed, 2=failed, 3=completed)
  transactionHash?: `0x${string}`;  // 트랜잭션 해시
  createdAt: bigint;           // 생성 시간 (Unix timestamp)
  updatedAt: bigint;           // 수정 시간 (Unix timestamp)
}
```

### PaymentStatus (API 응답)

```typescript
interface PaymentStatus {
  id: string;                  // 결제 ID
  userId: string;              // 사용자 ID
  amount: number;              // 결제 금액 (정수)
  currency: string;            // 통화
  tokenAddress: string;        // 토큰 주소
  recipientAddress: string;    // 수령자 주소
  status: 'pending' | 'confirmed' | 'failed' | 'completed';
  transactionHash?: string;    // TX 해시
  blockNumber?: number;        // 블록 번호
  createdAt: ISO8601String;   // ISO 형식 생성 시간
  updatedAt: ISO8601String;   // ISO 형식 수정 시간
}
```

---

## 무상태 아키텍처 설계

### 핵심 원칙

1. **스마트 컨트랙트 = Single Source of Truth**
   - 모든 결제 데이터는 스마트 컨트랙트에만 저장
   - API는 읽기 전용으로 블록체인 조회
   - 데이터베이스/캐시 없음

2. **API는 트랜잭션 생성자**
   - 새로운 결제 요청 검증
   - 스마트 컨트랙트에 기록 (향후 구현)
   - 거래 상태를 실시간으로 조회

3. **확장성 및 신뢰성**
   - 블록체인 = 영구 저장소
   - 분산화된 데이터 관리
   - 감시자 없음 (Trustless)

### 아키텍처 다이어그램

```mermaid
graph LR
    subgraph "API Layer"
        A["HTTP Request<br/>/payments/create"]
        B["Validation<br/>Zod Schema"]
        C["Service Layer<br/>BlockchainService"]
    end

    subgraph "Blockchain Layer"
        D["viem Client<br/>PublicClient"]
        E["RPC Provider<br/>Polygon RPC"]
        F["Smart Contract<br/>PaymentStorage.sol"]
    end

    subgraph "Data"
        G["Contract Storage<br/>PaymentData Structs"]
        H["Block Data<br/>Transactions"]
    end

    A -->|validate| B
    B -->|process| C
    C -->|read/write| D
    D -->|RPC Call| E
    E -->|contract execution| F
    F -->|store| G
    F -->|emit events| H

    style G fill:#2196F3,color:#fff
    style H fill:#4CAF50,color:#fff
    style F fill:#FF9800,color:#fff
    style E fill:#9C27B0,color:#fff
```

---

## 기술 스택

| 계층 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **HTTP 서버** | Fastify | v5.0+ | 고성능 Node.js 웹 프레임워크 |
| **언어** | TypeScript | v5.3+ | 타입 안전성 |
| **블록체인** | viem | v2.21+ | EVM 상호작용 (type-safe) |
| **검증** | Zod | v3.22+ | 요청/응답 스키마 검증 |
| **Gasless** | OZ Defender | Latest | 릴레이 서비스 |
| **테스트** | Vitest | v1.0+ | 고속 단위 테스트 |
| **네트워크** | Polygon | - | EVM 호환 블록체인 |

---

## 에러 처리 및 재시도

```mermaid
stateDiagram-v2
    [*] --> RpcCall

    RpcCall --> Success: ✓ 응답<br/>transactionHash
    RpcCall --> NetworkError: ❌ RPC 오류<br/>ECONNREFUSED
    RpcCall --> GasError: ❌ 가스 부족
    RpcCall --> ValidationError: ❌ 입력 검증

    NetworkError --> Retry: 재시도 (max 3)
    GasError --> Failure: 실패
    ValidationError --> Failure: 실패

    Retry --> RpcCall: 지수 백오프<br/>1s, 2s, 4s
    Retry --> Failure: 최대 재시도 초과

    Success --> [*]
    Failure --> [*]
```

### 재시도 정책

- **최대 재시도**: 3회
- **백오프 전략**: 지수 백오프 (1초, 2초, 4초)
- **재시도 대상**:
  - RPC 네트워크 오류
  - 임시 타임아웃
  - 논스(nonce) 충돌

### 에러 코드

```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',      // 400
  INVALID_REQUEST = 'INVALID_REQUEST',        // 400
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',    // 400
  INVALID_TRANSACTION_DATA = 'INVALID_TRANSACTION_DATA',  // 400
  INVALID_GAS_ESTIMATE = 'INVALID_GAS_ESTIMATE',  // 400
  NOT_FOUND = 'NOT_FOUND',                    // 404
  INTERNAL_ERROR = 'INTERNAL_ERROR',          // 500
}
```

---

## 보안 고려사항

### 1. 입력 검증

```typescript
// Zod 스키마로 타입 안전성 보장
const CreatePaymentSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(['USD', 'EUR', 'KRW']),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});
```

### 2. 주소 검증

```typescript
// viem Address 타입으로 런타임 검증
import { Address, isAddress } from 'viem';

const tokenAddress: Address = validatedData.tokenAddress as Address;
// 컴파일 시 + 런타임 타입 안전성
```

### 3. 서명 검증

```typescript
// Gasless 거래 서명 형식 검증
validateTransactionData(signature: string): boolean {
  return /^0x[a-fA-F0-9]{130}$/.test(signature);  // EIP-191 형식
}
```

### 4. 가스 비용 보호

```typescript
// 가스 추정치 검증
if (validatedData.gasEstimate <= 0) {
  throw new Error('가스 추정치는 양수여야 합니다');
}
```

---

## 성능 최적화

### 1. RPC 요청 최적화

- **PublicClient 재사용**: 싱글톤 패턴
- **배치 요청**: 여러 호출 병렬화
- **캐싱**: 읽기 전용 데이터 (향후 구현)

### 2. 거래 처리 최적화

```typescript
// viem 특성 활용
const result = await publicClient.readContract({
  address: contractAddress,
  abi: contractAbi,
  functionName: 'getPayment',
  args: [paymentId],
});
// 자동 ABI 타입 체크, 에러 처리
```

### 3. Defender 릴레이 최적화

- **배치 처리**: 다중 거래 한 번에 처리
- **Nonce 관리**: 자동 논스 관리
- **가스비 최적화**: Polygon 네트워크 활용

---

## 모니터링 및 로깅

### 로깅 포인트

```typescript
// 구현 예제
logger.info('Payment created', { paymentId, userId, amount });
logger.error('RPC call failed', { error, retries, endpoint });
logger.warn('High gas price detected', { gasPrice, threshold });
```

### 메트릭 수집 (향후)

- 결제 생성 수
- API 응답 시간
- RPC 오류율
- Defender 릴레이 성공률

---

## API 라우트 흐름도

### 결제 관련 API

```mermaid
flowchart TD
    A["POST /payments/create"] -->|CreatePaymentSchema| B["BlockchainService.recordPaymentOnChain"]
    B -->|publicClient.readContract| C["Contract: getPayment"]
    B -->|publicClient.readContract| D["Contract: recordPayment"]
    D -->|트랜잭션 해시| E["201 Created"]

    F["GET /payments/:id/status"] -->|paymentId| G["BlockchainService.getPaymentStatus"]
    G -->|publicClient.readContract| H["Contract: getPayment"]
    H -->|PaymentData| I["200 OK"]

    J["GET /payments/:id/history"] -->|paymentId| K["BlockchainService.getPaymentHistory"]
    K -->|publicClient.getTransactionReceipt| L["거래 이력 조회"]
    L -->|History Array| M["200 OK"]

    N["POST /payments/:id/gasless"] -->|GaslessRequestSchema| O["DefenderService.submitGaslessTransaction"]
    O -->|Defender API| P["릴레이 요청"]
    P -->|relayRequestId| Q["202 Accepted"]

    R["POST /payments/:id/relay"] -->|RelayExecutionSchema| S["DefenderService.executeRelayTransaction"]
    S -->|Defender API| T["릴레이 실행"]
    T -->|transactionHash| U["200 OK"]

    style E fill:#4CAF50,color:#fff
    style I fill:#4CAF50,color:#fff
    style M fill:#4CAF50,color:#fff
    style Q fill:#FF9800,color:#fff
    style U fill:#4CAF50,color:#fff
```

### 토큰 조회 API

```mermaid
flowchart TD
    A["GET /tokens/balance?tokenAddress&address"] -->|query params| B["BlockchainService.getTokenBalance"]
    B -->|publicClient.readContract| C["ERC20 Contract: balanceOf"]
    C -->|balance| D["200 OK"]

    E["GET /tokens/allowance?tokenAddress&owner&spender"] -->|query params| F["BlockchainService.getTokenAllowance"]
    F -->|publicClient.readContract| G["ERC20 Contract: allowance"]
    G -->|allowance| H["200 OK"]

    style D fill:#4CAF50,color:#fff
    style H fill:#4CAF50,color:#fff
```

### 거래 상태 조회 API

```mermaid
flowchart TD
    A["GET /transactions/:id/status"] -->|txHash| B["BlockchainService.getTransactionStatus"]
    B -->|publicClient.getTransaction| C["RPC: eth_getTransactionByHash"]
    C -->|tx data| B

    B -->|publicClient.getTransactionReceipt| D["RPC: eth_getTransactionReceipt"]
    D -->|tx receipt| B

    B -->|데이터 정리| E["TransactionStatus Object"]
    E -->|200 OK| F["클라이언트"]

    style F fill:#4CAF50,color:#fff
```

### 통합 결제 흐름 (클라이언트 API 기반)

```mermaid
sequenceDiagram
    participant App as Demo App
    participant API as Fastify API
    participant BS as BlockchainService
    participant viem as viem Client
    participant Contract as Smart Contract
    participant RPC as Polygon RPC

    App->>API: 1. POST /payments/create
    API->>BS: recordPaymentOnChain()
    BS->>viem: publicClient.readContract()
    viem->>RPC: eth_call (getPayment)
    RPC-->>viem: null (새 결제)

    BS->>viem: publicClient.readContract() [write]
    viem->>RPC: eth_sendTransaction (recordPayment)
    RPC->>Contract: 거래 실행
    Contract-->>RPC: txHash

    RPC-->>viem: txHash
    viem-->>BS: transactionHash
    BS-->>API: paymentId, txHash
    API-->>App: 201 Created

    Note over App: 2초 간격 폴링

    loop 폴링 (2초마다)
        App->>API: 2. GET /payments/:id/status
        API->>BS: getPaymentStatus(paymentId)
        BS->>viem: publicClient.readContract()
        viem->>RPC: eth_call (getPayment)
        RPC-->>viem: PaymentData
        viem-->>BS: payment info
        BS-->>API: status, blockNumber
        API-->>App: 200 OK (status=pending)
    end

    Note over App: 확인됨

    App->>API: 3. GET /transactions/:id/status
    API->>BS: getTransactionStatus(txHash)
    BS->>viem: publicClient.getTransactionReceipt()
    viem->>RPC: eth_getTransactionReceipt
    RPC-->>viem: receipt (blockNumber, confirmations)
    viem-->>BS: transaction info
    BS-->>API: status=confirmed, confirmations=10
    API-->>App: 200 OK

    Note over App: 결제 이력 조회 (선택사항)
    App->>API: 4. GET /payments/:id/history
    API->>BS: getPaymentHistory(paymentId)
    BS->>viem: publicClient.getTransactionReceipt()
    viem->>RPC: eth_getTransactionReceipt
    RPC-->>viem: history data
    viem-->>BS: history array
    BS-->>API: history
    API-->>App: 200 OK
```

---

## 향후 개선 사항

1. **데이터베이스 캐싱**: 자주 조회되는 결제 캐싱
2. **WebSocket 지원**: 실시간 결제 상태 업데이트
3. **이벤트 구독**: 스마트 컨트랙트 이벤트 구독
4. **메트릭 수집**: Prometheus 통합
5. **GraphQL API**: REST 대신 GraphQL
6. **다중 체인**: Ethereum, Arbitrum 등 지원

---

## 관련 문서

- [API 레퍼런스](./api/payments.md)
- [구현 가이드](./implementation/payments-api.md)
- [배포 가이드](./deployment/payments-setup.md)
- [기술 스펙](./technical-spec.md)
