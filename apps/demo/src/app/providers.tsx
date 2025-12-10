"use client";

import * as React from "react";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider, type Config } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { createWagmiConfig, fetchChainConfig } from "@/lib/wagmi";
import type { ChainConfig } from "@/app/api/config/route";

import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // 30초간 캐시 유지
      refetchOnWindowFocus: false, // 탭 전환 시 refetch 방지
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [wagmiConfig, setWagmiConfig] = React.useState<Config | null>(null);
  const [chainConfig, setChainConfig] = React.useState<ChainConfig | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);

    // 체인 설정을 API에서 가져와서 wagmi config 생성
    fetchChainConfig()
      .then((config) => {
        setChainConfig(config);
        setWagmiConfig(createWagmiConfig(config));
      })
      .catch((err) => {
        console.error('Failed to load chain config:', err);
        setError('Failed to load blockchain configuration');
      });
  }, []);

  // 로딩 상태
  if (!mounted || !wagmiConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {error || 'Loading blockchain configuration...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ChainConfigContext.Provider value={chainConfig}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={{
              lightMode: lightTheme(),
              darkMode: darkTheme(),
            }}
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ChainConfigContext.Provider>
  );
}

// 현재 체인 설정을 가져오기 위한 Context
export const ChainConfigContext = React.createContext<ChainConfig | null>(null);

export function useChainConfig(): ChainConfig | null {
  return React.useContext(ChainConfigContext);
}
