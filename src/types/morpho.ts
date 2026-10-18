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

/** `vaultV2Positions` entry: metrics sit on the vault itself. Normalized into `UserVaultPosition` by `utils/vaults`. */
export interface UserVaultV2Position {
  vault: {
    address: string;
    name: string;
    asset: VaultAsset;
    totalAssets: string | null;
    totalAssetsUsd: number | null;
    avgNetApy: number | null;
    curators: { items: VaultCurator[] } | null;
  };
  assets: string | null;
  assetsUsd: number | null;
}

/**
 * User data returned by the GetUserPositions query
 */
export interface MorphoUser {
  address: string;
  marketPositions: UserMarketPosition[];
  vaultPositions: UserVaultPosition[];
  vaultV2Positions: UserVaultV2Position[];
}

/**
 * Response structure for GetUserPositions GraphQL query
 */
export interface GetUserPositionsResponse {
  userByAddress: MorphoUser | null;
}

/**
 * Variables for GetUserPositions GraphQL query
 */
export interface GetUserPositionsVariables {
  chainId: number;
  address: string;
}
