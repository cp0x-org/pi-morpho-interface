/**
 * What a "Max" repay sends to Morpho's `repay(marketParams, assets, shares, onBehalf, data)` and how much of the loan
 * token it has to approve.
 *
 * The plan is fixed when Max is pressed: the field shows it, the allowance check and both transactions send it, and on
 * submission it is only checked to still stand against the chain as it is then.
 */
export interface MaxRepayPlan {
  /** `assets` argument when the wallet cannot close the loan: its balance, capped at the debt floor. Otherwise 0. */
  assets: bigint;
  /** `shares` argument: every borrow share of the position when the wallet closes the loan, otherwise 0. */
  shares: bigint;
  /** Amount for `approve`. */
  approveAmount: bigint;
  /** Allowance the Repay step needs. Never above `approveAmount`. */
  requiredAllowance: bigint;
}

/** What a plan is built from. */
export interface MaxRepayInputs {
  /**
   * The debt as Morpho will see it, as far as it can be told now: the market state last written on chain accrued once to
   * the current second, rounded up as Morpho rounds a repay by shares.
   */
  debtAssets: bigint;
  /**
   * The least the debt can be when the repay lands, rounded down: Morpho reverts a repay of more assets than the debt.
   * Debt only grows with time and a later block never has an earlier timestamp, so the written state accrued to (a little
   * before) the latest block's timestamp is safe.
   */
  debtFloor: bigint;
  /** The position's borrow shares. */
  borrowShares: bigint;
  /** The wallet's loan token balance. */
  walletBalance: bigint;
}

const BPS = 10_000n;

/**
 * Interest that can accrue between this read and the repay landing on chain: 1 bp is about 9 hours of interest at 10 %
 * APR. Repaying by shares, Morpho pulls the shares' value at inclusion, so the wallet must cover it.
 */
const INCLUSION_HEADROOM_BPS = 1n;

/** Approval above the debt for a repay by shares, which pulls the debt plus interest accrued until it lands (about 3.6 days at 10 % APR). */
const APPROVAL_BUFFER_BPS = 10n;

/** `amount` plus `bps` of it, rounded up: at least 1 wei above any non-zero amount. */
const withBps = (amount: bigint, bps: bigint): bigint => amount + (amount * bps + BPS - 1n) / BPS;

export const planMaxRepay = ({ debtAssets, debtFloor, borrowShares, walletBalance }: MaxRepayInputs): MaxRepayPlan => {
  const assets = walletBalance < debtFloor ? walletBalance : debtFloor;

  // Close by shares, which leaves no dust, when the wallet covers what Morpho will pull with headroom for interest until
  // inclusion. Also when the floor leaves nothing to repay by assets (less than one base unit) and the wallet covers the
  // debt: only shares can clear that.
  const closesByShares =
    borrowShares > 0n &&
    (walletBalance >= withBps(debtAssets, INCLUSION_HEADROOM_BPS) || (assets === 0n && walletBalance > 0n && walletBalance >= debtAssets));
  if (closesByShares) {
    const approveAmount = withBps(debtAssets, APPROVAL_BUFFER_BPS);
    return { assets: 0n, shares: borrowShares, approveAmount, requiredAllowance: approveAmount };
  }

  // The wallet cannot close the loan: repay what it holds, up to the floor, and approve exactly that.
  return { assets, shares: 0n, approveAmount: assets, requiredAllowance: assets };
};

/**
 * Whether a plan made earlier can still be sent as it is. A repay by shares stands while the wallet still closes the same
 * position and its approval still covers the debt; a repay of assets stands while they stay within the wallet and the
 * debt floor.
 */
export const maxRepayPlanStands = (plan: MaxRepayPlan, now: MaxRepayInputs): boolean => {
  if (plan.shares > 0n) {
    return planMaxRepay(now).shares === plan.shares && plan.approveAmount >= withBps(now.debtAssets, INCLUSION_HEADROOM_BPS);
  }
  return plan.assets > 0n && plan.assets <= now.walletBalance && plan.assets <= now.debtFloor;
};
