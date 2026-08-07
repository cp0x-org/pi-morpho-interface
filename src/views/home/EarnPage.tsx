import { useQuery } from '@apollo/client';
import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { visuallyHidden } from 'utils/a11y';

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
import { formatShortUSDS, shortenAddress } from 'utils/formatters';
import { CopyableAddress } from 'components/CopyableAddress';
import { MorphoRequests } from '@/api/constants';
import { Vault, VaultsData } from 'types/vaults';
import { appoloClients } from '@/api/apollo-client';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { useAccount } from 'wagmi';
import { CuratorIcon } from 'components/CuratorIcon';
import { TokenIcon } from 'components/TokenIcon';
import { GetUserPositionsResponse, GetUserPositionsVariables } from 'types/morpho';
import { ChainIcon } from 'components/ChainIcon';
import { formatUnits } from 'viem';

const toTokenAmount = (raw: string, decimals: number): number =>
  parseFloat(raw || '0') / Math.pow(10, decimals);

const truncateName = (name: string, maxLen = 20): string =>
  name && name.length > maxLen ? `${name.slice(0, maxLen)}...` : name;

type SortableField = 'chain' | 'name' | 'apy' | 'totalAssetsUsd';
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
  const [networkFilter, setNetworkFilter] = useState<string[]>([]);
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
    client: appoloClients.morphoApi
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

  const handleVaultClick = (vaultAddress: string, chainId?: number) => {
    navigate(`/earn/vault/${vaultAddress}${chainId ? `?chainId=${chainId}` : ''}`);
  };

  const getUniqueNetworks = (vaults: Vault[]): string[] => {
    const set = new Set<string>();
    vaults.forEach((v) => { if (v.chain?.network) set.add(v.chain.network); });
    return Array.from(set).sort();
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
    const filteredVaults = vaults.filter((vault) => {
      if (vault.address == '0x7f838C4c70B841A4979aF44053c8965f4694F9E5') return false;
      if (!vault.state) return false;
      const networkMatch = networkFilter.length === 0 || networkFilter.includes(vault.chain?.network);
      const symbolMatch = symbolFilter.length === 0 || symbolFilter.includes(vault.asset?.symbol);
      const nameMatch = nameFilter === '' || vault.name?.toLowerCase().includes(nameFilter.toLowerCase());
      return networkMatch && symbolMatch && nameMatch;
    });

    return filteredVaults.sort((a, b) => {
      if (sortField === 'chain') {
        return sortOrder === 'asc' ? (a.chain?.id ?? 0) - (b.chain?.id ?? 0) : (b.chain?.id ?? 0) - (a.chain?.id ?? 0);
      } else if (sortField === 'name') {
        return sortOrder === 'asc' ? (a.name ?? '').localeCompare(b.name ?? '') : (b.name ?? '').localeCompare(a.name ?? '');
      } else if (sortField === 'apy') {
        const apyA = a.state?.dailyNetApy ?? 0;
        const apyB = b.state?.dailyNetApy ?? 0;
        return sortOrder === 'asc' ? apyA - apyB : apyB - apyA;
      } else if (sortField === 'totalAssetsUsd') {
        const totA = a.state?.totalAssetsUsd ?? 0;
        const totB = b.state?.totalAssetsUsd ?? 0;
        return sortOrder === 'asc' ? totA - totB : totB - totA;
      }
      return 0;
    });
  };

  if (morphoLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label="Loading vaults" />
      </Box>
    );
  }

  if (morphoError) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          Error loading vaults: {morphoError.message}
        </Typography>
      </Box>
    );
  }

  const filteredAndSortedVaults = filterAndSortVaults(combinedVaults);
  const paginatedVaults = filteredAndSortedVaults.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(filteredAndSortedVaults.length / rowsPerPage);

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      <Box component="h1" sx={visuallyHidden}>
        Earn: Morpho vaults
      </Box>
      {morphoVaultPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h3" component="h2" gutterBottom sx={{ marginBottom: 1 }}>
            Your Positions
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label="Your vault positions">
              <TableHead>
                <TableRow>
                  <TableCell>Vault</TableCell>
                  <TableCell>Balance</TableCell>
                  <TableCell>APY</TableCell>
                  <TableCell>Total Deposits</TableCell>
                  <TableCell>Curators</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {morphoVaultPositions.map((position) => (
                  <TableRow
                    key={position.vault.address}
                    hover
                    onClick={() => handleVaultClick(position.vault.address)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TokenIcon symbol={position.vault.asset?.symbol} />
                        <Link
                          component={RouterLink}
                          to={`/earn/vault/${position.vault.address}`}
                          color="inherit"
                          underline="none"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open vault ${position.vault.name || shortenAddress(position.vault.address)}`}
                        >
                          <Tooltip
                            title={position.vault.name || ''}
                            arrow
                            disableHoverListener={!position.vault.name || position.vault.name.length <= 40}
                          >
                            <span>{truncateName(position.vault.name) || shortenAddress(position.vault.address)}</span>
                          </Tooltip>
                        </Link>
                      </Box>
                    </TableCell>

                    <TableCell>
                      {Number(formatUnits(BigInt(position.state.assets), position.vault.asset.decimals)).toFixed(6)} (
                      {Number(position.state.assetsUsd).toFixed(2)} $)
                    </TableCell>
                    <TableCell>{(Number(position.vault.state.avgNetApy) * 100).toFixed(2)} %</TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">
                          {formatShortUSDS(toTokenAmount(position.vault.state.totalAssets, position.vault.asset.decimals))} {position.vault.asset.symbol}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          ${formatShortUSDS(position.vault.state.totalAssetsUsd || 0)}
                        </Typography>
                      </Box>
                    </TableCell>
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

      <Typography variant="h3" component="h2" gutterBottom sx={{ marginBottom: 3 }}>
        Available Vaults
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            multiple
            id="network-filter"
            options={morphoData ? getUniqueNetworks(morphoData.vaults.items) : []}
            value={networkFilter}
            onChange={(event, newValue) => {
              setNetworkFilter(newValue);
              setPage(1);
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip label={option} {...getTagProps({ index })} size="small" />)
            }
            renderInput={(params) => <TextField {...params} label="Filter By Network" placeholder="Select networks" size="small" fullWidth />}
            size="small"
            fullWidth
          />
        </Grid>
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
        <Table sx={{ minWidth: 650 }} aria-label="Available vaults">
          <TableHead>
            <TableRow>
              <TableCell sortDirection={sortField === 'chain' ? sortOrder : false}>
                <Tooltip title="Click to sort by network" arrow describeChild>
                  <TableSortLabel
                    active={sortField === 'chain'}
                    direction={sortField === 'chain' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('chain')}
                    IconComponent={sortField === 'chain' ? undefined : UnfoldMore}
                    sx={{ '.MuiTableSortLabel-icon': { opacity: 1, visibility: 'visible' } }}
                  >
                    Network
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'name' ? sortOrder : false}>
                <Tooltip title="Click to sort by name" arrow describeChild>
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
                <Tooltip title="Click icon to copy full address" describeChild>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>Vault Address</Box>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click icon to copy full address" describeChild>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>Asset Address</Box>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'apy' ? sortOrder : false}>
                <Tooltip title="Click to sort by APY" arrow describeChild>
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
              <TableCell sortDirection={sortField === 'totalAssetsUsd' ? sortOrder : false}>
                <Tooltip title="Click to sort by APY" arrow describeChild>
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
              <TableRow key={vault.address} hover onClick={() => handleVaultClick(vault.address, vault.chain?.id)} sx={{ cursor: 'pointer' }}>
                <TableCell>{vault.chain?.id ? <ChainIcon chainId={vault.chain.id} /> : '-'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TokenIcon symbol={vault.asset?.symbol} />
                    <Link
                      component={RouterLink}
                      to={`/earn/vault/${vault.address}${vault.chain?.id ? `?chainId=${vault.chain.id}` : ''}`}
                      color="inherit"
                      underline="none"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open vault ${vault.name || shortenAddress(vault.address)}`}
                    >
                      <Tooltip title={vault.name || ''} arrow disableHoverListener={!vault.name || vault.name.length <= 40}>
                        <span>{vault.name ? truncateName(vault.name) : shortenAddress(vault.address)}</span>
                      </Tooltip>
                    </Link>
                  </Box>
                </TableCell>

                <TableCell>
                  <CopyableAddress
                    address={vault.address}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.address, vault.chain?.id);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <CopyableAddress
                    symbol={vault.asset?.symbol}
                    address={vault.asset?.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.address, vault.chain?.id);
                    }}
                  />
                </TableCell>
                <TableCell>{vault.state?.dailyNetApy != null ? `${(vault.state.dailyNetApy * 100).toFixed(2)}%` : '-'}</TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2">
                      {vault.state?.totalAssets != null
                        ? `${formatShortUSDS(toTokenAmount(vault.state.totalAssets, vault.asset.decimals))} ${vault.asset.symbol}`
                        : '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {vault.state?.totalAssetsUsd != null ? `$${formatShortUSDS(vault.state.totalAssetsUsd)}` : '-'}
                    </Typography>
                  </Box>
                </TableCell>
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
        <Typography variant="body2" color="text.secondary" role="status">
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
        <Pagination count={pageCount} page={page} onChange={handleChangePage} color="primary" size="large" aria-label="Vaults pagination" />
      </Box>
    </Box>
  );
}
