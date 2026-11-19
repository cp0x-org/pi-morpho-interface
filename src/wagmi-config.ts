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
import { getDefaultConfig, Chain as RainbowKitChain } from '@rainbow-me/rainbowkit';
import { fallback, http, Transport } from 'viem';

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

// RainbowKit ships icons only for a few well-known chains (Ethereum, Base, Polygon, Arbitrum, Optimism, ...); the rest
// would show up blank in the network switcher, so they take the icons from public/chains/<id>.jpg.
const CHAINS_WITHOUT_RAINBOWKIT_ICON = new Set<number>([
  unichain.id,
  worldchain.id,
  hyperEvm.id,
  katana.id,
  monad.id,
  stable.id,
  tempo.id,
  robinhood.id
]);

const withIcon = (chain: Chain): RainbowKitChain =>
  CHAINS_WITHOUT_RAINBOWKIT_ICON.has(chain.id) ? { ...chain, iconUrl: `${import.meta.env.BASE_URL}chains/${chain.id}.jpg` } : chain;

const configuredRpcUrls = (rpc: string | string[] | undefined): string[] =>
  (Array.isArray(rpc) ? rpc : [rpc]).filter((url): url is string => typeof url === 'string' && url.length > 0);

const withRpcUrls = (chain: Chain, urls: string[]): Chain => {
  if (urls.length === 0) return chain;
  // viem only reads `default`: a chain without it has no transport at all.
  return { ...chain, rpcUrls: { ...chain.rpcUrls, default: { http: urls } } };
};

/**
 * Every configured endpoint in order, then the chain's public one. RainbowKit's default transport takes only the first
 * URL of a chain, so a second endpoint in `public/config.js` did nothing. `fallback` moves to the next endpoint when one
 * fails (down, rate limited, origin not allowed); a node that answers from an old block is not an error and is not
 * skipped, that case is covered by re-reading on every block (see `useRefreshOnNewBlock`).
 */
const createTransport = (chain: Chain, urls: string[]): Transport => {
  const all = [...urls, ...chain.rpcUrls.default.http.filter((url) => !urls.includes(url))];
  return all.length > 1 ? fallback(all.map((url) => http(url))) : http(all[0]);
};

/**
 * Builds the wagmi/RainbowKit config once the runtime config is known. RPC endpoints never live in the source:
 * they come from `public/config.js`, with each chain's public endpoint as the fallback.
 */
export const createWagmiConfig = (runtime: RuntimeConfig = {}) => {
  const urlsOf = (chain: Chain) => configuredRpcUrls(runtime.rpcUrls?.[String(chain.id)]);
  return getDefaultConfig({
    appName: 'Morpho Interface',
    projectId: runtime.walletConnectProjectId || DEFAULT_WALLETCONNECT_PROJECT_ID,
    chains: supportedChains.map((chain) => withIcon(withRpcUrls(chain, urlsOf(chain)))) as [RainbowKitChain, ...RainbowKitChain[]],
    transports: Object.fromEntries(supportedChains.map((chain) => [chain.id, createTransport(chain, urlsOf(chain))])),
    ssr: false
  });
};
