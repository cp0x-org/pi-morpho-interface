import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Tooltip, IconButton, Stack, useTheme, Card, Divider } from '@mui/material';
import Grid from '@mui/material/Grid';

import { formatLLTV, formatShortUSDS } from '@/utils/formatters';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { MarketData } from 'types/market';
import ActionFormsSecondary from 'views/home/market/ActionFormsSecondary';
import { useMarketData } from 'hooks/useMarketData';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { useFuturePosition } from 'hooks/useFuturePosition';
import { useAccount, useSwitchChain } from 'wagmi';
import { dispatchInfo, dispatchSuccess, dispatchError } from 'utils/snackbar';
import { getChainName } from 'utils/chains';
import { TokenIcon } from 'components/TokenIcon';
import { ArrowRightAlt } from '@mui/icons-material';
import ActionFormsMain from 'views/home/market/ActionFormsMain';
import { visuallyHidden } from 'utils/a11y';

export default function MarketDetailPage() {
  const theme = useTheme();

  const { marketId } = useParams<{ marketId: string }>();
  const [searchParams] = useSearchParams();
  const targetChainId = Number(searchParams.get('chainId')) || undefined;
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const { address: userAddress, chainId: currentChainId } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (targetChainId && currentChainId !== targetChainId) {
      const networkName = getChainName(targetChainId);
      dispatchInfo(`Switching network to ${networkName}...`);
      switchChain(
        { chainId: targetChainId },
        {
          onSuccess: () => dispatchSuccess(`Switched to ${networkName}`),
          onError: (err) => dispatchError(`Failed to switch to ${networkName}: ${err.message}`)
        }
      );
    }
  }, [targetChainId, currentChainId]);

  const [diffBorrowAmount, setDiffBorrowAmount] = useState<bigint>(0n);
  const [diffCollateralAmount, setDiffCollateralAmount] = useState<bigint>(0n);

  const { loading, error, data } = useQuery<MarketData>(MorphoRequests.GetMorphoMarketByAddress, {
    variables: { marketId: marketId },
    skip: !marketId,
    client: appoloClients.morphoApi
  });

  const { accrualPosition, market, refreshPositionData } = useMarketData({
    marketId,
    marketItemData: data?.markets?.items[0]
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label="Loading market details" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          Error loading market details: {error.message}
        </Typography>
      </Box>
    );
  }

  const marketData = data?.markets?.items?.[0];

  if (!marketData) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="alert" color="error">
          Market not found
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ padding: '16px 0px' }}>
      {/* Market header — compact top bar */}
      <Paper sx={{ padding: '20px 24px', marginBottom: 3 }}>
        {/* The pair is rendered as separate inline chunks for layout reasons; this
            gives the page a single, machine-readable heading without changing it. */}
        <Box component="h1" sx={visuallyHidden}>
          {`Market ${marketData.collateralAsset?.symbol || 'N/A'} / ${marketData.loanAsset?.symbol || 'N/A'}`}
        </Box>
        <Grid container alignItems="center" spacing={3}>
          {/* Token pair */}
          <Grid size={{ xs: 12, md: 4 }}>
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
                  {marketData.collateralAsset?.symbol || 'N/A'}
                </Typography>
                {marketData.collateralAsset?.address && (
                  <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                    <IconButton
                      aria-label={`Copy collateral token ${marketData.collateralAsset?.symbol || ''} address ${marketData.collateralAsset?.address}`}
                      onClick={() => copyToClipboard(marketData.collateralAsset?.address || '')}
                      sx={{ padding: '3px' }}
                    >
                      <ContentCopyIcon sx={{ fontSize: '16px', color: theme.palette.grey[500] }} />
                    </IconButton>
                  </Tooltip>
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
                  {marketData.loanAsset?.symbol || 'N/A'}
                </Typography>
                {marketData.loanAsset?.address && (
                  <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                    <IconButton
                      aria-label={`Copy loan token ${marketData.loanAsset?.symbol || ''} address ${marketData.loanAsset?.address}`}
                      onClick={() => copyToClipboard(marketData.loanAsset?.address || '')}
                      sx={{ padding: '3px' }}
                    >
                      <ContentCopyIcon sx={{ fontSize: '16px', color: theme.palette.grey[500] }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </Grid>

          {/* Market stats */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Grid container spacing={1}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stack spacing={0.5}>
                  <Typography variant="h4" component="p">{`${((marketData.state?.utilization || 0) * 100).toFixed(2)}%`}</Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.grey[500] }}>
                    Utilization
                  </Typography>
                </Stack>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stack spacing={0.5}>
                  <Typography variant="h4" component="p">
                    {marketData.state.sizeUsd ? formatShortUSDS(marketData.state.sizeUsd) : 'n/a'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.grey[500] }}>
                    Market Size
                  </Typography>
                </Stack>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stack spacing={0.5}>
                  <Typography variant="h4" component="p">
                    {marketData.state.totalLiquidityUsd ? formatShortUSDS(marketData.state.totalLiquidityUsd) : 'n/a'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.grey[500] }}>
                    Liquidity
                  </Typography>
                </Stack>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <Stack spacing={0.5}>
                  <Typography variant="h4" component="p">
                    {marketData.state.dailyNetBorrowApy ? `${(marketData.state.dailyNetBorrowApy * 100).toFixed(2)}%` : 'n/a'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.grey[500] }}>
                    Borrow Rate
                  </Typography>
                </Stack>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Paper>

      {/* Main content: forms left, position right (sticky) */}
      <Grid container spacing={3} alignItems="flex-start">
        {/* Left: action forms stacked */}
        <Grid size={{ xs: 12, md: 7 }}>
          <ActionFormsMain
            market={marketData}
            sdkMarket={market}
            marketId={marketId}
            accrualPosition={accrualPosition}
            onPositionUpdate={refreshPositionData}
            onBorrowAmountChange={onBorrowAmountChange}
            onCollateralAmountChange={onCollateralAmountChange}
          />
          <ActionFormsSecondary
            market={marketData}
            sdkMarket={market}
            marketId={marketId}
            accrualPosition={accrualPosition}
            onPositionUpdate={refreshPositionData}
            onBorrowAmountChange={() => {}}
            onLoanAmountChange={() => {}}
          />
        </Grid>

        {/* Right: position summary, sticky */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Box sx={{ position: 'sticky', top: '24px' }}>
            {accrualPosition ? (
              <Paper>
                <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '24px' }}>
                  Your Position
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Card
                      sx={{
                        ...theme.applyStyles('dark', {
                          bgcolor: 'background.default',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '20px'
                        })
                      }}
                    >
                      <Stack spacing={'20px'}>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                          Loan ({marketData.loanAsset?.symbol})
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="h3" component="p" sx={{ color: isChanged ? theme.palette.grey[500] : 'inherit' }}>
                            {accrualPosition.borrowAssets
                              ? parseFloat(formatUnits(accrualPosition.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)
                              : '0'}
                          </Typography>
                          {isChanged && futurePosition && (
                            <>
                              <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                              <Box component="span" sx={visuallyHidden}>
                                changes to
                              </Box>
                              <Typography variant="h3" component="p">
                                {futurePosition?.borrowAssets
                                  ? futurePosition?.borrowAssets <= 0
                                    ? '0'
                                    : parseFloat(formatUnits(futurePosition?.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)
                                  : '0'}
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Stack>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Card
                      sx={{
                        ...theme.applyStyles('dark', {
                          bgcolor: 'background.default',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '20px'
                        })
                      }}
                    >
                      <Stack spacing={'20px'}>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                          Collateral ({marketData.collateralAsset?.symbol})
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="h3" component="p" sx={{ color: isChanged ? theme.palette.grey[500] : 'inherit' }}>
                            {accrualPosition.collateral
                              ? parseFloat(formatUnits(accrualPosition.collateral, marketData.collateralAsset?.decimals || 18)).toFixed(4)
                              : '0'}
                          </Typography>
                          {isChanged && futurePosition && (
                            <>
                              <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                              <Box component="span" sx={visuallyHidden}>
                                changes to
                              </Box>
                              <Typography variant="h3" component="p">
                                {futurePosition?.collateral
                                  ? futurePosition?.collateral <= 0
                                    ? '0'
                                    : parseFloat(
                                        formatUnits(futurePosition?.collateral, marketData.collateralAsset?.decimals || 18)
                                      ).toFixed(4)
                                  : '0'}
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Stack>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Card
                      sx={{
                        ...theme.applyStyles('dark', {
                          bgcolor: 'background.default',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '20px'
                        })
                      }}
                    >
                      <Stack spacing={'20px'}>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                          LTV (%)
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="h3" component="p" sx={{ color: isChanged ? theme.palette.grey[500] : 'inherit' }}>
                            {accrualPosition.ltv ? (parseFloat(formatUnits(accrualPosition?.ltv, 18)) * 100).toFixed(2) : '0'}
                          </Typography>
                          {isChanged && futurePosition && (
                            <>
                              <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                              <Box component="span" sx={visuallyHidden}>
                                changes to
                              </Box>
                              <Typography variant="h3" component="p">
                                {futurePosition?.ltv
                                  ? futurePosition?.ltv <= 0
                                    ? '0'
                                    : (parseFloat(formatUnits(futurePosition?.ltv, 18)) * 100).toFixed(2)
                                  : '0'}
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Stack>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Card
                      sx={{
                        ...theme.applyStyles('dark', {
                          bgcolor: 'background.default',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '20px'
                        })
                      }}
                    >
                      <Stack spacing={'20px'}>
                        <Typography variant="h5" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                          LLTV
                        </Typography>
                        <Typography variant="h3" component="p">
                          {formatLLTV(marketData.lltv) ? formatLLTV(marketData.lltv)?.toFixed(2) + '%' : 'n/a'}
                        </Typography>
                      </Stack>
                    </Card>
                  </Grid>
                </Grid>
              </Paper>
            ) : (
              <Paper>
                <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '16px' }}>
                  Your Position
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body1" sx={{ color: theme.palette.grey[500] }}>
                  You have no open position in this market.
                </Typography>
              </Paper>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
