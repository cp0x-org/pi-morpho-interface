import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { invalidateChainReads } from 'utils/onchainQueries';

// One Base block and one mainnet block past the receipt.
const FOLLOW_UP_REFRESH_DELAYS_MS = [3_000, 13_000];

/**
 * Returns a function that refreshes on-chain data right after a transaction receipt and again a couple of blocks later.
 *
 * Right after a receipt the RPC can still answer from the block before it (a node behind the load balancer, a cached
 * eth_call), so the first read may come back unchanged and nothing would ask again. The follow-ups read once the next
 * blocks are in. Without `refresh`, every contract read on `chainId` is invalidated, so a page's own reads (the vault
 * balance in the header) catch up together with the form's.
 */
export const useRefreshAfterTransaction = (chainId?: number, refresh?: () => unknown) => {
  const queryClient = useQueryClient();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return useCallback(() => {
    const run = () => {
      if (chainId) invalidateChainReads(queryClient, chainId);
      return refresh?.();
    };
    timers.current.forEach(clearTimeout);
    timers.current = FOLLOW_UP_REFRESH_DELAYS_MS.map((delay) => setTimeout(run, delay));
    return run();
  }, [chainId, queryClient, refresh]);
};
