import { formatUnits } from 'viem';
import type { Address } from 'viem';
import type { MarketDirectory, MarketInterface } from 'types/market';
import type { Vault, VaultDirectory, VaultVersion } from 'types/vaults';
import type { MorphoUser, UserMarketPosition, UserVaultPosition } from 'types/morpho';
import { ApiUrls } from './constants';

type ApiEnvelope<T> = { data: T; cursor?: string | null };
type Json = Record<string, any>;
const responseCache = new Map<string, { expires: number; value: Promise<unknown> }>();

const get = async <T>(path: string, query?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> => {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => value !== undefined && params.set(key, String(value)));
  const cacheKey = `${path}?${params.toString()}`;
  const cacheable = !path.includes('/users/') && !path.includes('/positions');
  const existing = cacheable ? responseCache.get(cacheKey) : undefined;
  if (existing && existing.expires > Date.now()) return existing.value as Promise<T>;
  const url = new URL(`${ApiUrls.morphoApi}${path}`, window.location.origin);
  url.search = params.toString();
  const pending = (async () => {
    const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = payload?.error?.message ?? payload?.message ?? response.statusText;
      throw new Error(`Morpho API ${response.status}: ${message}`);
    }
    return payload as T;
  })();
  if (cacheable) {
    const ttl = path.includes('/price') || path.includes('/tokens/') || path === '/v0/chains' ? 5 * 60_000 : 30_000;
    responseCache.set(cacheKey, { expires: Date.now() + ttl, value: pending });
  }
  try {
    return await pending;
  } catch (error) {
    responseCache.delete(cacheKey);
    throw error;
  }
};

const pages = async <T>(path: string, query: Record<string, string | number | undefined> = {}, pageSize = 1000): Promise<T[]> => {
  const all: T[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await get<ApiEnvelope<T[]>>(path, { ...query, limit: pageSize, cursor: cursor ?? undefined });
    all.push(...(result.data ?? []));
    cursor = result.cursor;
    if (!cursor) break;
  }
  return all;
};

const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await fn(items[index]);
    }
  }));
  return output;
};

const n = (value: unknown): number => value == null ? 0 : Number(value);
const tokenAmount = (raw: string | number | undefined, decimals: number): number => Number(formatUnits(BigInt(raw ?? 0), decimals));
let chainNames: Promise<Map<number, string>> | undefined;
const getChainNames = () => {
  chainNames ??= get<ApiEnvelope<Json[]>>('/v0/chains').then((r) => new Map((r.data ?? []).map((c) => [Number(c.chain_id), String(c.name ?? c.network ?? c.chain_id)])));
  return chainNames;
};

type MarketConfig = Json & { chain_id: number; market_id: string; loan_token: string; collateral_token: string; oracle_address: string; irm_address: string; lltv_wad: string };
const marketSelector = (chainId: number, id: string) => `${chainId}:${id}`;
const marketDetail = async (chainId: number, id: string) => get<ApiEnvelope<MarketConfig>>(`/v0/blue/markets/${marketSelector(chainId, id)}`);

const mapMarket = async (config: MarketConfig, chainMap: Map<number, string>): Promise<MarketInterface> => {
  const selector = marketSelector(Number(config.chain_id), config.market_id);
  const [stateResult, apyResult, loanResult, collateralResult] = await Promise.all([
    get<ApiEnvelope<Json>>(`/v0/blue/markets/${selector}/state`),
    get<ApiEnvelope<Json>>(`/v0/blue/markets/${selector}/apy-averages`),
    get<ApiEnvelope<Json>>(`/v0/tokens/${config.chain_id}:${config.loan_token}`),
    get<ApiEnvelope<Json>>(`/v0/tokens/${config.chain_id}:${config.collateral_token}`)
  ]);
  const state = stateResult.data;
  const apy = apyResult.data;
  const loan = loanResult.data;
  const collateral = collateralResult.data;
  const loanDecimals = Number(loan.decimals ?? 18);
  const collateralDecimals = Number(collateral.decimals ?? 18);
  const supplyAssets = tokenAmount(state.total_supply_assets, loanDecimals);
  const borrowAssets = tokenAmount(state.total_borrow_assets, loanDecimals);
  const priceResult = await get<ApiEnvelope<Json>>(`/v0/tokens/${config.chain_id}:${config.loan_token}/price`).catch(() => undefined);
  const price = n(priceResult?.data?.price ?? priceResult?.data?.usd_price);
  const supplyUsd = supplyAssets * price;
  const borrowUsd = borrowAssets * price;
  const supplyApy6h = n(apy.supply_apy_averages?.['6h']);
  const borrowApy6h = n(apy.borrow_apy_averages?.['6h']);
  const supplyApy24h = n(apy.supply_apy_averages?.['24h'] ?? apy.supply_apy_averages?.['6h']);
  const borrowApy24h = n(apy.borrow_apy_averages?.['24h'] ?? apy.borrow_apy_averages?.['6h']);
  return {
    price: String(price), marketId: config.market_id, lltv: config.lltv_wad,
    oracle: { address: config.oracle_address }, irmAddress: config.irm_address,
    chain: { id: Number(config.chain_id), network: chainMap.get(Number(config.chain_id)) ?? String(config.chain_id) },
    loanAsset: { address: config.loan_token, symbol: String(loan.symbol ?? ''), decimals: loanDecimals },
    collateralAsset: { address: config.collateral_token, symbol: String(collateral.symbol ?? ''), decimals: collateralDecimals },
    state: {
      borrowAssets: Number(state.total_borrow_assets ?? 0), supplyAssets: Number(state.total_supply_assets ?? 0), fee: n(state.fee_wad) / 1e18,
      utilization: supplyAssets ? borrowAssets / supplyAssets : 0,
      dailyNetBorrowApy: borrowApy24h, dailyNetSupplyApy: supplyApy24h,
      totalLiquidity: String(BigInt(state.total_supply_assets ?? 0) - BigInt(state.total_borrow_assets ?? 0)),
      totalLiquidityUsd: Math.max(0, supplyUsd - borrowUsd), size: String(state.total_borrow_assets ?? '0'), sizeUsd: borrowUsd,
      netBorrowApy: borrowApy6h, netSupplyApy: supplyApy6h
    }
  };
};

export const fetchMarkets = async (): Promise<MarketDirectory[]> => {
  const [configs, chainMap] = await Promise.all([
    pages<MarketConfig>('/v0/blue/markets', { listed: 'true' }), getChainNames()
  ]);
  return configs.map((config) => ({
    marketId: config.market_id,
    lltv: config.lltv_wad,
    oracle: { address: config.oracle_address },
    irmAddress: config.irm_address,
    chain: { id: Number(config.chain_id), network: chainMap.get(Number(config.chain_id)) ?? String(config.chain_id) },
    loanAsset: { address: config.loan_token, symbol: '', decimals: 18 },
    collateralAsset: { address: config.collateral_token, symbol: '', decimals: 18 }
  }));
};

export const fetchMarketMetrics = async (markets: MarketDirectory[]): Promise<MarketInterface[]> => {
  const chainMap = await getChainNames();
  return mapLimit(markets, 6, (market) => mapMarket({
    chain_id: market.chain.id,
    market_id: market.marketId,
    loan_token: market.loanAsset.address,
    collateral_token: market.collateralAsset.address,
    oracle_address: market.oracle?.address ?? '',
    irm_address: market.irmAddress,
    lltv_wad: market.lltv
  }, chainMap));
};

export const fetchMarketTokenMetadata = async (markets: MarketDirectory[]): Promise<Map<string, Json>> => {
  const selectors = [...new Set(markets.flatMap((market) => [
    `${market.chain.id}:${market.loanAsset.address}`,
    `${market.chain.id}:${market.collateralAsset.address}`
  ]))];
  const rows = await mapLimit(selectors, 6, async (selector) => [selector, (await get<ApiEnvelope<Json>>(`/v0/tokens/${selector}`)).data] as const);
  return new Map(rows);
};

export const fetchMarketCandidates = async (marketId: string, chainId?: number): Promise<MarketInterface[]> => {
  let configs: MarketConfig[];
  if (chainId) {
    try {
      configs = [(await marketDetail(chainId, marketId)).data];
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('404')) throw error;
      configs = await pages<MarketConfig>('/v0/blue/markets', { listed: 'true' });
    }
  } else {
    configs = await pages<MarketConfig>('/v0/blue/markets', { listed: 'true' });
  }
  const chainMap = await getChainNames();
  const candidates = configs.filter((config) => config.market_id.toLowerCase() === marketId.toLowerCase());
  return mapLimit(candidates, 4, (config) => mapMarket(config, chainMap));
};

const vaultListPath = (version: VaultVersion) => version === 'v1' ? '/v0/vaults-v1' : '/v0/vaults-v2';
const vaultDetailsPath = (version: VaultVersion, selector: string) => `${vaultListPath(version)}/${selector}`;
const vaultStatePath = (version: VaultVersion, selector: string) => version === 'v1' ? `/v0/vaults-v1/${selector}/state` : `/v1/vaults-v2/${selector}/state`;
const vaultApyPath = (version: VaultVersion, selector: string) => version === 'v1' ? `/v0/vaults-v1/${selector}/apy-averages` : `/v1/vaults-v2/${selector}/apy-averages`;
let curatorProfiles: Promise<Map<string, { id: string; name: string; image: string; addresses: { address: string; chainId: number }[] }>> | undefined;
const getCuratorProfiles = () => {
  curatorProfiles ??= pages<Json>('/v0/curators').then((rows) => {
    const profiles = new Map<string, { id: string; name: string; image: string; addresses: { address: string; chainId: number }[] }>();
    rows.forEach((row) => {
      const profile = {
        id: String(row.curator_id ?? row.id ?? ''), name: String(row.name ?? row.curator_id ?? ''),
        image: String(row.image_url ?? row.image ?? ''),
        addresses: (row.addresses ?? []).map((item: Json): { address: string; chainId: number } => ({ address: String(item.curator_address ?? item.address ?? ''), chainId: Number(item.chain_id ?? item.chainId) }))
      };
      profile.addresses.forEach(({ address, chainId }: { address: string; chainId: number }) => profiles.set(`${chainId}:${address.toLowerCase()}`, profile));
    });
    return profiles;
  });
  return curatorProfiles;
};

const mapVault = async (entry: Json, version: VaultVersion, chainMap: Map<number, string>): Promise<Vault> => {
  const chainId = Number(entry.chain_id);
  const address = entry.vault_address ?? entry.address;
  const selector = `${chainId}:${address}`;
  const [detailResult, stateResult, apyResult, curatorMap] = await Promise.all([
    get<ApiEnvelope<Json>>(vaultDetailsPath(version, selector)),
    get<ApiEnvelope<Json>>(vaultStatePath(version, selector)),
    get<ApiEnvelope<Json>>(vaultApyPath(version, selector), { lookback: 'six_hours' }),
    getCuratorProfiles()
  ]);
  const detail = detailResult.data;
  const state = stateResult.data;
  const apy = apyResult.data;
  const asset = detail.asset ?? {};
  const priceResult = await get<ApiEnvelope<Json>>(`/v0/tokens/${chainId}:${asset.address}/price`).catch(() => undefined);
  const price = n(priceResult?.data?.price ?? priceResult?.data?.usd_price);
  const totalAssets = String(state.total_assets ?? '0');
  const totalAssetsUsd = tokenAmount(totalAssets, Number(asset.decimals ?? 18)) * price;
  const apyValue = apy.apy ?? apy.avg_net_apy ?? apy.average_apy ?? 0;
  const curatorAddress = detail.curator;
  const curator = curatorAddress
    ? [curatorMap.get(`${chainId}:${String(curatorAddress).toLowerCase()}`) ?? { id: curatorAddress, name: curatorAddress, image: '', addresses: [{ address: curatorAddress, chainId }] }]
    : [];
  return {
    address, symbol: detail.symbol ?? entry.symbol ?? '', name: detail.name ?? entry.name ?? '',
    listed: true, version,
    asset: { id: asset.address ?? entry.asset_address ?? '', address: asset.address ?? entry.asset_address ?? '', symbol: asset.symbol ?? '', decimals: Number(asset.decimals ?? 18), name: asset.name ?? asset.symbol ?? '' },
    chain: { id: chainId, network: chainMap.get(chainId) ?? String(chainId) },
    state: { avgNetApy: n(apyValue), totalAssets, totalAssetsUsd, liquidity: state.withdrawable_assets ?? state.idle_assets, liquidityUsd: tokenAmount(state.withdrawable_assets ?? state.idle_assets ?? 0, Number(asset.decimals ?? 18)) * price, curators: curator }
  };
};

export const fetchVaults = async (version: VaultVersion): Promise<VaultDirectory[]> => {
  const [entries, chainMap] = await Promise.all([pages<Json>(vaultListPath(version)), getChainNames()]);
  return entries.map((entry) => {
    const chainId = Number(entry.chain_id);
    const address = String(entry.vault_address ?? entry.address ?? '');
    const assetAddress = String(entry.asset_address ?? '');
    return {
      address, symbol: String(entry.symbol ?? ''), name: String(entry.name ?? ''), listed: true, version,
      asset: { id: assetAddress, address: assetAddress, symbol: '', decimals: 18, name: '' },
      chain: { id: chainId, network: chainMap.get(chainId) ?? String(chainId) },
      state: undefined
    };
  });
};

export const fetchVaultAssetMetadata = async (vaults: VaultDirectory[]): Promise<Map<string, Json>> => {
  const selectors = [...new Set(vaults.map((vault) => `${vault.chain.id}:${vault.asset.address}`))];
  const rows = await mapLimit(selectors, 6, async (selector) => [selector, (await get<ApiEnvelope<Json>>(`/v0/tokens/${selector}`)).data] as const);
  return new Map(rows);
};

export const fetchVaultMetrics = async (vaults: VaultDirectory[]): Promise<Vault[]> => {
  const chainMap = await getChainNames();
  return mapLimit(vaults, 6, (vault) => mapVault({ chain_id: vault.chain.id, vault_address: vault.address, name: vault.name, symbol: vault.symbol, asset_address: vault.asset.address }, vault.version ?? 'v1', chainMap));
};

export const fetchVault = async (address: string, chainId?: number): Promise<Vault | undefined> => {
  const [chainMap, versions] = await Promise.all([getChainNames(), Promise.resolve(['v1', 'v2'] as VaultVersion[])]);
  for (const version of versions) {
    let id = chainId;
    if (!id) {
      const matches = await get<ApiEnvelope<Json[]>>(vaultListPath(version), {
        chain_ids: Array.from(chainMap.keys()).join(','), vault_addresses: address, limit: 100
      });
      id = Number(matches.data?.find((entry) => String(entry.vault_address).toLowerCase() === address.toLowerCase())?.chain_id);
    }
    if (!id) continue;
    try {
      const detail = await get<ApiEnvelope<Json>>(vaultDetailsPath(version, `${id}:${address}`));
      const d = detail.data;
      return mapVault({ ...d, chain_id: id, vault_address: address }, version, chainMap);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('404')) throw error;
    }
  }
  return undefined;
};

const allPositions = async (path: string, query: Record<string, string | number | undefined>) => pages<Json>(path, query, 100);

export const fetchUserPositions = async (chainId: number, address: Address): Promise<MorphoUser | null> => {
  const [blueRows, v1Rows, v2Rows, chainMap] = await Promise.all([
    allPositions(`/v0/blue/users/${address}/positions`, { chain_ids: chainId }),
    allPositions(`/v0/vaults-v1/users/${address}/positions`, { chain_ids: chainId }),
    allPositions(`/v0/vaults-v2/users/${address}/positions`, { chain_ids: chainId }),
    getChainNames()
  ]);
  const marketPositions = await mapLimit(blueRows, 6, async (row): Promise<UserMarketPosition> => {
    const config = (await marketDetail(chainId, row.market_id)).data;
    const market = await mapMarket(config, chainMap);
    const state = (await get<ApiEnvelope<Json>>(`/v0/blue/markets/${chainId}:${row.market_id}/state`)).data;
    const suppliedRaw = (BigInt(row.supply_shares ?? 0) * (BigInt(state.total_supply_assets ?? 0) + 1n)) / (BigInt(state.total_supply_shares ?? 0) + 1_000_000n);
    const borrowDenominator = BigInt(state.total_borrow_shares ?? 0) + 1_000_000n;
    const borrowNumerator = BigInt(row.borrow_shares ?? 0) * (BigInt(state.total_borrow_assets ?? 0) + 1n);
    const borrowedRaw = (borrowNumerator + borrowDenominator - 1n) / borrowDenominator;
    const collateralRaw = BigInt(row.collateral_assets ?? '0');
    const supplied = tokenAmount(String(suppliedRaw), market.loanAsset.decimals);
    const borrowed = tokenAmount(String(borrowedRaw), market.loanAsset.decimals);
    const [oracleResult, collateralPriceResult] = await Promise.all([
      market.oracle?.address ? get<ApiEnvelope<Json>>(`/v0/oracles/${chainId}:${market.oracle.address}/state`).catch(() => undefined) : Promise.resolve(undefined),
      get<ApiEnvelope<Json>>(`/v0/tokens/${chainId}:${market.collateralAsset.address}/price`).catch(() => undefined)
    ]);
    const oraclePrice = oracleResult?.data?.price ? Number(oracleResult.data.price) : undefined;
    const healthFactor = borrowedRaw > 0n && oraclePrice != null
      ? ((Number(collateralRaw) * oraclePrice) / 1e36 / Number(borrowedRaw)) * (Number(market.lltv) / 1e18)
      : null;
    const collateralUsdPrice = n(collateralPriceResult?.data?.price);
    return {
      healthFactor, market: { marketId: row.market_id, collateralAsset: { address: market.collateralAsset.address, name: market.collateralAsset.symbol, symbol: market.collateralAsset.symbol, decimals: market.collateralAsset.decimals }, loanAsset: { address: market.loanAsset.address, name: market.loanAsset.symbol, symbol: market.loanAsset.symbol, decimals: market.loanAsset.decimals }, state: { borrowApy: String(market.state.netBorrowApy) } },
      state: { borrowAssets: String(borrowedRaw), borrowAssetsUsd: String(borrowed * Number(market.price)), supplyAssets: String(suppliedRaw), supplyAssetsUsd: String(supplied * Number(market.price)), collateral: String(collateralRaw), collateralUsd: String(tokenAmount(String(collateralRaw), market.collateralAsset.decimals) * collateralUsdPrice) }
    };
  });
  const vaultRows: (Json & { version: VaultVersion })[] = [...v1Rows.map((row) => ({ ...row, version: 'v1' as const })), ...v2Rows.map((row) => ({ ...row, version: 'v2' as const }))];
  const vaultPositions = await mapLimit(vaultRows, 6, async (row): Promise<UserVaultPosition> => {
    const vault = await fetchVault(row.vault_address, Number(row.chain_id));
    if (!vault) throw new Error(`Morpho vault ${row.vault_address} was not found`);
    return {
      vault: { address: vault.address, name: vault.name, version: row.version, asset: { address: vault.asset.address, name: vault.asset.name, symbol: vault.asset.symbol, decimals: vault.asset.decimals }, state: { totalAssets: vault.state.totalAssets, totalAssetsUsd: String(vault.state.totalAssetsUsd), avgNetApy: String(vault.state.avgNetApy), curators: vault.state.curators.map((c) => ({ id: c.id, name: c.name })) } },
      state: { assets: String(row.assets ?? '0'), assetsUsd: String(tokenAmount(String(row.assets ?? '0'), vault.asset.decimals) * (vault.state.totalAssets ? vault.state.totalAssetsUsd / Math.max(1, tokenAmount(vault.state.totalAssets, vault.asset.decimals)) : 0)) }
    };
  });
  return { address, marketPositions, vaultPositions };
};

export const getMorphoRest = get;
