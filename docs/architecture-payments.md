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
    System_Ext(forwarder, "ERC2771Forwarder", "Meta-Transaction 처리\nEIP-712 서명 검증")
    System_Ext(rpc, "RPC 프로바이더", "Polygon RPC\nArithmetic 프로바이더")

    Rel(user, msqpay, "REST API\nHTTP/HTTPS")
    Rel(msqpay, polygon, "읽기/쓰기\nviem")
    Rel(msqpay, forwarder, "ForwardRequest 제출\nEIP-712 서명")
    Rel(forwarder, polygon, "Meta-TX 실행\n_msgSender() = User")
    Rel(msqpay, rpc, "RPC 호출\nviem Transport")
```

### C4 Container 다이어그램

```mermaid
C4Container
    title MSQPay 결제 API - 컨테이너 구조

    Container(fastify, "Fastify 서버", "Node.js", "HTTP 서버\nv5.0 이상")
    Container(routes, "라우트 계층", "TypeScript", "결제 API\n4개 엔드포인트")
    Container(services, "서비스 계층", "TypeScript", "BlockchainService\nForwarderService")
    Container(validation, "검증 계층", "Zod", "요청/응답 스키마\n타입 안전성")

    Container(blockchain, "블록체인 클라이언트", "viem", "스마트 컨트랙트 상호작용\nread/write 함수")
    Container(forwarder_client, "Forwarder 클라이언트", "viem", "EIP-712 서명 검증\nMeta-TX 제출")

    System_Ext(forwarder_contract, "ERC2771Forwarder", "Solidity", "서명 검증\n_msgSender 전달")
    System_Ext(polygon_sc, "PaymentGateway", "Solidity", "결제 저장소\nERC2771Context")
    System_Ext(polygon_node, "Polygon 노드", "EVM", "거래 검증\n블록 생성")

    Rel(routes, services, "호출")
    Rel(services, blockchain, "사용")
    Rel(services, forwarder_client, "사용")
    Rel(services, validation, "사용")

    Rel(blockchain, polygon_node, "RPC 호출")
    Rel(forwarder_client, forwarder_contract, "ForwardRequest 제출")
    Rel(forwarder_contract, polygon_sc, "Meta-TX 실행")
    Rel(polygon_node, polygon_sc, "스마트 컨트랙트 실행")
```

---

## 결제 흐름 (Payment Flow)

> **⚠️ 보안 필수사항 - 금액 조작 방지**
>
> 아래 다이어그램의 "클라이언트"는 **상점서버**를 의미합니다 (프론트엔드 아님).
>
> **올바른 흐름**:
> 1. 프론트엔드 → 상점서버: `productId`만 전송 (금액 절대 불가)
> 2. 상점서버: DB/설정에서 실제 상품 가격 조회
> 3. 상점서버 → 결제서버(API): 조회된 가격으로 `/payments/create` 호출
>
> 프론트엔드에서 `amount`를 직접 받으면 악의적 사용자가 금액을 조작할 수 있습니다!

### 1. 결제 생성 플로우 (Create Payment)

```mermaid
sequenceDiagram
    participant Client as 상점서버 (클라이언트)
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

### 3. Gasless 거래 플로우 (Forwarder-based Meta-Transaction)

```mermaid
sequenceDiagram
    participant User as 사용자
    participant Client as 클라이언트 (DApp)
    participant API as Fastify API
    participant Validation as Zod 검증
    participant Forwarder as ForwarderService
    participant ForwarderContract as ERC2771Forwarder
    participant Gateway as PaymentGateway

    User->>Client: Gasless 거래 시작
    Note over Client: 지갑 연결

    Client->>API: GET /payments/:id/gasless/prepare
    Note over API: userAddress 전송
    API->>Forwarder: getNonce(userAddress)
    Forwarder-->>API: nonce 반환
    API->>API: EIP-712 TypedData 생성
    Note over API: domain, types, ForwardRequest

    API-->>Client: typedData 반환
    Note over Client: EIP-712 서명 요청 데이터

    Client->>User: EIP-712 서명 요청
    Note over User: 구조화된 데이터 확인
    User->>Client: ✓ 서명 완료
    Note over Client: signature = signTypedData()

    Client->>API: POST /payments/:id/gasless
    Note over API: forwardRequest, signature 전송

    API->>Validation: GaslessRequestSchema.parse()
    Validation-->>API: ✓ 검증 성공

    API->>Forwarder: verifySignature(request, signature)
    Note over Forwarder: EIP-712 서명 검증
    Forwarder-->>API: ✓ 서명 유효

    API->>Forwarder: executeForwardRequest(request, signature)
    Note over Forwarder: Meta-TX 제출

    Forwarder->>ForwarderContract: execute(request, signature)
    Note over ForwarderContract: 서명 검증<br/>nonce 확인<br/>deadline 확인

    ForwarderContract->>Gateway: pay(paymentId, token, amount, merchant)
    Note over Gateway: _msgSender() = User<br/>(원래 서명자 주소)

    Gateway-->>ForwarderContract: 결제 완료
    ForwarderContract-->>Forwarder: 거래 영수증

    Forwarder-->>API: { transactionHash, status }

    API-->>Client: 200 OK
    Note over Client: transactionHash로 확인

    Client->>API: GET /payments/:id/status
    Note over Client: 상태 조회 폴링
    API-->>Client: status = "completed"
```

**EIP-712 Domain 설정**:

```typescript
const domain = {
  name: "MSQPayForwarder",
  version: "1",
  chainId: 31337, // 또는 80002 (Polygon Amoy)
  verifyingContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" // Forwarder 주소
};
```

**ForwardRequest 구조**:

```typescript
const types = {
  ForwardRequest: [
    { name: "from", type: "address" },      // 원래 서명자 (사용자)
    { name: "to", type: "address" },        // 대상 컨트랙트 (Gateway)
    { name: "value", type: "uint256" },     // ETH 값 (0)
    { name: "gas", type: "uint256" },       // 가스 한도
    { name: "nonce", type: "uint256" },     // 재생 공격 방지
    { name: "deadline", type: "uint48" },   // 만료 시간
    { name: "data", type: "bytes" }         // 인코딩된 함수 호출
  ]
};
```

### 4. 릴레이 거래 플로우 (Forwarder Relay)

```mermaid
sequenceDiagram
    participant Client as 클라이언트
    participant API as Fastify API
    participant Validation as Zod 검증
    participant Forwarder as ForwarderService
    participant ForwarderContract as ERC2771Forwarder
    participant Gateway as PaymentGateway

    Client->>API: POST /payments/:id/relay
    Note over API: forwardRequest, signature 전송

    API->>Validation: RelayExecutionSchema.parse()
    Validation-->>API: ✓ 검증 성공

    API->>Forwarder: validateForwardRequest(request)
    Note over Forwarder: ForwardRequest 구조 검증
    Forwarder-->>API: ✓ 유효함

    API->>Forwarder: verifySignature(request, signature)
    Note over Forwarder: EIP-712 서명 검증
    Forwarder-->>API: ✓ 서명 유효

    API->>Forwarder: executeForwardRequest(request, signature)
    Note over Forwarder: Forwarder 컨트랙트 호출

    Forwarder->>ForwarderContract: execute(request, signature)
    Note over ForwarderContract: nonce 확인<br/>deadline 확인<br/>서명 검증

    ForwarderContract->>Gateway: 인코딩된 함수 호출
    Note over Gateway: _msgSender() = request.from

    Gateway-->>ForwarderContract: 실행 완료
    ForwarderContract-->>Forwarder: 거래 영수증

    Forwarder-->>API: { transactionHash, status }

    API-->>Client: 200 OK
    Note over Client: 거래 완료
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
  paymentId: string;           // 결제 ID (변경: id → paymentId)
  userId: string;              // 사용자 ID
  amount: number;              // 결제 금액 (정수)
  tokenSymbol: string;         // 토큰 심볼 (변경: currency → tokenSymbol, 온체인 조회)
  tokenAddress: string;        // 토큰 주소
  recipientAddress: string;    // 수령자 주소
  status: 'pending' | 'confirmed' | 'failed' | 'completed';
  transactionHash?: string;    // TX 해시
  blockNumber?: number;        // 블록 번호
  createdAt: ISO8601String;   // ISO 형식 생성 시간
  updatedAt: ISO8601String;   // ISO 형식 수정 시간
}
```

> **Note (2025-11-30)**: API 필드 변경사항
> - `id` → `paymentId`: 일관된 명명 규칙 적용
> - `currency` → `tokenSymbol`: 온체인 ERC20 컨트랙트에서 `symbol()` 함수로 조회

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
| **Meta-Transaction** | ERC2771Forwarder | OZ v5.0+ | Forwarder 기반 Gasless 거래 |
| **서명 표준** | EIP-712 | - | 구조화된 데이터 서명 |
| **테스트** | Vitest | v1.0+ | 고속 단위 테스트 |
| **네트워크** | Polygon | - | EVM 호환 블록체인 |

### OZ Defender API 호환 Relay 아키텍처 (v4.0.0)

ERC2771Forwarder 컨트랙트를 사용하여 사용자 대신 가스비를 대납합니다. 사용자는 EIP-712 형식으로 서명만 하고, HTTP 기반 Relay 서비스가 Forwarder 컨트랙트를 통해 트랜잭션을 제출합니다.

**핵심 설계 원칙**:

Production과 Local 환경이 동일한 아키텍처를 유지합니다:
- 동일한 HTTP API 인터페이스
- 동일한 Payment Server 코드
- `DEFENDER_API_URL` 환경변수만 변경하여 환경 전환

**환경별 구성**:

| 환경 | Relay 서비스 | API URL | Forwarder |
|------|-------------|---------|-----------|
| **Local (Docker Compose)** | SimpleDefender HTTP 서비스 | http://simple-defender:3001 | ERC2771Forwarder |
| **Testnet/Mainnet** | OZ Defender API | https://api.defender.openzeppelin.com | ERC2771Forwarder |

**환경 전환 방식**:
- `DEFENDER_API_URL=http://simple-defender:3001` → Local 개발 환경
- `DEFENDER_API_URL=https://api.defender.openzeppelin.com` → Production 환경

**핵심 특징**:

- `_msgSender()` = 원래 서명자 (사용자 주소)
- EIP-712 구조화된 서명으로 사용자 의도 암호학적 증명
- HTTP 기반 통일된 API로 환경별 코드 분기 제거
- nonce + deadline으로 재생 공격 방지
- 모든 환경에서 동일한 Forwarder 컨트랙트 사용

**컨트랙트 주소**:

```
# Local (Hardhat)
Forwarder: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Gateway:   0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

# Testnet/Mainnet (배포 후 업데이트)
Forwarder: <배포된 주소>
Gateway:   <배포된 주소>
```

**데이터 흐름 (통합)**:
```
User (EIP-712 서명) → Payment Server (DefenderService HTTP Client) → Relay API → Forwarder.execute() → PaymentGateway
```

- Local: Relay API = SimpleDefender HTTP 서비스 (Docker 컨테이너)
- Production: Relay API = OZ Defender API

**상세 사양**: `.moai/specs/SPEC-RELAY-001/` 참조 (v4.0.0)

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

### 0. 금액 조작 방지 (핵심)

> **⚠️ 가장 중요한 보안 원칙**

**절대 금지**: 프론트엔드에서 `amount`를 직접 받아서 결제 생성 API를 호출하면 안됩니다.

**올바른 구현**:
1. 프론트엔드는 `productId`만 상점서버에 전송
2. 상점서버에서 DB/설정으로부터 실제 상품 가격 조회
3. 상점서버가 조회된 가격으로 결제 API 호출

**위험**: 프론트엔드에서 `amount`를 받으면 악의적 사용자가 개발자 도구로 금액을 조작하여 1원짜리 결제를 생성할 수 있습니다.

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

### 3. EIP-712 서명 검증

```typescript
// Forwarder 기반 EIP-712 서명 검증
async verifyForwardRequestSignature(
  request: ForwardRequest,
  signature: string
): Promise<boolean> {
  // EIP-712 domain
  const domain = {
    name: "MSQPayForwarder",
    version: "1",
    chainId: this.chainId,
    verifyingContract: this.forwarderAddress
  };

  // ForwardRequest types
  const types = {
    ForwardRequest: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "gas", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint48" },
      { name: "data", type: "bytes" }
    ]
  };

  // 서명자 주소 복구 및 검증
  const recoveredAddress = await verifyTypedData({
    address: request.from,
    domain,
    types,
    primaryType: "ForwardRequest",
    message: request,
    signature
  });

  return recoveredAddress === request.from;
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

### 3. Forwarder 최적화

- **Nonce 관리**: Forwarder 컨트랙트의 자동 nonce 관리
- **Deadline 검증**: 만료된 요청 자동 거부
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
- Forwarder 거래 성공률

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

    N["POST /payments/:id/gasless"] -->|GaslessRequestSchema| O["ForwarderService.executeForwardRequest"]
    O -->|ERC2771Forwarder| P["Meta-TX 실행"]
    P -->|transactionHash| Q["200 OK"]

    R["POST /payments/:id/relay"] -->|RelayExecutionSchema| S["ForwarderService.executeForwardRequest"]
    S -->|ERC2771Forwarder| T["Forwarder 실행"]
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
