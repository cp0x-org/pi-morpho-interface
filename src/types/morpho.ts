/**
 * Asset information used in Morpho markets
 */
export interface MorphoAsset {
  address: string;
  name: string;
  decimals: number;
  symbol: string;
}

/**
 * Market data in a user's market position
 */
export interface UserMarket {
  marketId: string;
  collateralAsset: MorphoAsset;
  loanAsset: MorphoAsset;
  state: MarketState;
}

/**
 * State data of a user's market position
 */
export interface MarketPositionState {
  borrowAssets: string;
  borrowAssetsUsd: string;
  supplyAssets: string;
  supplyAssetsUsd: string;
  collateralUsd: string;
  collateral: string;
}

export interface MarketState {
  borrowApy: string;
}

/**
 * User's position in a specific market
 */
export interface UserMarketPosition {
  healthFactor: number | null;
  market: UserMarket;
  state: MarketPositionState;
}

/**
 * Vault data in a user's vault position
 */
export interface UserVault {
  address: string;
  name: string;
  state: VaultState;
  asset: VaultAsset;
  version?: 'v1' | 'v2';
}

/**
 * State data of a user's vault position
 */
export interface VaultPositionState {
  assets: string;
  assetsUsd: string;
}

export interface VaultState {
  totalAssets: string;
  totalAssetsUsd: string;
  avgNetApy: string;
  curators: VaultCurator[];
}

export interface VaultCurator {
  id: string;
  name: string;
}

export interface VaultAsset {
  address: string;
  name: string;
  decimals: number;
  symbol: string;
}

/**
 * User's position in a specific vault
 */
export interface UserVaultPosition {
  vault: UserVault;
  state: VaultPositionState;
}

/** Normalized portfolio data assembled from public Morpho REST position endpoints. */
export interface MorphoUser {
  address: string;
  marketPositions: UserMarketPosition[];
  vaultPositions: UserVaultPosition[];
}
