import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { polygonAmoy, hardhat } from "wagmi/chains";

// WalletConnect Project ID - Get one at https://cloud.walletconnect.com/
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";

export const config = getDefaultConfig({
  appName: "MSQ Pay Demo",
  projectId,
  chains: [polygonAmoy, hardhat],
  ssr: true,
});

// ⚠️ DEPRECATED: These are only kept for UI display purposes
// Contract addresses and token addresses are now provided by the server
// See: POST /payments/create API response

// Default token symbol per chain (for UI display only)
export const DEFAULT_TOKEN_SYMBOL: Record<number, string> = {
  [polygonAmoy.id]: "SUT",
  [hardhat.id]: "TEST",
};

// Token addresses per chain (for UI display only - NOT used for contract interaction)
export const TOKENS: Record<number, Record<string, `0x${string}`>> = {
  [polygonAmoy.id]: {
    SUT: "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  },
  [hardhat.id]: {
    TEST: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  },
};

// Subgraph URLs per chain (update after deployment)
// Localhost uses direct blockchain query, other chains use subgraph
export const SUBGRAPH_URLS: Record<number, string> = {
  // [polygonAmoy.id]: "https://api.studio.thegraph.com/query/.../msq-pay-amoy/v0.0.1",
  // [137]: "https://api.studio.thegraph.com/query/.../msq-pay-polygon/v0.0.1", // Polygon Mainnet
  // Future: ETH (1), BSC (56) can be added here
};

// Helper to get subgraph URL for a chain
export function getSubgraphUrl(chainId: number): string | undefined {
  return SUBGRAPH_URLS[chainId];
}

// Helper to get token config for a chain (for UI display only)
export function getTokenForChain(chainId: number): { address: `0x${string}`; symbol: string } | undefined {
  const symbol = DEFAULT_TOKEN_SYMBOL[chainId];
  if (!symbol) return undefined;
  const address = TOKENS[chainId]?.[symbol];
  if (!address) return undefined;
  return { address, symbol };
}

