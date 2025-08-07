import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Button, TextField, InputAdornment } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import React, { useState, useMemo, useEffect, FC } from 'react';
import { VaultsData } from 'types/vaults';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';

interface WithdrawProps {
  vaultAddress?: string;
}

const WithdrawTab: FC<WithdrawProps> = ({ vaultAddress = '' }) => {
  const navigate = useNavigate();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();

  const { loading, error, data } = useQuery<VaultsData>(MorphoRequests.GetMorprhoVaultByAddress, {
    variables: { address: vaultAddress, chain: 1 },
    client: appoloClients.morphoApi
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

  // Format vault balance for display
  const formattedVaultBalance = useMemo(() => {
    if (!vaultBalance || !data?.vaults?.items[0]) return '0';
    return formatUnits(vaultBalance as bigint, data.vaults.items[0].asset.decimals);
  }, [vaultBalance, data]);

  const handleBack = () => {
    navigate('/earn');
  };

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
        <Button variant="outlined" size="small" onClick={() => setWithdrawAmount((parseFloat(formattedVaultBalance) * 0.25).toString())}>
          25%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setWithdrawAmount((parseFloat(formattedVaultBalance) * 0.5).toString())}>
          50%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setWithdrawAmount((parseFloat(formattedVaultBalance) * 0.75).toString())}>
          75%
        </Button>
        <Button variant="outlined" size="small" onClick={() => setWithdrawAmount(formattedVaultBalance)}>
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
        onClick={handleWithdraw}
        disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || isWithdrawLoading}
      >
        {isWithdrawLoading ? 'Withdrawing...' : 'Withdraw'}
      </Button>
    </Box>
  );
};

export default WithdrawTab;
