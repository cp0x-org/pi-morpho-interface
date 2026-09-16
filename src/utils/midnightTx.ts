import { erc20Abi, maxUint256, zeroAddress, type Address, type Hex } from 'viem';
import { MarketUtils, midnightAbi, midnightBundlesAbi, type MarketParams as MidnightMarketParams } from '@morpho-org/midnight-sdk';
import type { MidnightApiTake } from '@morpho-org/midnight-sdk/api';

import { getMidnightAddress, getMidnightBundlesAddress, validateMarketForWrite } from './midnight';

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
