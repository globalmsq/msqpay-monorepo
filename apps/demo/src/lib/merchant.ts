/**
 * Merchant Configuration
 *
 * 상점 레벨 설정 - 모든 상품이 동일한 체인과 토큰을 사용
 *
 * 설계 원칙:
 * - 상품별 체인/토큰 설정 대신 상점 단위로 통합
 * - 단일 결제 토큰으로 모든 상품 결제 처리
 * - 결제 서버와의 통신에 필요한 설정 집중 관리
 */

import { DEMO_MERCHANT_ADDRESS } from './constants';

/**
 * 상점 설정 인터페이스
 */
export interface MerchantConfig {
  /** 상점 고유 식별자 */
  merchantId: string;

  /** 결제 수령 주소 */
  recipientAddress: `0x${string}`;

  /** 사용할 블록체인 체인 ID */
  chainId: number;

  /** 결제 토큰 심볼 (예: TEST, USDC) */
  tokenSymbol: string;

  /** 결제 토큰 컨트랙트 주소 */
  tokenAddress: `0x${string}`;

  /** 토큰 소수점 자릿수 */
  tokenDecimals: number;
}

/**
 * 데모 상점 설정
 *
 * 환경:
 * - Hardhat 로컬 개발 네트워크 (chainId: 31337)
 * - TEST 토큰 사용
 */
const DEMO_MERCHANT_CONFIG: MerchantConfig = {
  merchantId: 'merchant_demo_001',
  recipientAddress: DEMO_MERCHANT_ADDRESS,
  chainId: 31337,
  tokenSymbol: 'TEST',
  tokenAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  tokenDecimals: 18,
};

/**
 * 현재 상점 설정 반환
 *
 * 향후 확장:
 * - 환경변수 기반 설정 로드
 * - 다중 상점 지원
 * - 동적 설정 변경
 */
export function getMerchantConfig(): MerchantConfig {
  return DEMO_MERCHANT_CONFIG;
}

/**
 * orderId 생성
 *
 * 상점 서버에서 주문 생성 시 호출
 * 형식: ord_{timestamp}_{random}
 */
export function generateOrderId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `ord_${timestamp}_${random}`;
}
