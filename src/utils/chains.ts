const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'OP Mainnet',
  100: 'Gnosis',
  130: 'Unichain',
  137: 'Polygon',
  143: 'Monad',
  480: 'World Chain',
  747474: 'Katana',
  988: 'Stable',
  999: 'HyperEVM',
  8453: 'Base',
  10143: 'Monad Testnet',
  42161: 'Arbitrum One',
  4217: 'Tempo',
};

export const getChainName = (chainId: number): string => CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
