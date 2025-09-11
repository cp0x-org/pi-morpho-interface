import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Divider, Tooltip, IconButton, Stack, useTheme, Card } from '@mui/material';
import Grid from '@mui/material/Grid';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { formatLLTV, formatShortUSDS, shortenAddress } from '@/utils/formatters';
import Button from '@mui/material/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useState } from 'react';
import { formatUnits } from 'viem';
import { MarketData } from 'types/market';
import ActionForms from 'views/home/market/ActionForms';
import { useMarketData } from 'hooks/useMarketData';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { useFuturePosition } from 'hooks/useFuturePosition';
import { useAccount } from 'wagmi';
import SubCard from 'ui-component/cards/SubCard';
import { TokenIcon } from 'components/TokenIcon';
import { alpha } from '@mui/material/styles';
import { ArrowRightAlt } from '@mui/icons-material';

export default function MarketDetailPage() {
  const theme = useTheme();

  const { uniqueKey } = useParams<{ uniqueKey: string }>();
  const navigate = useNavigate();
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const { address: userAddress } = useAccount();
  const [diffBorrowAmount, setDiffBorrowAmount] = useState<bigint>(0n);
  const [diffCollateralAmount, setDiffCollateralAmount] = useState<bigint>(0n);

  const { loading, error, data } = useQuery<MarketData>(MorphoRequests.GetMorphoMarketByAddress, {
    variables: { uniqueKey: uniqueKey },
    skip: !uniqueKey,
    client: appoloClients.morphoApi
  });

  const { accrualPosition, market, refreshPositionData } = useMarketData({
    uniqueKey,
    marketItemData: data?.markets?.items[0]
  });

  const { futurePosition, isChanged } = useFuturePosition({
    currentPosition: accrualPosition,
    market,
    userAddress,
    uniqueKey,
    diffBorrowAmount,
    diffCollateralAmount
  });

  const onBorrowAmountChange = (amount: bigint) => {
    console.log('onBorrowAmountChange', amount);
    setDiffBorrowAmount(amount);
  };

  const onCollateralAmountChange = (amount: bigint) => {
    console.log('onCollateralAmountChange', amount);
    setDiffCollateralAmount(amount);
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
        <Typography color="error">Error loading market details: {error.message}</Typography>
      </Box>
    );
  }

  const marketData = data?.markets?.items?.[0];

  const handleBack = () => {
    navigate('/borrow');
  };

  if (!marketData) {
    return (
      <Box sx={{ padding: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
          Back to Borrow
        </Button>
        <Typography variant="h5" color="error">
          Market not found
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ padding: '16px 0px' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 3 }}>
        Back to Borrow
      </Button>
      <Paper sx={{ padding: 0, marginBottom: 3 }}>
        <Grid container spacing={12.5}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box
              sx={{
                padding: '10px 20px',
                display: 'flex',
                flexDirection: 'column',
                marginBottom: '40px',
                width: '100%',
                backgroundColor: 'background.default',
                backgroundOpacity: 0.1,
                borderRadius: '12px'
              }}
            >
              <Grid container sx={{ width: '100%', marginBottom: '40px', paddingTop: '20px' }}>
                <Grid size={{ xs: 12, md: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', height: '70px' }}>
                    {marketData.collateralAsset?.symbol && (
                      <TokenIcon
                        sx={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', zIndex: 1 }}
                        avatarProps={{ sx: { width: 45, height: 45 } }}
                        symbol={marketData.collateralAsset?.symbol}
                      />
                    )}
                    {marketData.loanAsset?.symbol && (
                      <TokenIcon
                        sx={{
                          width: '50px',
                          height: '50px',
                          display: 'flex',
                          alignItems: 'center',
                          ml: '-30px', // перекрытие
                          zIndex: 2
                        }}
                        avatarProps={{ sx: { width: 45, height: 45 } }}
                        symbol={marketData.loanAsset?.symbol}
                      />
                    )}
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 10 }}>
                  {/*<Box sx={{ display: 'flex', width: '100%' }}>*/}
                  {/*  */}
                  {/*</Box>*/}
                  <Typography
                    variant="h4"
                    component="span"
                    sx={{
                      display: 'block',
                      width: '100%',
                      height: '50%',
                      fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
                      fontSize: '16px',
                      color: theme.palette.grey[500]
                    }}
                  >
                    Market Details
                  </Typography>
                  <Box display="flex" alignItems="center">
                    <Typography variant="h2" component="span" sx={{ display: 'inline' }}>
                      {marketData.loanAsset?.symbol || 'N/A'}
                    </Typography>
                    {marketData.loanAsset?.address && (
                      <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                        <IconButton
                          onClick={() => copyToClipboard(marketData.loanAsset?.address || '')}
                          sx={{ ml: 0.2, padding: '2px', marginLeft: '10px' }}
                        >
                          <ContentCopyIcon sx={{ fontSize: '22px', color: theme.palette.grey[500] }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Typography variant="h2" sx={{ display: 'inline', margin: '0px 20px', color: theme.palette.grey[500] }}>
                      /
                    </Typography>

                    <Typography variant="h2" component="span" sx={{ display: 'inline' }}>
                      {marketData.collateralAsset?.symbol || 'N/A'}
                    </Typography>
                    {marketData.collateralAsset?.address && (
                      <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                        <IconButton
                          onClick={() => copyToClipboard(marketData.collateralAsset?.address || '')}
                          sx={{ ml: 0.2, padding: '5px', marginLeft: '10px' }}
                        >
                          <ContentCopyIcon sx={{ fontSize: '22px', color: theme.palette.grey[500] }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Grid>
              </Grid>
              <Grid container size={{ xs: 12 }} spacing={2}>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3">{`${((marketData.state?.utilization || 0) * 100).toFixed(2)}`}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        Utilization (%)
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3">{marketData.state.sizeUsd ? formatShortUSDS(marketData.state.sizeUsd) : 'n/a'} </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        Market size ($)
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>

                <Grid size={{ xs: 12, sm: 3 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3">
                        {marketData.state.totalLiquidityUsd ? formatShortUSDS(marketData.state.totalLiquidityUsd) : 'n/a'}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        Total Liquidity ($)
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3">
                        {marketData.state.dailyNetBorrowApy ? (marketData.state.dailyNetBorrowApy * 100).toFixed(2) : 'n/a'}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        Borrow Rate (%)
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
              </Grid>
            </Box>

            {accrualPosition && (
              <Grid size={{ xs: 12 }}>
                <Paper>
                  <Typography variant="h4" gutterBottom sx={{ marginBottom: '40px' }}>
                    Your Position
                  </Typography>
                  <Grid container spacing={2} sx={{ padding: '0px' }}>
                    <Grid size={{ xs: 12, sm: 6 }} sx={{ padding: '0px' }}>
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
                        <Stack spacing={'30px'} sx={{ padding: '0px' }}>
                          <Typography
                            variant="h5"
                            sx={{ fontWeight: 400, color: theme.palette.grey[500], height: '24px', marginBottom: '8px' }}
                          >
                            Loan ({marketData.loanAsset?.symbol})
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="h3" sx={{ color: theme.palette.grey[500] }}>
                              {accrualPosition.borrowAssets
                                ? parseFloat(formatUnits(accrualPosition.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)
                                : '0'}
                            </Typography>
                            {isChanged && futurePosition && (
                              <>
                                <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                                <Typography variant="h3">
                                  {futurePosition?.borrowAssets
                                    ? parseFloat(formatUnits(futurePosition?.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)
                                    : '0'}
                                </Typography>
                              </>
                            )}
                          </Box>
                        </Stack>
                      </Card>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 6 }} sx={{ padding: '0px' }}>
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
                        <Stack spacing={'30px'} sx={{ padding: '0px' }}>
                          <Typography
                            variant="h5"
                            sx={{ fontWeight: 400, color: theme.palette.grey[500], height: '24px', marginBottom: '8px' }}
                          >
                            Collateral ({marketData.collateralAsset?.symbol})
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="h3" sx={{ color: theme.palette.grey[500] }}>
                              {accrualPosition.collateral
                                ? parseFloat(formatUnits(accrualPosition.collateral, marketData.collateralAsset?.decimals || 18)).toFixed(4)
                                : '0'}
                            </Typography>
                            {isChanged && futurePosition && (
                              <>
                                <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                                <Typography variant="h3">
                                  {futurePosition?.collateral
                                    ? parseFloat(
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
                        <Stack spacing={'30px'} sx={{ padding: '0px' }}>
                          <Typography
                            variant="h5"
                            sx={{ fontWeight: 400, color: theme.palette.grey[500], height: '24px', marginBottom: '8px' }}
                          >
                            LTV (%)
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="h3" sx={{ color: theme.palette.grey[500] }}>
                              {accrualPosition.ltv ? (parseFloat(formatUnits(accrualPosition?.ltv, 18)) * 100).toFixed(2) : '0'}
                            </Typography>
                            {isChanged && futurePosition && (
                              <>
                                <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />
                                <Typography variant="h3">
                                  {futurePosition?.ltv ? (parseFloat(formatUnits(futurePosition?.ltv, 18)) * 100).toFixed(2) : '0'}
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
                        <Stack spacing={'30px'} sx={{ padding: '0px' }}>
                          <Typography
                            variant="h5"
                            sx={{ fontWeight: 400, color: theme.palette.grey[500], height: '24px', marginBottom: '8px' }}
                          >
                            LLTV (Loan-to-Value)
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="h3">
                              {formatLLTV(marketData.lltv) ? formatLLTV(marketData.lltv)?.toFixed(2) + '%' : 'n/a'}
                            </Typography>
                          </Box>
                        </Stack>
                      </Card>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            )}
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <ActionForms
              market={marketData}
              uniqueKey={uniqueKey}
              accrualPosition={accrualPosition}
              onPositionUpdate={refreshPositionData}
              onBorrowAmountChange={onBorrowAmountChange}
              onCollateralAmountChange={onCollateralAmountChange}
            />{' '}
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
