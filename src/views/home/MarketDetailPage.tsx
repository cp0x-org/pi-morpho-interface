import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Divider, Tooltip, IconButton } from '@mui/material';
import Grid from '@mui/material/Grid';

import { shortenAddress } from '@/utils/formatters';
import Button from '@mui/material/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useState } from 'react';
import { formatUnits } from 'viem';
import { MarketData } from 'types/market';
import ActionForms from 'views/home/market/ActionForms';
import { useMarketData } from 'hooks/useMarketData';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';

export default function MarketDetailPage() {
  const { uniqueKey } = useParams<{ uniqueKey: string }>();
  const navigate = useNavigate();
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const copyToClipboard = async (text: string) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopySuccess('Failed to copy');
    }
  };

  const { loading, error, data } = useQuery<MarketData>(MorphoRequests.GetMorphoMarketByAddress, {
    variables: { uniqueKey: uniqueKey },
    skip: !uniqueKey,
    client: appoloClients.morphoApi
  });

  const {
    position,
    rateAtTarget,
    marketParams,
    accrualPosition,
    errors: accrualErrors
  } = useMarketData({
    uniqueKey,
    marketItemData: data?.markets?.items[0]
  });
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

  const market = data?.markets?.items?.[0];

  const handleBack = () => {
    navigate('/borrow');
  };

  if (!market) {
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
                      <Typography>{market.loanAsset?.symbol || 'N/A'}</Typography>
                      {market.loanAsset?.address && (
                        <Tooltip title={copySuccess || 'Copy address'} placement="top">
                          <IconButton onClick={() => copyToClipboard(market.loanAsset?.address || '')} sx={{ ml: 0.5, padding: '2px' }}>
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
                      <Typography>{market.collateralAsset?.symbol || 'N/A'}</Typography>
                      {market.collateralAsset?.address && (
                        <Tooltip title={copySuccess || 'Copy address'} placement="top">
                          <IconButton onClick={() => copyToClipboard(market.collateralAsset?.address || '')} sx={{ ml: 0.5 }}>
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
                      LLTV (Loan-to-Value)
                    </Typography>
                    <Typography>{formatLLTV(market.lltv)}</Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" color="textSecondary">
                      Utilization
                    </Typography>
                    <Typography>{`${((market.state?.utilization || 0) * 100).toFixed(2)}%`}</Typography>
                  </Box>
                </Grid>
                {/*<Grid size={{ xs: 3 }}>*/}
                {/*  <Box>*/}
                {/*    <Typography variant="subtitle2" color="textSecondary">*/}
                {/*      Borrowed Assets*/}
                {/*    </Typography>*/}
                {/*    <Typography>{(market.state?.borrowAssets || 0).toLocaleString()}</Typography>*/}
                {/*  </Box>*/}
                {/*</Grid>*/}
                {/*<Grid size={{ xs: 3 }}>*/}
                {/*  <Box>*/}
                {/*    <Typography variant="subtitle2" color="textSecondary">*/}
                {/*      Supplied Assets*/}
                {/*    </Typography>*/}
                {/*    <Typography>{(market.state?.supplyAssets || 0).toLocaleString()}</Typography>*/}
                {/*  </Box>*/}
                {/*</Grid>*/}

                <Grid size={{ xs: 3, md: 3 }}>
                  <Paper>
                    <Typography variant="subtitle2" color="textSecondary">
                      Market size
                    </Typography>
                    <Typography>{market.state.sizeUsd ? market.state.sizeUsd.toFixed(2) : 'n/a'} </Typography>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 3, md: 3 }}>
                  <Paper>
                    <Typography variant="subtitle2" color="textSecondary">
                      Total Liquidity
                    </Typography>
                    <Typography>{market.state.totalLiquidityUsd ? market.state.totalLiquidityUsd.toFixed(2) : 'n/a'} </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 3, md: 3 }}>
                  <Paper>
                    <Typography variant="subtitle2" color="textSecondary">
                      Borrow Rate
                    </Typography>
                    <Typography>{market.state.dailyNetBorrowApy ? (market.state.dailyNetBorrowApy * 100).toFixed(2) : 'n/a'}% </Typography>
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
                          Borrowed Assets
                        </Typography>
                        <Typography>
                          {accrualPosition.borrowAssets
                            ? formatUnits(accrualPosition.borrowAssets, market.loanAsset?.decimals || 18)
                            : '0'}{' '}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 3, md: 3 }}>
                      <Paper>
                        <Typography variant="subtitle2" color="textSecondary">
                          Is Healthy
                        </Typography>
                        <Typography>{accrualPosition.isHealthy ? 'Yes' : 'No'}</Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 3, md: 3 }}>
                      <Paper>
                        <Typography variant="subtitle2" color="textSecondary">
                          Max Borrowable Assets
                        </Typography>
                        <Typography>
                          {accrualPosition.maxBorrowableAssets
                            ? formatUnits(accrualPosition.maxBorrowableAssets, market.loanAsset?.decimals || 18)
                            : '0'}{' '}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 3, md: 3 }}>
                      <Paper>
                        <Typography variant="subtitle2" color="textSecondary">
                          Collateral Withdrawable
                        </Typography>
                        <Typography>
                          {accrualPosition.withdrawableCollateral
                            ? formatUnits(accrualPosition.withdrawableCollateral, market.collateralAsset?.decimals || 18)
                            : '0'}{' '}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            )}
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <ActionForms market={market} uniqueKey={uniqueKey} accrualPosition={accrualPosition} />{' '}
          </Grid>
        </Grid>
        {/*<Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 2, mb: 3 }}>*/}
        {/*  <Chip label={`Loan: ${market.loanAsset?.symbol || 'N/A'}`} color="primary" />*/}
        {/*  <Chip label={`Collateral: ${market.collateralAsset?.symbol || 'N/A'}`} color="secondary" />*/}
        {/*  <Chip label={`LLTV: ${formatLLTV(market.lltv)}`} variant="outlined" />*/}
        {/*</Box>*/}
      </Paper>
    </Box>
  );
}
