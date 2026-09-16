import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';

import { getBooks, getMarkets, type MidnightMarketsParams } from '@/api/midnight';
import { midnightQueryKeys } from './queryKeys';

export const useMidnightMarkets = (params: MidnightMarketsParams, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: midnightQueryKeys.markets(params),
    queryFn: ({ signal }) => getMarkets(params, { signal }),
    staleTime: 60_000,
    enabled
  });

/**
 * Order books for a set of markets (list page). `GET /books` only carries the top 3 levels per side, so every
 * market that has a book is re-read in full: that is what makes the summed depth match markets.morpho.org.
 */
export const useMidnightBooks = (marketIds: Hex[], { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: midnightQueryKeys.books(marketIds),
    queryFn: ({ signal }) => getBooks(marketIds, { deep: true, signal }),
    enabled: enabled && marketIds.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000
  });
