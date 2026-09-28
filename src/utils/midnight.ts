import type { IntlShape } from 'react-intl';
import { isAddressEqual, zeroAddress, type Address, type Hex } from 'viem';
import { MarketParams as MidnightMarketParams, MarketUtils, TakeAmountsLib, TickLib, type MarketInput } from '@morpho-org/midnight-sdk';
import { getChainAddress, MathLib, Time } from '@morpho-org/morpho-ts';

import type { MidnightBook, MidnightMarket, MidnightOpenOrder, MidnightOrderOffer, MidnightUserPosition } from 'types/midnight';

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

export const tryChainAddress = (
  chainId: number,
  label: 'midnight' | 'midnightBundles' | 'setterRatifier' | 'midnightMempool'
): Address | undefined => {
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

/**
 * Index of the market's collateral. A fixed-rate market pairs one collateral with the loan token, which is only lent.
 * Midnight params may also list the loan token itself as a collateral (most listed markets do, at 98% LLTV): that
 * entry is never offered here. Undefined when the market has no single collateral besides it.
 */
export const findCollateralIndex = (loanToken: Address, collaterals: readonly { token: Address }[]): number | undefined => {
  const indices = collaterals.flatMap((collateral, index) => (isAddressEqual(collateral.token, loanToken) ? [] : [index]));
  return indices.length === 1 ? indices[0] : undefined;
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
 *   → rate 807050805769773 (0.0807% for the term) → with 10 days to maturity 2.9457% simple, 2.9873% compounded.
 */
export const priceToRate = (priceWad: bigint): bigint => (priceWad > 0n ? divUp(WAD * WAD, priceWad) - WAD : 0n);

export const timeToMaturity = (maturity: number | bigint, nowSec: bigint = nowInSeconds()): bigint => {
  const remaining = BigInt(maturity) - nowSec;
  return remaining > 0n ? remaining : 0n;
};

export const isMatured = (maturity: number | bigint, nowSec: bigint = nowInSeconds()) => nowSec >= BigInt(maturity);

/**
 * Annualized rate (WAD) of a unit price, compounded over the remaining term: (1 + rate)^(year / ttm) − 1.
 *
 * This is the convention markets.morpho.org displays and the one the Midnight API itself returns in
 * `effective_rate_wad`: a 0.9992553 price 9.12 days before maturity is 3.03% here and 2.98% simply annualized.
 * `TickLib.tickToApr` in the SDK is the simple variant and is deliberately not used for display.
 *
 * The exponent is transcendental, so it is evaluated in double precision and snapped back to WAD. The error stays
 * far below `PRICE_ROUNDING_STEP` (1e11 wei), the granularity of every price the order book can quote.
 * Undefined once matured, and when compounding overflows a double — which real books only reach in the last
 * minutes before maturity, where a per-term rate annualizes to an astronomical number.
 */
export const priceToApy = (priceWad: bigint, maturity: number | bigint, nowSec: bigint = nowInSeconds()): bigint | undefined => {
  const ttm = timeToMaturity(maturity, nowSec);
  if (ttm === 0n || priceWad === 0n) return undefined;
  const rate = priceToRate(priceWad);
  const periodsPerYear = Number(SECONDS_PER_YEAR) / Number(ttm);
  // Guard the WAD-scaled value, not the ratio: a rate that is finite on its own still overflows once scaled.
  const apyWad = Math.expm1(Math.log1p(Number(rate) / 1e18) * periodsPerYear) * 1e18;
  if (!Number.isFinite(apyWad)) return undefined;
  return BigInt(Math.round(apyWad));
};

/**
 * Worst acceptable average unit price for a rate limit: WAD / (1 + (1 + apy)^(ttm / year) − 1), rounded in the
 * user's favour so a rounding error can never accept a worse rate than the one entered.
 * - lend (minimum APY): the highest price that still earns at least `apyWad`;
 * - borrow (maximum APY): the lowest price that costs at most `apyWad`.
 */
export const apyToPrice = (
  apyWad: bigint,
  maturity: number | bigint,
  side: 'lend' | 'borrow',
  nowSec: bigint = nowInSeconds()
): bigint | undefined => {
  const ttm = timeToMaturity(maturity, nowSec);
  if (ttm === 0n) return undefined;
  const apy = apyWad > 0n ? apyWad : 0n;
  const years = Number(ttm) / Number(SECONDS_PER_YEAR);
  const rateWad = Math.expm1(Math.log1p(Number(apy) / 1e18) * years) * 1e18;
  if (!Number.isFinite(rateWad) || rateWad < 0) return undefined;
  const denominator = WAD + BigInt(Math.round(rateWad));
  const price = side === 'lend' ? (WAD * WAD) / denominator : divUp(WAD * WAD, denominator);
  // A rate so large that the unit price rounds to zero is not a usable guard, and `TakeAmountsLib.toUnits`
  // throws on a zero price. Callers already treat `undefined` as "no quote yet".
  return price > 0n ? price : undefined;
};

/**
 * Credit still owed by borrowers: total credit units minus the loan tokens already waiting in the contract.
 * This is the "Outstanding loans" figure on markets.morpho.org; `totalUnits` on its own double counts repaid
 * loans that no lender has redeemed yet. `withdrawable` is on-chain only, so it can legitimately be unknown.
 */
export const outstandingLoans = (totalUnits?: bigint, withdrawable?: bigint) => {
  if (totalUnits == null) return undefined;
  const lent = totalUnits - (withdrawable ?? 0n);
  return lent > 0n ? lent : 0n;
};

/**
 * Price a taker settles at on a book level (same as TakeAmountsLib.prices):
 * lenders pay the ask plus the settlement fee, borrowers receive the bid minus it.
 */
export const takerPrice = (side: 'lend' | 'borrow', levelPrice: bigint, settlementFeeWad: bigint = 0n) => {
  if (side === 'lend') return levelPrice + settlementFeeWad;
  return levelPrice > settlementFeeWad ? levelPrice - settlementFeeWad : 0n;
};

/** Default distance between the quoted rate and the user's rate limit: 0.5 percentage points. */
export const DEFAULT_RATE_BUFFER_WAD = 5n * 10n ** 15n;

/**
 * How far a rate limit may sit on the wrong side of the quote before it stops protecting anything.
 * Relative rather than absolute: a market three days from maturity and one a year out have nothing in common
 * on an absolute scale, but "twice the rate you were just quoted" reads the same on both.
 */
export const RATE_LIMIT_FACTOR = 2n;
/** Floor for the relative bound, so a near-zero quote still leaves a usable range instead of pinning the field. */
export const RATE_LIMIT_HEADROOM_WAD = 2n * 10n ** 16n;

export interface RateLimitGuard {
  /** Widest limit that still bounds the fill: a maximum when a higher rate is worse, a minimum when a lower one is. */
  bound: bigint;
  /** The entered limit is past `bound`, so it no longer constrains the price in any useful way. */
  exceeded: boolean;
}

/**
 * Sanity bound for a market order's rate limit, measured against the unguarded quote for the same size.
 *
 * A borrower's maximum is the dangerous direction: set it high enough and the guard stops capping what the
 * position can end up owing. A lender's minimum is the mirror image and costs yield rather than principal.
 * The bound can never reject a fill that would otherwise execute — it always sits on the permissive side of
 * the quote the order is expected to get.
 *
 * Undefined when there is no usable quote yet (no amount entered, no liquidity, or a non-positive rate).
 */
export const rateLimitGuard = (quoteApy: bigint | undefined, limitApy: bigint | undefined, side: 'lend' | 'borrow') => {
  if (quoteApy == null || limitApy == null || quoteApy <= 0n) return undefined;

  if (side === 'borrow') {
    const scaled = quoteApy * RATE_LIMIT_FACTOR;
    const headroom = quoteApy + RATE_LIMIT_HEADROOM_WAD;
    const bound = scaled > headroom ? scaled : headroom;
    return { bound, exceeded: limitApy > bound } satisfies RateLimitGuard;
  }

  const scaled = quoteApy / RATE_LIMIT_FACTOR;
  const headroom = quoteApy > RATE_LIMIT_HEADROOM_WAD ? quoteApy - RATE_LIMIT_HEADROOM_WAD : 0n;
  const bound = scaled < headroom ? scaled : headroom;
  return { bound, exceeded: limitApy < bound } satisfies RateLimitGuard;
};

/** Percent text ("4.25" or "4,25") → WAD fraction, without floating point. Undefined for empty or invalid input. */
export const percentInputToWad = (value: string): bigint | undefined => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized || normalized === '.' || !/^\d*\.?\d*$/.test(normalized)) return undefined;
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole || '0') * 10n ** 16n + BigInt(`${fraction}${'0'.repeat(16)}`.slice(0, 16));
};

/** WAD fraction → percent text for an input field. Display only. */
export const wadToPercentInput = (value: bigint, fractionDigits = 2) => (Number(value) / 1e16).toFixed(fractionDigits);

/** Percent text for a WAD rate, rounded in one direction so the result never crosses the true value. */
const formatPercentRounded = (rateWad: bigint, rounding: 'down' | 'up', fractionDigits: number) => {
  const scale = 10 ** fractionDigits;
  const percent = Number(rateWad) / 1e16;
  const rounded = rounding === 'down' ? Math.floor(percent * scale) / scale : Math.ceil(percent * scale) / scale;
  return Math.max(0, rounded).toFixed(fractionDigits);
};

/**
 * Rate text for a limit field taken from an order book level, rounded so the limit is never stricter than the
 * level it came from: a lender's minimum rounds down, a borrower's maximum rounds up. Rounding to nearest could
 * land a hair past the level and make the guarded quote come back as "no liquidity within your rate limit".
 */
export const rateToLimitInput = (rateWad: bigint, side: 'lend' | 'borrow', fractionDigits = 2) =>
  formatPercentRounded(rateWad, side === 'lend' ? 'down' : 'up', fractionDigits);

/**
 * A `rateLimitGuard` bound as percent text the user can actually type. Rounds the opposite way to
 * `rateToLimitInput`: the bound is a floor for a lender and a ceiling for a borrower, so the suggested value has
 * to land on the accepted side of the check rather than a hundredth of a point outside it.
 */
export const formatRateBound = (bound: bigint, side: 'lend' | 'borrow', fractionDigits = 2) =>
  `${formatPercentRounded(bound, side === 'lend' ? 'up' : 'down', fractionDigits)}%`;

/** Loan assets for `units` at a WAD unit price. */
export const unitsToAssets = (units: bigint, priceWad: bigint, rounding: 'Up' | 'Down') =>
  rounding === 'Up' ? divUp(units * priceWad, WAD) : (units * priceWad) / WAD;

/** Units for `assets` loan tokens at a WAD unit price. */
export const assetsToUnits = (assets: bigint, priceWad: bigint, rounding: 'Up' | 'Down') =>
  TakeAmountsLib.toUnits({ assets, price: priceWad, rounding });

/** Lend: minimum credit units accepted for `assets` at the worst average price (rounded down). */
export const minUnitsForLend = (assets: bigint, worstPrice: bigint) =>
  TakeAmountsLib.toUnits({ assets, price: worstPrice, rounding: 'Down' });

/** Borrow: maximum debt units accepted for `loanAssets` at the worst average price (rounded up). */
export const maxUnitsForBorrow = (loanAssets: bigint, worstPrice: bigint) =>
  TakeAmountsLib.toUnits({ assets: loanAssets, price: worstPrice, rounding: 'Up' });

/**
 * Side of an open position, which picks the order form's tabs as on markets.morpho.org: no position → Lend | Borrow,
 * a loan → Borrow | Early exit, credit → Lend | Early exit. Collateral alone is no side.
 */
export const getPositionSide = (position?: { debt: bigint; faceValue: bigint }): 'lend' | 'borrow' | null =>
  !position ? null : position.debt > 0n ? 'borrow' : position.faceValue > 0n ? 'lend' : null;

/* ---------- limit orders ---------- */

/** An offer must stay takeable at least this long, or the mempool rejects it (markets.morpho.org: 300 s). */
export const MIN_OFFER_LIFETIME_SECONDS = 300n;

/**
 * Tick for a limit price, on the maker's side of the grid: a buyer never pays more than the price entered, a seller never
 * receives less. Undefined for a price outside (0, 1].
 */
export const limitPriceToTick = (priceWad: bigint, buy: boolean, tickSpacing: number): number | undefined => {
  if (priceWad <= 0n || priceWad > WAD || tickSpacing <= 0) return undefined;
  const spacing = BigInt(tickSpacing);
  try {
    // Lowest aligned tick priced at or above the price.
    let tick = TickLib.priceToTick(priceWad, spacing);
    if (buy && TickLib.tickToPrice(tick) > priceWad) tick -= spacing;
    return tick >= 0n ? Number(tick) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Where markets.morpho.org starts an exit order's price: at the top of the side the order joins (a buyer's best bid, a
 * seller's best ask), else at the other side's top.
 */
export const getExitOfferDefaultTick = (book: MidnightBook | undefined, buy: boolean) => {
  const level = buy ? (book?.bids[0] ?? book?.asks[0]) : (book?.asks[0] ?? book?.bids[0]);
  return level?.tick;
};

/** A resting order priced through the other side of the book: a market order would fill the same size at a better price. */
export const doesTickCrossBook = (tick: number, buy: boolean, book?: MidnightBook) => {
  const price = TickLib.tickToPrice(tick);
  const opposite = buy ? book?.asks[0] : book?.bids[0];
  if (!opposite) return false;
  return buy ? price >= opposite.price : price <= opposite.price;
};

/* ---------- open orders ---------- */

/**
 * Rate an order holds in its current window. A fixed tick is a fixed price, so the annualized rate drifts up as maturity
 * nears; markets.morpho.org sets each window's tick so the maker's limit holds for the whole window. A borrower pays the
 * most at the window's end and a lender earns the least at its start, so that is where the order's rate is read.
 * Self-check: tick 4324 (price 0.9914066) with the window ending 63.5 days before maturity → 5.08%.
 */
export const getOrderOfferApy = (side: MidnightOpenOrder['side'], offer: MidnightOrderOffer) =>
  priceToApy(TickLib.tickToPrice(offer.tick), offer.maturity, BigInt(side === 'borrow' ? offer.expiry : offer.start));

/** Share of the order already filled (WAD), from the group's on-chain `consumed` amount. */
export const getOrderFilledShare = (order: Pick<MidnightOpenOrder, 'cap'>, consumed: bigint) =>
  order.cap > 0n ? ((consumed < order.cap ? consumed : order.cap) * WAD) / order.cap : 0n;

/**
 * What an order does to the maker's position, named like markets.morpho.org: a reduce-only buy pays a loan back early
 * (`borrowExit`), a reduce-only sell exits a loan given (`lendExit`).
 */
export type OrderKind = 'lend' | 'borrow' | 'lendExit' | 'borrowExit';

export const getOrderKind = (order: Pick<MidnightOpenOrder, 'side' | 'reduceOnly'>): OrderKind =>
  order.reduceOnly ? (order.side === 'lend' ? 'borrowExit' : 'lendExit') : order.side;

/** Units of a `positionSide` position already offered in open exit orders in `marketId`. */
export const getOpenExitUnits = (orders: MidnightOpenOrder[], marketId: Hex, positionSide: 'lend' | 'borrow') =>
  orders
    .filter((order) => getOrderKind(order) === `${positionSide}Exit`)
    .flatMap((order) => order.offers)
    .filter((offer) => offer.marketId.toLowerCase() === marketId.toLowerCase())
    .reduce((total, offer) => total + offer.units, 0n);

/** True when an entry order on `side` quotes `marketId`: an exit order on the same side would trade against it. */
export const hasOpenEntryOrder = (orders: MidnightOpenOrder[], marketId: Hex, side: 'lend' | 'borrow') =>
  orders.some(
    (order) => getOrderKind(order) === side && order.offers.some((offer) => offer.marketId.toLowerCase() === marketId.toLowerCase())
  );

/**
 * Loan tokens the user's open buy orders on `chainId` may still pull from the wallet as takers fill them. Orders funded
 * by a callback are left out: their funds sit elsewhere until the fill.
 */
export const getOrderReservedAssets = (orders: (MidnightOpenOrder & { consumed?: bigint })[], chainId: number, loanToken: Address) =>
  orders
    .filter(
      (order) =>
        order.side === 'lend' &&
        order.chainId === chainId &&
        isAddressEqual(order.loanToken, loanToken) &&
        isAddressEqual(order.callback, zeroAddress)
    )
    .reduce((total, order) => {
      const consumed = order.consumed ?? 0n;
      const left = order.cap > consumed ? order.cap - consumed : 0n;
      if (!order.capInUnits) return total + left;
      const tick = order.offers[0]?.tick;
      return tick == null ? total : total + unitsToAssets(left, TickLib.tickToPrice(tick), 'Up');
    }, 0n);

/** Debt a borrow order can still add in `marketId` if takers fill what it shows there right now (units). */
export const getOpenBorrowUnits = (orders: MidnightOpenOrder[], marketId: Hex) =>
  orders
    .filter((order) => getOrderKind(order) === 'borrow')
    .flatMap((order) => order.offers)
    .filter((offer) => offer.marketId.toLowerCase() === marketId.toLowerCase())
    .reduce((total, offer) => total + offer.units, 0n);

/**
 * Collateral parked for an open borrow order is not a position yet: nothing is lent or owed until a taker fills the
 * order. True for a position that only holds collateral, in a market one of the user's borrow orders quotes.
 */
export const isOrderCollateral = (
  position: Pick<MidnightUserPosition, 'chainId' | 'marketId' | 'credit' | 'debt'>,
  orders: MidnightOpenOrder[]
) =>
  position.credit === 0n &&
  position.debt === 0n &&
  orders.some(
    (order) =>
      getOrderKind(order) === 'borrow' &&
      order.chainId === position.chainId &&
      order.offers.some((offer) => offer.marketId.toLowerCase() === position.marketId.toLowerCase())
  );

/** Collateral parked in a market for the user's borrow orders (see `isOrderCollateral`), in collateral base units. */
export const getOrderCollateralAmount = (
  positions: MidnightUserPosition[],
  orders: MidnightOpenOrder[],
  chainId: number,
  marketId: string
) => {
  const position = positions.find((item) => item.chainId === chainId && item.marketId.toLowerCase() === marketId.toLowerCase());
  if (!position || !isOrderCollateral(position, orders)) return undefined;
  return position.collaterals.find((collateral) => collateral.amount > 0n && !isAddressEqual(collateral.token, position.loanToken))?.amount;
};

/* ---------- health ---------- */

export interface CollateralHolding {
  amount: bigint;
  /** Oracle price scaled by 1e36 (loan base units per collateral base unit). */
  oraclePrice?: bigint;
  /** WAD */
  lltv: bigint;
}

/** Collateral value in loan-token base units: amount × oraclePrice / 1e36. */
export const computeCollateralValue = (holding: CollateralHolding) => (holding.amount * (holding.oraclePrice ?? 0n)) / ORACLE_PRICE_SCALE;

/** Borrowing capacity in loan-token base units: amount × oraclePrice / 1e36 × lltv / 1e18. Healthy while debt ≤ maxDebt. */
export const computeMaxDebt = (holding: CollateralHolding) => (computeCollateralValue(holding) * holding.lltv) / WAD;

/** Variable-rate forms keep 6% of headroom below the liquidation limit (BorrowTab, WithdrawCollateralTab). */
export const SAFETY_FACTOR_BPS = 9_400n;

/**
 * Fixed-rate forms stop 5 LTV points below the liquidation limit, like markets.morpho.org (`BORROW_SAFETY_BUFFER_WAD`):
 * LLTV 86% → 81%, 77% → 72%, 98% → 93%.
 */
export const BORROW_SAFETY_BUFFER_WAD = WAD / 20n;

/** Highest LTV a fixed-rate form lets a position reach (WAD). */
export const getSafeLtv = (lltv: bigint) => (lltv > BORROW_SAFETY_BUFFER_WAD ? lltv - BORROW_SAFETY_BUFFER_WAD : 0n);

/** Debt the collateral can back at the safe LTV, in loan-token base units. */
export const computeSafeMaxDebt = (holding: CollateralHolding) => (computeCollateralValue(holding) * getSafeLtv(holding.lltv)) / WAD;

/**
 * Largest amount of collateral that can leave the position while `debt` stays within the safe LTV. Rounded like
 * markets.morpho.org's `computeMaxWithdrawCollateral`, so both show the same figure.
 */
export const maxWithdrawableCollateral = (holding: CollateralHolding, debt: bigint): bigint => {
  if (debt === 0n) return holding.amount;
  const safeLtv = getSafeLtv(holding.lltv);
  if (!holding.oraclePrice || safeLtv === 0n) return 0n;

  const neededValue = divUp(debt * WAD, safeLtv);
  const neededAmount = divUp(neededValue * ORACLE_PRICE_SCALE, holding.oraclePrice);
  return holding.amount > neededAmount ? holding.amount - neededAmount : 0n;
};

/** Debt / collateral value (WAD). Undefined when there is debt but no priced collateral. */
export const computeLtv = (debt: bigint, holding: CollateralHolding): bigint | undefined => {
  const value = computeCollateralValue(holding);
  if (value === 0n) return debt === 0n ? 0n : undefined;
  return divUp(debt * WAD, value);
};

/** Maximum liquidation incentive factor (WAD): LLTV 86% with cursor 30% → 1.0438, i.e. a 4.38% max penalty. */
export const getMaxLif = (lltv: bigint, liquidationCursor: bigint) => MarketUtils.getLiquidationIncentiveFactor(lltv, liquidationCursor);

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

/** URL slug ignored by the router: loan-collateral-yyyy-mm-dd, e.g. usdc-cbbtc-2026-09-25. */
export const buildFixedSlug = (loanSymbol?: string, collateralSymbol?: string, maturity?: number) =>
  [loanSymbol, collateralSymbol, maturity ? formatMaturityIsoDate(maturity) : undefined]
    .filter((part): part is string => !!part)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('-');
