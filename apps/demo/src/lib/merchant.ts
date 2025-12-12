/**
 * Merchant Configuration
 *
 * 상점 레벨 설정 - 모든 상품이 동일한 체인과 토큰을 사용
 *
 * 설계 원칙:
 * - 상품별 체인/토큰 설정 대신 상점 단위로 통합
 * - 단일 결제 토큰으로 모든 상품 결제 처리
 * - 결제 서버와의 통신에 필요한 설정 집중 관리
 * - 환경변수(CHAIN_ID)로 체인 선택 (서버 사이드 전용)
 *
 * ⚠️ 주의: NEXT_PUBLIC_ 접두사를 사용하지 않음
 * - NEXT_PUBLIC_*는 빌드 타임에 인라인되어 런타임 변경 불가
 * - CHAIN_ID는 서버 런타임에 읽어서 docker-compose 환경변수 적용 가능
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
 * 체인별 설정
 */
const CHAIN_CONFIGS: Record<number, Omit<MerchantConfig, 'merchantId'>> = {
  // Hardhat Local (chainId: 31337)
  // MockERC20 is first contract deployed (nonce 0)
  31337: {
    chainId: 31337,
    recipientAddress: DEMO_MERCHANT_ADDRESS,
    tokenSymbol: 'TEST',
    tokenAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    tokenDecimals: 18,
  },
  // Polygon Amoy (chainId: 80002)
  80002: {
    chainId: 80002,
    recipientAddress: '0x31d45F29071e73836F67ec9dFf53e8af67A74f39',
    tokenSymbol: 'SUT',
    tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    tokenDecimals: 18,
  },
};

/**
 * 현재 상점 설정 반환
 *
 * 환경변수 CHAIN_ID로 체인 선택 (서버 사이드 전용, 런타임에 읽음)
 * - 31337: Hardhat 로컬 (TEST 토큰)
 * - 80002: Polygon Amoy (SUT 토큰)
 *
 * ⚠️ CHAIN_ID는 NEXT_PUBLIC_ 접두사 없이 사용
 * - docker-compose 환경변수가 런타임에 적용됨
 * - 빌드 타임 인라인 문제 방지
 */
export function getMerchantConfig(): MerchantConfig {
  // 서버 런타임 환경변수: CHAIN_ID (우선) 또는 NEXT_PUBLIC_CHAIN_ID (fallback)
  const chainId = Number(process.env.CHAIN_ID) || Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 31337;
  const chainConfig = CHAIN_CONFIGS[chainId] || CHAIN_CONFIGS[31337];

  return {
    merchantId: 'merchant_demo_001',
    ...chainConfig,
  };
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
