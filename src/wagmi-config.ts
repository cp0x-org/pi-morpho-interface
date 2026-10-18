import {
  mainnet,
  base,
  polygon,
  unichain,
  arbitrum,
  optimism,
  worldchain,
  hyperEvm,
  katana,
  monad,
  stable,
  tempo,
  Chain
} from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

import { robinhood } from './chains/robinhood';
import { RuntimeConfig } from './runtime-config';

// Public WalletConnect Cloud project id (it is sent to wallets anyway); `public/config.js` can override it.
const DEFAULT_WALLETCONNECT_PROJECT_ID = '3bd0ad741725d54fbc9a4c7b6545720e';

/** Chains the interface supports, in the order wallets list them. */
export const supportedChains: readonly [Chain, ...Chain[]] = [
  mainnet,
  base,
  polygon,
  unichain,
  arbitrum,
  optimism,
  worldchain,
  hyperEvm,
  katana,
  monad,
  stable,
  tempo,
  robinhood
];

const withRpcUrls = (chain: Chain, rpc: string | string[] | undefined): Chain => {
  const http = (Array.isArray(rpc) ? rpc : [rpc]).filter((url): url is string => typeof url === 'string' && url.length > 0);
  if (http.length === 0) return chain;
  // viem only reads `default`: a chain without it has no transport at all.
  return { ...chain, rpcUrls: { ...chain.rpcUrls, default: { http } } };
};

/**
 * Builds the wagmi/RainbowKit config once the runtime config is known. RPC endpoints never live in the source:
 * they come from `public/config.js`, with each chain's public endpoint as the fallback.
 */
export const createWagmiConfig = (runtime: RuntimeConfig = {}) =>
  getDefaultConfig({
    appName: 'Morpho Interface',
    projectId: runtime.walletConnectProjectId || DEFAULT_WALLETCONNECT_PROJECT_ID,
    chains: supportedChains.map((chain) => withRpcUrls(chain, runtime.rpcUrls?.[String(chain.id)])) as [Chain, ...Chain[]],
    ssr: false
  });
