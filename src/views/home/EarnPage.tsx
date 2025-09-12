import { useQuery } from '@apollo/client';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';

import {
  Autocomplete,
  Avatar,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { UnfoldMore } from '@mui/icons-material';
import { formatShortUSDS, formatTokenAmount, shortenAddress } from 'utils/formatters';
import { CopyableAddress } from 'components/CopyableAddress';
import { MorphoRequests, SubgraphRequests } from '@/api/constants';
import { Vault, VaultsData } from 'types/vaults';
import { appoloClients } from '@/api/apollo-client';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { useAccount } from 'wagmi';
import { CuratorIcon } from 'components/CuratorIcon';
import { TokenIcon } from 'components/TokenIcon';
import { GetUserPositionsResponse, GetUserPositionsVariables } from 'types/morpho';
import { formatUnits } from 'viem';

type SortableField = 'name' | 'apy' | 'totalAssetsUsd';
type SortOrder = 'asc' | 'desc';
interface MorphoPositionsData {
  marketId: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralBalance: string;
  loanBalance: string;
  collateralDecimal: number;
  loanDecimal: number;
  borrowUsd: string;
  supplyUsd: string;
  borrowApy: string;
}
export default function EarnPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState<SortableField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [symbolFilter, setSymbolFilter] = useState<string[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [assetAddressFilter, setAssetAddressFilter] = useState('');
  const { chainId } = useConfigChainId();
  const { address: userAddress } = useAccount();
  const {
    loading: morphoPositionsLoading,
    error: morphoPositionsError,
    data: morphoPositionsData
  } = useQuery<GetUserPositionsResponse, GetUserPositionsVariables>(MorphoRequests.GetUserPositions, {
    client: appoloClients.morphoApi,
    variables: {
      chainId: chainId,
      address: userAddress || ''
    },
    skip: !userAddress
  });
  const morphoVaultPositions = React.useMemo(() => {
    if (!morphoPositionsData?.userByAddress) return [];

    return morphoPositionsData.userByAddress.vaultPositions;
  }, [morphoPositionsData]);

  const {
    loading: morphoLoading,
    error: morphoError,
    data: morphoData
  } = useQuery<VaultsData>(MorphoRequests.GetVaultsData, {
    client: appoloClients.morphoApi,
    variables: { chainId }
  });

  // Combine data from both sources
  const combinedVaults = React.useMemo(() => {
    if (!morphoData) return [];

    const vaults = [...morphoData.vaults.items];

    // If Morpho data is available without errors, merge it with graph data
    if (morphoData && !morphoError) {
      const morphoVaultMap = new Map();

      // Create a map of Morpho vaults by address for easy lookup
      morphoData.vaults.items.forEach((morphoVault) => {
        morphoVaultMap.set(morphoVault.address.toLowerCase(), morphoVault);
      });

      // Enrich graph data with Morpho data
      return vaults.map((vault) => {
        const morphoVault = morphoVaultMap.get(vault.address.toLowerCase());

        if (morphoVault) {
          return {
            ...vault,
            dailyNetApy: morphoVault.state?.dailyNetApy || 0,
            curators: morphoVault.state?.curators || []
          };
        }

        return vault;
      });
    }

    return vaults;
  }, [morphoData, morphoError]);

  const handleChangePage = (event: React.ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: SelectChangeEvent<number>) => {
    setRowsPerPage(Number(event.target.value));
    setPage(1); // Reset to first page when changing rows per page
  };

  const handleRequestSort = (field: SortableField) => {
    const isAsc = sortField === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortField(field);
    setPage(1); // Reset to first page when sorting
  };

  const handleVaultClick = (vaultAddress: string) => {
    navigate(`/earn/vault/${vaultAddress}`);
  };

  // Get unique symbols from vaults data
  const getUniqueSymbols = (vaults: Vault[]): string[] => {
    const symbolsSet = new Set<string>();
    vaults.forEach((vault) => {
      if (vault.asset?.symbol) {
        symbolsSet.add(vault.asset?.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  const filterAndSortVaults = (vaults: Vault[]): Vault[] => {
    // Filter first
    const filteredVaults = vaults.filter((vault) => {
      // Filter by symbol (match any of selected symbols)
      const symbolMatch = symbolFilter.length === 0 || symbolFilter.includes(vault.asset?.symbol);

      // Filter by name (case insensitive)
      const nameMatch = nameFilter === '' || vault.name.toLowerCase().includes(nameFilter.toLowerCase());

      return symbolMatch && nameMatch;
    });

    // Then sort
    return filteredVaults.sort((a, b) => {
      if (sortField === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else if (sortField === 'apy') {
        const apyA = a.state.dailyNetApy || 0;
        const apyB = b.state.dailyNetApy || 0;
        return sortOrder === 'asc' ? apyA - apyB : apyB - apyA;
      } else if (sortField === 'totalAssetsUsd') {
        const apyA = a.state.totalAssetsUsd || 0;
        const apyB = b.state.totalAssetsUsd || 0;
        return sortOrder === 'asc' ? apyA - apyB : apyB - apyA;
      }
      return 0;
    });
  };

  if (morphoLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (morphoError) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography color="error">Error loading vaults: {morphoError.message}</Typography>
      </Box>
    );
  }

  const filteredAndSortedVaults = filterAndSortVaults(combinedVaults);
  const paginatedVaults = filteredAndSortedVaults.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(filteredAndSortedVaults.length / rowsPerPage);

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      {morphoVaultPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h3" gutterBottom sx={{ marginBottom: 1 }}>
            Your Positions
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="morpho vaults table">
              <TableHead>
                <TableRow>
                  <TableCell>Vault</TableCell>
                  <TableCell>Balance</TableCell>
                  <TableCell>APY</TableCell>
                  <TableCell>Total Deposits (USD)</TableCell>
                  <TableCell>Curators</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {morphoVaultPositions.map((position) => (
                  <TableRow
                    key={position.vault.address}
                    hover
                    onClick={() => navigate(`/earn/vault/${position.vault.address}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TokenIcon symbol={position.vault.asset?.symbol} />
                        {position.vault.name || shortenAddress(position.vault.address)}
                      </Box>
                    </TableCell>

                    <TableCell>
                      {Number(formatUnits(BigInt(position.state.assets), position.vault.asset.decimals)).toFixed(6)} (
                      {Number(position.state.assetsUsd).toFixed(2)} $)
                    </TableCell>
                    <TableCell>{(Number(position.vault.state.avgNetApy) * 100).toFixed(2)} %</TableCell>
                    <TableCell>$ {formatShortUSDS(parseFloat(position.vault.state.totalAssetsUsd))}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {position.vault.state.curators?.map((curator) => (
                          <Box key={curator?.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CuratorIcon symbol={curator?.id} /> {curator.name ? curator.name : curator?.id}
                          </Box>
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Typography variant="h3" gutterBottom sx={{ marginBottom: 3 }}>
        Available Vaults
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            multiple
            id="symbols-filter"
            options={morphoData ? getUniqueSymbols(morphoData.vaults.items) : []}
            value={symbolFilter}
            onChange={(event, newValue) => {
              setSymbolFilter(newValue);
              setPage(1);
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TokenIcon symbol={option} />
                      {option}
                    </Box>
                  }
                  {...getTagProps({ index })}
                  size="small"
                />
              ))
            }
            renderOption={(props, option) => (
              <li {...props} key={option}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TokenIcon symbol={option} />
                  {option}
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Filter By Asset Symbol" placeholder="Select symbols" size="small" fullWidth />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            id="name-filter"
            label="Filter By Name"
            value={nameFilter}
            onChange={(e) => {
              setNameFilter(e.target.value);
              setPage(1);
            }}
            size="small"
            fullWidth
          />
        </Grid>
      </Grid>

      <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="vaults table">
          <TableHead>
            <TableRow>
              <TableCell>
                <Tooltip title="Click to sort by name" arrow>
                  <TableSortLabel
                    active={sortField === 'name'}
                    direction={sortField === 'name' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('name')}
                    IconComponent={sortField === 'name' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Name
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click icon to copy full address">
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>Vault Address</Box>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click icon to copy full address">
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>Asset Address</Box>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by APY" arrow>
                  <TableSortLabel
                    active={sortField === 'apy'}
                    direction={sortField === 'apy' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('apy')}
                    IconComponent={sortField === 'apy' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    APY
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by APY" arrow>
                  <TableSortLabel
                    active={sortField === 'totalAssetsUsd'}
                    direction={sortField === 'totalAssetsUsd' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('totalAssetsUsd')}
                    IconComponent={sortField === 'apy' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Total Deposits (USD)
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>Curators</Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedVaults.map((vault) => (
              <TableRow key={vault.address} hover onClick={() => handleVaultClick(vault.address)} sx={{ cursor: 'pointer' }}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TokenIcon symbol={vault.asset?.symbol} /> {vault.name ? vault.name : shortenAddress(vault.address)}
                  </Box>
                </TableCell>

                <TableCell>
                  <CopyableAddress
                    address={vault.address}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.address);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <CopyableAddress
                    symbol={vault.asset?.symbol}
                    address={vault.asset?.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.address);
                    }}
                  />
                </TableCell>
                <TableCell>{vault.state.dailyNetApy !== undefined ? `${(vault.state.dailyNetApy * 100).toFixed(2)}%` : '-'}</TableCell>
                <TableCell>$ {vault.state.totalAssetsUsd !== undefined ? `${formatShortUSDS(vault.state.totalAssetsUsd)}` : '-'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {vault.state.curators?.map((curator) => (
                      <Box key={curator?.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CuratorIcon symbol={curator?.id} /> {curator.name ? curator.name : curator?.id}
                      </Box>
                    ))}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredAndSortedVaults.length} {filteredAndSortedVaults.length === 1 ? 'vault' : 'vaults'}
          {symbolFilter.length > 0 || nameFilter || assetAddressFilter ? ' (filtered)' : ''}
          {symbolFilter.length > 0 && (
            <span>
              {' '}
              by {symbolFilter.length} {symbolFilter.length === 1 ? 'symbol' : 'symbols'}
            </span>
          )}
          {nameFilter && (
            <span>
              {symbolFilter.length > 0 ? ' and' : ' by'} name "{nameFilter}"
            </span>
          )}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
        <FormControl variant="outlined" size="small">
          <InputLabel id="rows-per-page-label">Rows</InputLabel>
          <Select
            labelId="rows-per-page-label"
            id="rows-per-page"
            value={rowsPerPage}
            onChange={handleChangeRowsPerPage}
            label="Rows"
            sx={{ minWidth: 80 }}
          >
            <MenuItem value={10}>10</MenuItem>
            <MenuItem value={25}>25</MenuItem>
            <MenuItem value={50}>50</MenuItem>
            <MenuItem value={100}>100</MenuItem>
          </Select>
        </FormControl>
        <Pagination count={pageCount} page={page} onChange={handleChangePage} color="primary" size="large" />
      </Box>
    </Box>
  );
}
