import { defineChain } from 'viem';

/**
 * Robinhood Chain (Arbitrum Orbit L2). viem ships no definition yet, so this mirrors @morpho-org/morpho-ts
 * `ChainUtils.CHAIN_METADATA[ChainId.RobinhoodMainnet]` and ethereum-lists/chains `eip155-4663.json`.
 * Morpho Blue: 0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010 (resolved through morpho-ts, see `getMorphoAddress`).
 */
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] }
  },
  blockExplorers: {
    default: { name: 'Robinhood Chain Explorer', url: 'https://robin.etherscan.io' },
    blockscout: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' }
  },
  contracts: {
    // Canonical Multicall3 deployment, verified on-chain; lets wagmi batch `useReadContracts` calls.
    multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11' }
  },
  sourceId: 1
});
