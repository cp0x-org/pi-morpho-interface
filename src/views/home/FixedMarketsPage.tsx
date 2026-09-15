import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import {
  Alert,
  Autocomplete,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Pagination,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import { UnfoldMore } from '@mui/icons-material';

import { ChainIcon } from 'components/ChainIcon';
import { TokenIcon } from 'components/TokenIcon';
import { useMidnightBooks, useMidnightMarkets } from 'hooks/midnight/useMidnightMarkets';
import { useMidnightUserPositions } from 'hooks/midnight/useMidnightUserPositions';
import { useNowInSeconds } from 'hooks/midnight/useNowInSeconds';
import { useTokensMetadata } from 'hooks/midnight/useTokensMetadata';
import type { MidnightBookLevel, MidnightMarket } from 'types/midnight';
import { visuallyHidden } from 'utils/a11y';
import { getChainName } from 'utils/chains';
import { formatShortUSDS, shortenAddress } from 'utils/formatters';
import { formatMaturity, formatWadPercent, isMatured, MIDNIGHT_CHAIN_IDS, priceToApr, takerPrice } from 'utils/midnight';
import { routes, type FixedSide } from 'utils/routes';
import FixedPositionsTable from './fixed/FixedPositionsTable';
import PoweredByMorpho from './fixed/PoweredByMorpho';

type SortField = 'network' | 'pair' | 'maturity' | 'outstanding' | 'borrowDepth' | 'lendDepth' | 'bestRate';
type SortOrder = 'asc' | 'desc';

interface FixedMarketRow {
  market: MidnightMarket;
  loanSymbol: string;
  loanDecimals?: number;
  loanLogoURI?: string;
  collaterals: { token: string; symbol: string; logoURI?: string; lltv: bigint }[];
  pair: string;
  outstandingUsd?: number;
  /** Σ top-of-book asks (loan base units): what lenders can take. */
  lendDepth: bigint;
  /** Σ top-of-book bids (loan base units): what borrowers can take. */
  borrowDepth: bigint;
  bestLendApr?: bigint;
  bestBorrowApr?: bigint;
  isMatured: boolean;
}

const sumAssets = (levels?: MidnightBookLevel[]) => (levels ?? []).reduce((total, level) => total + level.assets, 0n);

/** Undefined values always sort last, whatever the direction. */
const compareOptional = <T extends number | bigint>(a: T | undefined, b: T | undefined, direction: number) => {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return (a < b ? -1 : a > b ? 1 : 0) * direction;
};

const formatLltv = (lltv: bigint) => `${Number(formatUnits(lltv, 16))}%`;

// ==============================|| FIXED RATE MARKETS ||============================== //

export default function FixedMarketsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const side: FixedSide = searchParams.get('side') === 'borrow' ? 'borrow' : 'lend';
  const { address: userAddress } = useAccount();
  const nowSec = useNowInSeconds();

  const [showMatured, setShowMatured] = useState(false);
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<number[]>([]);
  const [loanFilter, setLoanFilter] = useState<string[]>([]);
  const [collateralFilter, setCollateralFilter] = useState<string[]>([]);
  const [maturityFilter, setMaturityFilter] = useState<number[]>([]);
  const [sortField, setSortField] = useState<SortField>('maturity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const marketsQuery = useMidnightMarkets({
    listed: showUnlisted ? undefined : true,
    activeOnly: showMatured ? undefined : true,
    sortBy: 'maturity',
    sortDirection: 'asc'
  });
  const markets = useMemo(() => marketsQuery.data ?? [], [marketsQuery.data]);
  const marketIds = useMemo(() => markets.map((market) => market.marketId), [markets]);
  const booksQuery = useMidnightBooks(marketIds);
  const positionsQuery = useMidnightUserPositions(userAddress);

  const tokenRefs = useMemo(
    () => [
      ...markets.flatMap((market) => [
        { chainId: market.chainId, address: market.loanToken },
        ...market.collaterals.map((collateral) => ({ chainId: market.chainId, address: collateral.token }))
      ]),
      ...(positionsQuery.data ?? []).flatMap((position) => [
        { chainId: position.chainId, address: position.loanToken },
        ...position.collaterals.map((collateral) => ({ chainId: position.chainId, address: collateral.token }))
      ])
    ],
    [markets, positionsQuery.data]
  );
  const { getToken } = useTokensMetadata(tokenRefs);

  const rows = useMemo<FixedMarketRow[]>(() => {
    const books = new Map((booksQuery.data ?? []).map((book) => [book.marketId, book]));
    return markets.map((market) => {
      const loan = getToken(market.chainId, market.loanToken);
      const book = books.get(market.marketId);
      const fee = market.currentSettlementFeeWad ?? 0n;
      const loanSymbol = loan?.symbol ?? shortenAddress(market.loanToken);
      const collaterals = market.collaterals.map((collateral) => {
        const token = getToken(market.chainId, collateral.token);
        return {
          token: collateral.token,
          symbol: token?.symbol ?? shortenAddress(collateral.token),
          logoURI: token?.logoURI,
          lltv: collateral.lltv
        };
      });
      const bestAsk = book?.asks[0];
      const bestBid = book?.bids[0];

      return {
        market,
        loanSymbol,
        loanDecimals: loan?.decimals,
        loanLogoURI: loan?.logoURI,
        collaterals,
        pair: `${loanSymbol} / ${collaterals.map((collateral) => collateral.symbol).join(', ')}`,
        outstandingUsd:
          loan?.priceUsd != null && market.totalUnits != null
            ? Number(formatUnits(market.totalUnits, loan.decimals)) * loan.priceUsd
            : undefined,
        lendDepth: sumAssets(book?.asks),
        borrowDepth: sumAssets(book?.bids),
        bestLendApr: bestAsk ? priceToApr(takerPrice('lend', bestAsk.price, fee), market.maturity, nowSec) : undefined,
        bestBorrowApr: bestBid ? priceToApr(takerPrice('borrow', bestBid.price, fee), market.maturity, nowSec) : undefined,
        isMatured: isMatured(market.maturity, nowSec)
      };
    });
  }, [markets, booksQuery.data, getToken, nowSec]);

  const loanOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.loanSymbol))).sort(), [rows]);
  const collateralOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.collaterals.map((collateral) => collateral.symbol)))).sort(),
    [rows]
  );
  const maturityOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.market.maturity))).sort((a, b) => a - b), [rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        (networkFilter.length === 0 || networkFilter.includes(row.market.chainId)) &&
        (loanFilter.length === 0 || loanFilter.includes(row.loanSymbol)) &&
        (collateralFilter.length === 0 || row.collaterals.some((collateral) => collateralFilter.includes(collateral.symbol))) &&
        (maturityFilter.length === 0 || maturityFilter.includes(row.market.maturity))
    );
    const direction = sortOrder === 'asc' ? 1 : -1;
    const byPairThenMaturity = (a: FixedMarketRow, b: FixedMarketRow) =>
      a.pair.localeCompare(b.pair) || a.market.maturity - b.market.maturity;

    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'network':
          return direction * (a.market.chainId - b.market.chainId) || byPairThenMaturity(a, b);
        case 'pair':
          return direction * a.pair.localeCompare(b.pair) || a.market.maturity - b.market.maturity;
        case 'outstanding':
          return compareOptional(a.outstandingUsd, b.outstandingUsd, direction);
        case 'lendDepth':
          return compareOptional(a.lendDepth, b.lendDepth, direction);
        case 'borrowDepth':
          return compareOptional(a.borrowDepth, b.borrowDepth, direction);
        case 'bestRate':
          return side === 'lend'
            ? compareOptional(a.bestLendApr, b.bestLendApr, direction)
            : compareOptional(a.bestBorrowApr, b.bestBorrowApr, direction);
        default:
          return direction * (a.market.maturity - b.market.maturity) || byPairThenMaturity(a, b);
      }
    });
  }, [rows, networkFilter, loanFilter, collateralFilter, maturityFilter, sortField, sortOrder, side]);

  const totalOutstandingUsd = visibleRows.reduce((total, row) => total + (row.outstandingUsd ?? 0), 0);
  const paginatedRows = visibleRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pageCount = Math.ceil(visibleRows.length / rowsPerPage);
  const positions = positionsQuery.data ?? [];

  const handleSideChange = (nextSide: FixedSide) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('side', nextSide);
    setSearchParams(nextParams, { replace: true });
    if (sortField === 'bestRate') setSortOrder(nextSide === 'lend' ? 'desc' : 'asc');
  };

  const handleRequestSort = (field: SortField) => {
    if (sortField !== field) {
      // Amounts and lend APRs are most useful highest first, borrow APRs lowest first.
      const descending =
        field === 'outstanding' || field === 'lendDepth' || field === 'borrowDepth' || (field === 'bestRate' && side === 'lend');
      setSortOrder(descending ? 'desc' : 'asc');
    } else {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    }
    setSortField(field);
    setPage(1);
  };

  const formatLoanAmount = (row: FixedMarketRow, amount?: bigint) =>
    row.loanDecimals != null && amount != null
      ? `${formatShortUSDS(Number(formatUnits(amount, row.loanDecimals)))} ${row.loanSymbol}`
      : '-';

  const renderSortHeader = (field: SortField, labelId: string, hintId?: string) => {
    const label = intl.formatMessage({ id: labelId });
    const sortHint = intl.formatMessage({ id: 'fixed.list.sortBy' }, { column: label });
    return (
      <TableCell sortDirection={sortField === field ? sortOrder : false}>
        <Tooltip title={hintId ? `${sortHint}. ${intl.formatMessage({ id: hintId })}` : sortHint} arrow describeChild>
          <TableSortLabel
            active={sortField === field}
            direction={sortField === field ? sortOrder : 'asc'}
            onClick={() => handleRequestSort(field)}
            IconComponent={sortField === field ? undefined : UnfoldMore}
            sx={{ '.MuiTableSortLabel-icon': { opacity: 1, visibility: 'visible' } }}
          >
            {label}
          </TableSortLabel>
        </Tooltip>
      </TableCell>
    );
  };

  const renderSymbolOption = (props: React.HTMLAttributes<HTMLLIElement> & { key?: React.Key }, option: string) => {
    const { key, ...optionProps } = props;
    return (
      <li key={key ?? option} {...optionProps}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TokenIcon symbol={option} avatarProps={{ alt: '' }} />
          {option}
        </Box>
      </li>
    );
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="fixed.list.title" />
      </Box>

      {userAddress && positions.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h3" component="h2" gutterBottom sx={{ marginBottom: 1 }}>
            <FormattedMessage id="fixed.positions.title" />
          </Typography>
          <FixedPositionsTable positions={positions} getToken={getToken} nowSec={nowSec} />
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, marginBottom: 3 }}>
        <Typography variant="h3" component="h2">
          <FormattedMessage id="fixed.list.subtitle" />
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="secondary"
          value={side}
          onChange={(event, value: FixedSide | null) => value && handleSideChange(value)}
          aria-label={intl.formatMessage({ id: 'fixed.list.sideAria' })}
        >
          <ToggleButton value="lend" sx={{ px: 3 }}>
            <FormattedMessage id="fixed.list.sideLend" />
          </ToggleButton>
          <ToggleButton value="borrow" sx={{ px: 3 }}>
            <FormattedMessage id="fixed.list.sideBorrow" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={2} sx={{ marginBottom: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Stack spacing={0.5}>
            <Typography variant="h4" component="p">
              {marketsQuery.isLoading ? '-' : `$${formatShortUSDS(totalOutstandingUsd)}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="fixed.list.statOutstanding" />
            </Typography>
          </Stack>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Stack spacing={0.5}>
            <Typography variant="h4" component="p">
              {marketsQuery.isLoading ? '-' : visibleRows.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <FormattedMessage id="fixed.list.statMarkets" />
            </Typography>
          </Stack>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ marginBottom: 1 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Autocomplete
            multiple
            id="fixed-network-filter"
            options={MIDNIGHT_CHAIN_IDS}
            getOptionLabel={(chainId) => getChainName(chainId)}
            value={networkFilter}
            onChange={(event, value) => {
              setNetworkFilter(value);
              setPage(1);
            }}
            renderTags={(value, getTagProps) =>
              value.map((chainId, index) => <Chip label={getChainName(chainId)} {...getTagProps({ index })} key={chainId} size="small" />)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'filter.byNetwork' })}
                placeholder={intl.formatMessage({ id: 'filter.selectNetworks' })}
                size="small"
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Autocomplete
            multiple
            id="fixed-loan-filter"
            options={loanOptions}
            value={loanFilter}
            onChange={(event, value) => {
              setLoanFilter(value);
              setPage(1);
            }}
            renderOption={renderSymbolOption}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip label={option} {...getTagProps({ index })} key={option} size="small" />)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'filter.byLoan' })}
                placeholder={intl.formatMessage({ id: 'filter.selectSymbols' })}
                size="small"
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Autocomplete
            multiple
            id="fixed-collateral-filter"
            options={collateralOptions}
            value={collateralFilter}
            onChange={(event, value) => {
              setCollateralFilter(value);
              setPage(1);
            }}
            renderOption={renderSymbolOption}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip label={option} {...getTagProps({ index })} key={option} size="small" />)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'filter.byCollateral' })}
                placeholder={intl.formatMessage({ id: 'filter.selectSymbols' })}
                size="small"
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Autocomplete
            multiple
            id="fixed-maturity-filter"
            options={maturityOptions}
            getOptionLabel={(maturity) => formatMaturity(intl, maturity, nowSec).date}
            value={maturityFilter}
            onChange={(event, value) => {
              setMaturityFilter(value);
              setPage(1);
            }}
            renderTags={(value, getTagProps) =>
              value.map((maturity, index) => (
                <Chip label={formatMaturity(intl, maturity, nowSec).date} {...getTagProps({ index })} key={maturity} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={intl.formatMessage({ id: 'fixed.list.filterMaturity' })}
                placeholder={intl.formatMessage({ id: 'fixed.list.selectMaturities' })}
                size="small"
              />
            )}
            size="small"
            fullWidth
          />
        </Grid>
      </Grid>

      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', marginBottom: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={showMatured}
              onChange={(event) => {
                setShowMatured(event.target.checked);
                setPage(1);
              }}
            />
          }
          label={intl.formatMessage({ id: 'fixed.list.showMatured' })}
        />
        <FormControlLabel
          control={
            <Switch
              checked={showUnlisted}
              onChange={(event) => {
                setShowUnlisted(event.target.checked);
                setPage(1);
              }}
            />
          }
          label={intl.formatMessage({ id: 'fixed.list.showUnlisted' })}
        />
      </Stack>

      {showUnlisted && (
        <Alert severity="warning" sx={{ marginBottom: 2 }}>
          <FormattedMessage id="fixed.list.unlistedWarning" />
        </Alert>
      )}

      {marketsQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
          <CircularProgress aria-label={intl.formatMessage({ id: 'fixed.list.loading' })} />
        </Box>
      )}

      {marketsQuery.error && (
        <Typography role="alert" color="error" sx={{ padding: 2 }}>
          <FormattedMessage id="fixed.list.error" values={{ message: marketsQuery.error.message }} />
        </Typography>
      )}

      {!marketsQuery.isLoading && !marketsQuery.error && visibleRows.length === 0 && (
        <Typography role="status" sx={{ padding: 2 }}>
          <FormattedMessage id="fixed.list.empty" />
        </Typography>
      )}

      {visibleRows.length > 0 && (
        <>
          <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
            <Table sx={{ minWidth: 1000 }} aria-label={intl.formatMessage({ id: 'fixed.list.tableAria' })}>
              <TableHead>
                <TableRow>
                  {renderSortHeader('network', 'fixed.list.network')}
                  {renderSortHeader('pair', 'fixed.list.loan')}
                  <TableCell>
                    <FormattedMessage id="fixed.list.collateral" />
                  </TableCell>
                  <TableCell>
                    <FormattedMessage id="fixed.list.lltv" />
                  </TableCell>
                  {renderSortHeader('maturity', 'fixed.list.maturity')}
                  {renderSortHeader('outstanding', 'fixed.list.outstanding')}
                  {renderSortHeader('borrowDepth', 'fixed.list.borrowDepth', 'fixed.list.depthHint')}
                  {renderSortHeader('lendDepth', 'fixed.list.lendDepth', 'fixed.list.depthHint')}
                  {renderSortHeader('bestRate', side === 'lend' ? 'fixed.list.bestLendRate' : 'fixed.list.bestBorrowRate')}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedRows.map((row) => {
                  const maturity = formatMaturity(intl, row.market.maturity, nowSec);
                  const bestRate = side === 'lend' ? row.bestLendApr : row.bestBorrowApr;
                  const collateralSymbols = row.collaterals.map((collateral) => collateral.symbol);
                  const href = routes.fixedMarket(row.market.marketId, row.loanSymbol, collateralSymbols, row.market.maturity);

                  return (
                    <TableRow key={row.market.marketId} hover onClick={() => navigate(href)} sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <ChainIcon chainId={row.market.chainId} />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <TokenIcon symbol={row.loanSymbol} logoURI={row.loanLogoURI} avatarProps={{ alt: '' }} />
                          <Link
                            component={RouterLink}
                            to={href}
                            color="inherit"
                            underline="none"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={intl.formatMessage(
                              { id: 'fixed.list.openMarketAria' },
                              { pair: row.pair, maturity: maturity.date }
                            )}
                          >
                            {row.loanSymbol}
                          </Link>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {row.collaterals.map((collateral, index) => (
                              <TokenIcon
                                key={collateral.token}
                                symbol={collateral.symbol}
                                logoURI={collateral.logoURI}
                                sx={{ display: 'flex', marginLeft: index > 0 ? '-12px' : 0 }}
                                avatarProps={{ alt: '', sx: { width: 28, height: 28 } }}
                              />
                            ))}
                          </Box>
                          {collateralSymbols.join(', ')}
                        </Box>
                      </TableCell>
                      <TableCell>{row.collaterals.map((collateral) => formatLltv(collateral.lltv)).join(' / ')}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{maturity.date}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="body2" color={row.isMatured ? 'warning.main' : 'text.secondary'}>
                            {maturity.relative}
                          </Typography>
                          {row.market.listed === false && (
                            <Chip
                              size="small"
                              color="warning"
                              variant="outlined"
                              label={intl.formatMessage({ id: 'fixed.list.unlisted' })}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatLoanAmount(row, row.market.totalUnits)}</Typography>
                        {row.outstandingUsd != null && (
                          <Typography variant="body2" color="text.secondary">
                            ${formatShortUSDS(row.outstandingUsd)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{row.borrowDepth > 0n ? formatLoanAmount(row, row.borrowDepth) : '-'}</TableCell>
                      <TableCell>{row.lendDepth > 0n ? formatLoanAmount(row, row.lendDepth) : '-'}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {bestRate != null ? formatWadPercent(bestRate) : '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <Typography variant="body2" color="text.secondary" role="status">
              <FormattedMessage id="fixed.list.summaryCount" values={{ count: visibleRows.length }} />
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <FormControl variant="outlined" size="small">
              <InputLabel id="fixed-rows-per-page-label">
                <FormattedMessage id="common.rows" />
              </InputLabel>
              <Select
                labelId="fixed-rows-per-page-label"
                id="fixed-rows-per-page"
                value={rowsPerPage}
                onChange={(event: SelectChangeEvent<number>) => {
                  setRowsPerPage(Number(event.target.value));
                  setPage(1);
                }}
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
              onChange={(event, nextPage) => setPage(nextPage)}
              color="primary"
              size="large"
              aria-label={intl.formatMessage({ id: 'fixed.list.pagination' })}
            />
          </Box>
        </>
      )}

      <PoweredByMorpho />
    </Box>
  );
}
