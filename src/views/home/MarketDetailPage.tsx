import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Divider, Tooltip, IconButton } from '@mui/material';
import Grid from '@mui/material/Grid';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

import { formatLLTV, shortenAddress } from '@/utils/formatters';
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

export default function MarketDetailPage() {
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
    <Box sx={{ padding: 2 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 3 }}>
        Back to Borrow
      </Button>
      <Paper sx={{ padding: 3, marginBottom: 3 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography variant="h4" gutterBottom>
              Market Details
            </Typography>
            {/*<Divider sx={{ my: 5 }} />*/}
            <Paper>
              <Grid container size={{ xs: 12 }} spacing={2}>
                <Grid size={{ xs: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">
                      Loan Asset
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography>{marketData.loanAsset?.symbol || 'N/A'}</Typography>
                      {marketData.loanAsset?.address && (
                        <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                          <IconButton onClick={() => copyToClipboard(marketData.loanAsset?.address || '')} sx={{ ml: 0.5, padding: '2px' }}>
                            <ContentCopyIcon sx={{ fontSize: '0.75rem' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">
                      Collateral Asset
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography>{marketData.collateralAsset?.symbol || 'N/A'}</Typography>
                      {marketData.collateralAsset?.address && (
                        <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                          <IconButton onClick={() => copyToClipboard(marketData.collateralAsset?.address || '')} sx={{ ml: 0.5 }}>
                            <ContentCopyIcon sx={{ fontSize: '0.75rem' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Grid>

                <Grid size={{ xs: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">
                      Utilization
                    </Typography>
                    <Typography>{`${((marketData.state?.utilization || 0) * 100).toFixed(2)}%`}</Typography>
                  </Box>
                </Grid>
                {/*<Grid size={{ xs: 3 }}>*/}
                {/*  <Box>*/}
                {/*    <Typography variant="subtitle2" color="textSecondary">*/}
                {/*      Borrowed Assets*/}
                {/*    </Typography>*/}
                {/*    <Typography>{(marketData.state?.borrowAssets || 0).toLocaleString()}</Typography>*/}
                {/*  </Box>*/}
                {/*</Grid>*/}
                {/*<Grid size={{ xs: 3 }}>*/}
                {/*  <Box>*/}
                {/*    <Typography variant="subtitle2" color="textSecondary">*/}
                {/*      Supplied Assets*/}
                {/*    </Typography>*/}
                {/*    <Typography>{(marketData.state?.supplyAssets || 0).toLocaleString()}</Typography>*/}
                {/*  </Box>*/}
                {/*</Grid>*/}

                <Grid size={{ xs: 3, md: 3 }}>
                  <Paper>
                    <Typography variant="subtitle2" color="textSecondary">
                      Market size
                    </Typography>
                    <Typography>{marketData.state.sizeUsd ? marketData.state.sizeUsd.toFixed(2) + ' USD' : 'n/a'} </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 3, md: 3 }}>
                  <Paper>
                    <Typography variant="subtitle2" color="textSecondary">
                      Total Liquidity
                    </Typography>
                    <Typography>
                      {marketData.state.totalLiquidityUsd ? marketData.state.totalLiquidityUsd.toFixed(2) + ' USD' : 'n/a'}{' '}
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 3, md: 3 }}>
                  <Paper>
                    <Typography variant="subtitle2" color="textSecondary">
                      Borrow Rate
                    </Typography>
                    <Typography>
                      {marketData.state.dailyNetBorrowApy ? (marketData.state.dailyNetBorrowApy * 100).toFixed(2) : 'n/a'}%{' '}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Paper>
            {accrualPosition && (
              <Grid size={{ xs: 12 }}>
                <Paper>
                  <Divider sx={{ my: 5 }} />
                  <Typography variant="h4" gutterBottom>
                    Your Position
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 3, md: 3 }}>
                      <Paper>
                        <Typography variant="subtitle2" color="textSecondary">
                          Loan ({marketData.loanAsset?.symbol})
                        </Typography>
                        <Typography>
                          {accrualPosition.borrowAssets
                            ? parseFloat(formatUnits(accrualPosition.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)
                            : '0'}{' '}
                          {isChanged && futurePosition && (
                            <>
                              <ArrowForwardIcon style={{ fontSize: '1rem' }} />
                              {futurePosition?.borrowAssets
                                ? parseFloat(formatUnits(futurePosition?.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)
                                : '0'}{' '}
                            </>
                          )}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 3, md: 3 }}>
                      <Paper>
                        <Typography variant="subtitle2" color="textSecondary">
                          Collateral ({marketData.collateralAsset?.symbol})
                        </Typography>
                        <Typography>
                          {accrualPosition.collateral
                            ? parseFloat(formatUnits(accrualPosition.collateral, marketData.collateralAsset?.decimals || 18)).toFixed(4)
                            : '0'}{' '}
                          {isChanged && futurePosition && (
                            <>
                              <ArrowForwardIcon style={{ fontSize: '1rem' }} />
                              {futurePosition?.collateral
                                ? parseFloat(formatUnits(futurePosition?.collateral, marketData.collateralAsset?.decimals || 18)).toFixed(4)
                                : '0'}{' '}
                            </>
                          )}
                        </Typography>
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 3, md: 3 }}>
                      <Paper>
                        <Typography variant="subtitle2" color="textSecondary">
                          LTV (%)
                        </Typography>
                        <Typography>
                          {accrualPosition.ltv ? (parseFloat(formatUnits(accrualPosition?.ltv, 18)) * 100).toFixed(2) : '0'}{' '}
                          {isChanged && futurePosition && (
                            <>
                              <ArrowForwardIcon style={{ fontSize: '1rem' }} />
                              {futurePosition?.ltv ? (parseFloat(formatUnits(futurePosition?.ltv, 18)) * 100).toFixed(2) : '0'}{' '}
                            </>
                          )}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 3, md: 3 }}>
                      <Box>
                        <Typography variant="subtitle2" color="textSecondary">
                          LLTV (Loan-to-Value)
                        </Typography>
                        <Typography>{formatLLTV(marketData.lltv) ? formatLLTV(marketData.lltv)?.toFixed(2) + '%' : 'n/a'}</Typography>
                      </Box>
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
