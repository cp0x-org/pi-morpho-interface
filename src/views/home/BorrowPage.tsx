import { useQuery } from '@apollo/client';
import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { visuallyHidden } from 'utils/a11y';
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
  SelectChangeEvent
} from '@mui/material';
import { UnfoldMore } from '@mui/icons-material';
import { MorphoRequests } from '@/api/constants';
import { useAccount } from 'wagmi';
import { TokenIcon } from 'components/TokenIcon';
import { GetUserPositionsResponse, GetUserPositionsVariables } from 'types/morpho';
import { appoloClients } from '@/api/apollo-client';
import { DECIMALS_SCALE_FACTOR, formatTokenAmount, formatShortUSDS } from 'utils/formatters';
import { MarketData, MarketInterface } from 'types/market';
import { ChainIcon } from 'components/ChainIcon';
import { FormattedMessage, useIntl } from 'react-intl';

type SortableField =
  | 'chain'
  | 'loanAsset'
  | 'collateralAsset'
  | 'lltv'
  | 'utilization'
  | 'borrowApy'
  | 'supplyApy'
  | 'sizeUsd'
  | 'totalLiquidityUsd';
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
export default function BorrowPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState<SortableField>('borrowApy');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [networkFilter, setNetworkFilter] = useState<string[]>([]);
  const [loanAssetSymbolFilter, setLoanAssetSymbolFilter] = useState<string[]>([]);
  const [collateralAssetSymbolFilter, setCollateralAssetSymbolFilter] = useState<string[]>([]);

  const { address: userAddress, chain } = useAccount();

  const {
    loading: morphoPositionsLoading,
    error: morphoPositionsError,
    data: morphoPositionsData
  } = useQuery<GetUserPositionsResponse, GetUserPositionsVariables>(MorphoRequests.GetUserPositions, {
    client: appoloClients.morphoApi,
    variables: {
      chainId: Number(chain?.id || 1),
      address: userAddress || ''
    },
    skip: !userAddress
  });

  // Process Morpho positions data
  const morphoPositions = React.useMemo<MorphoPositionsData[]>(() => {
    if (!morphoPositionsData?.userByAddress) return [];

    return morphoPositionsData.userByAddress.marketPositions.map((position) => {
      return {
        marketId: position.market.marketId,
        collateralSymbol: position.market.collateralAsset?.symbol,
        loanSymbol: position.market.loanAsset?.symbol,
        collateralBalance: position.state.collateral || '0',
        loanBalance: position.state.borrowAssets || '0',
        collateralDecimal: position.market.collateralAsset.decimals,
        loanDecimal: position.market.loanAsset.decimals,
        borrowUsd: position.state.borrowAssetsUsd || '0',
        supplyUsd: position.state.supplyAssetsUsd || '0',
        borrowApy: position.market.state.borrowApy || '0'
      };
    });
  }, [morphoPositionsData]);

  const {
    loading: graphLoading,
    error: graphError,
    data: graphData
  } = useQuery<MarketData>(MorphoRequests.GetMorphoMarkets, {
    client: appoloClients.morphoApi
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

  const toTokenAmount = (raw: string, decimals: number): number => parseFloat(raw || '0') / Math.pow(10, decimals);

  // Format LLTV to percentage
  const formatLLTV = (lltv: string) => {
    if (!lltv) return intl.formatMessage({ id: 'common.na' });
    try {
      const lltvNumber = parseFloat(lltv) / 1e18;
      return `${(lltvNumber * 100).toFixed(2)}%`;
    } catch (e) {
      console.error(e);
      return intl.formatMessage({ id: 'common.na' });
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

  const getUniqueNetworks = (markets: MarketInterface[]): string[] => {
    const set = new Set<string>();
    markets.forEach((m) => {
      if (m.chain?.network) set.add(m.chain.network);
    });
    return Array.from(set).sort();
  };

  // Get unique loan asset symbols
  const getUniqueLoanAssetSymbols = (markets: MarketInterface[]): string[] => {
    const symbolsSet = new Set<string>();
    markets.forEach((market) => {
      if (market.loanAsset?.symbol) {
        symbolsSet.add(market.loanAsset?.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  // Get unique collateral asset symbols
  const getUniqueCollateralAssetSymbols = (markets: MarketInterface[]): string[] => {
    const symbolsSet = new Set<string>();
    markets.forEach((market) => {
      if (market.collateralAsset?.symbol) {
        symbolsSet.add(market.collateralAsset?.symbol);
      }
    });
    return Array.from(symbolsSet).sort();
  };

  const sortMarkets = (markets: MarketInterface[]): MarketInterface[] => {
    // Filter out markets with missing required fields and apply symbol filters
    const filteredMarkets = markets.filter((market) => {
      // Basic validation
      if (!market.lltv || !market.collateralAsset || !market.loanAsset) {
        return false;
      }

      const networkMatch = networkFilter.length === 0 || networkFilter.includes(market.chain?.network);
      const loanAssetMatch = loanAssetSymbolFilter.length === 0 || loanAssetSymbolFilter.includes(market.loanAsset?.symbol);
      const collateralAssetMatch =
        collateralAssetSymbolFilter.length === 0 || collateralAssetSymbolFilter.includes(market.collateralAsset?.symbol);

      return networkMatch && loanAssetMatch && collateralAssetMatch;
    });

    return [...filteredMarkets].sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;

      switch (sortField) {
        case 'chain':
          return multiplier * (a.chain?.id - b.chain?.id);

        case 'loanAsset':
          return multiplier * (a.loanAsset?.symbol || '').localeCompare(b.loanAsset?.symbol || '');

        case 'collateralAsset':
          return multiplier * (a.collateralAsset?.symbol || '').localeCompare(b.collateralAsset?.symbol || '');

        case 'lltv':
          return multiplier * (getLLTVAsNumber(a.lltv) - getLLTVAsNumber(b.lltv));

        // case 'utilization':
        //   return multiplier * ((a.state?.utilization || 0) - (b.state?.utilization || 0));

        case 'borrowApy':
          return multiplier * ((a.state.netBorrowApy || 0) - (b.state.netBorrowApy || 0));

        case 'supplyApy':
          return multiplier * ((a.state.netSupplyApy || 0) - (b.state.netSupplyApy || 0));

        case 'sizeUsd':
          return multiplier * ((a.state.sizeUsd || 0) - (b.state.sizeUsd || 0));

        case 'totalLiquidityUsd':
          return multiplier * ((a.state.totalLiquidityUsd || 0) - (b.state.totalLiquidityUsd || 0));

        default:
          return 0;
      }
    });
  };

  if (graphLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label={intl.formatMessage({ id: 'borrow.loading' })} />
      </Box>
    );
  }

  if (graphError) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          <FormattedMessage id="borrow.error" values={{ message: graphError.message }} />
        </Typography>
      </Box>
    );
  }

  const markets = sortMarkets(graphData?.markets.items || []);
  const paginatedMarkets = markets.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(markets.length / rowsPerPage);

  // Show a message if there are no markets
  if (markets.length === 0) {
    return (
      <Box sx={{ padding: 2 }}>
        <Box component="h1" sx={visuallyHidden}>
          <FormattedMessage id="borrow.title" />
        </Box>
        <Typography role="status">
          <FormattedMessage id="borrow.noMarkets" />
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }} alignContent={'center'} margin={'auto'}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="borrow.title" />
      </Box>
      {morphoPositions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h3" component="h2" gutterBottom sx={{ marginBottom: 1 }}>
            <FormattedMessage id="common.yourPositions" />
          </Typography>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 650 }} aria-label={intl.formatMessage({ id: 'borrow.yourPositionsAria' })}>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <FormattedMessage id="table.market" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="table.collateral" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="table.loan" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="table.borrowApy" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {morphoPositions.map((position) => (
                  <TableRow
                    key={position.marketId}
                    hover
                    onClick={() => navigate(`/borrow/market/${position.marketId}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/borrow/market/${position.marketId}`}
                        color="inherit"
                        underline="none"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={intl.formatMessage(
                          { id: 'borrow.openMarketAria' },
                          { pair: `${position.collateralSymbol}/${position.loanSymbol}` }
                        )}
                      >
                        {position.collateralSymbol}/{position.loanSymbol}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {parseFloat(position.collateralBalance) > 0 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TokenIcon symbol={position.collateralSymbol} avatarProps={{ alt: '' }} />
                          {formatTokenAmount(
                            position.collateralBalance,
                            position.collateralDecimal,
                            position.collateralDecimal / DECIMALS_SCALE_FACTOR
                          )}{' '}
                          {position.collateralSymbol}
                        </Box>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {parseFloat(position.loanBalance) > 0 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TokenIcon symbol={position.loanSymbol} avatarProps={{ alt: '' }} />
                          {formatTokenAmount(position.loanBalance, position.loanDecimal, position.loanDecimal / DECIMALS_SCALE_FACTOR)}{' '}
                          {position.loanSymbol}
                        </Box>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{(Number(position.borrowApy) * 100).toFixed(2)} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
      <Typography variant="h3" component="h2" gutterBottom sx={{ marginBottom: 3 }}>
        <FormattedMessage id="borrow.availableMarkets" />
      </Typography>

      <Grid container spacing={2} sx={{ marginBottom: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            multiple
            id="network-filter"
            options={graphData ? getUniqueNetworks(graphData.markets.items) : []}
            value={networkFilter}
            onChange={(event, newValue) => {
              setNetworkFilter(newValue);
              setPage(1);
            }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip label={option} {...getTagProps({ index })} size="small" />)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'filter.byNetwork' })}
                placeholder={intl.formatMessage({ id: 'filter.selectNetworks' })}
                size="small"
                fullWidth
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            multiple
            id="loan-asset-symbols-filter"
            options={graphData ? getUniqueLoanAssetSymbols(graphData.markets.items) : []}
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
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'filter.byLoan' })}
                placeholder={intl.formatMessage({ id: 'filter.selectSymbols' })}
                size="small"
                fullWidth
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            multiple
            id="collateral-asset-symbols-filter"
            options={graphData?.markets.items ? getUniqueCollateralAssetSymbols(graphData?.markets.items) : []}
            value={collateralAssetSymbolFilter}
            onChange={(event, newValue) => {
              setCollateralAssetSymbolFilter(newValue);
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
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'filter.byCollateral' })}
                placeholder={intl.formatMessage({ id: 'filter.selectSymbols' })}
                size="small"
                fullWidth
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
      </Grid>

      <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label={intl.formatMessage({ id: 'borrow.availableMarketsAria' })}>
          <TableHead>
            <TableRow>
              <TableCell sortDirection={sortField === 'chain' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byNetwork' })} arrow describeChild>
                  <TableSortLabel
                    active={sortField === 'chain'}
                    direction={sortField === 'chain' ? sortOrder : 'asc'}
                    onClick={() => handleRequestSort('chain')}
                    IconComponent={sortField === 'chain' ? undefined : UnfoldMore}
                    sx={{ '.MuiTableSortLabel-icon': { opacity: 1, visibility: 'visible' } }}
                  >
                    <FormattedMessage id="table.network" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'loanAsset' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byLoanAsset' })} arrow describeChild>
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
                    <FormattedMessage id="table.loanAsset" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'collateralAsset' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byCollateralAsset' })} arrow describeChild>
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
                    <FormattedMessage id="table.collateralAsset" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'lltv' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byLltv' })} arrow describeChild>
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
                    <FormattedMessage id="table.lltv" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'borrowApy' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byBorrowApy' })} arrow describeChild>
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
                    <FormattedMessage id="table.borrowApy" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'supplyApy' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.bySupplyApy' })} arrow describeChild>
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
                    <FormattedMessage id="table.supplyApy" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'sizeUsd' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byMarketSize' })} arrow describeChild>
                  <TableSortLabel
                    active={sortField === 'sizeUsd'}
                    direction={sortField === 'sizeUsd' ? sortOrder : 'desc'}
                    onClick={() => handleRequestSort('sizeUsd')}
                    IconComponent={sortField === 'sizeUsd' ? undefined : UnfoldMore}
                    sx={{ '.MuiTableSortLabel-icon': { opacity: 1, visibility: 'visible' } }}
                  >
                    <FormattedMessage id="table.marketSize" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell sortDirection={sortField === 'totalLiquidityUsd' ? sortOrder : false}>
                <Tooltip title={intl.formatMessage({ id: 'sort.byTotalLiquidity' })} arrow describeChild>
                  <TableSortLabel
                    active={sortField === 'totalLiquidityUsd'}
                    direction={sortField === 'totalLiquidityUsd' ? sortOrder : 'desc'}
                    onClick={() => handleRequestSort('totalLiquidityUsd')}
                    IconComponent={sortField === 'totalLiquidityUsd' ? undefined : UnfoldMore}
                    sx={{ '.MuiTableSortLabel-icon': { opacity: 1, visibility: 'visible' } }}
                  >
                    <FormattedMessage id="table.totalLiquidity" />
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedMarkets.map((market) => (
              <TableRow
                key={market.marketId}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/borrow/market/${market.marketId}?chainId=${market.chain?.id}`)}
              >
                <TableCell>{market.chain?.id ? <ChainIcon chainId={market.chain.id} /> : '-'}</TableCell>
                <TableCell>
                  {market.loanAsset?.symbol ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TokenIcon symbol={market.loanAsset?.symbol} avatarProps={{ alt: '' }} />{' '}
                      <Link
                        component={RouterLink}
                        to={`/borrow/market/${market.marketId}?chainId=${market.chain?.id}`}
                        color="inherit"
                        underline="none"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={intl.formatMessage(
                          { id: 'borrow.openMarketAssetsAria' },
                          {
                            loan: market.loanAsset?.symbol,
                            collateral: market.collateralAsset?.symbol || intl.formatMessage({ id: 'common.na' })
                          }
                        )}
                      >
                        {market.loanAsset?.symbol}
                      </Link>
                    </Box>
                  ) : (
                    intl.formatMessage({ id: 'common.na' })
                  )}
                </TableCell>

                <TableCell>
                  {market.collateralAsset?.symbol ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TokenIcon symbol={market.collateralAsset?.symbol} avatarProps={{ alt: '' }} /> {market.collateralAsset?.symbol}
                    </Box>
                  ) : (
                    intl.formatMessage({ id: 'common.na' })
                  )}
                </TableCell>
                <TableCell>{formatLLTV(market.lltv)}</TableCell>
                {/*<TableCell>{`${((market.state?.utilization || 0) * 100).toFixed(2)}%`}</TableCell>*/}
                <TableCell>{((market.state.netBorrowApy || 0) * 100).toFixed(2)}%</TableCell>
                <TableCell>{((market.state.netSupplyApy || 0) * 100).toFixed(2)}%</TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2">
                      {formatShortUSDS(toTokenAmount(market.state.size, market.loanAsset.decimals))} {market.loanAsset.symbol}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ${formatShortUSDS(market.state.sizeUsd || 0)}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2">
                      {formatShortUSDS(toTokenAmount(market.state.totalLiquidity, market.loanAsset.decimals))} {market.loanAsset.symbol}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ${formatShortUSDS(market.state.totalLiquidityUsd || 0)}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Typography variant="body2" color="text.secondary" role="status">
          <FormattedMessage id="borrow.summaryCount" values={{ count: markets.length }} />
          {(loanAssetSymbolFilter.length > 0 || collateralAssetSymbolFilter.length > 0) && (
            <span>
              {' '}
              <FormattedMessage id="common.filtered" />
            </span>
          )}
          {loanAssetSymbolFilter.length > 0 && (
            <span>
              {' '}
              <FormattedMessage id="borrow.summaryByLoanSymbols" values={{ count: loanAssetSymbolFilter.length }} />
            </span>
          )}
          {collateralAssetSymbolFilter.length > 0 && (
            <span>
              {' '}
              <FormattedMessage
                id={loanAssetSymbolFilter.length > 0 ? 'borrow.summaryAndCollateralSymbols' : 'borrow.summaryByCollateralSymbols'}
                values={{ count: collateralAssetSymbolFilter.length }}
              />
            </span>
          )}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
        <FormControl variant="outlined" size="small">
          <InputLabel id="rows-per-page-label">
            <FormattedMessage id="common.rows" />
          </InputLabel>
          <Select
            labelId="rows-per-page-label"
            id="rows-per-page"
            value={rowsPerPage}
            onChange={handleChangeRowsPerPage}
            label={intl.formatMessage({ id: 'common.rows' })}
            sx={{ minWidth: 80 }}
          >
            <MenuItem value={10}>10</MenuItem>
            <MenuItem value={25}>25</MenuItem>
            <MenuItem value={50}>50</MenuItem>
            <MenuItem value={100}>100</MenuItem>
          </Select>
        </FormControl>
        <Pagination
          count={pageCount}
          page={page}
          onChange={handleChangePage}
          color="primary"
          size="large"
          aria-label={intl.formatMessage({ id: 'borrow.pagination' })}
        />
      </Box>
    </Box>
  );
}
