/**
 * Chain Config API Route
 *
 * 서버사이드 환경변수를 클라이언트에 전달
 * Docker 환경변수만 변경하면 런타임에 체인 설정 변경 가능
 *
 * 환경변수:
 * - CHAIN_ID: 체인 ID (31337 = Hardhat, 80002 = Polygon Amoy)
 * - RPC_URL: RPC URL
 * - CHAIN_NAME: 체인 이름 (UI 표시용)
 */

import { NextResponse } from 'next/server';

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  chainName: string;
}

export async function GET() {
  const config: ChainConfig = {
    chainId: Number(process.env.CHAIN_ID) || 31337,
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    chainName: process.env.CHAIN_NAME || 'Hardhat',
  };

  return NextResponse.json(config);
}
