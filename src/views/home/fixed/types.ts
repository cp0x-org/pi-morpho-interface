import type { Address, Hex } from 'viem';
import type { AccrualPosition, Market as MidnightSdkMarket, MarketParams as MidnightMarketParams } from '@morpho-org/midnight-sdk';

import type { MidnightBook, MidnightMarket, MidnightMarketState } from 'types/midnight';

export interface FixedLoanInfo {
  token: Address;
  symbol: string;
  decimals?: number;
  logoURI?: string;
  priceUsd?: number;
  walletBalance?: bigint;
  allowanceBundles?: bigint;
}

export interface FixedCollateralInfo {
  /** Index in `marketParams.collateralParams`: the index every Midnight call expects. */
  index: number;
  token: Address;
  symbol: string;
  decimals?: number;
  logoURI?: string;
  lltv: bigint;
  liquidationCursor: bigint;
  oracle: Address;
  /** 1e36-scaled oracle price, read on-chain. */
  oraclePrice?: bigint;
  /** WAD */
  maxLif: bigint;
  positionAmount: bigint;
  walletBalance?: bigint;
  allowanceBundles?: bigint;
  allowanceMidnight?: bigint;
}

/** Everything the fixed-rate market screens need, assembled once by FixedMarketDetailPage. */
export interface FixedMarketContext {
  chainId: number;
  marketId: Hex;
  market: MidnightMarket;
  /** Validated struct: hashes to `marketId` on the morpho-ts Midnight deployment. */
  marketParams: MidnightMarketParams;
  state?: MidnightMarketState;
  sdkMarket?: MidnightSdkMarket;
  book?: MidnightBook;
  loan: FixedLoanInfo;
  collaterals: FixedCollateralInfo[];
  /** On-chain position accrued to now. */
  position?: AccrualPosition;
  isBundlesAuthorized?: boolean;
  midnightBundles?: Address;
  user?: Address;
  nowSec: bigint;
  isMatured: boolean;
  /** WAD settlement fee for the current time to maturity. */
  settlementFee: bigint;
  refresh: () => void;
}
