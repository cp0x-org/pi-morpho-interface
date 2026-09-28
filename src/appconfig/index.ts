export const Mainnet = 1;
export const Arbitrum = 42161;
export const Base = 8453;
export const AnvilTest = 1222;
export const TenderlyTest = 1999999;
import { mainnet, base, polygon, unichain } from 'wagmi/chains';
import { getChainAddress } from '@morpho-org/morpho-ts';

export const appChainConfig = {
  [mainnet.id]: {
    contracts: {
      Morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'
    }
  },
  [base.id]: {
    contracts: {
      Morpho: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'
    }
  },
  [polygon.id]: {
    contracts: {
      Morpho: '0x1bF0c2541F820E775182832f06c0B7Fc27A25f67'
    }
  },
  [unichain.id]: {
    contracts: {
      Morpho: '0x8f5ae9cddb9f68de460c77730b018ae7e04a140a'
    }
  }
} as const;

/**
 * Morpho Blue address for a chain: the morpho-ts registry first, the local config as a fallback.
 * Returns undefined for chains where Morpho Blue is not deployed, so callers can disable reads/writes.
 */
export const getMorphoAddress = (chainId: number | undefined): `0x${string}` | undefined => {
  if (!chainId) return undefined;
  try {
    return getChainAddress(chainId, 'morpho');
  } catch {
    return (appChainConfig as Record<number, { contracts: { Morpho: `0x${string}` } }>)[chainId]?.contracts.Morpho;
  }
};

export const INPUT_DECIMALS = 12;
