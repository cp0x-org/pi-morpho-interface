import { useCallback, useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import type { Hex } from 'viem';
import { midnightAbi } from '@morpho-org/midnight-sdk';

import { getMidnightAddress } from 'utils/midnight';

export interface MidnightMarketRef {
  chainId: number;
  marketId: Hex;
}

const refKey = (chainId: number, marketId: string) => `${chainId}:${marketId.toLowerCase()}`;

/**
 * On-chain `withdrawable(id)` for a set of markets, one multicall per chain.
 *
 * The REST API exposes no such field, yet it is what separates the two figures markets.morpho.org shows:
 * `total_units` is all credit ever issued, `withdrawable` is the part whose loan tokens already sit in the
 * contract, and "Outstanding loans" is the difference — the credit still owed by borrowers.
 */
export const useMidnightWithdrawable = (markets: MidnightMarketRef[]) => {
  const signature = Array.from(new Set(markets.map((market) => refKey(market.chainId, market.marketId))))
    .sort()
    .join(',');

  const refs = useMemo<MidnightMarketRef[]>(
    () =>
      signature
        ? signature.split(',').map((key) => {
            const [chainId, marketId] = key.split(':');
            return { chainId: Number(chainId), marketId: marketId as Hex };
          })
        : [],
    [signature]
  );

  const calls = useMemo(
    () =>
      refs.flatMap(({ chainId, marketId }) => {
        const midnight = getMidnightAddress(chainId);
        return midnight ? [{ chainId, address: midnight, abi: midnightAbi, functionName: 'withdrawable', args: [marketId] } as const] : [];
      }),
    [refs]
  );

  // `calls` drops markets on chains without a Midnight deployment, so results are indexed by the same filtered list.
  const answered = useMemo(() => refs.filter((ref) => getMidnightAddress(ref.chainId)), [refs]);

  const { data, isLoading, refetch } = useReadContracts({
    contracts: calls,
    allowFailure: true,
    query: { enabled: calls.length > 0, refetchInterval: 60_000 }
  });

  const byKey = useMemo(() => {
    const result: Record<string, bigint> = {};
    answered.forEach((ref, index) => {
      const entry = data?.[index];
      if (entry?.status === 'success') result[refKey(ref.chainId, ref.marketId)] = entry.result as bigint;
    });
    return result;
  }, [answered, data]);

  const getWithdrawable = useCallback((chainId: number, marketId: string): bigint | undefined => byKey[refKey(chainId, marketId)], [byKey]);

  return { getWithdrawable, isLoading, refetch };
};
