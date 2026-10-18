// Runtime settings the browser reads on page load (index.html loads /config.js before the app bundle).
// They are not part of the build: copy this file to public/config.js (git-ignored) and put your own RPC URLs there.
window.APP_CONFIG = {
  // WalletConnect Cloud project id (optional; the app has a default one).
  walletConnectProjectId: '3bd0ad741725d54fbc9a4c7b6545720e',

  // RPC endpoint(s) per chain id: one URL or an array of URLs.
  // A chain left out keeps the public endpoint from its viem definition.
  rpcUrls: {
    1: 'https://eth.merkle.io', // Ethereum
    8453: 'https://mainnet.base.org', // Base
    137: 'https://polygon.drpc.org', // Polygon
    130: 'https://mainnet.unichain.org', // Unichain
    42161: 'https://arb1.arbitrum.io/rpc', // Arbitrum One
    10: 'https://mainnet.optimism.io', // OP Mainnet
    480: 'https://worldchain-mainnet.g.alchemy.com/public', // World Chain
    999: 'https://rpc.hyperliquid.xyz/evm', // HyperEVM
    747474: 'https://rpc.katana.network', // Katana
    143: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz'], // Monad
    988: 'https://rpc.stable.xyz', // Stable
    4217: 'https://rpc.tempo.xyz', // Tempo
    4663: 'https://rpc.mainnet.chain.robinhood.com' // Robinhood Chain
  }
};
