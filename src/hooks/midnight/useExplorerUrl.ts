import { useMemo } from 'react';
import { useConfig } from 'wagmi';

/** Block explorer links for a chain from the wagmi config. */
export const useExplorerUrl = (chainId?: number) => {
  const config = useConfig();
  const baseUrl = config.chains.find((chain) => chain.id === chainId)?.blockExplorers?.default.url?.replace(/\/$/, '');

  return useMemo(
    () => ({
      address: (address: string) => (baseUrl ? `${baseUrl}/address/${address}` : undefined),
      tx: (hash: string) => (baseUrl ? `${baseUrl}/tx/${hash}` : undefined)
    }),
    [baseUrl]
  );
};
