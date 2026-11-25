import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContracts } from 'wagmi';
import { getAddress, type Address } from 'viem';

import { getMorphoRest } from '@/api/morphoRest';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';

export interface TokenRef {
  chainId: number;
  address: Address;
}

export interface TokenMetadata extends TokenRef {
  symbol: string;
  decimals: number;
  name?: string;
  logoURI?: string;
  priceUsd?: number;
}

export const tokenKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

const UNKNOWN_SYMBOL = 'UNKNOWN';

const fetchAssets = async (tokens: TokenRef[]): Promise<Record<string, any>[]> => {
  const rows = await Promise.all(tokens.map(async ({ address, chainId }) => {
    try {
      const selector = `${chainId}:${address}`;
      const [token, price] = await Promise.all([
        getMorphoRest<{ data: Record<string, any> }>(`/v0/tokens/${selector}`),
        getMorphoRest<{ data: Record<string, any> }>(`/v0/tokens/${selector}/price`).catch(() => undefined)
      ]);
      return { ...token.data, address: token.data.address ?? address, chain_id: chainId, logo_uri: token.data.logo_uri, price: price?.data };
    } catch {
      return undefined;
    }
  }));
  return rows.filter((row) => row != null);
};

/**
 * Symbol, decimals, logo and USD price for (chain, token) pairs from the Morpho REST API,
 * with an on-chain `symbol()` / `decimals()` fallback for tokens the API does not know.
 */
export const useTokensMetadata = (tokens: TokenRef[]) => {
  const keysSignature = Array.from(new Set(tokens.filter((token) => token.address).map((token) => tokenKey(token.chainId, token.address))))
    .sort()
    .join(',');

  const uniqueTokens = useMemo<TokenRef[]>(
    () =>
      keysSignature
        ? keysSignature.split(',').map((key) => {
            const [chainId, address] = key.split(':');
            return { chainId: Number(chainId), address: getAddress(address) };
          })
        : [],
    [keysSignature]
  );

  const {
    data,
    isLoading: loading,
    error
  } = useQuery({
    queryKey: ['tokensMetadata', keysSignature],
    queryFn: () => fetchAssets(uniqueTokens),
    enabled: uniqueTokens.length > 0,
    staleTime: 5 * 60_000
  });

  const apiTokens = useMemo(() => {
    const requested = new Set(keysSignature.split(','));
    const result = new Map<string, TokenMetadata>();
    data?.forEach((item) => {
      const key = tokenKey(item.chain_id, item.address);
      if (!requested.has(key) || item.symbol === UNKNOWN_SYMBOL) return;
      result.set(key, {
        chainId: item.chain_id,
        address: getAddress(item.address),
        symbol: item.symbol,
        decimals: item.decimals,
        name: item.name ?? undefined,
        logoURI: item.logo_uri ?? undefined,
        priceUsd: item.price?.price ?? item.price?.usd_price ?? undefined
      });
    });
    return result;
  }, [data, keysSignature]);

  const missingTokens = useMemo(
    () => (loading ? [] : uniqueTokens.filter((token) => !apiTokens.has(tokenKey(token.chainId, token.address)))),
    [loading, uniqueTokens, apiTokens]
  );

  const { data: onchainData, isLoading: isOnchainLoading } = useReadContracts({
    contracts: missingTokens.flatMap((token) => [
      { address: token.address, abi: erc20ABIConfig.abi, functionName: 'symbol', chainId: token.chainId },
      { address: token.address, abi: erc20ABIConfig.abi, functionName: 'decimals', chainId: token.chainId }
    ]),
    allowFailure: true,
    query: { enabled: missingTokens.length > 0, staleTime: Infinity }
  });

  const tokensByKey = useMemo(() => {
    const result: Record<string, TokenMetadata> = Object.fromEntries(apiTokens);
    missingTokens.forEach((token, index) => {
      const symbol = onchainData?.[index * 2];
      const decimals = onchainData?.[index * 2 + 1];
      if (symbol?.status !== 'success' || decimals?.status !== 'success') return;
      result[tokenKey(token.chainId, token.address)] = {
        ...token,
        symbol: String(symbol.result),
        decimals: Number(decimals.result)
      };
    });
    return result;
  }, [apiTokens, missingTokens, onchainData]);

  const getToken = useCallback(
    (chainId: number, address?: string): TokenMetadata | undefined => (address ? tokensByKey[tokenKey(chainId, address)] : undefined),
    [tokensByKey]
  );

  return { tokens: tokensByKey, getToken, isLoading: loading || (missingTokens.length > 0 && isOnchainLoading), error };
};
