import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import {
  Typography,
  CircularProgress,
  Paper,
  Grid,
  Button,
  Divider,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Tooltip,
  IconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { VaultsData } from 'types/vaults';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatEther, formatUnits, parseEther } from 'viem';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useWriteTransaction } from 'hooks/useWriteTransaction';
import { useDebounce } from 'hooks/useDebounce';

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
  const { address: vaultAddress } = useParams<{ vaultAddress: string }>();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const { address: userAddress } = useAccount();
  const debouncedDepositAmount = useDebounce(depositAmount, 500);
  const debouncedWithdrawAmount = useDebounce(depositAmount, 500);

  // Track when allowance checking is in progress (during debounce)
  const [allowanceChecking, setAllowanceChecking] = useState(false);

  // Use custom transaction hooks
  const approveTx = useWriteTransaction();
  const depositTx = useWriteTransaction();

  // Track process completion
  const [isApproved, setIsApproved] = useState(false);
  const [isDeposited, setIsDeposited] = useState(false);

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

  const { loading, error, data } = useQuery<VaultsData>(MorphoRequests.GetMorprhoVaultByAddress, {
    variables: { address: vaultAddress, chain: 1 },
    client: appoloClients.morphoApi
  });

  // Check allowance to determine if approval is needed
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: data?.vaults?.items[0]?.asset.address as `0x${string}` | undefined,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, vaultAddress as `0x${string}`],
    query: {
      enabled: !!userAddress && !!vaultAddress && !!data?.vaults?.items[0]
    }
  });

  useEffect(() => {
    if (debouncedDepositAmount && refetchAllowance) {
      setAllowanceChecking(false); // Clear checking state when debounced value is processed
      refetchAllowance();
    }
  }, [debouncedDepositAmount, refetchAllowance]);

  useEffect(() => {
    if (depositAmount !== debouncedDepositAmount && depositAmount) {
      setAllowanceChecking(true); // Set checking state when amount changes
    }
  }, [depositAmount, debouncedDepositAmount]);

  // Check if approval is needed
  useEffect(() => {
    if (userAddress && debouncedDepositAmount && allowanceData && vaultAddress) {
      try {
        const amountBigInt = parseEther(debouncedDepositAmount);
        const shouldBeApproved = allowanceData >= amountBigInt;

        // Only update state if it's different to avoid unnecessary re-renders
        if (shouldBeApproved !== isApproved) {
          setIsApproved(shouldBeApproved);
        }
      } catch (error) {
        console.error('Error checking allowance:', error);
      }
    }
  }, [userAddress, debouncedDepositAmount, allowanceData, isApproved, vaultAddress]);

  // Set up token approval contract write
  const { writeContract: writeApprove, data: approveData } = useWriteContract({
    mutation: {
      onError(error) {
        console.error('Approval error:', error);
        setTxError('Failed to approve tokens');
        setIsApproving(false);
        dispatchError('Failed to approve tokens');
      },
      onSuccess() {
        dispatchSuccess('Tokens approved');
      }
    }
  });

  // Set up deposit contract write
  const { writeContract: writeDeposit, data: depositData } = useWriteContract({
    mutation: {
      onError(error) {
        console.error('Deposit error:', error);
        // setTxError('Failed to deposit tokens: ' + error.message);
        setTxError('Failed to deposit tokens');
        setIsDepositing(false);
        dispatchError('Failed to deposit tokens');
      },
      onSuccess() {
        dispatchSuccess('Tokens deposited');
      }
    }
  });

  // Wait for approval transaction
  const { isLoading: isApprovalLoading, isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({ hash: approveData });

  // Wait for deposit transaction
  const { isLoading: isDepositLoading, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({ hash: depositData });

  // Read user's token balance
  const { data: tokenBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: data?.vaults?.items[0]?.asset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!data?.vaults?.items[0]
    }
  });

  // Read user's vault balance
  const { data: vaultBalance } = useReadContract({
    abi: vaultConfig.abi,
    address: vaultAddress as `0x${string}` | undefined,
    functionName: 'maxWithdraw',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultAddress
    }
  });

  // Format balances for display
  const formattedTokenBalance = useMemo(() => {
    if (!tokenBalance || !data?.vaults?.items[0]) return '0';
    return formatUnits(tokenBalance as bigint, data.vaults.items[0].asset.decimals);
  }, [tokenBalance, data]);

  const rawTokenBalance = useMemo(() => {
    if (!tokenBalance || !data?.vaults?.items[0]) return '0';
    return tokenBalance;
  }, [tokenBalance, data]);

  const formattedVaultBalance = useMemo(() => {
    if (!vaultBalance || !data?.vaults?.items[0]) return '0';
    return formatUnits(vaultBalance as bigint, data.vaults.items[0].asset.decimals);
  }, [vaultBalance, data]);

  // Handle percentage button clicks
  const handleDepositPercentClick = useCallback(
    (percent: number) => {
      const value = (Number(formatEther(BigInt(rawTokenBalance))) * percent) / 100;
      setDepositAmount(value.toString());

      if (depositAmount !== debouncedDepositAmount) {
        setAllowanceChecking(true);
      }
    },
    [depositAmount, debouncedDepositAmount, rawTokenBalance]
  );

  const handleBack = () => {
    navigate('/earn');
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDeposit = async () => {
    console.log('handleDeposit');
    if (!userAddress || !vaultAddress || !depositAmount || parseFloat(depositAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!data?.vaults?.items[0]) {
      setTxError('Vault data not available');
      return;
    }

    const vault = data.vaults.items[0];
    const assetAddress = vault.asset.address;
    const assetDecimals = vault.asset.decimals;

    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(parseFloat(depositAmount) * 10 ** assetDecimals));

    try {
      // First approve tokens
      setIsApproving(true);
      writeApprove({
        abi: erc20ABIConfig.abi,
        address: assetAddress as `0x${string}`,
        functionName: 'approve',
        args: [vaultAddress as `0x${string}`, amountBN]
      });
    } catch (error) {
      console.error('Error approving tokens:', error);
      setIsApproving(false);
    }
  };

  // Execute deposit after approval completes
  useEffect(() => {
    const executeDeposit = async () => {
      if (isApprovalSuccess && data?.vaults?.items[0] && vaultAddress && userAddress && depositAmount) {
        setIsApproving(false);
        setIsDepositing(true);

        const vault = data.vaults.items[0];
        const assetDecimals = vault.asset.decimals;
        const amountBN = BigInt(Math.floor(parseFloat(depositAmount) * 10 ** assetDecimals));

        try {
          writeDeposit({
            abi: vaultConfig.abi,
            address: vaultAddress as `0x${string}`,
            functionName: 'deposit',
            args: [amountBN, userAddress as `0x${string}`]
          });
        } catch (error) {
          console.error('Error depositing tokens:', error);
          // setTxError(`Failed to deposit tokens: ${error instanceof Error ? error.message : String(error)}`);
          setIsDepositing(false);
        }
      }
    };

    executeDeposit();
  }, [isApprovalSuccess]);

  // Reset form and states after successful deposit
  useEffect(() => {
    if (isDepositSuccess) {
      setDepositAmount('');
      setIsDepositing(false);
    }
  }, [isDepositSuccess]);

  // Set up withdraw contract write
  const { writeContract: writeWithdraw, data: withdrawData } = useWriteContract({
    mutation: {
      onError(error) {
        console.error('Withdraw error:', error);
        setTxError(`Failed to withdraw tokens`);
        dispatchError('Failed to withdraw tokens');
      },
      onSuccess() {
        dispatchSuccess('Tokens withdrawn');
      }
    }
  });

  // Wait for withdraw transaction
  const { isLoading: isWithdrawLoading, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawData });

  const handleWithdraw = async () => {
    if (!userAddress || !vaultAddress || !withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!data?.vaults?.items[0]) {
      setTxError('Vault data not available');
      return;
    }

    const vault = data.vaults.items[0];
    const assetDecimals = vault.asset.decimals;

    // Calculate amount with decimals
    const amountBN = BigInt(Math.floor(parseFloat(withdrawAmount) * 10 ** assetDecimals));

    try {
      writeWithdraw({
        abi: vaultConfig.abi,
        address: vaultAddress as `0x${string}`,
        functionName: 'withdraw',
        args: [amountBN, userAddress as `0x${string}`, userAddress as `0x${string}`]
      });
    } catch (error) {
      console.error('Error withdrawing tokens:', error);
      // setTxError(`Failed to withdraw tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Reset form and states after successful withdraw
  useEffect(() => {
    if (isWithdrawSuccess) {
      setWithdrawAmount('');
    }
  }, [isWithdrawSuccess]);

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
              <Tooltip title={copySuccess || 'Copy address'} placement="top">
                <IconButton onClick={() => copyToClipboard(vault.address)} sx={{ ml: 0.5, padding: '2px' }}>
                  <ContentCopyIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </Tooltip>
              {/*<Chip label={`APY: ${(vault.state.dailyNetApy * 100).toFixed(2)}%`} color="primary" variant="outlined" />*/}
            </Box>
            <Divider sx={{ my: 5 }} />
            <Grid container spacing={3}>
              <Grid size={{ xs: 3, md: 3 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    APY
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
                      {(vault.state.dailyNetApy * 100).toFixed(2)} %
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              <Grid size={{ xs: 3, md: 3 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Asset
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
                      {vault.asset.symbol}
                    </Typography>
                    <Tooltip title={copySuccess || 'Copy address'} placement="top">
                      <IconButton onClick={() => copyToClipboard(vault.asset.address)} sx={{ ml: 0.5, padding: '2px' }}>
                        <ContentCopyIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
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
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Balance: {formattedTokenBalance} {vault.asset.symbol || vault.symbol}
                  </Typography>
                </Box>
                <TextField
                  label="Deposit Amount"
                  variant="outlined"
                  type="number"
                  fullWidth
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">{vault.asset.symbol || vault.symbol}</InputAdornment>
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(25)}>
                    25%
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(50)}>
                    50%
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(75)}>
                    75%
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => handleDepositPercentClick(100)}>
                    Max
                  </Button>
                </Box>
                {txError && (
                  <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                    {txError}
                  </Typography>
                )}
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleDeposit}
                  disabled={
                    !depositAmount || parseFloat(depositAmount) <= 0 || isApproving || isDepositing || isApprovalLoading || isDepositLoading
                  }
                >
                  {isApproving || isApprovalLoading ? 'Approving...' : isDepositing || isDepositLoading ? 'Depositing...' : 'Deposit'}
                </Button>
              </Box>
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Vault Balance: {formattedVaultBalance} {vault.asset.symbol}
                  </Typography>
                </Box>
                <TextField
                  label="Withdraw Amount"
                  variant="outlined"
                  type="number"
                  fullWidth
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">{vault.asset.symbol}</InputAdornment>
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setWithdrawAmount((parseFloat(formattedVaultBalance) * 0.25).toString())}
                  >
                    25%
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setWithdrawAmount((parseFloat(formattedVaultBalance) * 0.5).toString())}
                  >
                    50%
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setWithdrawAmount((parseFloat(formattedVaultBalance) * 0.75).toString())}
                  >
                    75%
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => setWithdrawAmount(formattedVaultBalance)}>
                    Max
                  </Button>
                </Box>
                {txError && tabValue === 1 && (
                  <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                    {txError}
                  </Typography>
                )}
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleWithdraw}
                  disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isWithdrawLoading}
                >
                  {isWithdrawLoading ? 'Withdrawing...' : 'Withdraw'}
                </Button>
              </Box>
            </TabPanel>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
