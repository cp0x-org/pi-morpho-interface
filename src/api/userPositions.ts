import { queryOptions } from '@tanstack/react-query';
import type { Address } from 'viem';
import { fetchUserPositions } from './morphoRest';

export const userPositionsQuery = (chainId: number, address: Address, refetchOnWindowFocus = false) =>
  queryOptions({
    queryKey: ['morpho', 'user-positions', chainId, address.toLowerCase()],
    queryFn: () => fetchUserPositions(chainId, address),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus
  });
