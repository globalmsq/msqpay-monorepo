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

// Contract addresses per chain
export const CONTRACTS: Record<number, { gateway: `0x${string}`; forwarder: `0x${string}` }> = {
  // Polygon Amoy - TBD after deployment
  [polygonAmoy.id]: {
    gateway: "0x0000000000000000000000000000000000000000",
    forwarder: "0x0000000000000000000000000000000000000000",
  },
  // Localhost (Hardhat)
  [hardhat.id]: {
    gateway: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    forwarder: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  },
};

// Token addresses per chain
export const TOKENS: Record<number, Record<string, `0x${string}`>> = {
  [polygonAmoy.id]: {
    SUT: "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  },
  [hardhat.id]: {
    // MockERC20 deployed via ignition
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

// Default token symbol per chain
export const DEFAULT_TOKEN_SYMBOL: Record<number, string> = {
  [polygonAmoy.id]: "SUT",
  [hardhat.id]: "TEST",
};

// Helper to get token config for a chain
export function getTokenForChain(chainId: number): { address: `0x${string}`; symbol: string } | undefined {
  const symbol = DEFAULT_TOKEN_SYMBOL[chainId];
  if (!symbol) return undefined;
  const address = TOKENS[chainId]?.[symbol];
  if (!address) return undefined;
  return { address, symbol };
}

// Helper to get contracts for a chain
export function getContractsForChain(chainId: number): { gateway: `0x${string}`; forwarder: `0x${string}` } | undefined {
  return CONTRACTS[chainId];
}
