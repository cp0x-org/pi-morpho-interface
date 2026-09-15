import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Address, Hex } from 'viem';

import { getMarketTransactions, getUserTransactions } from '@/api/midnight';
import { midnightQueryKeys } from './queryKeys';

type UseMidnightTransactionsParams =
  | { scope: 'user'; user?: Address; marketId?: Hex; limit?: number; enabled?: boolean }
  | { scope: 'market'; marketId?: Hex; limit?: number; enabled?: boolean };

/** Latest events of a user (optionally narrowed to one market) or of a market. */
export const useMidnightTransactions = (params: UseMidnightTransactionsParams) => {
  const limit = params.limit ?? 50;
  const enabled = params.enabled ?? true;
  const user = params.scope === 'user' ? params.user : undefined;

  const query = useQuery({
    queryKey: params.scope === 'user' ? midnightQueryKeys.userTransactions(user) : midnightQueryKeys.marketTransactions(params.marketId),
    queryFn: ({ signal }) =>
      params.scope === 'user'
        ? getUserTransactions(user as Address, { limit: 100 }, signal)
        : getMarketTransactions(params.marketId as Hex, { limit }, signal),
    enabled: enabled && (params.scope === 'user' ? !!user : !!params.marketId),
    refetchInterval: 60_000
  });

  const marketId = params.marketId;
  const transactions = useMemo(() => {
    const items = query.data?.data ?? [];
    const filtered = params.scope === 'user' && marketId ? items.filter((item) => item.marketId === marketId.toLowerCase()) : items;
    return filtered.slice(0, limit);
  }, [query.data, params.scope, marketId, limit]);

  return { ...query, transactions };
};
