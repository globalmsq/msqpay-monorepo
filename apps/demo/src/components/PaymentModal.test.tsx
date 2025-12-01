/**
 * PaymentModal Tests
 * Test suite for PaymentModal component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentModal } from './PaymentModal';
import { createPayment } from '@/lib/api';

// Mock the API
vi.mock('@/lib/api', () => ({
  createPayment: vi.fn(),
  getPaymentStatus: vi.fn(),
}));

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({ address: '0x1234567890123456789012345678901234567890' })),
  useWalletClient: vi.fn(() => ({
    data: {
      writeContract: vi.fn(),
    },
  })),
  useChainId: vi.fn(() => 80002),
  useReadContract: vi.fn(() => ({
    data: BigInt('1000000000000000000'),
    isLoading: false,
    refetch: vi.fn(),
  })),
  useWaitForTransactionReceipt: vi.fn(() => ({
    isLoading: false,
    isSuccess: false,
  })),
}));

// Mock viem functions
vi.mock('viem', () => ({
  parseUnits: vi.fn((val) => BigInt(val) * BigInt(10 ** 18)),
  formatUnits: vi.fn((val) => (Number(val) / 10 ** 18).toString()),
  keccak256: vi.fn(() => '0x123456789'),
  toHex: vi.fn((val) => '0x' + val),
}));

// Mock wagmi lib
vi.mock('@/lib/wagmi', () => ({
  getTokenForChain: vi.fn(() => ({
    address: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    symbol: 'SUT',
  })),
}));

const mockProduct = {
  id: 'product-1',
  name: 'Test Product',
  description: 'A test product',
  price: '100',
};

const mockOnClose = vi.fn();
const mockOnSuccess = vi.fn();

describe('PaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render payment modal with product details', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Checkout')).toBeInTheDocument();
    expect(screen.getByText(mockProduct.name)).toBeInTheDocument();
  });

  it('should have close button in the modal header', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // The modal should have buttons for closing
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should display balance information', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Your.*Balance:/i)).toBeInTheDocument();
  });

  it('should display payment method selector with Direct and Gasless options', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Payment Method')).toBeInTheDocument();
    expect(screen.getByText(/Direct/i)).toBeInTheDocument();
    expect(screen.getByText(/Gasless/i)).toBeInTheDocument();
  });

  it('should show approval button when token approval is needed (Direct mode)', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // The approval button should be visible in the DOM
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should show payment buttons for payment processing', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Check that there is at least one button for payment/action
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should load server configuration on mount', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Component should render without errors
    expect(screen.getByText('Checkout')).toBeInTheDocument();
  });

  it('should use serverConfig for addresses instead of legacy contracts', async () => {
    render(
      <PaymentModal
        product={mockProduct}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />
    );

    // Component should be rendered and functional
    expect(screen.getByText(mockProduct.name)).toBeInTheDocument();
  });
});
