/**
 * Settings read from `public/config.js`, which index.html loads before the app bundle, so RPC endpoints (and the keys
 * inside them) live outside the bundle and outside git. `public/config.example.js` documents the shape; the Docker image
 * ships that example and `docker-compose.yml` mounts the real file over it.
 */
export interface RuntimeConfig {
  /** WalletConnect Cloud project id. Falls back to the one built into the app. */
  walletConnectProjectId?: string;
  /** RPC endpoint(s) per chain id. A chain missing here keeps the public endpoint from its viem definition. */
  rpcUrls?: Record<string, string | string[]>;
}

declare global {
  interface Window {
    APP_CONFIG?: unknown;
  }
}

/** Never throws: a missing or broken file only costs the overrides, the app still starts on public RPCs. */
export const loadRuntimeConfig = (): RuntimeConfig => {
  const raw = typeof window === 'undefined' ? undefined : window.APP_CONFIG;
  if (raw === undefined) {
    console.warn('public/config.js is missing or did not set window.APP_CONFIG; using default RPC endpoints.');
    return {};
  }
  if (!raw || typeof raw !== 'object') {
    console.warn('window.APP_CONFIG is not an object; using default RPC endpoints.');
    return {};
  }
  return raw as RuntimeConfig;
};
