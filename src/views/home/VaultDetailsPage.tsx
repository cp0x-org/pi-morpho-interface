import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Grid, Tabs, Tab, Tooltip, IconButton, Stack, useTheme, Card } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useMemo, useState } from 'react';
import { VaultsData } from 'types/vaults';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import DepositTab from 'views/home/vault/Deposit';
import WithdrawTab from 'views/home/vault/Withdraw';
import SubCard from 'ui-component/cards/SubCard';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { formatShortUSDS } from 'utils/formatters';
import { TokenIcon } from 'components/TokenIcon';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { formatUnits } from 'viem';
import TabPanel from './components/TabPanel';

export default function VaultDetailsPage() {
  const theme = useTheme();
  const chainId = useChainId();
  const { vaultAddress } = useParams<{ vaultAddress: string }>();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const { address: userAddress } = useAccount();

  const { loading, error, data } = useQuery<VaultsData>(MorphoRequests.GetMorprhoVaultByAddress, {
    variables: { address: vaultAddress, chain: chainId },
    client: appoloClients.morphoApi
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const vault = data?.vaults.items[0];

  // Read user's vault balance
  const { data: vaultBalance, isLoading: isBalanceLoading } = useReadContract({
    abi: vaultConfig.abi,
    address: vaultAddress as `0x${string}` | undefined,
    functionName: 'maxWithdraw',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultAddress
    }
  });
  const formattedVaultBalance = useMemo(() => {
    if (!vaultBalance || !vault) return '0';
    return formatUnits(vaultBalance as bigint, vault.asset.decimals);
  }, [vaultBalance, vault]);

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
        <Typography color="error">Error loading vault details: {error.message}</Typography>
      </Box>
    );
  }

  if (!vault) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Vault not found
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ padding: '16px 0px' }}>
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
                    {vault.asset.symbol && (
                      <TokenIcon
                        sx={{ width: '50px', height: '50px', display: 'flex', alignItems: 'center', zIndex: 1 }}
                        avatarProps={{ sx: { width: 45, height: 45 } }}
                        symbol={vault.asset.symbol}
                      />
                    )}
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 10 }}>
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
                    Vault Details
                  </Typography>
                  <Box display="flex" alignItems="center">
                    <Typography variant="h2" component="span" sx={{ display: 'inline' }}>
                      {vault.name || 'N/A'}
                    </Typography>
                    {vault.address && (
                      <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                        <IconButton
                          onClick={() => copyToClipboard(vault.address || '')}
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
                <Grid size={{ xs: 12, sm: 4 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Box display="flex" alignItems="center">
                        <Typography variant="h2" component="span" sx={{ display: 'inline' }}>
                          {vault.asset.symbol || 'N/A'}
                        </Typography>
                        {vault.asset.address && (
                          <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                            <IconButton
                              onClick={() => copyToClipboard(vault.asset.address || '')}
                              sx={{ ml: 0.2, padding: '5px', marginLeft: '10px' }}
                            >
                              <ContentCopyIcon sx={{ fontSize: '22px', color: theme.palette.grey[500] }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        Asset
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3">{(vault.state.dailyNetApy * 100).toFixed(2)} %</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        APY
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3">{formatShortUSDS(vault.state.totalAssetsUsd)}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        Total Deposits ($)
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
              </Grid>
            </Box>

            {!isBalanceLoading && vaultBalance !== 0n && (
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
                            Balance ({vault.asset.symbol})
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="h3" sx={{ color: theme.palette.grey[500] }}>
                              {vaultBalance ? parseFloat(formatUnits(vaultBalance, vault.asset.decimals || 18)).toFixed(4) : '0'}
                            </Typography>
                            {/*{isChanged && futurePosition && (*/}
                            {/*  <>*/}
                            {/*    <ArrowRightAlt style={{ color: theme.palette.grey[500] }} />*/}
                            {/*    <Typography variant="h3">*/}
                            {/*      {futurePosition?.borrowAssets*/}
                            {/*        ? parseFloat(formatUnits(futurePosition?.borrowAssets, marketData.loanAsset?.decimals || 18)).toFixed(4)*/}
                            {/*        : '0'}*/}
                            {/*    </Typography>*/}
                            {/*  </>*/}
                            {/*)}*/}
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
            <Paper sx={{ mb: 3, backgroundColor: 'background.default' }}>
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  value={tabValue}
                  onChange={handleTabChange}
                  aria-label="vault transaction tabs"
                  sx={{
                    height: '58px',
                    minHeight: '58px',
                    borderColor: 'black',
                    width: '100%',
                    '& .MuiTabs-flexContainer': {
                      border: 0,
                      height: '100%',
                      width: '100%'
                    }
                  }}
                >
                  <Tab label="Deposit" id="vault-tab-0" aria-controls="vault-tabpanel-0" sx={{ height: '100%', flex: 1 }} />
                  <Tab label="Withdraw" id="vault-tab-1" aria-controls="vault-tabpanel-1" sx={{ height: '100%', flex: 1 }} />
                </Tabs>
              </Box>
              <TabPanel value={tabValue} index={0} sx={{ bgcolor: theme.palette.background.paper }}>
                <DepositTab vaultAddress={vaultAddress as string} vaultData={vault} />
              </TabPanel>
              <TabPanel value={tabValue} index={1} sx={{ bgcolor: theme.palette.background.paper }}>
                <WithdrawTab vaultAddress={vaultAddress as string} vaultData={vault} />
              </TabPanel>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
