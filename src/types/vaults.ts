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
  /** Morpho's REST directory includes listed vaults and V1 vaults referenced by Vault V2 adapters. */
  listed?: boolean;
}

export type VaultDirectory = Omit<Vault, 'state'> & { state?: State };
