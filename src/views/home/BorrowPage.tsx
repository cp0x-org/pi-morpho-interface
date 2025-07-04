import { useQuery, gql } from '@apollo/client';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
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
  Tooltip,
  Grid,
  TextField,
  Autocomplete,
  Chip,
  SelectChangeEvent,
  Avatar
} from '@mui/material';
import { UnfoldMore } from '@mui/icons-material';
import { useConfigChainId } from 'hooks/useConfigChainId';

const GET_MARKETS = gql`
  query GetMarkets($chainId: Int!) {
    markets(where: { chainId_in: [$chainId], whitelisted: true }, first: 1000) {
      items {
        uniqueKey
        lltv
        oracleAddress
        irmAddress
        loanAsset {
          address
          symbol
          decimals
        }
        collateralAsset {
          address
          symbol
          decimals
        }
        state {
          dailyNetBorrowApy
          dailyNetSupplyApy
          fee
          utilization
        }
      }
    }
  }
`;

interface MarketState {
  dailyNetBorrowApy: number;
  dailyNetSupplyApy: number;
  fee: number;
  utilization: number;
}

interface Asset {
  address: string;
  symbol: string;
  decimals: number;
}

interface Market {
  uniqueKey: string;
  lltv: string;
  oracleAddress: string;
  irmAddress: string;
  loanAsset: Asset;
  collateralAsset: Asset;
  state: MarketState;
}

interface MarketsData {
  markets: {
    items: Market[];
  };
}

type SortableField = 'loanAsset' | 'collateralAsset' | 'lltv' | 'utilization' | 'borrowApy' | 'supplyApy';
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

export default function BorrowPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState<SortableField>('borrowApy');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [loanAssetSymbolFilter, setLoanAssetSymbolFilter] = useState<string[]>([]);
  const [collateralAssetSymbolFilter, setCollateralAssetSymbolFilter] = useState<string[]>([]);
  const { chainId } = useConfigChainId();

  const { loading, error, data } = useQuery<MarketsData>(GET_MARKETS, {
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
    // Default to descending for APY fields since users typically want to see highest APYs first
    if ((field === 'borrowApy' || field === 'supplyApy') && sortField !== field) {
      setSortOrder('desc');
    } else {
      setSortOrder(isAsc ? 'desc' : 'asc');
    }
    setSortField(field);
    setPage(1); // Reset to first page when sorting
  };

  // Format LLTV to percentage
  const formatLLTV = (lltv: string) => {
    if (!lltv) return 'N/A';
    try {
      const lltvNumber = parseFloat(lltv) / 1e18;
      return `${(lltvNumber * 100).toFixed(2)}%`;
    } catch (e) {
      console.error(e);
      return 'N/A';
    }
  };

  // Get LLTV as number for sorting
  const getLLTVAsNumber = (lltv: string): number => {
    if (!lltv) return 0;
    try {
      return parseFloat(lltv) / 1e18;
    } catch (e) {
      console.error(e);
      return 0;
    }
  };

  // Get unique loan asset symbols
  const getUniqueLoanAssetSymbols = (markets: Market[]): string[] => {
    const symbolsSet = new Set<string>();
    markets.forEach((market) => {
      if (market.loanAsset?.symbol) {
        symbolsSet.add(market.loanAsset.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  // Get unique collateral asset symbols
  const getUniqueCollateralAssetSymbols = (markets: Market[]): string[] => {
    const symbolsSet = new Set<string>();
    markets.forEach((market) => {
      if (market.collateralAsset?.symbol) {
        symbolsSet.add(market.collateralAsset.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  const sortMarkets = (markets: Market[]): Market[] => {
    // Filter out markets with missing required fields and apply symbol filters
    const filteredMarkets = markets.filter((market) => {
      // Basic validation
      if (!market.lltv || !market.collateralAsset || !market.loanAsset) {
        return false;
      }

      // Apply loan asset symbol filter
      const loanAssetMatch = loanAssetSymbolFilter.length === 0 || loanAssetSymbolFilter.includes(market.loanAsset.symbol);

      // Apply collateral asset symbol filter
      const collateralAssetMatch =
        collateralAssetSymbolFilter.length === 0 || collateralAssetSymbolFilter.includes(market.collateralAsset.symbol);

      return loanAssetMatch && collateralAssetMatch;
    });

    return [...filteredMarkets].sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;

      switch (sortField) {
        case 'loanAsset':
          return multiplier * (a.loanAsset?.symbol || '').localeCompare(b.loanAsset?.symbol || '');

        case 'collateralAsset':
          return multiplier * (a.collateralAsset?.symbol || '').localeCompare(b.collateralAsset?.symbol || '');

        case 'lltv':
          return multiplier * (getLLTVAsNumber(a.lltv) - getLLTVAsNumber(b.lltv));

        case 'utilization':
          return multiplier * ((a.state?.utilization || 0) - (b.state?.utilization || 0));

        case 'borrowApy':
          return multiplier * ((a.state?.dailyNetBorrowApy || 0) - (b.state?.dailyNetBorrowApy || 0));

        case 'supplyApy':
          return multiplier * ((a.state?.dailyNetSupplyApy || 0) - (b.state?.dailyNetSupplyApy || 0));

        default:
          return 0;
      }
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
        <Typography color="error">Error loading markets: {error.message}</Typography>
      </Box>
    );
  }

  const markets = sortMarkets(data?.markets?.items || []);
  const paginatedMarkets = markets.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(markets.length / rowsPerPage);

  // Show a message if there are no markets
  if (markets.length === 0) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography>No markets available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      <Typography variant="h4" gutterBottom sx={{ marginBottom: 1 }}>
        Available Markets
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: 2 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Autocomplete
            multiple
            id="loan-asset-symbols-filter"
            options={data ? getUniqueLoanAssetSymbols(data.markets.items) : []}
            value={loanAssetSymbolFilter}
            onChange={(event, newValue) => {
              setLoanAssetSymbolFilter(newValue);
              setPage(1); // Reset to first page when filtering
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
            renderInput={(params) => <TextField {...params} label="Filter By Loan" placeholder="Select symbols" size="small" fullWidth />}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Autocomplete
            multiple
            id="collateral-asset-symbols-filter"
            options={data ? getUniqueCollateralAssetSymbols(data.markets.items) : []}
            value={collateralAssetSymbolFilter}
            onChange={(event, newValue) => {
              setCollateralAssetSymbolFilter(newValue);
              setPage(1); // Reset to first page when filtering
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip label={option} {...getTagProps({ index })} key={option} size="small" />)
            }
            renderInput={(params) => (
              <TextField {...params} label="Filter By Collateral" placeholder="Select symbols" size="small" fullWidth />
            )}
            size="small"
            fullWidth
          />
        </Grid>
      </Grid>

      <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="markets table">
          <TableHead>
            <TableRow>
              <TableCell>
                <Tooltip title="Click to sort by loan asset" arrow>
                  <TableSortLabel
                    active={sortField === 'loanAsset'}
                    direction={sortField === 'loanAsset' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('loanAsset')}
                    IconComponent={sortField === 'loanAsset' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Loan Asset
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by collateral asset" arrow>
                  <TableSortLabel
                    active={sortField === 'collateralAsset'}
                    direction={sortField === 'collateralAsset' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('collateralAsset')}
                    IconComponent={sortField === 'collateralAsset' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Collateral Asset
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by LLTV" arrow>
                  <TableSortLabel
                    active={sortField === 'lltv'}
                    direction={sortField === 'lltv' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('lltv')}
                    IconComponent={sortField === 'lltv' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    LLTV
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by utilization" arrow>
                  <TableSortLabel
                    active={sortField === 'utilization'}
                    direction={sortField === 'utilization' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('utilization')}
                    IconComponent={sortField === 'utilization' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Utilization
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by borrow Rate" arrow>
                  <TableSortLabel
                    active={sortField === 'borrowApy'}
                    direction={sortField === 'borrowApy' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('borrowApy')}
                    IconComponent={sortField === 'borrowApy' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Borrow Rate
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title="Click to sort by supply APY" arrow>
                  <TableSortLabel
                    active={sortField === 'supplyApy'}
                    direction={sortField === 'supplyApy' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('supplyApy')}
                    IconComponent={sortField === 'supplyApy' ? undefined : UnfoldMore}
                    sx={{
                      '.MuiTableSortLabel-icon': {
                        opacity: 1,
                        visibility: 'visible'
                      }
                    }}
                  >
                    Supply APY
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedMarkets.map((market) => (
              <TableRow
                key={market.uniqueKey}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/borrow/market/${market.uniqueKey}`)}
              >
                <TableCell>
                  {market.loanAsset?.symbol ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TokenIcon symbol={market.loanAsset.symbol} /> {market.loanAsset.symbol}
                    </Box>
                  ) : (
                    'N/A'
                  )}
                </TableCell>

                <TableCell>{market.collateralAsset?.symbol || 'N/A'}</TableCell>
                <TableCell>{formatLLTV(market.lltv)}</TableCell>
                <TableCell>{`${((market.state?.utilization || 0) * 100).toFixed(2)}%`}</TableCell>
                <TableCell>{((market.state?.dailyNetBorrowApy || 0) * 100).toFixed(2)}%</TableCell>
                <TableCell>{((market.state?.dailyNetSupplyApy || 0) * 100).toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Showing {markets.length} {markets.length === 1 ? 'market' : 'markets'}
          {loanAssetSymbolFilter.length > 0 || collateralAssetSymbolFilter.length > 0 ? ' (filtered)' : ''}
          {loanAssetSymbolFilter.length > 0 && (
            <span>
              {' '}
              by {loanAssetSymbolFilter.length} loan {loanAssetSymbolFilter.length === 1 ? 'symbol' : 'symbols'}
            </span>
          )}
          {collateralAssetSymbolFilter.length > 0 && (
            <span>
              {loanAssetSymbolFilter.length > 0 ? ' and ' : ' by '}
              {collateralAssetSymbolFilter.length} collateral {collateralAssetSymbolFilter.length === 1 ? 'symbol' : 'symbols'}
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
