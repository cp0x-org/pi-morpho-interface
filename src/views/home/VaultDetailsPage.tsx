import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Grid, Tabs, Tab, Tooltip, IconButton, Stack, useTheme, Card } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useMemo, useState } from 'react';
import { Vault, VaultsData, VaultsV2Data } from 'types/vaults';
import { normalizeVaultV2 } from 'utils/vaults';
import { VaultVersionChip } from 'components/VaultVersionChip';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import DepositTab from 'views/home/vault/Deposit';
import WithdrawTab from 'views/home/vault/Withdraw';
import SubCard from 'ui-component/cards/SubCard';
import { useAccount, useReadContract } from 'wagmi';
import { useWalletChainSync } from 'hooks/useWalletChainSync';
import { useSearchParams } from 'react-router-dom';
import { formatShortUSDS } from 'utils/formatters';
import { TokenIcon } from 'components/TokenIcon';
import { BalanceReadError } from 'components/BalanceReadError';
import { useRefreshOnNewBlock } from 'hooks/useRefreshOnNewBlock';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { formatUnits } from 'viem';
import TabPanel from './components/TabPanel';
import { FormattedMessage, useIntl } from 'react-intl';

export default function VaultDetailsPage() {
  const theme = useTheme();
  const intl = useIntl();
  const { vaultAddress } = useParams<{ vaultAddress: string }>();
  const [searchParams] = useSearchParams();
  const targetChainId = Number(searchParams.get('chainId')) || undefined;
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const { address: userAddress } = useAccount();

  const {
    loading: v1Loading,
    error: v1Error,
    data: v1Data
  } = useQuery<VaultsData>(MorphoRequests.GetMorprhoVaultByAddress, {
    variables: { address: vaultAddress },
    client: appoloClients.morphoApi
  });
  const v1Vault = v1Data?.vaults.items[0];
  // Vaults V2 are a separate API entity: looked up only when the address is not a V1 vault.
  const {
    loading: v2Loading,
    error: v2Error,
    data: v2Data
  } = useQuery<VaultsV2Data>(MorphoRequests.GetMorphoVaultV2ByAddress, {
    variables: { address: vaultAddress, chainIds: targetChainId ? [targetChainId] : null },
    client: appoloClients.morphoApi,
    skip: v1Loading || !!v1Vault
  });
  const loading = v1Loading || v2Loading;
  const error = v1Error ?? v2Error;

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const vault = useMemo<Vault | undefined>(() => {
    if (v1Vault) return { ...v1Vault, version: 'v1' };
    const v2Vault = v2Data?.vaultV2s.items[0];
    return v2Vault ? normalizeVaultV2(v2Vault) : undefined;
  }, [v1Vault, v2Data]);
  // Reads and writes target the vault's chain, not the chain the wallet happens to be on.
  const vaultChainId = targetChainId ?? vault?.chain?.id;
  useWalletChainSync(vaultChainId);
  // Token and vault balances follow the chain, including changes made outside the interface (a swap in the wallet).
  useRefreshOnNewBlock(vaultChainId);

  // Read user's vault balance
  const {
    data: vaultBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    refetch: refetchVaultBalance
  } = useReadContract({
    abi: vaultConfig.abi,
    address: vaultAddress as `0x${string}` | undefined,
    chainId: vaultChainId,
    functionName: 'maxWithdraw',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultAddress && !!vaultChainId
    }
  });
  const formattedVaultBalance = useMemo(() => {
    if (!vaultBalance || !vault) return '0';
    return formatUnits(vaultBalance as bigint, vault.asset.decimals);
  }, [vaultBalance, vault]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label={intl.formatMessage({ id: 'vault.loading' })} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          <FormattedMessage id="vault.error" values={{ message: error.message }} />
        </Typography>
      </Box>
    );
  }

  if (!vault) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="alert" color="error">
          <FormattedMessage id="vault.notFound" />
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
                        avatarProps={{ sx: { width: 45, height: 45 }, alt: '' }}
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
                    <FormattedMessage id="vault.details" />
                  </Typography>
                  <Box display="flex" alignItems="center">
                    <Typography variant="h2" component="h1" sx={{ display: 'inline' }}>
                      {vault.name || intl.formatMessage({ id: 'common.na' })}
                    </Typography>
                    <Box sx={{ ml: 1 }}>
                      <VaultVersionChip version={vault.version} />
                    </Box>
                    {vault.address && (
                      <Tooltip title={copySuccessMsg || intl.formatMessage({ id: 'common.copyAddress' })} placement="top">
                        <IconButton
                          aria-label={intl.formatMessage({ id: 'vault.copyVaultAria' }, { address: vault.address })}
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
                          {vault.asset.symbol || intl.formatMessage({ id: 'common.na' })}
                        </Typography>
                        {vault.asset.address && (
                          <Tooltip title={copySuccessMsg || intl.formatMessage({ id: 'common.copyAddress' })} placement="top">
                            <IconButton
                              aria-label={intl.formatMessage(
                                { id: 'vault.copyAssetAria' },
                                { symbol: vault.asset.symbol || intl.formatMessage({ id: 'vault.asset' }), address: vault.asset.address }
                              )}
                              onClick={() => copyToClipboard(vault.asset.address || '')}
                              sx={{ ml: 0.2, padding: '5px', marginLeft: '10px' }}
                            >
                              <ContentCopyIcon sx={{ fontSize: '22px', color: theme.palette.grey[500] }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                      <Typography variant="h6" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        <FormattedMessage id="vault.asset" />
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3" component="p">
                        {(vault.state.avgNetApy * 100).toFixed(2)} %
                      </Typography>
                      <Typography variant="h6" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        <FormattedMessage id="vault.apy" />
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>

                <Grid size={{ xs: 12, sm: 4 }}>
                  <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                    <Stack spacing={1}>
                      <Typography variant="h3" component="p">
                        {formatShortUSDS(vault.state.totalAssetsUsd)}
                      </Typography>
                      <Typography variant="h6" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                        <FormattedMessage id="vault.totalDepositsUsd" />
                      </Typography>
                    </Stack>
                  </SubCard>
                </Grid>
                {vault.version === 'v2' && vault.state.liquidityUsd != null && (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <SubCard sx={{ border: 'none', backgroundColor: 'transparent', ':hover': { boxShadow: 'none' } }}>
                      <Stack spacing={1}>
                        <Typography variant="h3" component="p">
                          {formatShortUSDS(vault.state.liquidityUsd)}
                        </Typography>
                        <Typography variant="h6" component="div" sx={{ fontWeight: 400, color: theme.palette.grey[500] }}>
                          <FormattedMessage id="vault.liquidityUsd" />
                        </Typography>
                      </Stack>
                    </SubCard>
                  </Grid>
                )}
              </Grid>
            </Box>

            {!isBalanceLoading && vaultBalance !== 0n && (
              <Grid size={{ xs: 12 }}>
                <Paper>
                  <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '40px' }}>
                    <FormattedMessage id="common.yourPosition" />
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
                            component="div"
                            sx={{ fontWeight: 400, color: theme.palette.grey[500], height: '24px', marginBottom: '8px' }}
                          >
                            <FormattedMessage id="vault.balanceWithSymbol" values={{ symbol: vault.asset.symbol }} />
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Typography variant="h3" component="p" sx={{ color: theme.palette.grey[500] }}>
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
                          <BalanceReadError id="vault-balance-error" isError={isBalanceError} onRetry={refetchVaultBalance} />
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
                  aria-label={intl.formatMessage({ id: 'vault.tabsAria' })}
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
                  <Tab
                    label={intl.formatMessage({ id: 'vault.tabDeposit' })}
                    id="vault-tab-0"
                    aria-controls="vault-tabpanel-0"
                    sx={{ height: '100%', flex: 1 }}
                  />
                  <Tab
                    label={intl.formatMessage({ id: 'vault.tabWithdraw' })}
                    id="vault-tab-1"
                    aria-controls="vault-tabpanel-1"
                    sx={{ height: '100%', flex: 1 }}
                  />
                </Tabs>
              </Box>
              <TabPanel value={tabValue} index={0} idPrefix="vault" sx={{ bgcolor: theme.palette.background.paper }}>
                <DepositTab vaultAddress={vaultAddress as string} vaultData={vault} chainId={vaultChainId} />
              </TabPanel>
              <TabPanel value={tabValue} index={1} idPrefix="vault" sx={{ bgcolor: theme.palette.background.paper }}>
                <WithdrawTab vaultAddress={vaultAddress as string} vaultData={vault} chainId={vaultChainId} />
              </TabPanel>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
