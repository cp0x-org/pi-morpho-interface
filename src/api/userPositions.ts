import { queryOptions } from '@tanstack/react-query';
import type { Address } from 'viem';
import type { GetUserPositionsResponse, GetUserPositionsVariables } from 'types/morpho';
import { appoloClients } from './apollo-client';
import { MorphoRequests } from './constants';

// A successful network read sets dataUpdatedAt for this account and chain, including when it has no positions.
export const userPositionsQuery = (chainId: number, address: Address, refetchOnWindowFocus = false) =>
  queryOptions({
    queryKey: ['morpho', 'user-positions', chainId, address],
    queryFn: async () => {
      const { data } = await appoloClients.morphoApi.query<GetUserPositionsResponse, GetUserPositionsVariables>({
        query: MorphoRequests.GetUserPositions,
        variables: { chainId, address },
        fetchPolicy: 'network-only',
        errorPolicy: 'none'
      });
      return data.userByAddress;
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus
  });
