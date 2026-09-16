import { erc20Abi, maxUint256, zeroAddress, type Address, type Hex } from 'viem';
import {
  Group,
  MarketUtils,
  MAX_OFFER_CAP,
  midnightAbi,
  midnightBundlesAbi,
  MidnightMempoolValidationError,
  Offer,
  Payload,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
  type MarketParams as MidnightMarketParams
} from '@morpho-org/midnight-sdk';
import type { MidnightApiTake } from '@morpho-org/midnight-sdk/api';

import { ApiUrls } from '@/api/constants';
import type { RawTxRequest } from 'hooks/midnight/useTxSteps';
import { getMidnightAddress, getMidnightBundlesAddress, tryChainAddress, validateMarketForWrite } from './midnight';

// ==============================|| MIDNIGHT WRITE REQUESTS ||============================== //
//
// Contract calls for fixed-rate markets, mirroring @morpho-org/morpho-sdk 5.11.0 (actions/midnight/*); argument order
// follows midnightBundlesAbi / midnightAbi. Every market call re-validates the struct against the market id, the chain
// and the morpho-ts Midnight deployment. The bundles' built-in referral fee stays disabled (0%, zero recipient).

const NO_PERMIT = { kind: 0, data: '0x' } as const;
const NO_REFERRAL_FEE = 0n;

interface MarketWrite {
  chainId: number;
  marketId: Hex;
  marketParams: MidnightMarketParams;
  user: Address;
}

export interface CollateralAmount {
  collateralIndex: number;
  assets: bigint;
}

const requireMidnightBundles = (chainId: number) => {
  const bundles = getMidnightBundlesAddress(chainId);
  if (!bundles) throw new Error(`MidnightBundles is not deployed on chain ${chainId}`);
  return bundles;
};

/** Takeable offers must sit on the expected side (maker buys on bids) and belong to this market. */
const toOfferFills = (takeableOffers: readonly MidnightApiTake[], marketId: Hex, expectedBuy: boolean) => {
  if (takeableOffers.length === 0) throw new Error('No takeable offers for this order');
  return takeableOffers.map(({ offer, ratifierData, units }) => {
    if (offer.buy !== expectedBuy) throw new Error('Takeable offer is on the wrong side of the book');
    if (MarketUtils.toId(offer.market).toLowerCase() !== marketId.toLowerCase())
      throw new Error('Takeable offer belongs to another market');
    return { offer, ratifierData, units };
  });
};

const toCollateralWithdrawals = (withdrawals: CollateralAmount[]) =>
  withdrawals
    .filter((withdrawal) => withdrawal.assets > 0n)
    .map(({ collateralIndex, assets }) => ({ collateralIndex: BigInt(collateralIndex), assets }));

export const approveRequest = (chainId: number, token: Address, spender: Address, amount: bigint) =>
  ({ chainId, address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount] }) as const;

/** Lets MidnightBundles act on the user's Midnight position (required by every bundle call). */
export const authorizeBundlesRequest = (chainId: number, user: Address) => {
  const midnight = getMidnightAddress(chainId);
  if (!midnight) throw new Error(`Midnight is not deployed on chain ${chainId}`);
  return {
    chainId,
    address: midnight,
    abi: midnightAbi,
    functionName: 'setIsAuthorized',
    args: [requireMidnightBundles(chainId), true, user]
  } as const;
};

/**
 * Cancel an open order: mark its whole group consumed so no offer of the series can be taken any more. This is the call
 * markets.morpho.org makes (`setConsumed(group, MAX_OFFER_CAP, maker)`); funds already in a position stay where they are.
 */
export const cancelOrderRequest = (chainId: number, group: Hex, maker: Address) => {
  const midnight = getMidnightAddress(chainId);
  if (!midnight) throw new Error(`Midnight is not deployed on chain ${chainId}`);
  return { chainId, address: midnight, abi: midnightAbi, functionName: 'setConsumed', args: [group, MAX_OFFER_CAP, maker] } as const;
};

/** Lend: buy units from asks for exactly `assets` loan tokens, receiving at least `minUnits`. */
export const lendRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  assets,
  minUnits,
  takeableOffers,
  deadline
}: MarketWrite & { assets: bigint; minUnits: bigint; takeableOffers: readonly MidnightApiTake[]; deadline: bigint }) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  return {
    chainId,
    address: requireMidnightBundles(chainId),
    abi: midnightBundlesAbi,
    functionName: 'midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral',
    args: [
      assets,
      minUnits,
      user,
      false,
      NO_PERMIT,
      toOfferFills(takeableOffers, marketId, false),
      [],
      zeroAddress,
      NO_REFERRAL_FEE,
      zeroAddress,
      maxUint256,
      deadline
    ]
  } as const;
};

/** Borrow: optionally supply collateral, then sell units into bids for exactly `loanAssets`, owing at most `maxUnits`. */
export const borrowRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  loanAssets,
  maxUnits,
  collateralIndex,
  collateralAssets,
  takeableOffers,
  deadline
}: MarketWrite & {
  loanAssets: bigint;
  maxUnits: bigint;
  collateralIndex: number;
  collateralAssets: bigint;
  takeableOffers: readonly MidnightApiTake[];
  deadline: bigint;
}) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  if (collateralAssets > 0n) MarketUtils.getCollateralByIndex(marketParams, collateralIndex);
  const collateralSupplies =
    collateralAssets > 0n ? [{ collateralIndex: BigInt(collateralIndex), assets: collateralAssets, permit: NO_PERMIT }] : [];
  return {
    chainId,
    address: requireMidnightBundles(chainId),
    abi: midnightBundlesAbi,
    functionName: 'midnightBundlesV1SupplyCollateralAndSellWithAssetsTarget',
    args: [
      loanAssets,
      maxUnits,
      user,
      false,
      user,
      collateralSupplies,
      toOfferFills(takeableOffers, marketId, true),
      NO_REFERRAL_FEE,
      zeroAddress,
      maxUint256,
      deadline
    ]
  } as const;
};

/** Repay debt at par (1 loan token = 1 unit) and optionally withdraw collateral in the same bundle. */
export const repayRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  repayAssets,
  withdrawals,
  deadline
}: MarketWrite & { repayAssets: bigint; withdrawals: CollateralAmount[]; deadline: bigint }) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  return {
    chainId,
    address: requireMidnightBundles(chainId),
    abi: midnightBundlesAbi,
    functionName: 'midnightBundlesV1RepayAndWithdrawCollateral',
    args: [marketParams, repayAssets, user, NO_PERMIT, toCollateralWithdrawals(withdrawals), user, NO_REFERRAL_FEE, zeroAddress, deadline]
  } as const;
};

/** Direct supply to Midnight (the collateral token must be approved to Midnight). */
export const supplyCollateralRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  collateralIndex,
  assets
}: MarketWrite & { collateralIndex: number; assets: bigint }) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  MarketUtils.getCollateralByIndex(marketParams, collateralIndex);
  return {
    chainId,
    address: marketParams.midnight,
    abi: midnightAbi,
    functionName: 'supplyCollateral',
    args: [marketParams, BigInt(collateralIndex), assets, user]
  } as const;
};

/** Direct withdrawal from Midnight by the position owner (no bundle authorization involved). */
export const withdrawCollateralRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  collateralIndex,
  assets
}: MarketWrite & { collateralIndex: number; assets: bigint }) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  MarketUtils.getCollateralByIndex(marketParams, collateralIndex);
  return {
    chainId,
    address: marketParams.midnight,
    abi: midnightAbi,
    functionName: 'withdrawCollateral',
    args: [marketParams, BigInt(collateralIndex), assets, user, user]
  } as const;
};

/** Redeem credit units for loan tokens (bounded by the market's withdrawable liquidity). */
export const redeemRequest = ({ chainId, marketId, marketParams, user, units }: MarketWrite & { units: bigint }) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  return {
    chainId,
    address: marketParams.midnight,
    abi: midnightAbi,
    functionName: 'withdraw',
    args: [marketParams, units, user, user]
  } as const;
};

/** Exit a lend position early: sell `units` of credit into bids (reduce-only) for at least `minSellerAssets`. */
export const exitLendRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  units,
  minSellerAssets,
  takeableOffers,
  deadline
}: MarketWrite & { units: bigint; minSellerAssets: bigint; takeableOffers: readonly MidnightApiTake[]; deadline: bigint }) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  return {
    chainId,
    address: requireMidnightBundles(chainId),
    abi: midnightBundlesAbi,
    functionName: 'midnightBundlesV1SupplyCollateralAndSellWithUnitsTarget',
    args: [
      units,
      minSellerAssets,
      user,
      true,
      user,
      [],
      toOfferFills(takeableOffers, marketId, true),
      NO_REFERRAL_FEE,
      zeroAddress,
      maxUint256,
      deadline
    ]
  } as const;
};

/** Close a borrow early: buy back `units` of debt from asks (reduce-only) for at most `maxBuyerAssets`. */
/**
 * Partial exit of a loan: spend exactly `assets` loan tokens buying debt units back from asks (at least `minUnits`), then
 * optionally withdraw collateral. MidnightBundles pulls exactly `assets`, so that is the amount to approve.
 */
export const exitBorrowWithAssetsRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  assets,
  minUnits,
  takeableOffers,
  withdrawals,
  deadline
}: MarketWrite & {
  assets: bigint;
  minUnits: bigint;
  takeableOffers: readonly MidnightApiTake[];
  withdrawals: CollateralAmount[];
  deadline: bigint;
}) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  return {
    chainId,
    address: requireMidnightBundles(chainId),
    abi: midnightBundlesAbi,
    functionName: 'midnightBundlesV1BuyWithAssetsTargetAndWithdrawCollateral',
    args: [
      assets,
      minUnits,
      user,
      true,
      NO_PERMIT,
      toOfferFills(takeableOffers, marketId, false),
      toCollateralWithdrawals(withdrawals),
      user,
      NO_REFERRAL_FEE,
      zeroAddress,
      maxUint256,
      deadline
    ]
  } as const;
};

/**
 * Full exit of a loan: buy back exactly `units` of debt from asks, then optionally withdraw collateral. MidnightBundles
 * pulls the whole `maxBuyerAssets` up front and refunds the rest, so the approval must cover exactly that bound.
 */
export const closeBorrowRequest = ({
  chainId,
  marketId,
  marketParams,
  user,
  units,
  maxBuyerAssets,
  takeableOffers,
  withdrawals,
  deadline
}: MarketWrite & {
  units: bigint;
  maxBuyerAssets: bigint;
  takeableOffers: readonly MidnightApiTake[];
  withdrawals: CollateralAmount[];
  deadline: bigint;
}) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  return {
    chainId,
    address: requireMidnightBundles(chainId),
    abi: midnightBundlesAbi,
    functionName: 'midnightBundlesV1BuyWithUnitsTargetAndWithdrawCollateral',
    args: [
      units,
      maxBuyerAssets,
      user,
      true,
      NO_PERMIT,
      toOfferFills(takeableOffers, marketId, false),
      toCollateralWithdrawals(withdrawals),
      user,
      NO_REFERRAL_FEE,
      zeroAddress,
      maxUint256,
      deadline
    ]
  } as const;
};

/* ---------- limit orders (maker) ---------- */
//
// markets.morpho.org's default route for a limit order, without an off-chain signature: the offers go into a Merkle
// tree, the maker approves its root on the SetterRatifier, and the ratified offers are published in one MidnightMempool
// payload. Midnight must trust the ratifier once ("Enable limit orders"); a buy order also needs the loan token approved
// to Midnight, which pulls it from the wallet when a taker fills the order.

const requireLimitOrderContracts = (chainId: number) => {
  const setterRatifier = tryChainAddress(chainId, 'setterRatifier');
  const mempool = tryChainAddress(chainId, 'midnightMempool');
  if (!setterRatifier || !mempool) throw new Error(`Limit orders are not available on chain ${chainId}`);
  return { setterRatifier, mempool };
};

/** Lets the SetterRatifier vouch for the user's offers, once per wallet. */
export const authorizeRatifierRequest = (chainId: number, user: Address) => {
  const midnight = getMidnightAddress(chainId);
  if (!midnight) throw new Error(`Midnight is not deployed on chain ${chainId}`);
  const { setterRatifier } = requireLimitOrderContracts(chainId);
  return { chainId, address: midnight, abi: midnightAbi, functionName: 'setIsAuthorized', args: [setterRatifier, true, user] } as const;
};

/** Approves the order's offer tree: from then on every offer in it is valid for takers until it expires or is cancelled. */
export const ratifyOrderRequest = (chainId: number, maker: Address, root: Hex) => {
  const { setterRatifier } = requireLimitOrderContracts(chainId);
  return {
    chainId,
    address: setterRatifier,
    abi: setterRatifierAbi,
    functionName: 'setIsRootRatified',
    args: [maker, root, true]
  } as const;
};

/** Publishes the ratified offers: MidnightMempool takes the encoded payload as raw calldata. */
export const submitOrderRequest = (chainId: number, payload: Hex): RawTxRequest => ({
  chainId,
  to: requireLimitOrderContracts(chainId).mempool,
  data: payload
});

export interface ExitOrder {
  root: Hex;
  payload: Hex;
}

interface ExitOrderParams extends MarketWrite {
  buy: boolean;
  tick: number;
  tickSpacing: number;
  units: bigint;
  continuousFeeCap: bigint;
  start: bigint;
}

type MempoolIssue = MidnightMempoolValidationError['issues'][number];

/** The API's minimum order size in loan-token base units (`min_offer_assets_usd`), when an issue names it. */
const findMinOfferAssets = (issues: readonly MempoolIssue[]) => {
  const details = issues.find((issue) => issue.rule === 'min_offer_assets_usd')?.details;
  return details?.type === 'minOfferAssetsUsd' ? details.minAssets : undefined;
};

/**
 * Early exit at the maker's own price, as markets.morpho.org builds it: one reduce-only offer at `tick` from now until
 * maturity, capped at `units`. A buy pays a loan back, a sell exits a loan given; reduce-only means a fill can never grow
 * the position past zero.
 */
const createExitOrderTree = ({
  chainId,
  marketId,
  marketParams,
  user,
  buy,
  tick,
  tickSpacing,
  units,
  continuousFeeCap,
  start
}: ExitOrderParams) => {
  validateMarketForWrite(marketParams, marketId, chainId);
  const { setterRatifier } = requireLimitOrderContracts(chainId);
  const offer = Offer.create({
    market: marketParams,
    buy,
    maker: user,
    tick: BigInt(tick),
    tickSpacing: BigInt(tickSpacing),
    start,
    expiry: marketParams.maturity,
    callback: zeroAddress,
    callbackData: '0x',
    receiverIfMakerIsSeller: buy ? zeroAddress : user,
    ratifier: setterRatifier,
    reduceOnly: true,
    maxUnits: units,
    maxAssets: 0n,
    continuousFeeCap
  });
  return Tree.create([Group.create([offer])]);
};

/** Builds the order and checks it against the API's mempool policy before anything is sent. */
export const buildExitOrder = async (params: ExitOrderParams): Promise<ExitOrder> => {
  const tree = createExitOrderTree(params);
  try {
    await tree.mempoolValidate({ chainId: params.chainId, apiUrl: ApiUrls.midnightApi });
  } catch (error) {
    // The SDK only counts the issues; the rules say what to change.
    if (error instanceof MidnightMempoolValidationError) {
      throw new Error(`The order book rejected the order: ${error.issues.map((issue) => issue.rule).join(', ')}`);
    }
    throw error;
  }
  return { root: tree.root, payload: await Payload.encode(SetterRatifierUtils.ratify({ tree })) };
};

/**
 * Smallest order the API accepts in this market, in loan-token base units. It is a USD minimum, so it is read from the
 * API's answer for a one-unit order rather than hard-coded; 0 when the API sets none.
 */
export const fetchMinExitOrderAssets = async (params: Omit<ExitOrderParams, 'units'>) => {
  try {
    await createExitOrderTree({ ...params, units: 1n }).mempoolValidate({ chainId: params.chainId, apiUrl: ApiUrls.midnightApi });
    return 0n;
  } catch (error) {
    if (error instanceof MidnightMempoolValidationError) return findMinOfferAssets(error.issues) ?? 0n;
    throw error;
  }
};
