/**
 * 블록체인 체인 설정
 * 지원하는 네트워크별 컨트랙트 주소와 토큰 정보를 중앙에서 관리
 */

export interface ChainConfig {
  id: number;
  name: string;
  contracts: {
    gateway: string;
    forwarder: string;
  };
  tokens: Record<string, string>; // symbol -> address
}

/**
 * 지원하는 블록체인 네트워크
 */
export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: 80002,
    name: 'Polygon Amoy',
    contracts: {
      gateway: '0x0000000000000000000000000000000000000000',
      forwarder: '0x0000000000000000000000000000000000000000',
    },
    tokens: {
      SUT: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    },
  },
  {
    id: 31337,
    name: 'Hardhat',
    contracts: {
      gateway: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      forwarder: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    },
    tokens: {
      TEST: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    },
  },
];

/**
 * chainId로 체인 설정 조회
 * @param chainId 네트워크 체인 ID
 * @returns 체인 설정 또는 undefined
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find(chain => chain.id === chainId);
}

/**
 * 지원하는 chainId 목록 조회
 * @returns 지원하는 모든 chainId 배열
 */
export function getSupportedChainIds(): number[] {
  return SUPPORTED_CHAINS.map(chain => chain.id);
}

/**
 * 특정 체인의 토큰 주소 조회
 * @param chainId 네트워크 체인 ID
 * @param symbol 토큰 심볼 (예: "SUT", "TEST")
 * @returns 토큰 주소 또는 undefined
 */
export function getTokenAddress(chainId: number, symbol: string): string | undefined {
  const chain = getChainConfig(chainId);
  return chain?.tokens[symbol];
}
