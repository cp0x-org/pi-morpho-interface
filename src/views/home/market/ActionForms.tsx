import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, TextField, InputAdornment, CircularProgress } from '@mui/material';
import Button from '@mui/material/Button';
import React, { useState, useMemo, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatUnits, parseUnits } from 'viem';
import { usePosition } from '@morpho-org/blue-sdk-wagmi';
import { isMarketId } from '@morpho-org/blue-sdk/lib/types';
import type { MarketId } from '@morpho-org/blue-sdk/lib/types';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { morphoOracleConfig } from '@/appconfig/abi/MorphoOracle';
import { curveIrmConfig } from '@/appconfig/abi/CurveIrm';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  market?: MarketInterface;
  uniqueKey?: string;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div role="tabpanel" hidden={value !== index} id={`market-tabpanel-${index}`} aria-labelledby={`market-tab-${index}`} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function ActionForms(props: MarketProps) {
  const uniqueKey = props.uniqueKey;
  const market = props.market;
  const accrualPosition = props.accrualPosition;
  const [tabValue, setTabValue] = useState(0);

  const [addAmount, setAddAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const [isApproving, setIsApproving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const account = useAccount();
  const { address: userAddress } = useAccount();
  const { config: chainConfig } = useConfigChainId();

  const marketIdParam = useMemo(() => {
    if (uniqueKey && isMarketId(uniqueKey)) {
      return uniqueKey as MarketId;
    }
    return undefined;
  }, [uniqueKey]);

  // Only call usePosition if we have a valid marketId and user address
  const { data: position } = usePosition({
    user: account.address,
    marketId: marketIdParam,
    query: { enabled: !!marketIdParam && !!account.address }
  });

  // Log position data if available
  useEffect(() => {
    if (position) {
      console.log('User position data:', position);
    }
  }, [position]);

  // Set up contract interactions
  const { writeContract: writeApprove, data: approveData } = useWriteContract({
    mutation: {
      onError(error) {
        console.error('Approval error:', error);
        setTxError('Failed to approve tokens: ' + error.name);
        setIsApproving(false);
      }
    }
  });

  // Set up transaction contract write
  const { writeContract: writeTransaction, data: transactionData } = useWriteContract({
    mutation: {
      onError(error) {
        console.error('Transaction error:', error);
        setTxError('Transaction failed: ' + error.name);
        setIsProcessing(false);
      }
    }
  });

  // Wait for approval transaction
  const { isLoading: isApprovalLoading, isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({ hash: approveData });

  // Wait for main transaction
  const { isLoading: isTransactionLoading, isSuccess: isTransactionSuccess } = useWaitForTransactionReceipt({ hash: transactionData });

  // Read user's collateral token balance
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: market?.collateralAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!market?.collateralAsset
    }
  });

  // Read user's loan token balance
  const { data: loanBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: market?.loanAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!market?.loanAsset
    }
  });

  // Format balances for display
  const formattedCollateralBalance = useMemo(() => {
    if (!collateralBalance) return '0';
    return formatUnits(collateralBalance as bigint, market?.collateralAsset?.decimals ? market.collateralAsset.decimals : 0);
  }, [collateralBalance, market]);

  const formattedMaxBorrowable = useMemo(() => {
    if (!accrualPosition?.maxBorrowableAssets) return '0';
    return formatUnits(accrualPosition?.maxBorrowableAssets as bigint, market?.loanAsset?.decimals ? market.loanAsset.decimals : 0);
  }, [accrualPosition, market]);

  const formattedLoanBalance = useMemo(() => {
    if (!loanBalance) return '0';
    return formatUnits(loanBalance as bigint, market?.loanAsset?.decimals ? market?.loanAsset?.decimals : 0);
  }, [loanBalance, market]);

  const formattedWithdrawableCollateral = useMemo(() => {
    if (!accrualPosition?.withdrawableCollateral) return '0';
    return formatUnits(
      accrualPosition?.withdrawableCollateral as bigint,
      market?.collateralAsset?.decimals ? market.collateralAsset.decimals : 0
    );
  }, [accrualPosition, market]);

  // Execute operations after approval completes
  useEffect(() => {
    const executeAfterApproval = async () => {
      if (isApprovalSuccess && market && uniqueKey && userAddress) {
        setIsApproving(false);
        setIsProcessing(true);

        try {
          if (tabValue === 0 && addAmount) {
            // Add collateral
            const amountBN = parseUnits(addAmount, market.collateralAsset.decimals);
            writeTransaction({
              address: chainConfig.contracts.Morpho,
              // This is a placeholder - replace with actual ABI and function
              abi: morphoContractConfig.abi,
              functionName: 'supplyCollateral',
              args: [
                {
                  loanToken: market.loanAsset.address as `0x${string}`,
                  collateralToken: market.collateralAsset.address as `0x${string}`,
                  oracle: market.oracleAddress as `0x${string}`,
                  irm: market.irmAddress as `0x${string}`,
                  lltv: BigInt(market.lltv)
                },
                amountBN,
                userAddress as `0x${string}`,
                '' as `0x${string}`
              ]
            });
          } else if (tabValue === 2 && repayAmount) {
            // Repay loan
            const amountBN = parseUnits(repayAmount, market.loanAsset.decimals);

            writeTransaction({
              address: chainConfig.contracts.Morpho,
              // This is a placeholder - replace with actual ABI and function
              abi: morphoContractConfig.abi,
              functionName: 'repay',
              args: [
                {
                  loanToken: market.loanAsset.address as `0x${string}`,
                  collateralToken: market.collateralAsset.address as `0x${string}`,
                  oracle: market.oracleAddress as `0x${string}`,
                  irm: market.irmAddress as `0x${string}`,
                  lltv: BigInt(market.lltv)
                },
                amountBN,
                0n,
                userAddress as `0x${string}`,
                '' as `0x${string}`
              ]
            });
          }
        } catch (error) {
          console.error('Error in transaction after approval:', error);
          setTxError(`Transaction failed: ${error instanceof Error ? error.name : ''}`);
          setIsProcessing(false);
        }
      }
    };

    executeAfterApproval();
  }, [isApprovalSuccess, uniqueKey, userAddress, tabValue, addAmount, repayAmount, writeTransaction, market]);

  // Reset form and states after successful transaction
  useEffect(() => {
    if (isTransactionSuccess) {
      if (tabValue === 0) setAddAmount('');
      else if (tabValue === 1) setBorrowAmount('');
      else if (tabValue === 2) setRepayAmount('');
      else if (tabValue === 3) setWithdrawAmount('');

      setIsProcessing(false);
    }
  }, [isTransactionSuccess, tabValue]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setTxError(null);
  };

  // Handle add collateral
  const handleAddCollateral = async () => {
    if (!userAddress || !uniqueKey || !addAmount || parseFloat(addAmount) <= 0) {
      return;
    }

    setTxError(null);
    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      setIsProcessing(false);
      return;
    }
    try {
      const assetAddress = market?.collateralAsset.address;
      const marketAddress = chainConfig.contracts.Morpho;
      const assetDecimals = market?.collateralAsset.decimals;

      // Calculate amount with decimals
      const amountBN = parseUnits(addAmount, assetDecimals);

      // First approve tokens
      setIsApproving(true);
      writeApprove({
        abi: erc20ABIConfig.abi,
        address: assetAddress as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress as `0x${string}`, amountBN]
      });
    } catch (error) {
      console.error('Error approving tokens:', error);
      setTxError(`Failed to approve tokens: ${error instanceof Error ? error.name : ''}`);
      setIsApproving(false);
    }
  };

  // Handle borrow loan asset
  const handleBorrow = async () => {
    if (!userAddress || !uniqueKey || !borrowAmount || parseFloat(borrowAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      setIsProcessing(false);
      return;
    }

    try {
      const assetDecimals = market.loanAsset.decimals;

      // Calculate amount with decimals
      const amountBN = parseUnits(borrowAmount, assetDecimals);

      setIsProcessing(true);
      // Example function call - this would need to be replaced with actual contract method
      writeTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        // This is a placeholder - replace with actual ABI and function
        abi: morphoContractConfig.abi,
        functionName: 'borrow',
        args: [
          {
            loanToken: market.loanAsset.address as `0x${string}`,
            collateralToken: market.collateralAsset.address as `0x${string}`,
            oracle: market.oracleAddress as `0x${string}`,
            irm: market.irmAddress as `0x${string}`,
            lltv: BigInt(market.lltv)
          },
          amountBN,
          0n,
          userAddress as `0x${string}`,
          userAddress as `0x${string}`
        ]
      });
    } catch (error) {
      console.error('Error borrowing tokens:', error);
      setTxError(`Failed to borrow: ${error instanceof Error ? error.name : ''}`);
      setIsProcessing(false);
    }
  };

  // Handle repay loan
  const handleRepay = async () => {
    if (!userAddress || !uniqueKey || !repayAmount || parseFloat(repayAmount) <= 0) {
      return;
    }

    setTxError(null);
    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      setIsProcessing(false);
      return;
    }

    try {
      const assetAddress = market.loanAsset.address;
      const marketAddress = chainConfig.contracts.Morpho;
      const assetDecimals = market.loanAsset.decimals;

      // Calculate amount with decimals
      const amountBN = parseUnits(repayAmount, assetDecimals);

      // First approve tokens
      setIsApproving(true);
      writeApprove({
        abi: erc20ABIConfig.abi,
        address: assetAddress as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress as `0x${string}`, amountBN]
      });
    } catch (error) {
      console.error('Error approving tokens:', error);
      setTxError(`Failed to approve tokens: ${error instanceof Error ? error.name : ''}`);
      setIsApproving(false);
    }
  };

  // Handle withdraw collateral
  const handleWithdraw = async () => {
    if (!userAddress || !uniqueKey || !withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      return;
    }

    setTxError(null);

    if (!market) {
      console.error('Market Not Found');
      setTxError(`Market Not Found`);
      setIsProcessing(false);
      return;
    }

    const assetDecimals = market.collateralAsset.decimals;

    // Calculate amount with decimals
    const amountBN = parseUnits(withdrawAmount, assetDecimals);

    try {
      setIsProcessing(true);
      // Example function call - this would need to be replaced with actual contract method
      writeTransaction({
        address: chainConfig.contracts.Morpho as `0x${string}`,
        // This is a placeholder - replace with actual ABI and function
        abi: morphoContractConfig.abi,
        functionName: 'withdrawCollateral',
        args: [
          {
            loanToken: market.loanAsset.address as `0x${string}`,
            collateralToken: market.collateralAsset.address as `0x${string}`,
            oracle: market.oracleAddress as `0x${string}`,
            irm: market.irmAddress as `0x${string}`,
            lltv: BigInt(market.lltv)
          },
          amountBN,
          userAddress as `0x${string}`,
          userAddress as `0x${string}`
        ]
      });
    } catch (error) {
      console.error('Error withdrawing collateral:', error);
      setTxError(`Failed to withdraw: ${error instanceof Error ? error.name : String(error)}`);
      setIsProcessing(false);
    }
  };

  if (!uniqueKey || !market) {
    setTxError('Market data not available');

    <Box sx={{ padding: 2 }}>
      <Typography variant="h5" color="error">
        Market Not Found.
      </Typography>
    </Box>;

    console.log('UNIQUIEY || MAREKT');
    return;
  }

  if (!userAddress) {
    <Box sx={{ padding: 2 }}>
      <Typography variant="h5" color="error">
        Connect wallet to continue.
      </Typography>
    </Box>;
  }

  if (!uniqueKey || !market) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Market not found
        </Typography>
      </Box>
    );
  }
  //
  if (!market || !uniqueKey) {
    console.log('market || accrualPosition || uniqueKey');
    console.log(market);
    console.log(accrualPosition);
    console.log(uniqueKey);
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="market transaction tabs">
          <Tab label="Add" id="market-tab-0" aria-controls="market-tabpanel-0" />
          <Tab label="Borrow" id="market-tab-1" aria-controls="market-tabpanel-1" />
          <Tab label="Repay" id="market-tab-2" aria-controls="market-tabpanel-2" />
          <Tab label="Withdraw" id="market-tab-3" aria-controls="market-tabpanel-3" />
        </Tabs>
      </Box>

      {/* Add Collateral Tab */}
      <TabPanel value={tabValue} index={0}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Typography variant="body2" color="text.secondary">
              Supply Collateral {market.collateralAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <TextField
            label="Add Collateral Amount"
            variant="outlined"
            type="number"
            fullWidth
            value={addAmount}
            onChange={(e) => setAddAmount(e.target.value)}
            InputProps={{
              endAdornment: <InputAdornment position="end">{market.collateralAsset?.symbol || 'N/A'}</InputAdornment>
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Typography variant="body2" color="text.secondary">
              Balance: {formattedCollateralBalance} {market.collateralAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setAddAmount((parseFloat(formattedCollateralBalance) * 0.25).toString())}
            >
              25%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setAddAmount((parseFloat(formattedCollateralBalance) * 0.5).toString())}>
              50%
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setAddAmount((parseFloat(formattedCollateralBalance) * 0.75).toString())}
            >
              75%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setAddAmount(formattedCollateralBalance)}>
              Max
            </Button>
          </Box>
          {txError && tabValue === 0 && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {txError}
            </Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddCollateral}
            disabled={
              !addAmount ||
              parseFloat(addAmount) <= 0 ||
              parseFloat(addAmount) > parseFloat(formattedCollateralBalance) ||
              isApproving ||
              isProcessing ||
              isApprovalLoading ||
              isTransactionLoading
            }
          >
            {isApproving || isApprovalLoading ? 'Approving...' : isProcessing || isTransactionLoading ? 'Adding...' : 'Add Collateral'}
          </Button>
        </Box>
      </TabPanel>

      {/* Borrow Tab */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Typography variant="body2" color="text.secondary">
              Borrow {market.loanAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <TextField
            label="Borrow Amount"
            variant="outlined"
            type="number"
            fullWidth
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
            InputProps={{
              endAdornment: <InputAdornment position="end">{market.loanAsset?.symbol || 'N/A'}</InputAdornment>
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Typography variant="body2" color="text.secondary">
              Borrowable: {formattedMaxBorrowable} {market.loanAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button variant="outlined" size="small" onClick={() => setBorrowAmount((parseFloat(formattedMaxBorrowable) * 0.25).toString())}>
              25%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setBorrowAmount((parseFloat(formattedMaxBorrowable) * 0.5).toString())}>
              50%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setBorrowAmount((parseFloat(formattedMaxBorrowable) * 0.75).toString())}>
              75%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setBorrowAmount(formattedMaxBorrowable)}>
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
            onClick={handleBorrow}
            disabled={
              !borrowAmount ||
              parseFloat(borrowAmount) <= 0 ||
              parseFloat(borrowAmount) > parseFloat(formattedMaxBorrowable) ||
              isProcessing ||
              isTransactionLoading
            }
          >
            {isProcessing || isTransactionLoading ? 'Borrowing...' : 'Borrow'}
          </Button>
        </Box>
      </TabPanel>

      {/* Repay Tab */}
      <TabPanel value={tabValue} index={2}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Typography variant="body2" color="text.secondary">
              Repay Loan {market.loanAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <TextField
            label="Repay Amount"
            variant="outlined"
            type="number"
            fullWidth
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            InputProps={{
              endAdornment: <InputAdornment position="end">{market.loanAsset?.symbol || 'N/A'}</InputAdornment>
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Typography variant="body2" color="text.secondary">
              Balance: {formattedLoanBalance} {market.loanAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button variant="outlined" size="small" onClick={() => setRepayAmount((parseFloat(formattedLoanBalance) * 0.25).toString())}>
              25%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setRepayAmount((parseFloat(formattedLoanBalance) * 0.5).toString())}>
              50%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setRepayAmount((parseFloat(formattedLoanBalance) * 0.75).toString())}>
              75%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setRepayAmount(formattedLoanBalance)}>
              Max
            </Button>
          </Box>
          {txError && tabValue === 2 && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {txError}
            </Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            onClick={handleRepay}
            disabled={
              !repayAmount ||
              parseFloat(repayAmount) <= 0 ||
              parseFloat(repayAmount) > parseFloat(formattedLoanBalance) ||
              isApproving ||
              isProcessing ||
              isApprovalLoading ||
              isTransactionLoading
            }
          >
            {isApproving || isApprovalLoading ? 'Approving...' : isProcessing || isTransactionLoading ? 'Repaying...' : 'Repay Loan'}
          </Button>
        </Box>
      </TabPanel>

      {/* Withdraw Tab */}
      <TabPanel value={tabValue} index={3}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Typography variant="body2" color="text.secondary">
              Withdraw Collateral {market.collateralAsset?.symbol || 'N/A'}
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
              endAdornment: <InputAdornment position="end">{market.collateralAsset?.symbol || 'N/A'}</InputAdornment>
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Typography variant="body2" color="text.secondary">
              Withdrawable: {formattedWithdrawableCollateral} {market.collateralAsset?.symbol || 'N/A'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.25).toString())}
            >
              25%
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.5).toString())}
            >
              50%
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setWithdrawAmount((parseFloat(formattedWithdrawableCollateral) * 0.75).toString())}
            >
              75%
            </Button>
            <Button variant="outlined" size="small" onClick={() => setWithdrawAmount(formattedWithdrawableCollateral)}>
              Max
            </Button>
          </Box>
          {txError && tabValue === 3 && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {txError}
            </Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            onClick={handleWithdraw}
            disabled={
              !withdrawAmount ||
              parseFloat(withdrawAmount) <= 0 ||
              parseFloat(withdrawAmount) > parseFloat(formattedWithdrawableCollateral) ||
              isProcessing ||
              isTransactionLoading
            }
          >
            {isProcessing || isTransactionLoading ? 'Withdrawing...' : 'Withdraw'}
          </Button>
        </Box>
      </TabPanel>
    </Paper>
  );
}
