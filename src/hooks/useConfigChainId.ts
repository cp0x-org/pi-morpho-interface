import { useChainId } from 'wagmi';
import { appChainConfig } from '@/appconfig';

export type NetworkId = keyof typeof appChainConfig;

export const useConfigChainId = () => {
  let chainId = useChainId();

  const isSupportedNetwork = chainId in appChainConfig;

  if (!isSupportedNetwork) {
    console.warn(`Unsupported network with chainId: ${chainId}`);
    chainId = 1;
  }

  const config = appChainConfig[chainId as NetworkId];
  return { config, chainId: chainId as NetworkId, isSupported: isSupportedNetwork };
};
