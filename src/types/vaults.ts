export interface Asset {
  id: string;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

export interface Chain {
  id: number;
  network: string;
}
export interface CuratorAddresses {
  address: string;
  chainId: number;
}

export interface Curators {
  id: string;
  name: string;
  image: string;
  addresses: CuratorAddresses[];
}

export interface State {
  avgNetApy: number;
  totalAssets: string;
  totalAssetsUsd: number;
  /** Vaults V2 only: assets withdrawable right now (base units) and their USD value. */
  liquidity?: string;
  liquidityUsd?: number;
  curators: Curators[];
}

export type VaultVersion = 'v1' | 'v2';

export interface Vault {
  address: string;
  symbol: string;
  name: string;
  asset: Asset;
  chain: Chain;
  state: State;
  /** Missing on raw V1 API rows; set by the pages when both generations are mixed. */
  version?: VaultVersion;
}

export interface VaultsData {
  vaults: {
    items: Vault[];
  };
}

/** `vaultV2s` API entity. Normalized into `Vault` by `utils/vaults`. */
export interface VaultV2 {
  address: string;
  symbol: string;
  name: string;
  asset: Asset;
  chain: Chain;
  totalAssets: string | null;
  totalAssetsUsd: number | null;
  liquidity: string | null;
  liquidityUsd: number | null;
  avgNetApy: number | null;
  curators: { items: Curators[] } | null;
}

export interface VaultsV2Data {
  vaultV2s: {
    items: VaultV2[];
  };
}
