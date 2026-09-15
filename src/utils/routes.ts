import { buildFixedSlug } from 'utils/midnight';

// ==============================|| APP ROUTES ||============================== //
//
// Morpho-style URLs. Slugs are cosmetic: the router ignores them.
// Vaults and variable (Blue) markets keep ?chainId= because their addresses/ids are not unique across chains;
// fixed-rate (Midnight) market ids already commit to the chain id.

export type FixedSide = 'lend' | 'borrow';

const slugify = (...parts: (string | undefined)[]) =>
  parts
    .filter((part): part is string => !!part)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('-');

const withSlug = (path: string, slug: string) => (slug ? `${path}/${slug}` : path);

const withChainId = (path: string, chainId?: number) => (chainId ? `${path}?chainId=${chainId}` : path);

export const routes = {
  vaults: () => '/vaults',
  vault: (address: string, chainId?: number, name?: string) => withChainId(withSlug(`/vault/${address}`, slugify(name)), chainId),
  variable: () => '/variable',
  variableMarket: (marketId: string, chainId?: number, loanSymbol?: string, collateralSymbol?: string) =>
    withChainId(withSlug(`/variable/${marketId}`, slugify(loanSymbol, collateralSymbol)), chainId),
  fixed: (side?: FixedSide) => (side ? `/fixed?side=${side}` : '/fixed'),
  fixedMarket: (marketId: string, loanSymbol?: string, collateralSymbols?: (string | undefined)[], maturity?: number) =>
    withSlug(`/fixed/${marketId}`, buildFixedSlug(loanSymbol, collateralSymbols, maturity)),
  portfolio: () => '/portfolio'
};
