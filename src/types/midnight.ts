import type { Address, Hex } from 'viem';
import type { MidnightApiTake } from '@morpho-org/midnight-sdk/api';

/* ==============================|| REST RESPONSES (snake_case, as returned by /v0/midnight) ||============================== */

export interface MidnightPageResponse<T> {
  cursor: string | null;
  data: T[];
}

export interface MidnightItemResponse<T> {
  data: T;
}

export interface MidnightApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown;
    request_id: string;
  };
}

export interface MidnightCollateralResponse {
  token: Address;
  lltv: string;
  liquidation_cursor: string;
  oracle: Address;
}

export interface MidnightSettlementFeeTierResponse {
  time_to_maturity_days: number;
  fee_cbp: string;
}

/** `GET /markets/{id}` returns only the immutable params; `GET /markets` also returns state fields and `listed`. */
export interface MidnightMarketResponse {
  chain_id: number;
  market_id: Hex;
  market_family_id: Hex;
  loan_token: Address;
  collaterals: MidnightCollateralResponse[];
  maturity: number;
  rcf_threshold: string;
  enter_gate: Address;
  liquidator_gate: Address;
  listed?: boolean;
  total_units?: string;
  tick_granularity?: number;
  settlement_fee_schedule?: MidnightSettlementFeeTierResponse[];
  current_settlement_fee_wad?: string;
  current_settlement_fee_cbp?: string;
  continuous_fee_rate?: string;
}

export interface MidnightMarketStateResponse {
  chain_id: number;
  market_id: Hex;
  market_family_id: Hex;
  total_units: string;
  tick_granularity: number;
  settlement_fee_schedule: MidnightSettlementFeeTierResponse[];
  current_settlement_fee_wad: string;
  current_settlement_fee_cbp: string;
  continuous_fee_rate: string;
  last_indexed_block: string;
}

export type MidnightPositionType = 'lend' | 'borrow' | 'collateral_only';

export interface MidnightPositionResponse {
  chain_id: number;
  market_id: Hex;
  user_address: Address;
  created_at?: number;
  loan_token: Address;
  maturity: number;
  type: MidnightPositionType | null;
  credit: string;
  pending_fee: string;
  last_loss_factor: string;
  loss_factor: string;
  debt: string;
  /** Loan-token base units scaled by WAD. */
  cost_basis?: string;
  effective_rate_wad?: string;
  collaterals: { token: Address; amount: string }[];
  last_indexed_block?: string;
}

export interface MidnightPositionPerformanceResponse {
  chain_id: number;
  market_id: Hex;
  user_address: Address;
  type: MidnightPositionType | null;
  accounting_method: string;
  cost_basis: string;
  effective_rate_wad: string;
  last_indexed_block: string;
}

export type MidnightEventType =
  | 'lend'
  | 'exit_lend_primary'
  | 'exit_lend_secondary'
  | 'borrow'
  | 'exit_borrow_primary'
  | 'exit_borrow_secondary'
  | 'supply_collateral'
  | 'withdraw_collateral'
  | 'partial_liquidation'
  | 'full_liquidation';

export type MidnightTransactionData = Record<string, string | number | boolean | null>;

export interface MidnightTransactionResponse {
  id: string;
  chain_id: number;
  market_id: Hex;
  event_type: MidnightEventType | string;
  tx_hash: Hex;
  data: MidnightTransactionData;
  created_at: number;
}

/* ==============================|| NORMALIZED MODELS (camelCase, bigint amounts) ||============================== */

export interface MidnightCollateral {
  token: Address;
  /** WAD */
  lltv: bigint;
  /** WAD */
  liquidationCursor: bigint;
  oracle: Address;
}

export interface MidnightSettlementFeeTier {
  timeToMaturityDays: number;
  feeCbp: bigint;
}

export interface MidnightMarket {
  chainId: number;
  marketId: Hex;
  marketFamilyId: Hex;
  loanToken: Address;
  /** Collateral order as returned by the API. Use `MarketParams.collateralParams` indices for contract calls. */
  collaterals: MidnightCollateral[];
  /** Unix seconds */
  maturity: number;
  rcfThreshold: bigint;
  enterGate: Address;
  liquidatorGate: Address;
  /** Only present in `GET /markets` responses. */
  listed?: boolean;
  totalUnits?: bigint;
  currentSettlementFeeWad?: bigint;
  continuousFeeRate?: bigint;
}

export interface MidnightMarketState {
  chainId: number;
  marketId: Hex;
  totalUnits: bigint;
  tickGranularity: number;
  settlementFeeSchedule: MidnightSettlementFeeTier[];
  currentSettlementFeeWad: bigint;
  currentSettlementFeeCbp: bigint;
  continuousFeeRate: bigint;
  lastIndexedBlock: bigint;
}

export type MidnightBookSide = 'asks' | 'bids';

export interface MidnightBookLevel {
  tick: number;
  /** WAD price of one unit */
  price: bigint;
  units: bigint;
  /** Loan-token base units */
  assets: bigint;
  count: number;
}

export interface MidnightBook {
  chainId: number;
  marketId: Hex;
  midnight: Address;
  loanToken: Address;
  maturity: number;
  /** Maker sell offers, best first: liquidity for lenders. */
  asks: MidnightBookLevel[];
  /** Maker buy offers, best first: liquidity for borrowers. */
  bids: MidnightBookLevel[];
}

export interface MidnightQuote {
  /** Fee-inclusive WAD average price without a guard. */
  averageBestPrice: bigint;
  averageWorstPrice: bigint;
  availableAssets: bigint;
  availableUnits: bigint;
  /** ABI-ready take caps, passed unchanged to MidnightBundles. */
  takeableOffers: readonly MidnightApiTake[];
}

export interface MidnightUserPosition {
  chainId: number;
  marketId: Hex;
  user: Address;
  loanToken: Address;
  maturity: number;
  type: MidnightPositionType | null;
  credit: bigint;
  pendingFee: bigint;
  debt: bigint;
  collaterals: { token: Address; amount: bigint }[];
  /** Loan-token base units scaled by WAD. */
  costBasis?: bigint;
  effectiveRateWad?: bigint;
  createdAt?: number;
  lastIndexedBlock?: bigint;
}

export interface MidnightPositionPerformance {
  accountingMethod: string;
  costBasis: bigint;
  effectiveRateWad: bigint;
  lastIndexedBlock: bigint;
}

export interface MidnightTransaction {
  id: string;
  chainId: number;
  marketId: Hex;
  eventType: MidnightEventType | string;
  txHash: Hex;
  data: MidnightTransactionData;
  createdAt: number;
}
