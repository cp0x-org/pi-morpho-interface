import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';

import { getBook, isMidnightNotFound } from '@/api/midnight';
import { midnightQueryKeys } from './queryKeys';

/**
 * One market's order book. `GET /books/{id}` answers 404 for a market nobody has quoted yet, which is the
 * normal state of most listed maturities — retrying it just burns requests, so that case is not retried.
 */
export const useMidnightBook = (marketId: Hex | undefined, depth = 100, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: midnightQueryKeys.book(marketId, depth),
    queryFn: ({ signal }) => getBook(marketId as Hex, depth, signal),
    enabled: enabled && !!marketId,
    retry: (failureCount, error) => !isMidnightNotFound(error) && failureCount < 2,
    refetchInterval: 15_000
  });
