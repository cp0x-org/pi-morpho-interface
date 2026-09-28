import type { Address, Hex } from 'viem';
import type { AccrualPosition, Market as MidnightSdkMarket, MarketParams as MidnightMarketParams } from '@morpho-org/midnight-sdk';

import type { FixedOpenOrder } from 'hooks/midnight/useMidnightOpenOrders';
import type { MidnightBook, MidnightMarket, MidnightMarketState } from 'types/midnight';
import type { FixedSide } from 'utils/routes';

/** A tab of the order form: a new trade on either side, or closing the current position (repay, redeem, early exit). */
export type FixedActionTab = FixedSide | 'repay' | 'redeem' | 'exit';

/**
 * A rate taken from the order book and handed to the form on that level's taker side.
 * `nonce` rises on every click so picking the same level twice re-applies it after a manual edit.
 */
export interface FixedRatePick {
  side: FixedSide;
  percent: string;
  nonce: number;
}

export interface FixedLoanInfo {
  token: Address;
  symbol: string;
  decimals?: number;
  logoURI?: string;
  priceUsd?: number;
  walletBalance?: bigint;
  allowanceBundles?: bigint;
  /** Spent by a resting buy order when it fills: Midnight pulls it straight from the wallet. */
  allowanceMidnight?: bigint;
  /** What the user's open buy orders on this chain may still pull from the wallet (see `getOrderReservedAssets`). */
  reservedByOrders: bigint;
}

/** The market's only collateral (see `findCollateralIndex`): the loan token is lent, never supplied as collateral. */
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
  collateral: FixedCollateralInfo;
  /** On-chain position accrued to now. */
  position?: AccrualPosition;
  /** The user's open orders that quote this market. They are not part of the position until a taker fills them. */
  openOrders: FixedOpenOrder[];
  isBundlesAuthorized?: boolean;
  midnightBundles?: Address;
  /** Midnight trusts the SetterRatifier for this user: needed once before the first limit order. */
  isSetterRatifierAuthorized?: boolean;
  user?: Address;
  nowSec: bigint;
  isMatured: boolean;
  /** WAD settlement fee for the current time to maturity. */
  settlementFee: bigint;
  /** Last rate clicked in the order book, consumed by the Lend/Borrow form on the matching side. */
  ratePick?: FixedRatePick;
  /** Switches the action panel to the level's taker side and puts that level's rate in its limit field. */
  pickRate: (side: FixedSide, rateWad: bigint) => void;
  /** Opens a tab of the order form and brings it into view (the position card's Borrow / Lend / Repay / Exit buttons). */
  openAction: (tab: FixedActionTab) => void;
  refresh: () => void;
}
