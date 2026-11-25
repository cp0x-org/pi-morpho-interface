import { useQuery } from '@tanstack/react-query';
import { fetchVaults } from '@/api/morphoRest';

export const useVaultsV2 = () => useQuery({
  queryKey: ['morpho', 'vaultsV2'],
  queryFn: () => fetchVaults('v2'),
  staleTime: 5 * 60_000,
  retry: 1
});
