import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

// Etherscan API v2: Single API key for all 60+ supported chains
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// Dynamic network configuration
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Default network: Configure via RPC_URL and CHAIN_ID environment variables
    // Supported chains (set CHAIN_ID):
    //   - Polygon Amoy: 80002 (Testnet)
    //   - Polygon: 137 (Mainnet)
    //   - Ethereum Sepolia: 11155111 (Testnet)
    //   - Ethereum: 1 (Mainnet)
    //   - BNB Testnet: 97 (Testnet)
    //   - BNB: 56 (Mainnet)
    ...(RPC_URL && CHAIN_ID ? {
      default: {
        url: RPC_URL,
        chainId: CHAIN_ID,
        accounts: [PRIVATE_KEY],
      },
    } : {}),
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
