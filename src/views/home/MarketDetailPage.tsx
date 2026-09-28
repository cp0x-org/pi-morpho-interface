import { Link as RouterLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Tooltip, IconButton, Stack, useTheme, Chip, Link } from '@mui/material';
import Grid from '@mui/material/Grid';

import { formatLLTV, formatShortUSDS, shortenAddress } from '@/utils/formatters';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useCallback, useEffect, useState } from 'react';
import { MarketData } from 'types/market';
import { useMarketData } from 'hooks/useMarketData';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { useFuturePosition } from 'hooks/useFuturePosition';
import { useAccount } from 'wagmi';
import { useWalletChainSync } from 'hooks/useWalletChainSync';
import { getChainName } from 'utils/chains';
import { ChainIcon } from 'components/ChainIcon';
import { TokenIcon } from 'components/TokenIcon';
import MarketActionPanel from 'views/home/market/MarketActionPanel';
import MarketDetailsCard from 'views/home/market/MarketDetailsCard';
import MarketPositionCard from 'views/home/market/MarketPositionCard';
import { visuallyHidden } from 'utils/a11y';
import { FormattedMessage, useIntl } from 'react-intl';
import { useMidnightMarketLookup } from 'hooks/midnight/useMidnightMarket';
import { routes } from 'utils/routes';

export default function MarketDetailPage() {
  const theme = useTheme();
  const intl = useIntl();

  const { marketId } = useParams<{ marketId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const urlChainId = Number(searchParams.get('chainId')) || undefined;
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const { address: userAddress } = useAccount();

  const [diffBorrowAmount, setDiffBorrowAmount] = useState<bigint>(0n);
  const [diffCollateralAmount, setDiffCollateralAmount] = useState<bigint>(0n);

  // Blue market ids are not unique across chains, so the lookup is scoped to ?chainId=.
  // Without it, or when the market is not on that chain, search every chain and fix the URL.
  const { loading, error, data } = useQuery<MarketData>(MorphoRequests.GetMorphoMarketByAddress, {
    variables: { marketId: marketId, chainIds: urlChainId ? [urlChainId] : null },
    skip: !marketId,
    client: appoloClients.morphoApi
  });
  const needsChainLookup = !!urlChainId && !loading && !error && data?.markets?.items.length === 0;
  const { loading: lookupLoading, data: lookupData } = useQuery<MarketData>(MorphoRequests.GetMorphoMarketByAddress, {
    variables: { marketId: marketId, chainIds: null },
    skip: !marketId || !needsChainLookup,
    client: appoloClients.morphoApi
  });

  const marketData = urlChainId ? data?.markets?.items.find((item) => item.chain?.id === urlChainId) : undefined;
  const chainCandidates = (urlChainId ? lookupData : data)?.markets?.items ?? [];
  const redirectChainId = !marketData && chainCandidates.length === 1 ? chainCandidates[0].chain?.id : undefined;
  const chainId = marketData?.chain?.id;

  // Not a Blue market on any chain: old /borrow/market/ links may point at a fixed-rate (Midnight) market.
  const isMissingOnBlue =
    !!marketId && !loading && !lookupLoading && !error && !marketData && chainCandidates.length === 0 && (!urlChainId || !!lookupData);
  const fixedMarketLookup = useMidnightMarketLookup(marketId, isMissingOnBlue);
  const fixedMarketId = fixedMarketLookup.data?.marketId;

  useEffect(() => {
    if (fixedMarketId) navigate(routes.fixedMarket(fixedMarketId), { replace: true });
  }, [fixedMarketId, navigate]);

  useEffect(() => {
    if (!redirectChainId || redirectChainId === urlChainId) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('chainId', String(redirectChainId));
    navigate({ search: `?${nextParams.toString()}`, hash: location.hash }, { replace: true });
  }, [redirectChainId, urlChainId, searchParams, location.hash, navigate]);

  useWalletChainSync(chainId);

  const { accrualPosition, market, marketParams, oraclePrice, refreshPositionData, refreshAfterTransaction } = useMarketData({
    marketId,
    chainId,
    marketItemData: marketData
  });

  const { futurePosition, isChanged } = useFuturePosition({
    currentPosition: accrualPosition,
    market,
    userAddress,
    marketId,
    diffBorrowAmount,
    diffCollateralAmount
  });

  const onBorrowAmountChange = useCallback((amount: bigint) => {
    setDiffBorrowAmount(amount);
  }, []);

  const onCollateralAmountChange = useCallback((amount: bigint) => {
    setDiffCollateralAmount(amount);
  }, []);

  if (loading || lookupLoading || (redirectChainId && redirectChainId !== urlChainId) || fixedMarketLookup.isFetching || !!fixedMarketId) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label={intl.formatMessage({ id: 'market.loading' })} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          <FormattedMessage id="market.error" values={{ message: error.message }} />
        </Typography>
      </Box>
    );
  }

  if (!marketData && chainCandidates.length > 1) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="status">
          <FormattedMessage id="market.multipleNetworks" />
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {chainCandidates.map((item) => (
            <Link key={item.chain.id} component={RouterLink} to={{ search: `?chainId=${item.chain.id}` }} replace>
              {getChainName(item.chain.id)}
            </Link>
          ))}
        </Stack>
      </Box>
    );
  }

  if (!marketData) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="alert" color="error">
          <FormattedMessage id="market.notFound" />
        </Typography>
      </Box>
    );
  }

  const lltv = formatLLTV(marketData.lltv);
  const copyTitle = copySuccessMsg || intl.formatMessage({ id: 'common.copyAddress' });
  const naShort = intl.formatMessage({ id: 'common.naShort' });
  const stats = [
    { labelId: 'market.utilization', value: `${((marketData.state?.utilization || 0) * 100).toFixed(2)}%` },
    { labelId: 'market.size', value: marketData.state.sizeUsd ? formatShortUSDS(marketData.state.sizeUsd) : naShort },
    {
      labelId: 'market.liquidity',
      value: marketData.state.totalLiquidityUsd ? formatShortUSDS(marketData.state.totalLiquidityUsd) : naShort
    },
    {
      labelId: 'market.borrowRate',
      value: marketData.state.dailyNetBorrowApy ? `${(marketData.state.dailyNetBorrowApy * 100).toFixed(2)}%` : naShort
    },
    {
      labelId: 'market.lendRate',
      value: marketData.state.dailyNetSupplyApy ? `${(marketData.state.dailyNetSupplyApy * 100).toFixed(2)}%` : naShort
    }
  ];

  const renderCopyButton = (ariaLabel: string, text: string) => (
    <Tooltip title={copyTitle} placement="top">
      <IconButton aria-label={ariaLabel} onClick={() => copyToClipboard(text)} sx={{ padding: '3px' }}>
        <ContentCopyIcon sx={{ fontSize: '16px', color: theme.palette.grey[500] }} />
      </IconButton>
    </Tooltip>
  );

  return (
    <Box sx={{ padding: '16px 0px' }}>
      {/* Market header — identity on the left, the numbers that change on the right, same shape as /fixed. */}
      <Paper sx={{ padding: '20px 24px', marginBottom: 3 }}>
        {/* The pair is rendered as separate inline chunks for layout reasons; this
            gives the page a single, machine-readable heading without changing it. */}
        <Box component="h1" sx={visuallyHidden}>
          <FormattedMessage
            id="market.heading"
            values={{
              collateral: marketData.collateralAsset?.symbol || intl.formatMessage({ id: 'common.na' }),
              loan: marketData.loanAsset?.symbol || intl.formatMessage({ id: 'common.na' })
            }}
          />
        </Box>
        <Grid container alignItems="center" spacing={3}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {marketData.collateralAsset?.symbol && (
                    <TokenIcon
                      sx={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', zIndex: 1 }}
                      avatarProps={{ sx: { width: 38, height: 38 }, alt: '' }}
                      symbol={marketData.collateralAsset?.symbol}
                    />
                  )}
                  {marketData.loanAsset?.symbol && (
                    <TokenIcon
                      sx={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', ml: '-18px', zIndex: 2 }}
                      avatarProps={{ sx: { width: 38, height: 38 }, alt: '' }}
                      symbol={marketData.loanAsset?.symbol}
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                  <Typography variant="h3" component="span" sx={{ display: 'inline' }}>
                    {marketData.collateralAsset?.symbol || intl.formatMessage({ id: 'common.na' })}
                  </Typography>
                  {marketData.collateralAsset?.address &&
                    renderCopyButton(
                      intl.formatMessage(
                        { id: 'market.copyCollateralAria' },
                        { symbol: marketData.collateralAsset?.symbol || '', address: marketData.collateralAsset?.address }
                      ),
                      marketData.collateralAsset.address
                    )}
                  <Typography
                    variant="h3"
                    component="span"
                    aria-hidden="true"
                    sx={{ display: 'inline', mx: 1, color: theme.palette.grey[500] }}
                  >
                    /
                  </Typography>
                  <Typography variant="h3" component="span" sx={{ display: 'inline' }}>
                    {marketData.loanAsset?.symbol || intl.formatMessage({ id: 'common.na' })}
                  </Typography>
                  {marketData.loanAsset?.address &&
                    renderCopyButton(
                      intl.formatMessage(
                        { id: 'market.copyLoanAria' },
                        { symbol: marketData.loanAsset?.symbol || '', address: marketData.loanAsset?.address }
                      ),
                      marketData.loanAsset.address
                    )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                {chainId && <ChainIcon chainId={chainId} showName />}
                <Chip
                  size="small"
                  variant="outlined"
                  label={intl.formatMessage({ id: 'market.lltvChip' }, { value: lltv != null ? `${lltv.toFixed(2)}%` : naShort })}
                />
                <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    <FormattedMessage id="market.marketIdLabel" values={{ id: shortenAddress(marketData.marketId) }} />
                  </Typography>
                  {renderCopyButton(
                    intl.formatMessage({ id: 'market.copyMarketIdAria' }, { id: marketData.marketId }),
                    marketData.marketId
                  )}
                </Box>
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Grid container spacing={2}>
              {stats.map((stat) => (
                <Grid key={stat.labelId} size={{ xs: 6, sm: 4 }}>
                  <Stack spacing={0.5}>
                    <Typography variant="h4" component="p">
                      {stat.value}
                    </Typography>
                    <Typography variant="body2" sx={{ color: theme.palette.grey[500] }}>
                      <FormattedMessage id={stat.labelId} />
                    </Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Market data and your position on the left, the forms you act with on the right. Stacked on a phone the
          forms come first: that is what the page is for, and the data is one scroll away. */}
      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 7 }} sx={{ order: { xs: 2, md: 1 } }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <MarketDetailsCard market={marketData} chainId={chainId} oraclePrice={oraclePrice as bigint | undefined} />
            <MarketPositionCard market={marketData} position={accrualPosition} futurePosition={futurePosition} isChanged={isChanged} />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }} sx={{ order: { xs: 1, md: 2 } }}>
          <MarketActionPanel
            market={marketData}
            chainId={chainId}
            marketParams={marketParams}
            sdkMarket={market}
            marketId={marketId}
            accrualPosition={accrualPosition}
            onPositionUpdate={refreshAfterTransaction}
            onRefresh={refreshPositionData}
            onBorrowAmountChange={onBorrowAmountChange}
            onCollateralAmountChange={onCollateralAmountChange}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
