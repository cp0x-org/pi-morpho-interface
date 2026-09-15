import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';

import { getQuote, isInsufficientLiquidity } from '@/api/midnight';
import { useDebounce } from 'hooks/useDebounce';
import type { MidnightBookSide } from 'types/midnight';
import { midnightQueryKeys } from './queryKeys';

interface UseMidnightQuoteParams {
  marketId?: Hex;
  side: MidnightBookSide;
  /** Loan-token base units: spent by the lender (asks) or received by the borrower (bids). */
  assets?: bigint;
  /** Fee-inclusive WAD guard derived from the user's minimum (lend) or maximum (borrow) rate. */
  averageWorstPrice?: bigint;
  settlementFee?: bigint;
  enabled?: boolean;
}

/**
 * Debounced market-order quote. A 422 INSUFFICIENT_LIQUIDITY is surfaced as `isInsufficientLiquidity`
 * together with the side's total available liquidity (a guard-free probe), so no transaction is built from it.
 */
export const useMidnightQuote = ({ marketId, side, assets, averageWorstPrice, settlementFee, enabled = true }: UseMidnightQuoteParams) => {
  const target = assets && assets > 0n ? assets.toString() : '';
  const guard = averageWorstPrice != null ? averageWorstPrice.toString() : '';
  const debouncedKey = useDebounce(`${target}|${guard}`, 400);
  const [debouncedTarget, debouncedGuard] = debouncedKey.split('|');
  const isDebouncing = debouncedKey !== `${target}|${guard}`;

  const quoteQuery = useQuery({
    queryKey: midnightQueryKeys.quote(marketId, side, debouncedTarget, debouncedGuard),
    queryFn: ({ signal }) =>
      getQuote(
        {
          marketId: marketId as Hex,
          side,
          assets: BigInt(debouncedTarget),
          averageWorstPrice: debouncedGuard ? BigInt(debouncedGuard) : undefined,
          settlementFee
        },
        signal
      ),
    enabled: enabled && !!marketId && !!debouncedTarget,
    retry: false,
    refetchInterval: 15_000
  });

  const insufficientLiquidity = isInsufficientLiquidity(quoteQuery.error);

  const availableQuery = useQuery({
    queryKey: midnightQueryKeys.quote(marketId, side, 'available', ''),
    queryFn: async ({ signal }) => {
      try {
        const probe = await getQuote({ marketId: marketId as Hex, side, units: 1n, settlementFee }, signal);
        return probe.availableAssets;
      } catch (error) {
        if (isInsufficientLiquidity(error)) return 0n;
        throw error;
      }
    },
    enabled: enabled && !!marketId && insufficientLiquidity,
    retry: false
  });

  return {
    quote: quoteQuery.data,
    error: insufficientLiquidity ? null : quoteQuery.error,
    isInsufficientLiquidity: insufficientLiquidity,
    availableAssets: insufficientLiquidity ? availableQuery.data : quoteQuery.data?.availableAssets,
    isLoading: isDebouncing || quoteQuery.isFetching,
    refetch: quoteQuery.refetch
  };
};
