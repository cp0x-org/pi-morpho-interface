import type { MidnightMarketsParams } from '@/api/midnight';
import type { MidnightBookSide } from 'types/midnight';

// react-query keys for Midnight data. Amounts are passed as strings: bigint is not serializable in query keys.
export const midnightQueryKeys = {
  all: ['midnight'] as const,
  markets: (params: MidnightMarketsParams) => ['midnight', 'markets', params] as const,
  market: (marketId?: string) => ['midnight', 'market', marketId] as const,
  marketState: (marketId?: string) => ['midnight', 'marketState', marketId] as const,
  marketListed: (marketId?: string) => ['midnight', 'marketListed', marketId] as const,
  book: (marketId?: string, depth?: number) => ['midnight', 'book', marketId, depth] as const,
  books: (marketIds: string[]) => ['midnight', 'books', marketIds] as const,
  quote: (marketId: string | undefined, side: MidnightBookSide, target: string, guard: string) =>
    ['midnight', 'quote', marketId, side, target, guard] as const,
  userPositions: (user?: string) => ['midnight', 'userPositions', user?.toLowerCase()] as const,
  userPerformance: (marketId?: string, user?: string) => ['midnight', 'userPerformance', marketId, user?.toLowerCase()] as const,
  userTransactions: (user?: string) => ['midnight', 'userTransactions', user?.toLowerCase()] as const,
  marketTransactions: (marketId?: string) => ['midnight', 'marketTransactions', marketId] as const
};
