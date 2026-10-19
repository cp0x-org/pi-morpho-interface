import type { QueryClient } from '@tanstack/react-query';

/**
 * Marks every wagmi contract read on a chain as stale and refetches the ones on screen. All of them land in the same
 * tick, so wagmi folds them into one multicall instead of one request per hook.
 *
 * wagmi query keys look like `['readContract', { chainId, address, functionName, ... }]`.
 */
export const invalidateChainReads = (queryClient: QueryClient, chainId: number) =>
  queryClient.invalidateQueries({
    predicate: (query) => {
      const [scope, params] = query.queryKey;
      if (scope !== 'readContract' && scope !== 'readContracts') return false;
      return typeof params === 'object' && params !== null && (params as { chainId?: number }).chainId === chainId;
    }
  });
