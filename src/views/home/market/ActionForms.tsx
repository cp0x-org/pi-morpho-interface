import Box from '@mui/material/Box';
import { Typography, Paper, Tabs, Tab, CircularProgress } from '@mui/material';
import React, { useState, useMemo, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { formatUnits, parseUnits } from 'viem';
import { usePosition } from '@morpho-org/blue-sdk-wagmi';
import { isMarketId } from '@morpho-org/blue-sdk/lib/types';
import type { MarketId } from '@morpho-org/blue-sdk/lib/types';
import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { useConfigChainId } from 'hooks/useConfigChainId';
import { AccrualPosition } from '@morpho-org/blue-sdk';
import { MarketInterface } from 'types/market';
import { TabPanel, AddTab, BorrowTab, RepayTab, WithdrawTab } from './components';

interface MarketProps {
  accrualPosition: AccrualPosition | null;
  market?: MarketInterface;
  uniqueKey?: string;
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
  // const { data: position } = usePosition({
  //   user: account.address,
  //   marketId: marketIdParam,
  //   query: { enabled: !!marketIdParam && !!account.address }
  // });

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
  }, [
    isApprovalSuccess,
    uniqueKey,
    userAddress,
    tabValue,
    addAmount,
    repayAmount,
    writeTransaction,
    market,
    chainConfig?.contracts?.Morpho,
    setTxError,
    setIsApproving,
    setIsProcessing
  ]);

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

  if (!uniqueKey || !market) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Market not found
        </Typography>
      </Box>
    );
  }

  if (!userAddress) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" color="error">
          Connect wallet to continue.
        </Typography>
      </Box>
    );
  }

  if (!market || !uniqueKey) {
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
        <AddTab
          market={market}
          addAmount={addAmount}
          setAddAmount={setAddAmount}
          txError={txError}
          isApproving={isApproving}
          isProcessing={isProcessing}
          isApprovalLoading={isApprovalLoading}
          isTransactionLoading={isTransactionLoading}
          setIsApproving={setIsApproving}
          setTxError={setTxError}
          writeApprove={writeApprove}
          tabValue={tabValue}
          uniqueKey={uniqueKey}
        />
      </TabPanel>

      {/* Borrow Tab */}
      <TabPanel value={tabValue} index={1}>
        <BorrowTab
          market={market}
          accrualPosition={accrualPosition}
          borrowAmount={borrowAmount}
          setBorrowAmount={setBorrowAmount}
          txError={txError}
          isProcessing={isProcessing}
          isTransactionLoading={isTransactionLoading}
          setIsProcessing={setIsProcessing}
          setTxError={setTxError}
          writeTransaction={writeTransaction}
          tabValue={tabValue}
          uniqueKey={uniqueKey}
        />
      </TabPanel>

      {/* Repay Tab */}
      <TabPanel value={tabValue} index={2}>
        <RepayTab
          market={market}
          repayAmount={repayAmount}
          setRepayAmount={setRepayAmount}
          txError={txError}
          isApproving={isApproving}
          isProcessing={isProcessing}
          isApprovalLoading={isApprovalLoading}
          isTransactionLoading={isTransactionLoading}
          setIsApproving={setIsApproving}
          setTxError={setTxError}
          writeApprove={writeApprove}
          tabValue={tabValue}
          uniqueKey={uniqueKey}
        />
      </TabPanel>

      {/* Withdraw Tab */}
      <TabPanel value={tabValue} index={3}>
        <WithdrawTab
          market={market}
          accrualPosition={accrualPosition}
          withdrawAmount={withdrawAmount}
          setWithdrawAmount={setWithdrawAmount}
          txError={txError}
          isProcessing={isProcessing}
          isTransactionLoading={isTransactionLoading}
          setIsProcessing={setIsProcessing}
          setTxError={setTxError}
          writeTransaction={writeTransaction}
          tabValue={tabValue}
          uniqueKey={uniqueKey}
        />
      </TabPanel>
    </Paper>
  );
}
