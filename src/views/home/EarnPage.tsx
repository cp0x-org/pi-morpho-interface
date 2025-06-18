import { useQuery, gql } from '@apollo/client';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { useConfigChainId } from 'hooks/useConfigChainId';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  CircularProgress,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TableSortLabel,
  TextField,
  Grid,
  Tooltip,
  Autocomplete,
  Chip,
  SelectChangeEvent
} from '@mui/material';
import { UnfoldMore, ContentCopy } from '@mui/icons-material';
import { shortenAddress } from 'utils/formatters';
import { VaultsData, Vault } from 'types/vaults';
import { useSnackbar } from 'notistack';

const GET_VAULTS = gql`
  query GetVaults($chainId: Int!) {
    vaults(where: { chainId_in: [$chainId], whitelisted: true }, first: 1000) {
      items {
        address
        symbol
        name
        whitelisted
        asset {
          id
          address
          decimals
          name
          symbol
        }
        chain {
          id
          network
        }
        state {
          dailyNetApy
        }
      }
    }
  }
`;

type SortableField = 'name' | 'apy';
type SortOrder = 'asc' | 'desc';

// Component for address with copy functionality
interface CopyableAddressProps {
  address: string;
  onClick?: (e: React.MouseEvent) => void;
}

const CopyableAddress = ({ address, onClick }: CopyableAddressProps) => {
  const { enqueueSnackbar } = useSnackbar();

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    navigator.clipboard
      .writeText(address)
      .then(() => {
        enqueueSnackbar('Address copied to clipboard!', {
          variant: 'success',
          autoHideDuration: 2000
        });
      })
      .catch((err) => {
        console.error('Failed to copy address:', err);
        enqueueSnackbar('Failed to copy address', {
          variant: 'error'
        });
      });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        '&:hover .copy-icon': {
          opacity: 1
        }
      }}
      onClick={onClick}
    >
      <Typography component="span">{shortenAddress(address)}</Typography>
      <Tooltip title="Copy full address">
        <ContentCopy
          fontSize="small"
          onClick={copyToClipboard}
          sx={{
            ml: 1,
            cursor: 'pointer',
            opacity: 0.3,
            transition: 'opacity 0.2s',
            '&:hover': {
              opacity: 1
            }
          }}
          className="copy-icon"
        />
      </Tooltip>
    </Box>
  );
};

export default function EarnPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortableField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [symbolFilter, setSymbolFilter] = useState<string[]>([]);
  const [assetAddressFilter, setAssetAddressFilter] = useState('');
  const { chainId } = useConfigChainId();

  const { loading, error, data } = useQuery<VaultsData>(GET_VAULTS, {
    variables: { chainId }
  });

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
      if (vault.asset.symbol) {
        symbolsSet.add(vault.asset.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  const filterAndSortVaults = (vaults: Vault[]): Vault[] => {
    // Filter first
    const filteredVaults = vaults.filter((vault) => {
      // Filter by symbol (match any of selected symbols)
      const symbolMatch = symbolFilter.length === 0 || symbolFilter.includes(vault.asset.symbol);

      // Filter by asset address (case insensitive)
      const addressMatch = assetAddressFilter
        ? vault.asset.address.toLowerCase().includes(assetAddressFilter.toLowerCase()) ||
          shortenAddress(vault.asset.address).toLowerCase().includes(assetAddressFilter.toLowerCase())
        : true;

      return symbolMatch && addressMatch;
    });

    // Then sort
    return filteredVaults.sort((a, b) => {
      if (sortField === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      } else if (sortField === 'apy') {
        return sortOrder === 'asc' ? a.state.dailyNetApy - b.state.dailyNetApy : b.state.dailyNetApy - a.state.dailyNetApy;
      }
      return 0;
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography color="error">Error loading vaults: {error.message}</Typography>
      </Box>
    );
  }

  const filteredAndSortedVaults = filterAndSortVaults(data?.vaults.items || []);
  const paginatedVaults = filteredAndSortedVaults.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(filteredAndSortedVaults.length / rowsPerPage);

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      <Typography variant="h4" gutterBottom sx={{ marginBottom: 1 }}>
        Available Vaults
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: 2 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Autocomplete
            multiple
            id="symbols-filter"
            options={data ? getUniqueSymbols(data.vaults.items) : []}
            value={symbolFilter}
            onChange={(event, newValue) => {
              setSymbolFilter(newValue);
              setPage(1); // Reset to first page when filtering
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip label={option} {...getTagProps({ index })} key={option} size="small" />)
            }
            renderInput={(params) => (
              <TextField {...params} label="Filter By Asset Symbol" placeholder="Select symbols" size="small" fullWidth />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            fullWidth
            label="Filter By Asset Address"
            variant="outlined"
            value={assetAddressFilter}
            onChange={(e) => {
              setAssetAddressFilter(e.target.value);
              setPage(1); // Reset to first page when filtering
            }}
            size="small"
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
              <TableCell>Symbol</TableCell>
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
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedVaults.map((vault) => (
              <TableRow key={vault.address} hover onClick={() => handleVaultClick(vault.address)} sx={{ cursor: 'pointer' }}>
                <TableCell>{vault.name}</TableCell>
                <TableCell>{vault.asset.symbol}</TableCell>
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
                    address={vault.asset.address}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVaultClick(vault.address);
                    }}
                  />
                </TableCell>
                <TableCell>{(vault.state.dailyNetApy * 100).toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Showing {filteredAndSortedVaults.length} {filteredAndSortedVaults.length === 1 ? 'vault' : 'vaults'}
          {symbolFilter.length > 0 || assetAddressFilter ? ' (filtered)' : ''}
          {symbolFilter.length > 0 && (
            <span>
              {' '}
              by {symbolFilter.length} {symbolFilter.length === 1 ? 'symbol' : 'symbols'}
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
            <MenuItem value={5}>5</MenuItem>
            <MenuItem value={10}>10</MenuItem>
            <MenuItem value={25}>25</MenuItem>
            <MenuItem value={50}>50</MenuItem>
          </Select>
        </FormControl>
        <Pagination count={pageCount} page={page} onChange={handleChangePage} color="primary" size="large" />
      </Box>
    </Box>
  );
}
