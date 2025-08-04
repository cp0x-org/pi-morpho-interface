/**
 * Asset information related to MetaMorpho
 */
export interface Asset {
  id: string;
  name: string;
  symbol: string;
}

export interface Curators {
  id: string;
  address: string;
  name: string;
  image: string;
}

/**
 * MetaMorpho entity information
 */
export interface MetaMorpho {
  id: string;
  name: string;
  symbol: string;
  asset: Asset;
  timelock: string | number;
  dailyNetApy?: number;
  curators?: Curators[];
}

/**
 * Response structure for MetaMorpho GraphQL query
 */
export interface MetaMorphosQueryResponse {
  // vaults
  metaMorphos: MetaMorpho[];
}

/**
 * Variables for MetaMorpho GraphQL query
 */
export interface MetaMorphosQueryVariables {
  // Add any query variables here if needed
}
