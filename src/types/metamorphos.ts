/**
 * Asset information related to MetaMorpho
 */
export interface Asset {
  id: string;
  name: string;
  symbol: string;
}

/**
 * Asset information with decimals
 */
export interface AssetWithDecimals extends Asset {
  decimals: number;
}

export interface Curators {
  id: string;
  address: string;
  name: string;
  image: string;
}

/**
 * Curator minimal information
 */
export interface CuratorMinimal {
  id: string;
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
 * MetaMorpho entity information for position
 */
export interface MetaMorphoForPosition {
  id: string;
  name: string;
  asset: AssetWithDecimals;
  curator: CuratorMinimal;
}

/**
 * MetaMorpho position information
 */
export interface MetaMorphoPosition {
  id: string;
  lastAssetsBalance: string;
  lastAssetsBalanceUSD: string;
  metaMorpho: MetaMorphoForPosition;
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

/**
 * Response structure for MetaMorphoPosition GraphQL query
 */
export interface MetaMorphoPositionsQueryResponse {
  metaMorphoPositions: MetaMorphoPosition[];
}

/**
 * Variables for MetaMorphoPosition GraphQL query
 */
export interface MetaMorphoPositionsQueryVariables {
  account: string;
}

/**
 * Rate information for markets
 */
export interface MarketRate {
  rate: string;
  side: string;
  type: string;
}

/**
 * Token information for markets
 */
export interface MarketToken {
  name: string;
  symbol: string;
  id: string;
  decimals: number;
}

/**
 * Market information from subgraph
 */
export interface MorphoMarket {
  maximumLTV: string;
  lltv: string;
  name: string;
  rates: MarketRate[];
  id: string;
  irm: string;
  totalCollateral: string;
  totalSupply: string;
  totalSupplyShares: string;
  totalValueLockedUSD: string;
  isActive: boolean;
  borrowedToken: MarketToken;
  inputToken: MarketToken;
  totalBorrow: string;
  borrowApy?: number;
  supplyApy?: number;
}

/**
 * Response structure for MorphoMarkets GraphQL query
 */
export interface MorphoMarketsQueryResponse {
  markets: MorphoMarket[];
}

/**
 * Variables for MorphoMarkets GraphQL query (empty as the query doesn't have variables)
 */
export interface MorphoMarketsQueryVariables {
  // This query doesn't have variables
}
export interface MarketToken {
  name: string;
  symbol: string;
  id: string;
  decimals: number;
}

/**
 * Market information for position
 */
export interface MarketForPosition {
  id: string;
  name: string;
  inputToken: MarketToken;
  borrowedToken: MarketToken;
}

/**
 * Asset information for position
 */
export interface PositionAsset {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * Position information
 */
export interface MorphoPosition {
  id: string;
  market: MarketForPosition;
  asset: PositionAsset;
  side: string;
  isCollateral: boolean;
  balance: string;
  hashClosed: string | null;
  hashOpened: string;
}

/**
 * Account information
 */
export interface MorphoAccount {
  id: string;
  positionCount: number;
  openPositionCount: number;
  positions: MorphoPosition[];
}

/**
 * Response structure for MorphoMarketPositions GraphQL query
 */
export interface MorphoMarketPositionsQueryResponse {
  account?: MorphoAccount;
}

/**
 * Variables for MorphoMarketPositions GraphQL query
 */
export interface MorphoMarketPositionsQueryVariables {
  account: string;
}

/**
 * Rate information for markets
 */
export interface MarketRate {
  rate: string;
  side: string;
  type: string;
}

/**
 * Token information for markets
 */
export interface MarketToken {
  name: string;
  symbol: string;
  id: string;
  decimals: number;
}

/**
 * Market information from subgraph
 */
export interface MorphoMarket {
  maximumLTV: string;
  lltv: string;
  name: string;
  rates: MarketRate[];
  id: string;
  irm: string;
  totalCollateral: string;
  totalSupply: string;
  totalSupplyShares: string;
  totalValueLockedUSD: string;
  isActive: boolean;
  borrowedToken: MarketToken;
  inputToken: MarketToken;
  totalBorrow: string;
}

/**
 * Response structure for MorphoMarkets GraphQL query
 */
export interface MorphoMarketsQueryResponse {
  markets: MorphoMarket[];
}

/**
 * Variables for MorphoMarkets GraphQL query (empty as the query doesn't have variables)
 */
export interface MorphoMarketsQueryVariables {
  // This query doesn't have variables
}
