import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';

import { getQuote, isInsufficientLiquidity } from '@/api/midnight';
import { useDebounce } from 'hooks/useDebounce';
import type { MidnightBookSide } from 'types/midnight';
import { midnightQueryKeys } from './queryKeys';
import { useMidnightBook } from './useMidnightBook';

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
 * together with the side's total liquidity in the book, so no transaction is built from it.
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

  // A quote's `availableAssets` covers only the offers it takes (a 1-unit probe: the top one), so the side's total is
  // summed from the book. Same query as the market page's, so it is usually cached already.
  const bookQuery = useMidnightBook(marketId, 100, { enabled: enabled && insufficientLiquidity });
  const bookAssets = bookQuery.data?.[side].reduce((sum, level) => sum + level.assets, 0n);

  const isCurrent = !isDebouncing && !!target;

  return {
    quote: isCurrent ? quoteQuery.data : undefined,
    error: insufficientLiquidity ? null : quoteQuery.error,
    isInsufficientLiquidity: isCurrent && insufficientLiquidity,
    availableAssets: insufficientLiquidity ? bookAssets : quoteQuery.data?.availableAssets,
    isLoading: isDebouncing || quoteQuery.isFetching,
    refetch: quoteQuery.refetch
  };
};
