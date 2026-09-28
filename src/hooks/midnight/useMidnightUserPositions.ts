import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { getUserMarketPerformance, getUserPositions } from '@/api/midnight';
import { midnightQueryKeys } from './queryKeys';

/** Fixed-rate positions of a user on every Midnight chain (indexed with a lag: prefer on-chain reads right after a tx). */
export const useMidnightUserPositions = (user?: Address) =>
  useQuery({
    queryKey: midnightQueryKeys.userPositions(user),
    queryFn: ({ signal }) => getUserPositions(user as Address, {}, signal),
    enabled: !!user,
    refetchInterval: 30_000
  });

export const useMidnightPositionPerformance = (marketId?: Hex, user?: Address) =>
  useQuery({
    queryKey: midnightQueryKeys.userPerformance(marketId, user),
    queryFn: ({ signal }) => getUserMarketPerformance(marketId as Hex, user as Address, signal),
    enabled: !!marketId && !!user,
    retry: false,
    refetchInterval: 60_000
  });
