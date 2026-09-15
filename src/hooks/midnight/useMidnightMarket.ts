import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isHex, type Hex } from 'viem';
import type { MarketParams as MidnightMarketParams } from '@morpho-org/midnight-sdk';

import { getMarket, getMarkets, getMarketState, isMidnightNotFound } from '@/api/midnight';
import { toMarketParams } from 'utils/midnight';
import { midnightQueryKeys } from './queryKeys';

const MARKET_ID_LENGTH = 66;

export const toMidnightMarketId = (value?: string): Hex | undefined =>
  value && isHex(value) && value.length === MARKET_ID_LENGTH ? (value.toLowerCase() as Hex) : undefined;

/**
 * Market params (immutable) + indexed state for one Midnight market.
 * `marketParams` is only returned once the API params hash back to the requested id on a known Midnight deployment.
 */
export const useMidnightMarket = (marketIdParam?: string) => {
  const marketId = toMidnightMarketId(marketIdParam);

  const marketQuery = useQuery({
    queryKey: midnightQueryKeys.market(marketId),
    queryFn: ({ signal }) => getMarket(marketId as Hex, signal),
    enabled: !!marketId,
    staleTime: Infinity,
    retry: (failureCount, error) => !isMidnightNotFound(error) && failureCount < 2
  });
  const market = marketQuery.data;

  const stateQuery = useQuery({
    queryKey: midnightQueryKeys.marketState(marketId),
    queryFn: ({ signal }) => getMarketState(marketId as Hex, signal),
    enabled: !!market,
    refetchInterval: 30_000
  });

  // `GET /markets/{id}` has no `listed` flag: look the market up among its siblings with the same loan token and maturity.
  const listedQuery = useQuery({
    queryKey: midnightQueryKeys.marketListed(marketId),
    queryFn: async ({ signal }) => {
      const siblings = await getMarkets(
        { chainIds: [market!.chainId], loanAssets: [market!.loanToken], maturities: [market!.maturity] },
        { maxPages: 3, signal }
      );
      return siblings.find((sibling) => sibling.marketId === marketId)?.listed ?? false;
    },
    enabled: !!market,
    staleTime: 5 * 60_000
  });

  const { marketParams, validationError } = useMemo((): { marketParams?: MidnightMarketParams; validationError?: Error } => {
    if (!market) return {};
    try {
      return { marketParams: toMarketParams(market) };
    } catch (error) {
      return { validationError: error as Error };
    }
  }, [market]);

  return {
    marketId,
    market,
    marketParams,
    validationError,
    state: stateQuery.data,
    listed: listedQuery.data,
    isLoading: marketQuery.isLoading,
    error: marketQuery.error,
    isNotFound: !marketId || isMidnightNotFound(marketQuery.error),
    refetchState: stateQuery.refetch
  };
};
