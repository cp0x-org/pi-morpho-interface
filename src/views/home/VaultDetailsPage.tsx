import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Paper, Grid, Button, Divider, Tabs, Tab, Tooltip, IconButton, Stack, useTheme } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useState } from 'react';
import { VaultsData } from 'types/vaults';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import DepositTab from 'views/home/vault/Deposit';
import WithdrawTab from 'views/home/vault/Withdraw';
import SubCard from 'ui-component/cards/SubCard';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} id={`vault-tabpanel-${index}`} aria-labelledby={`vault-tab-${index}`} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function VaultDetailsPage() {
  const theme = useTheme();
  const { vaultAddress } = useParams<{ vaultAddress: string }>();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();

  const { loading, error, data } = useQuery<VaultsData>(MorphoRequests.GetMorprhoVaultByAddress, {
    variables: { address: vaultAddress, chain: 1 },
    client: appoloClients.morphoApi
  });

  const handleBack = () => {
    navigate('/earn');
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
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
        <Typography color="error">Error loading vault details: {error.message}</Typography>
      </Box>
    );
  }

  const vault = data?.vaults.items[0];

  if (!vault) {
    return (
      <Box sx={{ padding: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 2 }}>
          Back to Earn
        </Button>
        <Typography variant="h5" color="error">
          Vault not found
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mb: 3 }}>
        Back to Earn
      </Button>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box sx={{ display: 'flex' }}>
              <Typography variant="h4">
                {vault.name} ({vault.symbol})
              </Typography>
              <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                <IconButton onClick={() => copyToClipboard(vault.address)} sx={{ ml: 0.5, padding: '2px' }}>
                  <ContentCopyIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </Tooltip>
              {/*<Chip label={`APY: ${(vault.state.dailyNetApy * 100).toFixed(2)}%`} color="primary" variant="outlined" />*/}
            </Box>
            <Divider sx={{ my: 5 }} />
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <SubCard sx={{ bgcolor: 'grey.100', ...theme.applyStyles('dark', { bgcolor: 'background.default' }) }}>
                  <Stack spacing={1}>
                    <Typography variant="h5" sx={{ fontWeight: 400 }}>
                      APY
                    </Typography>
                    <Typography variant="h3">{(vault.state.dailyNetApy * 100).toFixed(2)} %</Typography>
                  </Stack>
                </SubCard>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <SubCard sx={{ bgcolor: 'grey.100', ...theme.applyStyles('dark', { bgcolor: 'background.default' }) }}>
                  <Stack spacing={1}>
                    <Typography variant="h5" sx={{ fontWeight: 400 }}>
                      Asset
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="h3">{vault.asset.symbol}</Typography>
                      <Tooltip title={copySuccessMsg || 'Copy address'} placement="top">
                        <IconButton onClick={() => copyToClipboard(vault.asset.address)} sx={{ ml: 0.5, padding: '2px' }}>
                          <ContentCopyIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Stack>
                </SubCard>
              </Grid>
            </Grid>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange} aria-label="vault transaction tabs">
                <Tab label="Deposit" id="vault-tab-0" aria-controls="vault-tabpanel-0" />
                <Tab label="Withdraw" id="vault-tab-1" aria-controls="vault-tabpanel-1" />
              </Tabs>
            </Box>
            <TabPanel value={tabValue} index={0}>
              <DepositTab vaultAddress={vaultAddress as string} vaultData={vault} />
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              <WithdrawTab vaultAddress={vaultAddress as string} vaultData={vault} />
            </TabPanel>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
