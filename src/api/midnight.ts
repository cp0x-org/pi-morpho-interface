import { getAddress, type Address, type Hex } from 'viem';
import { MidnightApi, MidnightApiError } from '@morpho-org/midnight-sdk/api';
import type { FetchBookQuoteParams, MidnightApiBookMarket, MidnightApiPriceLevel } from '@morpho-org/midnight-sdk/api';

import { ApiUrls } from './constants';
import { isExpectedMidnightAddress } from 'utils/midnight';
import type {
  MidnightApiErrorResponse,
  MidnightBook,
  MidnightBookLevel,
  MidnightBookSide,
  MidnightCollateralResponse,
  MidnightEventType,
  MidnightItemResponse,
  MidnightMarket,
  MidnightMarketResponse,
  MidnightMarketState,
  MidnightMarketStateResponse,
  MidnightPageResponse,
  MidnightPositionPerformance,
  MidnightPositionPerformanceResponse,
  MidnightPositionResponse,
  MidnightPositionType,
  MidnightQuote,
  MidnightTransaction,
  MidnightTransactionResponse,
  MidnightUserPosition
} from 'types/midnight';

// ==============================|| MORPHO MIDNIGHT REST CLIENT ||============================== //
//
// Books and quotes go through @morpho-org/midnight-sdk/api: it recomputes every market id from the returned params and
// normalizes takeable offers into ABI-ready structs. Markets, positions and transactions are not covered by the SDK.

export { MidnightApiError };

export const isMidnightNotFound = (error: unknown) => error instanceof MidnightApiError && error.status === 404;

export const isInsufficientLiquidity = (error: unknown) => error instanceof MidnightApiError && error.code === 'INSUFFICIENT_LIQUIDITY';

type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;

const request = async <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal): Promise<T> => {
  const url = new URL(`${ApiUrls.midnightApi.replace(/\/$/, '')}/${path}`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      // Lists must be comma separated: repeated query parameters are ignored by the API.
      if (value.length > 0) url.searchParams.set(key, value.join(','));
      return;
    }
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, { signal });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error = (body as Partial<MidnightApiErrorResponse> | undefined)?.error;
    throw new MidnightApiError({
      status: response.status,
      code: error?.code,
      message: error?.message ?? response.statusText,
      details: error?.details,
      requestId: error?.request_id
    });
  }
  return body as T;
};

const collectPages = async <T>(fetchPage: (cursor?: string) => Promise<MidnightPageResponse<T>>, maxPages: number): Promise<T[]> => {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const response = await fetchPage(cursor);
    items.push(...response.data);
    if (!response.cursor) break;
    cursor = response.cursor;
  }
  return items;
};

const sdkConfig = (signal?: AbortSignal) => ({ baseUrl: ApiUrls.midnightApi, request: { signal } });

const toBigInt = (value: string | undefined) => (value == null ? undefined : BigInt(value));

const toMarketId = (id: string) => id.toLowerCase() as Hex;

/* ---------- normalizers ---------- */

const normalizeCollateral = (collateral: MidnightCollateralResponse) => ({
  token: getAddress(collateral.token),
  lltv: BigInt(collateral.lltv),
  liquidationCursor: BigInt(collateral.liquidation_cursor),
  oracle: getAddress(collateral.oracle)
});

export const normalizeMarket = (market: MidnightMarketResponse): MidnightMarket => ({
  chainId: market.chain_id,
  marketId: toMarketId(market.market_id),
  marketFamilyId: market.market_family_id,
  loanToken: getAddress(market.loan_token),
  collaterals: market.collaterals.map(normalizeCollateral),
  maturity: market.maturity,
  rcfThreshold: BigInt(market.rcf_threshold),
  enterGate: getAddress(market.enter_gate),
  liquidatorGate: getAddress(market.liquidator_gate),
  listed: market.listed,
  totalUnits: toBigInt(market.total_units),
  currentSettlementFeeWad: toBigInt(market.current_settlement_fee_wad),
  continuousFeeRate: toBigInt(market.continuous_fee_rate)
});

const normalizeMarketState = (state: MidnightMarketStateResponse): MidnightMarketState => ({
  chainId: state.chain_id,
  marketId: toMarketId(state.market_id),
  totalUnits: BigInt(state.total_units),
  tickGranularity: state.tick_granularity,
  settlementFeeSchedule: state.settlement_fee_schedule.map((tier) => ({
    timeToMaturityDays: tier.time_to_maturity_days,
    feeCbp: BigInt(tier.fee_cbp)
  })),
  currentSettlementFeeWad: BigInt(state.current_settlement_fee_wad),
  currentSettlementFeeCbp: BigInt(state.current_settlement_fee_cbp),
  continuousFeeRate: BigInt(state.continuous_fee_rate),
  lastIndexedBlock: BigInt(state.last_indexed_block)
});

const normalizePosition = (position: MidnightPositionResponse): MidnightUserPosition => ({
  chainId: position.chain_id,
  marketId: toMarketId(position.market_id),
  user: getAddress(position.user_address),
  loanToken: getAddress(position.loan_token),
  maturity: position.maturity,
  type: position.type,
  credit: BigInt(position.credit),
  pendingFee: BigInt(position.pending_fee),
  debt: BigInt(position.debt),
  collaterals: position.collaterals.map((collateral) => ({ token: getAddress(collateral.token), amount: BigInt(collateral.amount) })),
  costBasis: toBigInt(position.cost_basis),
  effectiveRateWad: toBigInt(position.effective_rate_wad),
  createdAt: position.created_at,
  lastIndexedBlock: toBigInt(position.last_indexed_block)
});

const normalizeTransaction = (transaction: MidnightTransactionResponse): MidnightTransaction => ({
  id: transaction.id,
  chainId: transaction.chain_id,
  marketId: toMarketId(transaction.market_id),
  eventType: transaction.event_type,
  txHash: transaction.tx_hash,
  data: transaction.data,
  createdAt: transaction.created_at
});

const normalizeLevel = (level: MidnightApiPriceLevel): MidnightBookLevel => ({
  tick: level.tick,
  price: BigInt(level.price),
  units: BigInt(level.units),
  assets: BigInt(level.assets),
  count: level.count
});

const normalizeBook = (book: MidnightApiBookMarket): MidnightBook => ({
  chainId: book.chainId,
  marketId: toMarketId(book.marketId),
  midnight: getAddress(book.midnight),
  loanToken: getAddress(book.loanToken),
  maturity: book.maturity,
  asks: book.asks.map(normalizeLevel),
  bids: book.bids.map(normalizeLevel)
});

/* ---------- markets ---------- */

export interface MidnightMarketsParams {
  chainIds?: number[];
  listed?: boolean;
  activeOnly?: boolean;
  loanAssets?: Address[];
  collateralAssets?: Address[];
  maturities?: number[];
  maturityGte?: number;
  maturityLte?: number;
  sortBy?: 'maturity' | 'total_units';
  sortDirection?: 'asc' | 'desc';
  limit?: number;
}

export const getMarkets = async (
  params: MidnightMarketsParams = {},
  { maxPages = 20, signal }: { maxPages?: number; signal?: AbortSignal } = {}
): Promise<MidnightMarket[]> => {
  const markets = await collectPages(
    (cursor) =>
      request<MidnightPageResponse<MidnightMarketResponse>>(
        'markets',
        {
          chain_ids: params.chainIds,
          listed: params.listed,
          active_only: params.activeOnly,
          loan_assets: params.loanAssets,
          collateral_assets: params.collateralAssets,
          maturities: params.maturities,
          maturity_gte: params.maturityGte,
          maturity_lte: params.maturityLte,
          sort_by: params.sortBy,
          sort_direction: params.sortDirection,
          limit: params.limit ?? 100,
          cursor
        },
        signal
      ),
    maxPages
  );
  return markets.map(normalizeMarket);
};

export const getMarket = async (marketId: Hex, signal?: AbortSignal): Promise<MidnightMarket> => {
  const response = await request<MidnightItemResponse<MidnightMarketResponse>>(`markets/${marketId}`, undefined, signal);
  return normalizeMarket(response.data);
};

export const getMarketState = async (marketId: Hex, signal?: AbortSignal): Promise<MidnightMarketState> => {
  const response = await request<MidnightItemResponse<MidnightMarketStateResponse>>(`markets/${marketId}/state`, undefined, signal);
  return normalizeMarketState(response.data);
};

/* ---------- positions ---------- */

export const getMarketPositions = async (
  marketId: Hex,
  params: { types?: MidnightPositionType[]; activeOnly?: boolean; limit?: number; cursor?: string } = {},
  signal?: AbortSignal
): Promise<{ cursor: string | null; data: MidnightUserPosition[] }> => {
  const response = await request<MidnightPageResponse<MidnightPositionResponse>>(
    `markets/${marketId}/positions`,
    { types: params.types, active_only: params.activeOnly, limit: params.limit, cursor: params.cursor },
    signal
  );
  return { cursor: response.cursor, data: response.data.map(normalizePosition) };
};

/** Positions across every Midnight chain. */
export const getUserPositions = async (
  user: Address,
  params: { types?: MidnightPositionType[] } = {},
  signal?: AbortSignal
): Promise<MidnightUserPosition[]> => {
  const positions = await collectPages(
    (cursor) => request<MidnightPageResponse<MidnightPositionResponse>>(`users/${user}/positions`, { types: params.types, cursor }, signal),
    10
  );
  return positions.map(normalizePosition);
};

export const getUserMarketPosition = async (marketId: Hex, user: Address, signal?: AbortSignal): Promise<MidnightUserPosition> => {
  const response = await request<MidnightItemResponse<MidnightPositionResponse>>(
    `markets/${marketId}/users/${user}/position`,
    undefined,
    signal
  );
  return normalizePosition(response.data);
};

export const getUserMarketPerformance = async (
  marketId: Hex,
  user: Address,
  signal?: AbortSignal
): Promise<MidnightPositionPerformance> => {
  const response = await request<MidnightItemResponse<MidnightPositionPerformanceResponse>>(
    `markets/${marketId}/users/${user}/position/performance`,
    undefined,
    signal
  );
  return {
    accountingMethod: response.data.accounting_method,
    costBasis: BigInt(response.data.cost_basis),
    effectiveRateWad: BigInt(response.data.effective_rate_wad),
    lastIndexedBlock: BigInt(response.data.last_indexed_block)
  };
};

/* ---------- transactions ---------- */

export interface MidnightTransactionsPage {
  cursor: string | null;
  data: MidnightTransaction[];
}

export const getUserTransactions = async (
  user: Address,
  params: { eventTypes?: MidnightEventType[]; limit?: number; cursor?: string } = {},
  signal?: AbortSignal
): Promise<MidnightTransactionsPage> => {
  const response = await request<MidnightPageResponse<MidnightTransactionResponse>>(
    `users/${user}/transactions`,
    { event_types: params.eventTypes, limit: params.limit, cursor: params.cursor },
    signal
  );
  return { cursor: response.cursor, data: response.data.map(normalizeTransaction) };
};

export const getMarketTransactions = async (
  marketId: Hex,
  params: { createdAtGte?: number; limit?: number; cursor?: string } = {},
  signal?: AbortSignal
): Promise<MidnightTransactionsPage> => {
  const response = await request<MidnightPageResponse<MidnightTransactionResponse>>(
    `markets/${marketId}/transactions`,
    { created_at_gte: params.createdAtGte, limit: params.limit, cursor: params.cursor },
    signal
  );
  return { cursor: response.cursor, data: response.data.map(normalizeTransaction) };
};

/* ---------- books & quotes (SDK) ---------- */

const BOOKS_BATCH_SIZE = 50;

/** Top-of-book levels for many markets. Books served for another Midnight deployment are dropped. */
export const getBooks = async (marketIds: Hex[], signal?: AbortSignal): Promise<MidnightBook[]> => {
  const ids = Array.from(new Set(marketIds.map(toMarketId)));
  const batches: Hex[][] = [];
  for (let i = 0; i < ids.length; i += BOOKS_BATCH_SIZE) batches.push(ids.slice(i, i + BOOKS_BATCH_SIZE));

  const responses = await Promise.all(
    batches.map((batch) => MidnightApi.fetchBooks({ ...sdkConfig(signal), marketIds: batch, limit: batch.length }))
  );
  return responses
    .flatMap((response) => response.data)
    .filter((book) => isExpectedMidnightAddress(book.chainId, book.midnight))
    .map(normalizeBook);
};

export const getBook = async (marketId: Hex, depth = 20, signal?: AbortSignal): Promise<MidnightBook> => {
  const { data } = await MidnightApi.fetchBook({ ...sdkConfig(signal), marketId, depth });
  if (!isExpectedMidnightAddress(data.chainId, data.midnight)) {
    throw new Error(`Midnight book for ${marketId} targets an unknown Midnight deployment ${data.midnight}`);
  }
  return normalizeBook(data);
};

export interface MidnightQuoteParams {
  marketId: Hex;
  side: MidnightBookSide;
  /** Loan-token target: what the lender spends on asks, what the borrower receives on bids. */
  assets?: bigint;
  units?: bigint;
  /** Fee-inclusive WAD average price guard: a maximum on asks, a minimum on bids. */
  averageWorstPrice?: bigint;
  /** Current WAD settlement fee, used by the SDK to re-check the guard locally. */
  settlementFee?: bigint;
}

export const getQuote = async (params: MidnightQuoteParams, signal?: AbortSignal): Promise<MidnightQuote> => {
  const target = params.units != null ? { units: params.units } : { assets: params.assets ?? 0n };
  const guard = params.averageWorstPrice != null ? { averageWorstPrice: params.averageWorstPrice } : {};
  const { data } = await MidnightApi.fetchBookQuote({
    ...sdkConfig(signal),
    marketId: params.marketId,
    side: params.side,
    settlementFee: params.settlementFee ?? 0n,
    ...target,
    ...guard
  } as FetchBookQuoteParams);

  return {
    averageBestPrice: BigInt(data.averageBestPrice),
    averageWorstPrice: BigInt(data.averageWorstPrice),
    availableAssets: BigInt(data.availableAssets),
    availableUnits: BigInt(data.availableUnits),
    takeableOffers: data.takeableOffers
  };
};
