import { useQuery } from '@tanstack/react-query';

import { appoloClients } from '@/api/apollo-client';
import { MorphoRequests } from '@/api/constants';
import { Vault, VaultsV2Data } from 'types/vaults';
import { normalizeVaultV2 } from 'utils/vaults';

// The API caps query complexity at 1M; a V2 page with curators costs ~4.5k per vault, so 100 per page stays well under.
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export const fetchVaultsV2 = async (): Promise<Vault[]> => {
  const items: Vault[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await appoloClients.morphoApi.query<VaultsV2Data>({
      query: MorphoRequests.GetVaultsV2Data,
      variables: { first: PAGE_SIZE, skip: page * PAGE_SIZE },
      fetchPolicy: 'network-only'
    });
    const batch = data.vaultV2s.items;
    items.push(...batch.map(normalizeVaultV2));
    if (batch.length < PAGE_SIZE) break;
  }
  return items;
};

/** All listed Morpho Vaults V2, normalized to the V1 `Vault` shape (`version: 'v2'`). */
export const useVaultsV2 = () =>
  useQuery({
    queryKey: ['morpho', 'vaultsV2'],
    queryFn: fetchVaultsV2,
    staleTime: 60_000
  });
