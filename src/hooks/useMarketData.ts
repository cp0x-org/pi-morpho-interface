import { useMemo, useEffect, useState, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';

import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { morphoOracleConfig } from '@/appconfig/abi/MorphoOracle';
import { curveIrmConfig } from '@/appconfig/abi/CurveIrm';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';
import { getMorphoAddress } from '@/appconfig';

import { Position } from '@morpho-org/blue-sdk';
import { AccrualPosition, Market, MarketParams } from '@morpho-org/blue-sdk';
import type { MarketId } from '@morpho-org/blue-sdk/lib/types';
import { isMarketId } from '@morpho-org/blue-sdk/lib/types';

export const useMarketData = ({
  marketId,
  chainId,
  marketItemData
}: {
  marketId?: string;
  /** Chain the market lives on. All reads target this chain, never the wallet's current one. */
  chainId?: number;
  marketItemData?: {
    collateralAsset: { address: string };
    loanAsset: { address: string };
  };
}) => {
  const { address: userAddress } = useAccount();
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
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!marketItemData && !!chainId }
  });
  const { data: loanBalance, refetch: refetchLoanBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: marketItemData?.loanAsset.address as `0x${string}` | undefined,
    chainId,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!marketItemData && !!chainId }
  });
  const [market, setMarket] = useState<Market | null>(null);
  const [accrualPosition, setAccrualPosition] = useState<AccrualPosition | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  // Function to refresh all position data
  const refreshPositionData = useCallback(async () => {
    console.log('Refreshing position data...');
    try {
      await Promise.all([
        refetchPosition(),
        refetchMarketConfig(),
        refetchOraclePrice(),
        refetchRateAtTarget(),
        refetchMarketState(),
        refetchCollateralBalance(),
        refetchLoanBalance()
      ]);
      console.log('Position data refreshed successfully');
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
    refetchLoanBalance
  ]);

  useEffect(() => {
    if (!position || !marketParams || !oraclePrice || !rateAtTarget || !marketState) return;

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
      user: userAddress as `0x${string}`,
      marketId: marketIdParam as MarketId,
      supplyShares: position[0],
      borrowShares: position[1],
      collateral: position[2]
    });

    const tmpAccrualPosition = new AccrualPosition(tmpPosition, market);

    setMarket(market);
    setAccrualPosition(tmpAccrualPosition);
    setIsLoading(false);
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
    market,
    accrualPosition,
    isLoading,
    refreshPositionData,
    errors: {
      mcError,
      opError,
      ratError,
      msError
    }
  };
};
