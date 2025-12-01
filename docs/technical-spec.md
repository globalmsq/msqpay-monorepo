# Technical Specification
## MSQ Pay Onchain - Implementation Details

### Document Information
- **Version**: 0.1
- **Date**: 2025-11-26
- **Status**: Draft

---

## 1. Smart Contract Architecture

### 1.1 Contract Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      ERC1967Proxy                           │
│                   (PaymentGateway Proxy)                    │
├─────────────────────────────────────────────────────────────┤
│  Implementation: PaymentGatewayV1                           │
│  Admin: Owner (upgrade authority)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PaymentGatewayV1                         │
├─────────────────────────────────────────────────────────────┤
│  Inherits:                                                  │
│  - UUPSUpgradeable                                         │
│  - OwnableUpgradeable                                      │
│  - ERC2771ContextUpgradeable                               │
│  - ReentrancyGuardUpgradeable                              │
├─────────────────────────────────────────────────────────────┤
│  State Variables:                                           │
│  - processedPayments: mapping(bytes32 => bool)             │
│  - supportedTokens: mapping(address => bool)               │
│  - enforceTokenWhitelist: bool                             │
├─────────────────────────────────────────────────────────────┤
│  Functions:                                                 │
│  - constructor(trustedForwarder)                           │
│  - initialize(owner)                                       │
│  - pay(paymentId, token, amount, merchant)                 │
│  - setSupportedToken(token, supported)                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Storage Layout

```solidity
// Slot 0-49: Reserved for OpenZeppelin upgradeable contracts
// Slot 50+: Custom storage

// Storage slot calculation for UUPS
contract PaymentGatewayV1Storage {
    // Slot 50: processedPayments mapping
    mapping(bytes32 => bool) public processedPayments;

    // Slot 51: supportedTokens mapping
    mapping(address => bool) public supportedTokens;

    // Slot 52: enforceTokenWhitelist flag
    bool public enforceTokenWhitelist;

    // Gap for future upgrades (reserved slots 53-99)
    uint256[47] private __gap;
}
```

### 1.3 Events

```solidity
event PaymentCompleted(
    bytes32 indexed paymentId,    // Unique payment identifier
    address indexed payer,        // User who paid
    address indexed merchant,     // Recipient
    address token,                // ERC20 token address
    uint256 amount,               // Amount in wei
    uint256 timestamp             // Block timestamp
);

event TokenSupportChanged(
    address indexed token,
    bool supported
);
```

### 1.4 Payment ID Generation

```typescript
// Client-side: Convert order ID to bytes32
function generatePaymentId(orderId: string, chainId: number): bytes32 {
    return keccak256(
        encodePacked(
            chainId,
            orderId,
            block.timestamp  // Optional: for uniqueness
        )
    );
}

// Simple version (recommended for MVP)
function generatePaymentId(orderId: string): bytes32 {
    return keccak256(toUtf8Bytes(orderId));
}
```

---

## 2. Meta Transaction Implementation

### 2.1 ERC2771 Flow

```
┌────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User     │────▶│ ERC2771Forwarder│────▶│ PaymentGateway  │
│  (Signer)  │     │ (Trusted)       │     │ (ERC2771Context)│
└────────────┘     └─────────────────┘     └─────────────────┘
      │                    │                       │
      │ 1. Sign EIP-712    │                       │
      │    ForwardRequest  │                       │
      │                    │                       │
      │ 2. Submit to Relay │                       │
      │───────────────────▶│                       │
      │                    │                       │
      │                    │ 3. Verify signature   │
      │                    │    & execute call     │
      │                    │──────────────────────▶│
      │                    │                       │
      │                    │                       │ 4. _msgSender()
      │                    │                       │    returns original
      │                    │                       │    signer
```

### 2.2 EIP-712 Domain Separator

```typescript
const domain = {
    name: "ERC2771Forwarder",
    version: "1",
    chainId: 80002,  // Polygon Amoy
    verifyingContract: FORWARDER_ADDRESS
};
```

### 2.3 ForwardRequest Structure

```typescript
const types = {
    ForwardRequest: [
        { name: "from", type: "address" },      // Original signer
        { name: "to", type: "address" },        // Target contract
        { name: "value", type: "uint256" },     // ETH value (0 for ERC20)
        { name: "gas", type: "uint256" },       // Gas limit
        { name: "nonce", type: "uint256" },     // Replay protection
        { name: "deadline", type: "uint48" },   // Expiration timestamp
        { name: "data", type: "bytes" }         // Encoded function call
    ]
};
```

### 2.4 OpenZeppelin Defender Integration

```typescript
// Defender Relay Webhook URL
const DEFENDER_RELAY_URL = "https://api.defender.openzeppelin.com/actions/xxx/webhook/yyy";

// Submit meta-tx
async function submitToDefender(signedRequest: SignedForwardRequest) {
    const response = await fetch(DEFENDER_RELAY_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': DEFENDER_API_KEY
        },
        body: JSON.stringify({
            request: signedRequest.request,
            signature: signedRequest.signature
        })
    });

    return response.json(); // { txHash: "0x..." }
}
```

---

## 3. SDK Architecture

### 3.1 Class Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      MSQPayClient                           │
├─────────────────────────────────────────────────────────────┤
│ - config: MSQPayConfig                                      │
│ - provider: PublicClient                                    │
│ - gatewayContract: Contract                                 │
├─────────────────────────────────────────────────────────────┤
│ + constructor(config: MSQPayConfig)                         │
│ + getPaymentTxData(params: PaymentParams): TransactionReq   │
│ + getMetaTxSignRequest(params, payer): EIP712SignRequest    │
│ + submitMetaTx(signed: SignedRequest): Promise<string>      │
│ + getPayment(id: string): Promise<Payment | null>           │
│ + getPaymentsByMerchant(addr: string): Promise<Payment[]>   │
│ + onPaymentComplete(cb: Callback): Unsubscribe              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Configuration Interface

```typescript
interface MSQPayConfig {
    // Required
    chainId: number;
    rpcUrl: string;
    gatewayAddress: Address;
    forwarderAddress: Address;

    // Optional
    defenderRelayUrl?: string;   // For meta-tx
    subgraphUrl?: string;        // For queries
}

// Pre-configured for Polygon Amoy
const POLYGON_AMOY_CONFIG: MSQPayConfig = {
    chainId: 80002,
    rpcUrl: "https://rpc-amoy.polygon.technology",
    gatewayAddress: "0x...",  // TBD after deployment
    forwarderAddress: "0x...", // TBD after deployment
    subgraphUrl: "https://api.studio.thegraph.com/..."
};
```

### 3.3 Payment Params

```typescript
interface PaymentParams {
    paymentId: string;    // Unique order/payment ID (will be hashed)
    token: Address;       // ERC20 token address
    amount: bigint;       // Amount in smallest unit (wei)
    merchant: Address;    // Recipient address
}

// Example usage
const params: PaymentParams = {
    paymentId: "ORDER_12345",
    token: "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    amount: parseUnits("100", 18),  // 100 SUT
    merchant: "0x..."
};
```

---

## 4. Subgraph Schema

### 4.1 Entity Definitions

```graphql
# Individual payment record
type Payment @entity(immutable: true) {
    id: ID!                      # paymentId (bytes32 as hex string)
    payer: Bytes!                # User address
    merchant: Bytes!             # Recipient address
    token: Bytes!                # Token contract address
    amount: BigInt!              # Amount in wei
    timestamp: BigInt!           # Unix timestamp
    transactionHash: Bytes!      # TX hash
    blockNumber: BigInt!         # Block number
    gasMode: GasMode!            # Direct or MetaTx
}

enum GasMode {
    Direct
    MetaTx
}

# Merchant statistics (aggregated)
type MerchantStats @entity {
    id: ID!                      # Merchant address (lowercase)
    totalReceived: BigInt!       # Total amount received
    paymentCount: Int!           # Number of payments
    lastPaymentAt: BigInt        # Last payment timestamp
}

# Daily volume statistics
type DailyVolume @entity {
    id: ID!                      # Date string (YYYY-MM-DD)
    date: BigInt!                # Unix timestamp (start of day)
    volume: BigInt!              # Total volume
    count: Int!                  # Number of transactions
}

# Token statistics
type TokenStats @entity {
    id: ID!                      # Token address
    symbol: String               # Token symbol (nullable, cached from first tx)
    totalVolume: BigInt!
    transactionCount: Int!
}

# Global statistics
type GlobalStats @entity {
    id: ID!                      # Singleton: "global"
    totalPayments: Int!          # Total number of payments
    totalVolume: BigInt!         # Total volume (note: mixed decimals)
    uniqueMerchants: Int!        # Number of unique merchants
    uniquePayers: Int!           # Number of unique payers
}
```

### 4.2 Event Handler

```typescript
// src/payment-gateway.ts
import { PaymentCompleted } from "../generated/PaymentGateway/PaymentGateway";
import { Payment, MerchantStats, DailyVolume } from "../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

const SECONDS_PER_DAY = 86400;

export function handlePaymentCompleted(event: PaymentCompleted): void {
    // Create Payment entity
    let payment = new Payment(event.params.paymentId.toHexString());
    payment.payer = event.params.payer;
    payment.merchant = event.params.merchant;
    payment.token = event.params.token;
    payment.amount = event.params.amount;
    payment.timestamp = event.params.timestamp;
    payment.transactionHash = event.transaction.hash;
    payment.blockNumber = event.block.number;

    // Determine gas mode: Direct if tx.from == payer, MetaTx otherwise
    // Note: AssemblyScript uses .equals() for address comparison
    if (event.transaction.from.equals(event.params.payer)) {
        payment.gasMode = "Direct";
    } else {
        payment.gasMode = "MetaTx";
    }
    payment.save();

    // Update MerchantStats
    let merchantId = event.params.merchant.toHexString();
    let merchant = MerchantStats.load(merchantId);
    if (merchant == null) {
        merchant = new MerchantStats(merchantId);
        merchant.totalReceived = BigInt.fromI32(0);
        merchant.paymentCount = 0;
    }
    merchant.totalReceived = merchant.totalReceived.plus(event.params.amount);
    merchant.paymentCount = merchant.paymentCount + 1;
    merchant.lastPaymentAt = event.params.timestamp;
    merchant.save();

    // Update DailyVolume
    let dayId = getDayId(event.params.timestamp);
    let daily = DailyVolume.load(dayId);
    if (daily == null) {
        daily = new DailyVolume(dayId);
        daily.date = getDayStart(event.params.timestamp);
        daily.volume = BigInt.fromI32(0);
        daily.count = 0;
    }
    daily.volume = daily.volume.plus(event.params.amount);
    daily.count = daily.count + 1;
    daily.save();
}

// Note: AssemblyScript doesn't support JavaScript Date API
// Use BigInt arithmetic instead
function getDayId(timestamp: BigInt): string {
    let dayNumber = timestamp.div(BigInt.fromI32(SECONDS_PER_DAY));
    return "day-" + dayNumber.toString();
}

function getDayStart(timestamp: BigInt): BigInt {
    let seconds = timestamp.toI64();
    let dayStart = seconds - (seconds % SECONDS_PER_DAY);
    return BigInt.fromI64(dayStart);
}
```

### 4.3 Example Queries

```graphql
# Get payment by ID
query GetPayment($id: ID!) {
    payment(id: $id) {
        id
        payer
        merchant
        amount
        timestamp
        transactionHash
        gasMode
    }
}

# Get merchant payments
query GetMerchantPayments($merchant: Bytes!, $first: Int, $skip: Int) {
    payments(
        where: { merchant: $merchant }
        orderBy: timestamp
        orderDirection: desc
        first: $first
        skip: $skip
    ) {
        id
        payer
        amount
        timestamp
        gasMode
    }
}

# Get merchant stats
query GetMerchantStats($id: ID!) {
    merchantStats(id: $id) {
        totalReceived
        paymentCount
        lastPaymentAt
    }
}

# Get daily volumes
query GetDailyVolumes($days: Int!) {
    dailyVolumes(
        orderBy: date
        orderDirection: desc
        first: $days
    ) {
        id
        date
        volume
        count
    }
}
```

---

## 5. Demo App Architecture

### 5.1 Page Structure

```
apps/demo/src/app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Home - Product list
├── checkout/
│   └── [orderId]/
│       └── page.tsx        # Checkout page
├── history/
│   └── page.tsx            # Payment history
└── api/
    └── relay/
        └── route.ts        # Relay endpoint (optional)
```

### 5.2 Component Hierarchy

```
App
├── Providers (wagmi, rainbow, tanstack-query)
├── Header
│   ├── Logo
│   └── ConnectButton (RainbowKit)
├── ProductList
│   └── ProductCard (x N)
│       ├── Image
│       ├── Title
│       ├── Price (SUT)
│       └── BuyButton
├── PaymentModal (Dialog)
│   ├── OrderSummary
│   ├── GasModeSelector
│   │   ├── DirectOption
│   │   └── GaslessOption
│   ├── PaymentButton
│   └── StatusIndicator
└── PaymentHistory
    └── PaymentRow (x N)
```

### 5.3 State Management

```typescript
// Payment flow state machine
type PaymentState =
    | { status: 'idle' }
    | { status: 'selecting-gas-mode' }
    | { status: 'approving-token'; txHash?: string }
    | { status: 'signing' }
    | { status: 'submitting'; txHash?: string }
    | { status: 'confirming'; txHash: string }
    | { status: 'completed'; payment: Payment }
    | { status: 'failed'; error: Error };

// Hook: usePayment
function usePayment() {
    const [state, setState] = useState<PaymentState>({ status: 'idle' });

    const startPayment = async (params: PaymentParams, gasMode: GasMode) => {
        // 1. Check token approval
        // 2. Approve if needed
        // 3. Direct: send tx / Meta: sign & submit
        // 4. Wait for confirmation
        // 5. Update state
    };

    return { state, startPayment, reset };
}
```

---

## 6. Security Considerations

### 6.0 Payment Amount Manipulation (Critical)

> **⚠️ 핵심 보안 원칙**

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Frontend Amount Manipulation** | **Critical** | 프론트엔드에서 `amount`를 직접 받지 않음 |

**올바른 구현 패턴**:
1. 프론트엔드 → 상점서버: `productId`만 전송 (금액 절대 불가)
2. 상점서버: DB/설정에서 실제 상품 가격 조회
3. 상점서버 → 결제서버: 조회된 가격으로 API 호출

**잘못된 패턴** (보안 취약):
```typescript
// ❌ 위험: 프론트에서 amount를 받음
const response = await fetch('/api/payments/create', {
    body: JSON.stringify({ amount: product.price }) // 조작 가능!
});
```

**올바른 패턴**:
```typescript
// ✅ 안전: productId만 전송
const response = await fetch('/api/checkout', {
    body: JSON.stringify({ productId: product.id }) // 서버에서 가격 조회
});
```

### 6.1 Contract Security

| Risk | Mitigation |
|------|------------|
| Reentrancy | `ReentrancyGuard` modifier on all external functions |
| Replay Attack | `processedPayments` mapping prevents duplicate payment IDs |
| Unauthorized Upgrade | `onlyOwner` modifier on `_authorizeUpgrade` |
| Meta-tx Replay | Forwarder nonce + deadline prevents replay |

### 6.2 SDK Security

| Risk | Mitigation |
|------|------------|
| Invalid Payment ID | Hash order ID to ensure uniqueness |
| Signature Reuse | Include nonce and deadline in EIP-712 data |
| Man-in-the-middle | HTTPS only for relay communication |

### 6.3 Recommended Audit Checklist

- [ ] Reentrancy vulnerabilities
- [ ] Integer overflow/underflow (Solidity 0.8+ has built-in checks)
- [ ] Access control
- [ ] Front-running risks
- [ ] ERC20 token compatibility (non-standard tokens)
- [ ] Upgrade safety (storage layout)

---

## 7. Network Configuration

### 7.1 Polygon Amoy Testnet

```typescript
export const POLYGON_AMOY = {
    chainId: 80002,
    name: "Polygon Amoy Testnet",
    network: "polygon-amoy",
    nativeCurrency: {
        name: "MATIC",
        symbol: "MATIC",
        decimals: 18
    },
    rpcUrls: {
        default: {
            http: ["https://rpc-amoy.polygon.technology"],
            webSocket: ["wss://rpc-amoy.polygon.technology"]
        },
        public: {
            http: ["https://rpc-amoy.polygon.technology"]
        }
    },
    blockExplorers: {
        default: {
            name: "PolygonScan",
            url: "https://amoy.polygonscan.com"
        }
    },
    testnet: true
};
```

### 7.2 Deployed Addresses (TBD)

```typescript
export const CONTRACTS = {
    // Will be filled after deployment
    POLYGON_AMOY: {
        forwarder: "0x...",      // ERC2771Forwarder
        gateway: "0x...",        // PaymentGateway Proxy
        gatewayImpl: "0x..."     // PaymentGateway Implementation
    }
};

export const TOKENS = {
    POLYGON_AMOY: {
        SUT: "0xE4C687167705Abf55d709395f92e254bdF5825a2"
    }
};

export const SUBGRAPH = {
    POLYGON_AMOY: "https://api.studio.thegraph.com/query/..."
};
```

---

## 8. Testing Strategy

### 8.1 Contract Tests

```typescript
describe("PaymentGateway", () => {
    describe("Direct Payment", () => {
        it("should process payment successfully");
        it("should emit PaymentCompleted event");
        it("should reject duplicate payment ID");
        it("should reject zero amount");
        it("should reject zero merchant address");
    });

    describe("Meta Transaction", () => {
        it("should process meta-tx payment");
        it("should use _msgSender() for payer");
        it("should reject invalid signature");
        it("should reject expired request");
    });

    describe("Admin Functions", () => {
        it("should allow owner to set supported tokens");
        it("should allow owner to upgrade contract");
        it("should reject non-owner upgrade");
    });
});
```

### 8.2 SDK Tests

```typescript
describe("MSQPayClient", () => {
    describe("getPaymentTxData", () => {
        it("should return valid transaction data");
        it("should encode function call correctly");
    });

    describe("getMetaTxSignRequest", () => {
        it("should return valid EIP-712 request");
        it("should calculate correct nonce");
    });

    describe("submitMetaTx", () => {
        it("should submit to Defender relay");
        it("should return transaction hash");
    });
});
```

### 8.3 E2E Tests

```typescript
describe("E2E Payment Flow", () => {
    it("Direct: User can complete payment");
    it("Meta-tx: User can complete gasless payment");
    it("Subgraph indexes payment within 30 seconds");
    it("Payment history shows completed payments");
});
```

---

## 9. Deployment Checklist

### 9.1 Pre-deployment

- [ ] All tests passing
- [ ] Contract verified on testnet
- [ ] Environment variables configured
- [ ] OZ Defender relay set up
- [ ] Subgraph deployed

### 9.2 Deployment Steps

1. Deploy ERC2771Forwarder (or use existing)
2. Deploy PaymentGatewayV1 implementation
3. Deploy ERC1967Proxy pointing to implementation
4. Initialize proxy with forwarder and owner
5. Verify all contracts on Polygonscan
6. Update SDK constants
7. Deploy subgraph
8. Deploy demo app

### 9.3 Post-deployment

- [ ] Verify direct payment works
- [ ] Verify meta-tx payment works
- [ ] Verify subgraph indexing
- [ ] Verify demo app functionality
- [ ] Document deployed addresses

---

## 10. Appendix

### 10.1 Gas Estimates

| Operation | Estimated Gas |
|-----------|---------------|
| Direct Payment | ~65,000 |
| Meta-tx Payment (via Forwarder) | ~85,000 |
| Token Approval | ~46,000 |

### 10.2 External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @openzeppelin/contracts | 5.0.0 | Base contracts |
| @openzeppelin/contracts-upgradeable | 5.0.0 | Upgradeable contracts |
| viem | 2.0.0+ | Ethereum interaction |
| wagmi | 2.5.0+ | React Web3 hooks |
| @rainbow-me/rainbowkit | 2.0.0+ | Wallet connection |
| @graphprotocol/graph-ts | 0.32.0+ | Subgraph mapping |
