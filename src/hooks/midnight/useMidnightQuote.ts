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
  /** Unit target (exits). Takes precedence over `assets`. */
  units?: bigint;
  /** Fee-inclusive WAD guard: a maximum average price on asks, a minimum on bids. */
  averageWorstPrice?: bigint;
  settlementFee?: bigint;
  enabled?: boolean;
}

/**
 * Debounced market-order quote. A 422 INSUFFICIENT_LIQUIDITY is surfaced as `isInsufficientLiquidity`
 * together with the side's total available liquidity (a guard-free probe), so no transaction is built from it.
 */
export const useMidnightQuote = ({
  marketId,
  side,
  assets,
  units,
  averageWorstPrice,
  settlementFee,
  enabled = true
}: UseMidnightQuoteParams) => {
  const target = units != null && units > 0n ? `u${units}` : assets != null && assets > 0n ? `a${assets}` : '';
  const guard = averageWorstPrice != null ? averageWorstPrice.toString() : '';
  const debouncedKey = useDebounce(`${target}|${guard}`, 400);
  const [debouncedTarget, debouncedGuard] = debouncedKey.split('|');
  const isDebouncing = debouncedKey !== `${target}|${guard}`;

  const quoteQuery = useQuery({
    queryKey: midnightQueryKeys.quote(marketId, side, debouncedTarget, debouncedGuard),
    queryFn: ({ signal }) => {
      const amount = BigInt(debouncedTarget.slice(1));
      return getQuote(
        {
          marketId: marketId as Hex,
          side,
          ...(debouncedTarget.startsWith('u') ? { units: amount } : { assets: amount }),
          averageWorstPrice: debouncedGuard ? BigInt(debouncedGuard) : undefined,
          settlementFee
        },
        signal
      );
    },
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

  const isCurrent = !isDebouncing && !!target;

  return {
    quote: isCurrent ? quoteQuery.data : undefined,
    error: insufficientLiquidity ? null : quoteQuery.error,
    isInsufficientLiquidity: isCurrent && insufficientLiquidity,
    availableAssets: insufficientLiquidity ? availableQuery.data : quoteQuery.data?.availableAssets,
    isLoading: isDebouncing || quoteQuery.isFetching,
    refetch: quoteQuery.refetch
  };
};
