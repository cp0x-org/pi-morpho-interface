import { useQuery } from '@tanstack/react-query';

import { appoloClients } from '@/api/apollo-client';
import { MorphoRequests } from '@/api/constants';
import { Vault, VaultsV2Data } from 'types/vaults';
import { normalizeVaultV2 } from 'utils/vaults';

// The API caps query complexity at 1M; a V2 page with curators costs ~4.5k per vault, so 100 per page stays well under.
const PAGE_SIZE = 100;
// Listed vaults are a few hundred. Unlisted ones run into the thousands (mostly test deployments), so they stop at
// the same 1000-vault cap the V1 query has.
const MAX_PAGES = 10;

export const fetchVaultsV2 = async (includeUnlisted: boolean): Promise<Vault[]> => {
  const items: Vault[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await appoloClients.morphoApi.query<VaultsV2Data>({
      query: MorphoRequests.GetVaultsV2Data,
      variables: { first: PAGE_SIZE, skip: page * PAGE_SIZE, listed: includeUnlisted ? null : true },
      fetchPolicy: 'network-only'
    });
    const batch = data.vaultV2s.items;
    items.push(...batch.map(normalizeVaultV2));
    if (batch.length < PAGE_SIZE) break;
  }
  return items;
};

/** Morpho Vaults V2 (listed by default), normalized to the V1 `Vault` shape (`version: 'v2'`). */
export const useVaultsV2 = ({ includeUnlisted = false }: { includeUnlisted?: boolean } = {}) =>
  useQuery({
    queryKey: ['morpho', 'vaultsV2', { includeUnlisted }],
    queryFn: () => fetchVaultsV2(includeUnlisted),
    staleTime: 60_000
  });
