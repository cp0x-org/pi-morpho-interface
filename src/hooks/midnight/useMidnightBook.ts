import { useQuery } from '@tanstack/react-query';
import type { Hex } from 'viem';

import { getBook } from '@/api/midnight';
import { midnightQueryKeys } from './queryKeys';

export const useMidnightBook = (marketId: Hex | undefined, depth = 20, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: midnightQueryKeys.book(marketId, depth),
    queryFn: ({ signal }) => getBook(marketId as Hex, depth, signal),
    enabled: enabled && !!marketId,
    refetchInterval: 15_000
  });
