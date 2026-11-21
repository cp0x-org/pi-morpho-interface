import { useMemo, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';

import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { morphoOracleConfig } from '@/appconfig/abi/MorphoOracle';
import { curveIrmConfig } from '@/appconfig/abi/CurveIrm';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { getMorphoAddress } from '@/appconfig';

import { Position } from '@morpho-org/blue-sdk';
import { AccrualPosition, MathLib, Market, MarketParams } from '@morpho-org/blue-sdk';
import { Time } from '@morpho-org/morpho-ts';
import type { MarketId } from '@morpho-org/blue-sdk/lib/types';
import { isMarketId } from '@morpho-org/blue-sdk/lib/types';
import { useRefreshAfterTransaction } from 'hooks/useRefreshAfterTransaction';

export const useMarketData = ({
  marketId,
  chainId,
  marketItemData,
  userAddress
}: {
  marketId?: string;
  userAddress?: `0x${string}`;
  /** Chain the market lives on. All reads target this chain, never the wallet's current one. */
  chainId?: number;
  marketItemData?: {
    collateralAsset: { address: string };
    loanAsset: { address: string };
  };
}) => {
  const { address: connected } = useAccount();
  const morphoAddress = getMorphoAddress(chainId);

  const marketIdParam = useMemo(() => {
    if (marketId && isMarketId(marketId)) {
      return marketId as MarketId;
    }
    return undefined;
  }, [marketId]);

  const isReady = !!marketIdParam && !!chainId && !!morphoAddress;

  const {
    data: position,
    isLoading: isPositionLoading,
    isError: isPositionError,
    error: positionError,
    refetch: refetchPosition
  } = useReadContract({
    abi: morphoContractConfig.abi,
    address: morphoAddress,
    chainId,
    functionName: 'position',
    args: [marketId as `0x${string}`, userAddress as `0x${string}`],
    query: { enabled: isReady && !!userAddress }
  });

  const {
    data: marketConfig,
    isLoading: isMcLoading,
    isError: isMcError,
    error: mcError,
    refetch: refetchMarketConfig
  } = useReadContract({
    abi: morphoContractConfig.abi,
    address: morphoAddress,
    chainId,
    functionName: 'idToMarketParams',
    args: marketId ? [marketId as `0x${string}`] : undefined,
    query: { enabled: isReady }
  });

  // Transaction arguments come from the chain, not from the API: the params must hash back to the market id.
  const marketParams = useMemo(() => {
    if (!marketConfig || !marketIdParam) return null;
    try {
      const params = new MarketParams({
        loanToken: marketConfig[0],
        collateralToken: marketConfig[1],
        oracle: marketConfig[2],
        irm: marketConfig[3],
        lltv: marketConfig[4]
      });
      return params.id.toLowerCase() === marketIdParam.toLowerCase() ? params : null;
    } catch {
      return null;
    }
  }, [marketConfig, marketIdParam]);

  const oracleAddress = marketParams?.oracle;
  const {
    data: oraclePrice,
    isLoading: isOpLoading,
    isError: isOpError,
    error: opError,
    refetch: refetchOraclePrice
  } = useReadContract({
    abi: morphoOracleConfig.abi,
    address: oracleAddress ?? '0x0000000000000000000000000000000000000000',
    chainId,
    functionName: 'price',
    args: [],
    query: { enabled: !!oracleAddress }
  });

  const irmAddress = marketParams?.irm;
  const {
    data: rateAtTarget,
    isLoading: isRatLoading,
    isError: isRatError,
    error: ratError,
    refetch: refetchRateAtTarget
  } = useReadContract({
    abi: curveIrmConfig.abi,
    address: irmAddress ?? '0x0000000000000000000000000000000000000000',
    chainId,
    functionName: 'rateAtTarget',
    args: marketId ? [marketId as `0x${string}`] : undefined,
    query: { enabled: !!irmAddress && !!userAddress }
  });
  const {
    data: marketState,
    isLoading: isMsLoading,
    isError: isMsError,
    error: msError,
    refetch: refetchMarketState
  } = useReadContract({
    abi: morphoContractConfig.abi,
    address: morphoAddress,
    chainId,
    functionName: 'market',
    args: marketId ? [marketId as `0x${string}`] : undefined,
    query: { enabled: isReady }
  });

  const { data: collateralBalance, refetch: refetchCollateralBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: marketItemData?.collateralAsset.address as `0x${string}` | undefined,
    chainId,
    functionName: 'balanceOf',
    args: connected ? [connected] : undefined,
    query: { enabled: !!connected && !!marketItemData && !!chainId }
  });
  const { data: loanBalance, refetch: refetchLoanBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: marketItemData?.loanAsset.address as `0x${string}` | undefined,
    chainId,
    functionName: 'balanceOf',
    args: connected ? [connected] : undefined,
    query: { enabled: !!connected && !!marketItemData && !!chainId }
  });

  // Function to refresh all position data
  const refreshPositionData = useCallback(async () => {
    try {
      await Promise.all([
        refetchPosition(),
        refetchMarketConfig(),
        refetchOraclePrice(),
        refetchRateAtTarget(),
        refetchMarketState(),
        ...(connected ? [refetchCollateralBalance(), refetchLoanBalance()] : [])
      ]);
    } catch (error) {
      console.error('Failed to refresh position data:', error);
    }
  }, [
    refetchPosition,
    refetchMarketConfig,
    refetchOraclePrice,
    refetchRateAtTarget,
    refetchMarketState,
    refetchCollateralBalance,
    refetchLoanBalance,
    connected
  ]);

  // Reads again a couple of blocks after the receipt as well: the first read can still come from the block before it.
  const refreshAfterTransaction = useRefreshAfterTransaction(chainId, refreshPositionData);

  const { accrualPosition, onchainPosition } = useMemo(() => {
    if (!userAddress || !marketIdParam || !position || !marketParams || !oraclePrice || rateAtTarget == null || !marketState) {
      return { accrualPosition: null, onchainPosition: null };
    }

    const market = new Market({
      params: marketParams,
      totalSupplyAssets: marketState[0],
      totalSupplyShares: marketState[1],
      totalBorrowAssets: marketState[2],
      totalBorrowShares: marketState[3],
      lastUpdate: marketState[4],
      fee: marketState[5],
      price: oraclePrice,
      rateAtTarget
    });

    const tmpPosition = new Position({
      user: userAddress,
      marketId: marketIdParam,
      supplyShares: position[0],
      borrowShares: position[1],
      collateral: position[2]
    });

    // The contract state is as of the market's last interaction, which can be days old on a quiet market. Every
    // write accrues interest first, so debt read from the raw state is short and every limit built on it (max
    // borrow, withdrawable collateral) promises more than the chain will allow.
    const onchainPosition = new AccrualPosition(tmpPosition, market);
    try {
      return { accrualPosition: onchainPosition.accrueInterest(MathLib.max(Time.timestamp(), market.lastUpdate)), onchainPosition };
    } catch (accrualError) {
      console.warn('Position accrual failed, using the raw on-chain position', accrualError);
      return { accrualPosition: onchainPosition, onchainPosition };
    }
  }, [position, marketParams, oraclePrice, rateAtTarget, marketState, userAddress, marketIdParam]);

  return {
    position,
    marketConfig,
    oraclePrice,
    rateAtTarget,
    marketState,
    collateralBalance,
    loanBalance,
    marketParams,
    market: accrualPosition?.market ?? null,
    accrualPosition,
    /** The position on the market state as last written on chain, before accruing it to now. */
    onchainPosition,
    isLoading: !accrualPosition,
    refreshPositionData,
    refreshAfterTransaction,
    errors: {
      mcError,
      opError,
      ratError,
      msError
    }
  };
};
