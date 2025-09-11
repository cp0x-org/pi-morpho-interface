export const Mainnet = 1;
export const Arbitrum = 42161;
export const Base = 8453;
export const AnvilTest = 1222;
export const TenderlyTest = 1999999;
import { mainnet, base, polygon, unichain } from 'wagmi/chains';

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

export const INPUT_DECIMALS = 12;
