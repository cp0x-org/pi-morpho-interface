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
import { formatTokenAmount, shortenAddress } from 'utils/formatters';
import { MetaMorpho, MetaMorphoPositionsQueryResponse, MetaMorphosQueryResponse } from 'types/metamorphos';
import { CopyableAddress } from 'components/CopyableAddress';
import { MorphoRequests, SubgraphRequests } from '@/api/constants';
import { VaultsData } from 'types/vaults';
import { appoloClients } from '@/api/apollo-client';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { useAccount } from 'wagmi';

type SortableField = 'name' | 'apy';
type SortOrder = 'asc' | 'desc';

// Component for displaying token icons
interface TokenIconProps {
  symbol: string;
}

const TokenIcon = ({ symbol }: TokenIconProps) => {
  const normalizedSymbol = symbol.toLowerCase();
  const iconUrl = `/tokens/${normalizedSymbol}.svg`;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar
        src={iconUrl}
        alt={`${symbol} icon`}
        sx={{ width: 24, height: 24 }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </Box>
  );
};

const CuratorIcon = ({ symbol }: TokenIconProps) => {
  const normalizedSymbol = symbol.toLowerCase();
  const [iconUrl, setIconUrl] = useState(`/curators/${normalizedSymbol}.svg`);
  const [triedPng, setTriedPng] = useState(false);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!triedPng) {
      // попробуем png, если svg не загрузился
      setIconUrl(`/curators/${normalizedSymbol}.png`);
      setTriedPng(true);
    } else {
      // если и png не загрузился — скрыть
      (e.target as HTMLImageElement).style.display = 'none';
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Avatar src={iconUrl} alt={`${symbol} icon`} sx={{ width: 24, height: 24 }} onError={handleError} />
    </Box>
  );
};

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
    loading: positionsLoading,
    error: positionsError,
    data: positionsData
  } = useQuery<MetaMorphoPositionsQueryResponse>(SubgraphRequests.GetMetamorphoPositions, {
    variables: { account: userAddress }
  });

  const { loading: graphLoading, error: graphError, data: graphData } = useQuery<MetaMorphosQueryResponse>(SubgraphRequests.GetMetaMorphos);
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
    if (!graphData) return [];

    const vaults = [...graphData.metaMorphos];

    // If Morpho data is available without errors, merge it with graph data
    if (morphoData && !morphoError) {
      const morphoVaultMap = new Map();

      // Create a map of Morpho vaults by address for easy lookup
      morphoData.vaults.items.forEach((morphoVault) => {
        morphoVaultMap.set(morphoVault.address.toLowerCase(), morphoVault);
      });

      // Enrich graph data with Morpho data
      return vaults.map((vault) => {
        const morphoVault = morphoVaultMap.get(vault.id.toLowerCase());

        if (morphoVault) {
          return {
            ...vault,
            dailyNetApy: morphoVault.state.dailyNetApy,
            curators: morphoVault.state.curators
          };
        }

        return vault;
      });
    }

    return vaults;
  }, [graphData, morphoData, morphoError]);

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
  const getUniqueSymbols = (vaults: MetaMorpho[]): string[] => {
    const symbolsSet = new Set<string>();
    vaults.forEach((vault) => {
      if (vault.asset.symbol) {
        symbolsSet.add(vault.asset.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  const filterAndSortVaults = (vaults: MetaMorpho[]): MetaMorpho[] => {
    // Filter first
    const filteredVaults = vaults.filter((vault) => {
      // Filter by symbol (match any of selected symbols)
      const symbolMatch = symbolFilter.length === 0 || symbolFilter.includes(vault.asset.symbol);

      // Filter by name (case insensitive)
      const nameMatch = nameFilter === '' || vault.name.toLowerCase().includes(nameFilter.toLowerCase());

      return symbolMatch && nameMatch;
    });

    // Then sort
    return filteredVaults.sort((a, b) => {
      if (sortField === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else if (sortField === 'apy') {
        const apyA = a.dailyNetApy || 0;
        const apyB = b.dailyNetApy || 0;
        return sortOrder === 'asc' ? apyA - apyB : apyB - apyA;
      }
      return 0;
    });
  };

  if (graphLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (graphError) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography color="error">Error loading vaults: {graphError.message}</Typography>
      </Box>
    );
  }

  const filteredAndSortedVaults = filterAndSortVaults(combinedVaults);
  const paginatedVaults = filteredAndSortedVaults.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(filteredAndSortedVaults.length / rowsPerPage);

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      {positionsData?.metaMorphoPositions && positionsData.metaMorphoPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ marginBottom: 1 }}>
            Your Positions
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="positions table">
              <TableHead>
                <TableRow>
                  <TableCell>Vault</TableCell>
                  <TableCell>Balance</TableCell>
                  <TableCell>USD Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {positionsData.metaMorphoPositions.map((position) => (
                  <TableRow key={position.id} hover onClick={() => handleVaultClick(position.metaMorpho.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {position.metaMorpho.asset && <TokenIcon symbol={position.metaMorpho.asset.symbol} />}
                        {position.metaMorpho.name || shortenAddress(position.metaMorpho.id)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {formatTokenAmount(position.lastAssetsBalance, position.metaMorpho.asset.decimals)} {position.metaMorpho.asset.symbol}
                    </TableCell>
                    <TableCell>${parseFloat(position.lastAssetsBalanceUSD).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Typography variant="h4" gutterBottom sx={{ marginBottom: 1 }}>
        Available Vaults
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: 2 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Autocomplete
            multiple
            id="symbols-filter"
            options={graphData ? getUniqueSymbols(graphData.metaMorphos) : []}
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
        <Grid size={{ xs: 12, md: 3 }}>
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
                <Box sx={{ display: 'flex', alignItems: 'center' }}>Curators</Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedVaults.map((vault) => (
              <TableRow key={vault.id} hover onClick={() => handleVaultClick(vault.id)} sx={{ cursor: 'pointer' }}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TokenIcon symbol={vault.asset.symbol} /> {vault.name ? vault.name : shortenAddress(vault.id)}
                  </Box>
                </TableCell>

                <TableCell>
                  <CopyableAddress
                    address={vault.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.id);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <CopyableAddress
                    symbol={vault.asset.symbol}
                    address={vault.asset.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.id);
                    }}
                  />
                </TableCell>
                <TableCell>{vault.dailyNetApy !== undefined ? `${(vault.dailyNetApy * 100).toFixed(2)}%` : '-'}</TableCell>
                {/*<TableCell>{vault.curators?.map((curator) => <Box key={curator.address}>{curator.name}</Box>)}</TableCell>*/}
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {vault.curators?.map((curator) => (
                      <Box key={curator.address} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CuratorIcon symbol={curator.id} /> {curator.name ? curator.name : curator.id}
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
