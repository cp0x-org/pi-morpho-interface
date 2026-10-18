import { UserVaultPosition, UserVaultV2Position } from 'types/morpho';
import { Vault, VaultV2 } from 'types/vaults';

/**
 * Morpho Vaults V2 come from a separate API entity whose metrics sit on the object itself rather than under `state`.
 * The interface renders both generations through the V1 shape; the `version` flag marks the rows that are V2.
 * On-chain, both are ERC-4626, so deposit / withdraw / maxWithdraw calls stay the same.
 */
export const normalizeVaultV2 = (vault: VaultV2): Vault => ({
  address: vault.address,
  symbol: vault.symbol,
  name: vault.name,
  asset: vault.asset,
  chain: vault.chain,
  version: 'v2',
  listed: vault.listed ?? undefined,
  state: {
    avgNetApy: vault.avgNetApy ?? 0,
    totalAssets: vault.totalAssets ?? '0',
    totalAssetsUsd: vault.totalAssetsUsd ?? 0,
    liquidity: vault.liquidity ?? undefined,
    liquidityUsd: vault.liquidityUsd ?? undefined,
    curators: vault.curators?.items ?? []
  }
});

export const normalizeVaultV2Position = (position: UserVaultV2Position): UserVaultPosition => ({
  vault: {
    address: position.vault.address,
    name: position.vault.name,
    asset: position.vault.asset,
    version: 'v2',
    state: {
      totalAssets: position.vault.totalAssets ?? '0',
      totalAssetsUsd: String(position.vault.totalAssetsUsd ?? 0),
      avgNetApy: String(position.vault.avgNetApy ?? 0),
      curators: position.vault.curators?.items ?? []
    }
  },
  state: {
    assets: position.assets ?? '0',
    assetsUsd: String(position.assetsUsd ?? 0)
  }
});
