import { useCallback, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfig, useReadContracts } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';
import type { Address, ContractFunctionParameters, PublicClient } from 'viem';
import { midnightAbi } from '@morpho-org/midnight-sdk';

import { getOpenOrders } from '@/api/midnight';
import type { MidnightOpenOrder } from 'types/midnight';
import { getMidnightAddress } from 'utils/midnight';
import { fetchOrderSeries, type MidnightOrderSeries } from 'utils/midnightOrderSeries';
import { midnightQueryKeys } from './queryKeys';

export interface FixedOpenOrder extends MidnightOpenOrder {
  /** Group amount already consumed on-chain, in the cap's unit. Undefined until the read lands. */
  consumed?: bigint;
  /** The whole series of offers behind the order: undefined while it is looked up, null when it cannot be traced. */
  series?: MidnightOrderSeries | null;
}

// Orders cancelled in this session, shared by every page. `setConsumed` is final, so a cancelled group never reopens:
// hiding it as soon as the receipt lands covers the API's indexing lag and an RPC node still a block behind.
// The key sits outside `midnightQueryKeys.all` so a refresh never clears it.
const CANCELLED_ORDERS_KEY = ['fixedCancelledOrders'] as const;

const orderKey = (order: Pick<MidnightOpenOrder, 'chainId' | 'group'>) => `${order.chainId}:${order.group.toLowerCase()}`;

// An RPC that refuses the log search leaves the order untraced, like an order that has no series to find. Module-level,
// so `useQueries` keeps the combined array stable between renders.
const combineSeries = (results: { data?: MidnightOrderSeries | null; isError: boolean }[]) =>
  results.map((result) => (result.isError ? null : result.data));

/** Hides an order right after its cancel transaction is mined. */
export const useMarkOrderCancelled = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (order: Pick<MidnightOpenOrder, 'chainId' | 'group'>) =>
      queryClient.setQueryData<string[]>(CANCELLED_ORDERS_KEY, (previous = []) => [...previous, orderKey(order)]),
    [queryClient]
  );
};

/**
 * Open maker orders of a user on every Midnight chain. The API lists them with an indexing lag, so the on-chain
 * `consumed` amount decides: an order consumed up to its cap (filled, or cancelled with `setConsumed`) is dropped at once.
 */
export const useMidnightOpenOrders = (user?: Address) => {
  const queryClient = useQueryClient();
  const { data: cancelled } = useQuery({
    queryKey: CANCELLED_ORDERS_KEY,
    queryFn: () => queryClient.getQueryData<string[]>(CANCELLED_ORDERS_KEY) ?? [],
    initialData: [] as string[],
    staleTime: Infinity,
    gcTime: Infinity
  });
  const {
    data,
    isLoading,
    error,
    refetch: refetchOrders
  } = useQuery({
    queryKey: midnightQueryKeys.openOrders(user),
    queryFn: ({ signal }) => getOpenOrders(user as Address, signal),
    enabled: !!user,
    refetchInterval: 30_000
  });
  const apiOrders = useMemo(() => data ?? [], [data]);

  const contracts = useMemo<(ContractFunctionParameters & { chainId: number })[]>(
    () =>
      apiOrders.map((order) => ({
        chainId: order.chainId,
        address: getMidnightAddress(order.chainId) as Address,
        abi: midnightAbi,
        functionName: 'consumed',
        args: [order.maker, order.group]
      })),
    [apiOrders]
  );
  const { data: consumedData, refetch: refetchConsumed } = useReadContracts({
    contracts,
    allowFailure: true,
    query: { enabled: apiOrders.length > 0, refetchInterval: 30_000 }
  });

  // An order's series is on-chain history, so it never changes: looked up once per session, outside `midnightQueryKeys.all`.
  const config = useConfig();
  const series = useQueries({
    queries: apiOrders.map((order) => ({
      queryKey: ['fixedOrderSeries', order.chainId, order.group.toLowerCase()],
      queryFn: () => {
        const client = getPublicClient(config, { chainId: order.chainId });
        if (!client) throw new Error(`No RPC connection for chain ${order.chainId}`);
        return fetchOrderSeries(client as PublicClient, order);
      },
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1
    })),
    combine: combineSeries
  });

  const orders = useMemo<FixedOpenOrder[]>(
    () =>
      apiOrders
        .map((order, index) => {
          const read = consumedData?.[index];
          return {
            ...order,
            consumed: read?.status === 'success' ? (read.result as bigint) : undefined,
            series: series[index]
          };
        })
        .filter((order) => !cancelled.includes(orderKey(order)) && (order.consumed === undefined || order.consumed < order.cap)),
    [apiOrders, consumedData, cancelled, series]
  );

  const refetch = useCallback(() => {
    refetchOrders();
    refetchConsumed();
  }, [refetchOrders, refetchConsumed]);

  return { orders, isLoading, error, refetch };
};
