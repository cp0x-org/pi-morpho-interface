import { useCallback, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { useReadContracts } from 'wagmi';
import { getAddress, type Address } from 'viem';

import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
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

interface AssetsByAddressData {
  assets: {
    items: {
      address: string;
      symbol: string;
      name: string | null;
      decimals: number;
      logoURI: string | null;
      chain: { id: number };
      price: { usd: number | null } | null;
    }[];
  };
}

export const tokenKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

const UNKNOWN_SYMBOL = 'UNKNOWN';

/**
 * Symbol, decimals, logo and USD price for (chain, token) pairs: batched from the Morpho GraphQL API,
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

  const variables = useMemo(
    () => ({
      addresses: Array.from(new Set(uniqueTokens.map((token) => token.address.toLowerCase()))),
      chainIds: Array.from(new Set(uniqueTokens.map((token) => token.chainId)))
    }),
    [uniqueTokens]
  );

  const { data, loading, error } = useQuery<AssetsByAddressData>(MorphoRequests.GetAssetsByAddress, {
    client: appoloClients.morphoApi,
    variables,
    skip: uniqueTokens.length === 0
  });

  const apiTokens = useMemo(() => {
    const requested = new Set(keysSignature.split(','));
    const result = new Map<string, TokenMetadata>();
    data?.assets.items.forEach((item) => {
      const key = tokenKey(item.chain.id, item.address);
      if (!requested.has(key) || item.symbol === UNKNOWN_SYMBOL) return;
      result.set(key, {
        chainId: item.chain.id,
        address: getAddress(item.address),
        symbol: item.symbol,
        decimals: item.decimals,
        name: item.name ?? undefined,
        logoURI: item.logoURI ?? undefined,
        priceUsd: item.price?.usd ?? undefined
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
