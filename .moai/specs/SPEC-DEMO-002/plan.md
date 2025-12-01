---
id: SPEC-DEMO-002
type: plan
version: "1.0.0"
status: "draft"
created: "2025-12-01"
---

# SPEC-DEMO-002 구현 계획

## 📊 Overview

**SPEC ID**: SPEC-DEMO-002
**Title**: Demo App 서버 기반 블록체인 설정 적용
**Parent SPEC**: SPEC-API-001
**Priority**: High
**Estimated Time**: 4.5-5시간

---

## 🎯 구현 목표

1. **서버 API 통합**: `/payments/create` API 호출하여 블록체인 설정 로드
2. **레거시 코드 제거**: wagmi.ts의 LEGACY_CONTRACTS, getContractsForChain() 삭제
3. **에러 처리 강화**: API 재시도, 캐싱, 로딩 상태 표시
4. **테스트 커버리지 90%**: 모든 주요 기능에 대한 테스트 작성

---

## 📋 Phase 1: API 클라이언트 함수 추가 (45분)

### 1.1 Zod 스키마 정의 (15분)

**파일**: `packages/demo-app/src/types/api.ts`

```typescript
import { z } from 'zod';

// ===== Request Schema =====
export const CreatePaymentRequestSchema = z.object({
  merchantId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(['USDC', 'USDT']),
  chainId: z.number().positive(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

// ===== Response Schema =====
export const CreatePaymentResponseSchema = z.object({
  paymentId: z.string(),
  tokenAddress: z.string(),
  gatewayAddress: z.string(),
  amount: z.string(),
  currency: z.string(),
  chainId: z.number(),
  expiresAt: z.string(),
});

export type CreatePaymentResponse = z.infer<typeof CreatePaymentResponseSchema>;

// ===== API Response Wrapper =====
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

**체크포인트**: TypeScript 컴파일 통과 확인

### 1.2 createPayment() 함수 구현 (20분)

**파일**: `packages/demo-app/src/utils/api.ts`

```typescript
import {
  CreatePaymentRequest,
  CreatePaymentRequestSchema,
  CreatePaymentResponse,
  CreatePaymentResponseSchema,
  ApiResponse,
  ApiResponseSchema,
} from '../types/api';

// ===== 환경 변수 =====
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1초

// ===== 에러 코드 =====
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ===== 재시도 헬퍼 함수 =====
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && isRetryableError(error)) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithDelay(fn, retries - 1, delay);
    }
    throw error;
  }
}

function isRetryableError(error: unknown): boolean {
  // 5xx 에러만 재시도
  if (error instanceof Error && 'status' in error) {
    const status = (error as any).status;
    return status >= 500 && status < 600;
  }
  return false;
}

// ===== createPayment() API 함수 =====
export async function createPayment(
  request: CreatePaymentRequest
): Promise<ApiResponse<CreatePaymentResponse>> {
  try {
    // 1. 요청 데이터 검증
    const validatedRequest = CreatePaymentRequestSchema.parse(request);

    // 2. API 호출 (재시도 로직 포함)
    const response = await retryWithDelay(async () => {
      const res = await fetch(`${API_BASE_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validatedRequest),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error: any = new Error(`HTTP ${res.status}: ${res.statusText}`);
        error.status = res.status;
        error.data = errorData;
        throw error;
      }

      return res;
    });

    // 3. 응답 데이터 파싱 및 검증
    const rawData = await response.json();
    const parsedResponse = ApiResponseSchema(CreatePaymentResponseSchema).parse(rawData);

    return parsedResponse;
  } catch (error) {
    // 4. 에러 처리
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.VALIDATION_ERROR,
          message: 'Invalid request or response data',
          details: error.errors,
        },
      };
    }

    if (error instanceof Error && 'status' in error) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.SERVER_ERROR,
          message: error.message,
          details: (error as any).data,
        },
      };
    }

    return {
      success: false,
      error: {
        code: ApiErrorCode.UNKNOWN_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}
```

**체크포인트**: ESLint 검증, 타입 에러 0개 확인

### 1.3 Unit Tests 작성 (10분)

**파일**: `packages/demo-app/src/utils/api.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPayment, ApiErrorCode } from './api';
import { CreatePaymentRequest } from '../types/api';

describe('createPayment()', () => {
  const mockRequest: CreatePaymentRequest = {
    merchantId: 'merchant-123',
    amount: 100,
    currency: 'USDC',
    chainId: 80002,
    description: 'Test payment',
  };

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('AC-1: 유효한 요청으로 성공적으로 결제 생성', async () => {
    const mockResponse = {
      success: true,
      data: {
        paymentId: 'payment-123',
        tokenAddress: '0x1234567890abcdef',
        gatewayAddress: '0xabcdef1234567890',
        amount: '100',
        currency: 'USDC',
        chainId: 80002,
        expiresAt: '2025-12-01T12:00:00Z',
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await createPayment(mockRequest);

    expect(result.success).toBe(true);
    expect(result.data?.paymentId).toBe('payment-123');
    expect(result.data?.tokenAddress).toBe('0x1234567890abcdef');
  });

  it('AC-2: 잘못된 chainId (-1)로 검증 실패', async () => {
    const invalidRequest = { ...mockRequest, chainId: -1 };

    const result = await createPayment(invalidRequest);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ApiErrorCode.VALIDATION_ERROR);
  });

  it('AC-3: 서버 500 에러 2회 후 성공하여 재시도', async () => {
    const mockResponse = {
      success: true,
      data: {
        paymentId: 'payment-123',
        tokenAddress: '0x1234567890abcdef',
        gatewayAddress: '0xabcdef1234567890',
        amount: '100',
        currency: 'USDC',
        chainId: 80002,
        expiresAt: '2025-12-01T12:00:00Z',
      },
    };

    // 첫 2회는 500 에러, 3회째 성공
    (global.fetch as any)
      .mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { status: 500 }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await createPayment(mockRequest);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('네트워크 에러 발생 시 에러 응답 반환', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const result = await createPayment(mockRequest);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ApiErrorCode.UNKNOWN_ERROR);
  });
});
```

**체크포인트**: `npm test -- api.test.ts` 실행하여 모든 테스트 통과 확인

---

## 📋 Phase 2: PaymentModal.tsx 수정 (2.5시간)

### 2.1 Import 변경 및 State 추가 (20분)

**파일**: `packages/demo-app/src/components/PaymentModal.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, erc20Abi } from 'viem';
import { getTokenForChain } from '../config/wagmi'; // UI 표시용 유지
import { createPayment } from '../utils/api'; // 🆕 서버 API
import { CreatePaymentResponse } from '../types/api'; // 🆕 타입

// ===== State 추가 =====
interface PaymentModalProps {
  amount: number;
  merchantId: string;
  chainId: number;
  currency: 'USDC' | 'USDT';
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentModal({
  amount,
  merchantId,
  chainId,
  currency,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const { address, isConnected } = useAccount();

  // 🆕 서버 설정 상태
  const [serverConfig, setServerConfig] = useState<CreatePaymentResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // 기존 상태들
  const [step, setStep] = useState<'approve' | 'pay'>('approve');
  const { writeContract, data: hash } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  // ... (나머지 코드는 다음 단계에서)
}
```

**체크포인트**: TypeScript 컴파일 통과 확인

### 2.2 서버 설정 로드 useEffect (30분)

```typescript
// ===== 서버 설정 자동 로드 =====
useEffect(() => {
  // AC-4: 지갑 연결 시 자동으로 서버 API 호출
  if (!isConnected || !address) {
    return;
  }

  const loadServerConfig = async () => {
    setIsLoadingConfig(true);
    setConfigError(null);

    try {
      const response = await createPayment({
        merchantId,
        amount,
        currency,
        chainId,
        description: `Payment for merchant ${merchantId}`,
      });

      if (response.success && response.data) {
        setServerConfig(response.data);
        console.log('✅ Server config loaded:', response.data);
      } else {
        setConfigError(response.error?.message || 'Failed to load server config');
        console.error('❌ Server config error:', response.error);
      }
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Unknown error');
      console.error('❌ Exception loading server config:', error);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  loadServerConfig();
}, [isConnected, address, merchantId, amount, currency, chainId]);

// ===== 재시도 함수 =====
const retryLoadConfig = () => {
  setServerConfig(null);
  setConfigError(null);
  // useEffect가 자동으로 다시 실행됨
};
```

**체크포인트**:
- 지갑 연결 후 자동으로 API 호출되는지 확인
- 로딩 상태 표시 확인
- 에러 처리 확인

### 2.3 handleApprove / handleDirectPayment 수정 (40분)

```typescript
// ===== AC-5: 서버 주소로 트랜잭션 생성 =====
const handleApprove = async () => {
  if (!serverConfig) {
    console.error('❌ Server config not loaded');
    return;
  }

  try {
    const amountInWei = parseUnits(serverConfig.amount, 6); // USDC는 6 decimals

    // 🆕 서버에서 받은 tokenAddress, gatewayAddress 사용
    writeContract({
      address: serverConfig.tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [serverConfig.gatewayAddress as `0x${string}`, amountInWei],
    });

    console.log('✅ Approve transaction sent:', {
      tokenAddress: serverConfig.tokenAddress,
      gatewayAddress: serverConfig.gatewayAddress,
      amount: amountInWei.toString(),
    });

    setStep('pay');
  } catch (error) {
    console.error('❌ Approve transaction failed:', error);
  }
};

const handleDirectPayment = async () => {
  if (!serverConfig) {
    console.error('❌ Server config not loaded');
    return;
  }

  try {
    const amountInWei = parseUnits(serverConfig.amount, 6);

    // 🆕 서버에서 받은 gatewayAddress 사용
    writeContract({
      address: serverConfig.gatewayAddress as `0x${string}`,
      abi: [
        {
          name: 'processPayment',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'paymentId', type: 'bytes32' },
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [],
        },
      ],
      functionName: 'processPayment',
      args: [
        serverConfig.paymentId as `0x${string}`,
        serverConfig.tokenAddress as `0x${string}`,
        amountInWei,
      ],
    });

    console.log('✅ Payment transaction sent:', {
      paymentId: serverConfig.paymentId,
      tokenAddress: serverConfig.tokenAddress,
      gatewayAddress: serverConfig.gatewayAddress,
      amount: amountInWei.toString(),
    });
  } catch (error) {
    console.error('❌ Payment transaction failed:', error);
  }
};

// ===== 트랜잭션 성공 시 처리 =====
useEffect(() => {
  if (isSuccess) {
    console.log('✅ Transaction confirmed:', hash);
    onSuccess();
  }
}, [isSuccess, hash, onSuccess]);
```

**체크포인트**:
- serverConfig 사용 확인
- 레거시 getContractsForChain() 호출 제거 확인
- 트랜잭션 파라미터 정확성 확인

### 2.4 UI 개선 - 로딩 및 에러 표시 (30분)

```typescript
// ===== IR-3: 재시도 버튼 포함 에러 UI =====
if (configError) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg max-w-md">
        <h2 className="text-xl font-bold mb-4 text-red-600">설정 로드 실패</h2>
        <p className="mb-4">{configError}</p>
        <div className="flex gap-2">
          <button
            onClick={retryLoadConfig}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            재시도
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== FR-5: 로딩 상태 표시 =====
if (isLoadingConfig) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-center">서버 설정을 불러오는 중...</p>
      </div>
    </div>
  );
}

// ===== 정상 결제 UI (서버 설정 로드 완료) =====
if (!serverConfig) {
  return null; // 이 경우는 발생하지 않음 (useEffect가 처리)
}

return (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
    <div className="bg-white p-6 rounded-lg max-w-md">
      <h2 className="text-xl font-bold mb-4">결제하기</h2>

      {/* 서버에서 받은 설정 표시 */}
      <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
        <p><strong>Payment ID:</strong> {serverConfig.paymentId}</p>
        <p><strong>Token:</strong> {serverConfig.currency}</p>
        <p><strong>Amount:</strong> {serverConfig.amount}</p>
        <p><strong>Chain:</strong> {serverConfig.chainId}</p>
      </div>

      {step === 'approve' ? (
        <button
          onClick={handleApprove}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Approve USDC
        </button>
      ) : (
        <button
          onClick={handleDirectPayment}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Pay Now
        </button>
      )}

      <button
        onClick={onClose}
        className="w-full mt-2 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
      >
        닫기
      </button>
    </div>
  </div>
);
```

**체크포인트**:
- UI 로딩 상태 표시 확인
- 에러 상태 표시 및 재시도 버튼 확인
- 서버 설정 정보 표시 확인

### 2.5 PaymentModal Tests 작성 (30분)

**파일**: `packages/demo-app/src/components/PaymentModal.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentModal } from './PaymentModal';
import * as api from '../utils/api';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x123', isConnected: true }),
  useWriteContract: () => ({ writeContract: vi.fn(), data: null }),
  useWaitForTransactionReceipt: () => ({ isSuccess: false }),
}));

describe('PaymentModal', () => {
  const mockProps = {
    amount: 100,
    merchantId: 'merchant-123',
    chainId: 80002,
    currency: 'USDC' as const,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('AC-4: 마운트 시 자동으로 서버 API 호출', async () => {
    const createPaymentSpy = vi.spyOn(api, 'createPayment').mockResolvedValueOnce({
      success: true,
      data: {
        paymentId: 'payment-123',
        tokenAddress: '0x1234567890abcdef',
        gatewayAddress: '0xabcdef1234567890',
        amount: '100',
        currency: 'USDC',
        chainId: 80002,
        expiresAt: '2025-12-01T12:00:00Z',
      },
    });

    render(<PaymentModal {...mockProps} />);

    await waitFor(() => {
      expect(createPaymentSpy).toHaveBeenCalledWith({
        merchantId: 'merchant-123',
        amount: 100,
        currency: 'USDC',
        chainId: 80002,
        description: expect.stringContaining('merchant-123'),
      });
    });
  });

  it('로딩 중 로딩 스피너 표시', async () => {
    vi.spyOn(api, 'createPayment').mockImplementation(
      () => new Promise(() => {}) // 무한 대기
    );

    render(<PaymentModal {...mockProps} />);

    expect(screen.getByText(/서버 설정을 불러오는 중/i)).toBeInTheDocument();
  });

  it('에러 발생 시 재시도 버튼 표시', async () => {
    vi.spyOn(api, 'createPayment').mockResolvedValueOnce({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Server is down',
      },
    });

    render(<PaymentModal {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText(/설정 로드 실패/i)).toBeInTheDocument();
      expect(screen.getByText(/재시도/i)).toBeInTheDocument();
    });
  });

  it('재시도 버튼 클릭 시 API 재호출', async () => {
    const createPaymentSpy = vi
      .spyOn(api, 'createPayment')
      .mockResolvedValueOnce({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Error' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          paymentId: 'payment-123',
          tokenAddress: '0x1234567890abcdef',
          gatewayAddress: '0xabcdef1234567890',
          amount: '100',
          currency: 'USDC',
          chainId: 80002,
          expiresAt: '2025-12-01T12:00:00Z',
        },
      });

    render(<PaymentModal {...mockProps} />);

    await waitFor(() => screen.getByText(/재시도/i));

    const retryButton = screen.getByText(/재시도/i);
    await userEvent.click(retryButton);

    await waitFor(() => {
      expect(createPaymentSpy).toHaveBeenCalledTimes(2);
    });
  });
});
```

**체크포인트**: `npm test -- PaymentModal.test.tsx` 실행하여 모든 테스트 통과 확인

---

## 📋 Phase 3: wagmi.ts 정리 (30분)

### 3.1 LEGACY_CONTRACTS 삭제 (15분)

**파일**: `packages/demo-app/src/config/wagmi.ts`

**삭제할 코드**:
```typescript
// ❌ 삭제: LEGACY_CONTRACTS
// ❌ 삭제: getContractsForChain()
```

**유지할 코드**:
```typescript
// ✅ 유지: getTokenForChain() - UI 표시용
export function getTokenForChain(chainId: number) {
  switch (chainId) {
    case polygonAmoy.id:
      return {
        address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582' as `0x${string}`,
        symbol: 'USDC',
        decimals: 6,
      };
    case hardhat.id:
      return {
        address: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`,
        symbol: 'USDC',
        decimals: 6,
      };
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}
```

**체크포인트**: AC-6 확인 - `git grep LEGACY_CONTRACTS` 결과가 0개

### 3.2 검증 스크립트 실행 (15분)

**파일**: `packages/demo-app/scripts/verify-cleanup.sh` (새 파일)

```bash
#!/bin/bash

echo "🔍 Verifying legacy code cleanup..."

# AC-6: LEGACY_CONTRACTS 검색
LEGACY_COUNT=$(git grep -c "LEGACY_CONTRACTS" packages/demo-app/src || echo "0")

if [ "$LEGACY_COUNT" != "0" ]; then
  echo "❌ FAILED: LEGACY_CONTRACTS still exists!"
  git grep -n "LEGACY_CONTRACTS" packages/demo-app/src
  exit 1
fi

# getContractsForChain 검색
GET_CONTRACTS_COUNT=$(git grep -c "getContractsForChain" packages/demo-app/src || echo "0")

if [ "$GET_CONTRACTS_COUNT" != "0" ]; then
  echo "❌ FAILED: getContractsForChain still exists!"
  git grep -n "getContractsForChain" packages/demo-app/src
  exit 1
fi

# getTokenForChain은 유지되어야 함
GET_TOKEN_COUNT=$(git grep -c "getTokenForChain" packages/demo-app/src || echo "0")

if [ "$GET_TOKEN_COUNT" == "0" ]; then
  echo "❌ FAILED: getTokenForChain was removed (should be kept)!"
  exit 1
fi

echo "✅ PASSED: All legacy code removed successfully!"
echo "✅ PASSED: getTokenForChain is kept for UI display!"
exit 0
```

**실행**: `chmod +x scripts/verify-cleanup.sh && ./scripts/verify-cleanup.sh`

**체크포인트**: 스크립트 통과 확인

---

## 📋 Phase 4: 통합 테스트 및 품질 검증 (1-1.5시간)

### 4.1 Integration Tests (30분)

**파일**: `packages/demo-app/src/__tests__/integration/payment-flow.test.tsx`

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentModal } from '../../components/PaymentModal';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// MSW 서버 설정
const server = setupServer(
  http.post('http://localhost:3001/payments/create', () => {
    return HttpResponse.json({
      success: true,
      data: {
        paymentId: 'payment-integration-test',
        tokenAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
        gatewayAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
        amount: '100',
        currency: 'USDC',
        chainId: 80002,
        expiresAt: '2025-12-01T12:00:00Z',
      },
    });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('Payment Flow Integration Test', () => {
  it('전체 결제 흐름: API 호출 → UI 로드 → Approve → Pay', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <PaymentModal
        amount={100}
        merchantId="merchant-integration"
        chainId={80002}
        currency="USDC"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // 1. 로딩 상태 확인
    expect(screen.getByText(/서버 설정을 불러오는 중/i)).toBeInTheDocument();

    // 2. 서버 설정 로드 완료 후 UI 표시
    await waitFor(() => {
      expect(screen.getByText(/결제하기/i)).toBeInTheDocument();
    });

    // 3. 서버 설정 정보 표시 확인
    expect(screen.getByText(/payment-integration-test/i)).toBeInTheDocument();
    expect(screen.getByText(/USDC/i)).toBeInTheDocument();

    // 4. Approve 버튼 클릭
    const approveButton = screen.getByText(/Approve USDC/i);
    await userEvent.click(approveButton);

    // 5. Pay Now 버튼 표시 확인
    await waitFor(() => {
      expect(screen.getByText(/Pay Now/i)).toBeInTheDocument();
    });
  });
});
```

**체크포인트**: `npm test -- payment-flow.test.tsx` 실행하여 통과 확인

### 4.2 TypeScript / ESLint / Coverage 검증 (20분)

```bash
# TypeScript 컴파일 에러 확인 (NFR-3)
npm run type-check

# ESLint 검증
npm run lint

# 전체 테스트 + 커버리지 (AC-7, NFR-2)
npm test -- --coverage

# 커버리지 검증
# - api.ts: 95%+
# - PaymentModal.tsx: 90%+
# - wagmi.ts: 85%+
```

**체크포인트**: 모든 검증 통과 확인

### 4.3 E2E Tests (Optional, 30분)

**파일**: `packages/demo-app/e2e/payment.spec.ts` (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Payment E2E', () => {
  test('전체 결제 흐름 E2E 테스트', async ({ page }) => {
    // 1. 데모 앱 접속
    await page.goto('http://localhost:5173');

    // 2. 지갑 연결
    await page.click('text=Connect Wallet');
    await page.click('text=MetaMask'); // MetaMask 선택
    // (MetaMask 확인 대기 - 수동 또는 자동화)

    // 3. 결제 모달 열기
    await page.click('text=Pay 100 USDC');

    // 4. 로딩 확인
    await expect(page.locator('text=서버 설정을 불러오는 중')).toBeVisible();

    // 5. 결제 모달 로드 완료
    await expect(page.locator('text=결제하기')).toBeVisible({ timeout: 5000 });

    // 6. Approve 버튼 클릭
    await page.click('text=Approve USDC');

    // 7. MetaMask 확인 (수동 또는 자동화)
    // ...

    // 8. Pay Now 버튼 클릭
    await expect(page.locator('text=Pay Now')).toBeVisible();
    await page.click('text=Pay Now');

    // 9. 성공 메시지 확인
    await expect(page.locator('text=Payment Successful')).toBeVisible({ timeout: 30000 });
  });
});
```

**실행**: `npx playwright test`

**체크포인트**: E2E 테스트 통과 확인 (선택사항)

---

## ✅ Rollback Plan (위험 완화)

### Rollback Checkpoints

**Checkpoint 1** (Phase 1 완료 후):
```bash
git add packages/demo-app/src/types/api.ts packages/demo-app/src/utils/api.ts
git commit -m "checkpoint: API client and schemas added"
```

**Checkpoint 2** (Phase 2 완료 후):
```bash
git add packages/demo-app/src/components/PaymentModal.tsx
git commit -m "checkpoint: PaymentModal server integration complete"
```

**Checkpoint 3** (Phase 3 완료 후):
```bash
git add packages/demo-app/src/config/wagmi.ts
git commit -m "checkpoint: Legacy code removed"
```

### Rollback 전략

**Phase 2 실패 시**:
```bash
git reset --hard <checkpoint-1-hash>
# Phase 1 상태로 복구, PaymentModal 변경사항 취소
```

**Phase 3 실패 시**:
```bash
git reset --hard <checkpoint-2-hash>
# Phase 2 상태로 복구, wagmi.ts 변경사항 취소
```

**전체 Rollback**:
```bash
git reset --hard HEAD~3
# 전체 구현 취소, 초기 상태 복구
```

---

## 📊 성공 지표

| 지표 | 목표 | 검증 방법 |
|------|------|----------|
| **테스트 커버리지** | ≥90% | `npm test -- --coverage` |
| **TypeScript 에러** | 0개 | `npm run type-check` |
| **ESLint 에러** | 0개 | `npm run lint` |
| **API 응답 시간** | ≤3초 | 통합 테스트 로그 확인 |
| **번들 크기 증가** | <5KB | `npm run build` 후 크기 확인 |
| **레거시 코드 제거** | 100% | `./scripts/verify-cleanup.sh` |

---

## 🚀 Next Steps (SPEC-DEMO-002 완료 후)

1. **Production 배포 준비**:
   - 환경 변수 설정 (VITE_API_BASE_URL)
   - 프로덕션 빌드 테스트
   - 성능 모니터링 설정

2. **추가 개선 사항**:
   - 서버 설정 캐싱 (localStorage)
   - 에러 로깅 (Sentry)
   - Analytics 추가 (Google Analytics)

3. **문서화**:
   - `/moai:3-sync SPEC-DEMO-002` 실행
   - API 사용법 문서 작성
   - 배포 가이드 작성

---

**Status**: Draft
**Last Updated**: 2025-12-01
**Estimated Total Time**: 4.5-5시간
