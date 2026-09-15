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

/** Top-of-book levels for a set of markets (list page). */
export const useMidnightBooks = (marketIds: Hex[], { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: midnightQueryKeys.books(marketIds),
    queryFn: ({ signal }) => getBooks(marketIds, signal),
    enabled: enabled && marketIds.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000
  });
