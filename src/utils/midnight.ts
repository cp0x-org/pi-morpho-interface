import type { IntlShape } from 'react-intl';
import { isAddressEqual, type Address, type Hex } from 'viem';
import { MarketParams as MidnightMarketParams, MarketUtils, TakeAmountsLib, type MarketInput } from '@morpho-org/midnight-sdk';
import { getChainAddress, MathLib, Time } from '@morpho-org/morpho-ts';

import type { MidnightMarket } from 'types/midnight';

// ==============================|| MORPHO MIDNIGHT HELPERS ||============================== //
//
// Every amount, price and rate is a bigint: WAD (1e18) for unit prices, rates and LLTV, 1e36 for oracle prices.
// `Number` only appears in display helpers.

export const WAD = MathLib.WAD;
export const ORACLE_PRICE_SCALE = 10n ** 36n;
/** 365 days: the year used by TickLib.tickToApr. */
export const SECONDS_PER_YEAR = Time.s.from.y(1n);
/** Chains with a Midnight deployment registered in morpho-ts. */
export const MIDNIGHT_CHAIN_IDS = [1, 8453];
export const TX_DEADLINE_SECONDS = 20n * 60n;
/** Borrowers are warned this long before maturity: unpaid debt is liquidatable right after it. */
export const MATURITY_WARNING_SECONDS = 72n * 60n * 60n;

const divUp = (numerator: bigint, denominator: bigint) => (numerator + denominator - 1n) / denominator;

export const nowInSeconds = () => BigInt(Math.floor(Date.now() / 1000));

export const getDeadline = (now: bigint = nowInSeconds()) => now + TX_DEADLINE_SECONDS;

/* ---------- addresses & market validation ---------- */

const tryChainAddress = (chainId: number, label: 'midnight' | 'midnightBundles'): Address | undefined => {
  try {
    return getChainAddress(chainId, label);
  } catch {
    return undefined;
  }
};

export const getMidnightAddress = (chainId: number) => tryChainAddress(chainId, 'midnight');

export const getMidnightBundlesAddress = (chainId: number) => tryChainAddress(chainId, 'midnightBundles');

export const isExpectedMidnightAddress = (chainId: number, midnight: string) => {
  const expected = getMidnightAddress(chainId);
  return !!expected && isAddressEqual(expected, midnight as Address);
};

export const assertMarketId = (market: MarketInput, marketId: string): Hex => {
  const computedId = MarketUtils.toId(market);
  if (computedId.toLowerCase() !== marketId.toLowerCase()) {
    throw new Error(`Midnight market id mismatch: expected ${marketId}, computed ${computedId}`);
  }
  return computedId;
};

/**
 * ABI market struct from API data. The Midnight address always comes from morpho-ts (never from the API),
 * and the struct must hash back to the market id, so a tampered response cannot redirect a transaction.
 */
export const toMarketParams = (market: MidnightMarket): MidnightMarketParams => {
  const midnight = getMidnightAddress(market.chainId);
  if (!midnight) throw new Error(`Midnight is not deployed on chain ${market.chainId}`);

  const params = new MidnightMarketParams({
    chainId: market.chainId,
    midnight,
    loanToken: market.loanToken,
    collateralParams: market.collaterals,
    maturity: market.maturity,
    rcfThreshold: market.rcfThreshold,
    enterGate: market.enterGate,
    liquidatorGate: market.liquidatorGate
  });
  assertMarketId(params, market.marketId);
  return params;
};

/** Called right before every write: the struct targets `chainId`, the morpho-ts Midnight deployment and `marketId`. */
export const validateMarketForWrite = (params: MidnightMarketParams, marketId: string, chainId: number) => {
  if (params.chainId !== BigInt(chainId)) {
    throw new Error(`Midnight market targets chain ${params.chainId}, expected ${chainId}`);
  }
  if (!isExpectedMidnightAddress(chainId, params.midnight)) {
    throw new Error(`Midnight market targets an unknown deployment ${params.midnight}`);
  }
  assertMarketId(params, marketId);
};

/* ---------- prices & rates ---------- */

/**
 * Rate over the remaining term for a WAD unit price: 1/P − 1 (WAD).
 *
 * Self-check against TickLib: tick 4800 → price 0.9991936 (999193600000000000)
 *   → rate 807050805769773 (0.0807% for the term) → with 10 days to maturity APR 29457354410596715 (2.9457%).
 */
export const priceToRate = (priceWad: bigint): bigint => (priceWad > 0n ? divUp(WAD * WAD, priceWad) - WAD : 0n);

export const timeToMaturity = (maturity: number | bigint, nowSec: bigint = nowInSeconds()): bigint => {
  const remaining = BigInt(maturity) - nowSec;
  return remaining > 0n ? remaining : 0n;
};

export const isMatured = (maturity: number | bigint, nowSec: bigint = nowInSeconds()) => nowSec >= BigInt(maturity);

/** Simple annualized rate (WAD) of a unit price: rate × year / timeToMaturity. Undefined once matured. */
export const priceToApr = (priceWad: bigint, maturity: number | bigint, nowSec: bigint = nowInSeconds()): bigint | undefined => {
  const ttm = timeToMaturity(maturity, nowSec);
  if (ttm === 0n || priceWad === 0n) return undefined;
  const rate = priceToRate(priceWad);
  return rate >= 0n ? divUp(rate * SECONDS_PER_YEAR, ttm) : -((-rate * SECONDS_PER_YEAR) / ttm);
};

/**
 * Worst acceptable average unit price for a rate limit: WAD / (1 + apr × ttm / year), rounded in the user's favour.
 * - lend (minimum APR): the highest price that still earns at least `aprWad`;
 * - borrow (maximum APR): the lowest price that costs at most `aprWad`.
 */
export const aprToPrice = (
  aprWad: bigint,
  maturity: number | bigint,
  side: 'lend' | 'borrow',
  nowSec: bigint = nowInSeconds()
): bigint | undefined => {
  const ttm = timeToMaturity(maturity, nowSec);
  if (ttm === 0n) return undefined;
  const apr = aprWad > 0n ? aprWad : 0n;
  if (side === 'lend') return (WAD * WAD) / (WAD + divUp(apr * ttm, SECONDS_PER_YEAR));
  return divUp(WAD * WAD, WAD + (apr * ttm) / SECONDS_PER_YEAR);
};

/**
 * Price a taker settles at on a book level (same as TakeAmountsLib.prices):
 * lenders pay the ask plus the settlement fee, borrowers receive the bid minus it.
 */
export const takerPrice = (side: 'lend' | 'borrow', levelPrice: bigint, settlementFeeWad: bigint = 0n) => {
  if (side === 'lend') return levelPrice + settlementFeeWad;
  return levelPrice > settlementFeeWad ? levelPrice - settlementFeeWad : 0n;
};

/** Lend: minimum credit units accepted for `assets` at the worst average price (rounded down). */
export const minUnitsForLend = (assets: bigint, worstPrice: bigint) =>
  TakeAmountsLib.toUnits({ assets, price: worstPrice, rounding: 'Down' });

/** Borrow: maximum debt units accepted for `loanAssets` at the worst average price (rounded up). */
export const maxUnitsForBorrow = (loanAssets: bigint, worstPrice: bigint) =>
  TakeAmountsLib.toUnits({ assets: loanAssets, price: worstPrice, rounding: 'Up' });

/* ---------- health ---------- */

export interface CollateralHolding {
  amount: bigint;
  /** Oracle price scaled by 1e36 (loan base units per collateral base unit). */
  oraclePrice?: bigint;
  /** WAD */
  lltv: bigint;
}

/** Collateral value in loan-token base units: Σ amount × oraclePrice / 1e36. */
export const computeCollateralValue = (holdings: CollateralHolding[]) =>
  holdings.reduce((total, holding) => total + (holding.amount * (holding.oraclePrice ?? 0n)) / ORACLE_PRICE_SCALE, 0n);

/** Borrowing capacity in loan-token base units: Σ amount × oraclePrice / 1e36 × lltv / 1e18. Healthy while debt ≤ maxDebt. */
export const computeMaxDebt = (holdings: CollateralHolding[]) =>
  holdings.reduce(
    (total, holding) => total + (((holding.amount * (holding.oraclePrice ?? 0n)) / ORACLE_PRICE_SCALE) * holding.lltv) / WAD,
    0n
  );

/** Debt / collateral value (WAD). Undefined when there is debt but no priced collateral. */
export const computeLtv = (debt: bigint, holdings: CollateralHolding[]): bigint | undefined => {
  const value = computeCollateralValue(holdings);
  if (value === 0n) return debt === 0n ? 0n : undefined;
  return divUp(debt * WAD, value);
};

/** Maximum liquidation incentive factor (WAD): LLTV 86% with cursor 30% → 1.0438, i.e. a 4.38% max penalty. */
export const getMaxLif = (lltv: bigint, liquidationCursor: bigint) => MarketUtils.getLiquidationIncentiveFactor(lltv, liquidationCursor);

/** Loan-token base units paid for one whole collateral token at an oracle price. */
export const collateralPriceInLoan = (oraclePrice: bigint, collateralDecimals: number) =>
  (oraclePrice * 10n ** BigInt(collateralDecimals)) / ORACLE_PRICE_SCALE;

/* ---------- display ---------- */

/** WAD fraction → "2.95%". Display only. */
export const formatWadPercent = (value: bigint | undefined, fractionDigits = 2) =>
  value == null ? undefined : `${(Number(value) / 1e16).toFixed(fractionDigits)}%`;

export const formatMaturityIsoDate = (maturity: number) => new Date(maturity * 1000).toISOString().slice(0, 10);

/** Maturity date (UTC) and a relative label: "in 10 days" or "Matured". */
export const formatMaturity = (intl: IntlShape, maturity: number, nowSec: bigint = nowInSeconds()) => {
  const date = intl.formatDate(maturity * 1000, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  });
  const remaining = Number(timeToMaturity(maturity, nowSec));
  if (remaining === 0) {
    return { date, relative: intl.formatMessage({ id: 'fixed.maturity.matured' }), isMatured: true };
  }
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor(remaining / 3_600);
  const relative =
    days >= 1
      ? intl.formatMessage({ id: 'fixed.maturity.inDays' }, { days })
      : hours >= 1
        ? intl.formatMessage({ id: 'fixed.maturity.inHours' }, { hours })
        : intl.formatMessage({ id: 'fixed.maturity.inMinutes' }, { minutes: Math.max(1, Math.floor(remaining / 60)) });
  return { date, relative, isMatured: false };
};

/** URL slug ignored by the router: loan-collaterals-yyyy-mm-dd, e.g. usdc-cbbtc-2026-09-25. */
export const buildFixedSlug = (loanSymbol?: string, collateralSymbols: (string | undefined)[] = [], maturity?: number) =>
  [loanSymbol, ...collateralSymbols, maturity ? formatMaturityIsoDate(maturity) : undefined]
    .filter((part): part is string => !!part)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('-');
