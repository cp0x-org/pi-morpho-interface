import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBlockNumber } from 'wagmi';

import { invalidateChainReads } from 'utils/onchainQueries';

/**
 * Re-reads every on-screen contract read on `chainId` whenever the chain produces a block.
 *
 * Balances change outside the interface too (a swap in the wallet, a transfer from another app) and nothing in the
 * page would notice: contract reads are fetched once on mount, and React Query only refetches on a tab switch, not on
 * the wallet popup closing. Watching the block number keeps every balance and allowance within one block of the chain.
 * Call it once per page, not per form: wagmi dedupes the block poll, but each caller would invalidate on its own.
 */
export const useRefreshOnNewBlock = (chainId?: number) => {
  const queryClient = useQueryClient();
  const { data: blockNumber } = useBlockNumber({ chainId, watch: true, query: { enabled: !!chainId } });
  const lastSeen = useRef<{ chainId: number; blockNumber: bigint } | undefined>(undefined);

  useEffect(() => {
    if (!chainId || blockNumber === undefined) return;
    const previous = lastSeen.current;
    lastSeen.current = { chainId, blockNumber };
    // The first block after mount (or after a chain change) comes with reads that are already fresh.
    if (!previous || previous.chainId !== chainId || previous.blockNumber === blockNumber) return;
    invalidateChainReads(queryClient, chainId);
  }, [blockNumber, chainId, queryClient]);
};
