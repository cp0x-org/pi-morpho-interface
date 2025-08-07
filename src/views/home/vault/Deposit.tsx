import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import Box from '@mui/material/Box';
import { Typography, CircularProgress, Button, TextField, InputAdornment } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import { Vault, VaultsData } from 'types/vaults';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatEther, formatUnits, parseEther } from 'viem';
import { vaultConfig } from '@/appconfig/abi/Vault';
import { MorphoRequests } from '@/api/constants';
import { appoloClients } from '@/api/apollo-client';
import { dispatchError, dispatchSuccess } from 'utils/snackbar';
import { useDebounce } from 'hooks/useDebounce';

interface DepositProps {
  vaultAddress: string;
  vaultData?: Vault;
}

const DepositTab: FC<DepositProps> = ({ vaultAddress, vaultData }) => {
  const navigate = useNavigate();
  const [depositAmount, setDepositAmount] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const { address: userAddress } = useAccount();
  const debouncedDepositAmount = useDebounce(depositAmount, 500);

  // Track when allowance checking is in progress (during debounce)
  const [allowanceChecking, setAllowanceChecking] = useState(false);

  // Track process completion
  const [isApproved, setIsApproved] = useState(false);

  // Check allowance to determine if approval is needed
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: vaultData.asset.address as `0x${string}` | undefined,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, vaultAddress as `0x${string}`],
    query: {
      enabled: !!userAddress && !!vaultAddress && !!vaultData
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
    address: vaultData.asset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!vaultData
    }
  });

  // Format balances for display
  const formattedTokenBalance = useMemo(() => {
    if (!tokenBalance || !vaultData) return '0';
    return formatUnits(tokenBalance as bigint, vaultData.asset.decimals);
  }, [tokenBalance]);

  const rawTokenBalance = useMemo(() => {
    if (!tokenBalance || !vaultData) return '0';
    return tokenBalance;
  }, [tokenBalance]);

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

  const handleDeposit = async () => {
    if (!userAddress || !vaultAddress || !depositAmount || parseFloat(depositAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!vaultData) {
      setTxError('Vault data not available');
      return;
    }

    const assetAddress = vaultData.asset.address;
    const assetDecimals = vaultData.asset.decimals;

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
      if (isApprovalSuccess && vaultData && vaultAddress && userAddress && depositAmount) {
        setIsApproving(false);
        setIsDepositing(true);

        const assetDecimals = vaultData.asset.decimals;
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

  if (!vaultData) {
    return <Box>Incorrect Vault Data</Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Balance: {formattedTokenBalance} {vaultData.asset.symbol || vaultData.symbol}
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
          endAdornment: <InputAdornment position="end">{vaultData.asset.symbol || vaultData.symbol}</InputAdornment>
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
        disabled={!depositAmount || parseFloat(depositAmount) <= 0 || isApproving || isDepositing || isApprovalLoading || isDepositLoading}
      >
        {isApproving || isApprovalLoading ? 'Approving...' : isDepositing || isDepositLoading ? 'Depositing...' : 'Deposit'}
      </Button>
    </Box>
  );
};

export default DepositTab;
