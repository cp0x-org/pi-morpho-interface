import { useMemo, useEffect, useState, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { usePosition } from '@morpho-org/blue-sdk-wagmi';

import { morphoContractConfig } from '@/appconfig/abi/Morpho';
import { morphoOracleConfig } from '@/appconfig/abi/MorphoOracle';
import { curveIrmConfig } from '@/appconfig/abi/CurveIrm';
import { erc20ABIConfig } from '@/appconfig/abi/ERC20';

import { Position } from '@morpho-org/blue-sdk';
import { AccrualPosition, Market, MarketParams } from '@morpho-org/blue-sdk';
import type { MarketId } from '@morpho-org/blue-sdk/lib/types';
import { isMarketId } from '@morpho-org/blue-sdk/lib/types';
import { useConfigChainId } from 'hooks/useConfigChainId';

export const useMarketData = ({
  uniqueKey,
  marketItemData
}: {
  uniqueKey?: string;
  marketItemData?: {
    collateralAsset: { address: string };
    loanAsset: { address: string };
  };
}) => {
  const { address: userAddress } = useAccount();
  const { config: chainConfig, chainId } = useConfigChainId();

  const marketIdParam = useMemo(() => {
    if (uniqueKey && isMarketId(uniqueKey)) {
      return uniqueKey as MarketId;
    }
    return undefined;
  }, [uniqueKey]);
  //
  // const { data: position } = usePosition({
  //   user: userAddress as `0x${string}`,
  //   marketId: marketIdParam,
  //   query: { enabled: !!marketIdParam && !!userAddress },
  //   chainId: chainId
  // });

  const {
    data: position,
    isLoading: isPositionLoading,
    isError: isPositionError,
    error: positionError,
    refetch: refetchPosition
  } = useReadContract({
    abi: morphoContractConfig.abi,
    address: chainConfig.contracts.Morpho,
    functionName: 'position',
    args: [uniqueKey as `0x${string}`, userAddress as `0x${string}`],
    query: { enabled: !!uniqueKey }
  });

  console.log('useMarketData');
  console.log('position');
  console.log(position);

  const {
    data: marketConfig,
    isLoading: isMcLoading,
    isError: isMcError,
    error: mcError,
    refetch: refetchMarketConfig
  } = useReadContract({
    abi: morphoContractConfig.abi,
    address: chainConfig.contracts.Morpho,
    functionName: 'idToMarketParams',
    args: uniqueKey ? [uniqueKey as `0x${string}`] : undefined,
    query: { enabled: !!uniqueKey }
  });

  const oracleAddress = marketConfig?.[2];
  console.log('marketConfig');
  console.log(marketConfig);

  const {
    data: oraclePrice,
    isLoading: isOpLoading,
    isError: isOpError,
    error: opError,
    refetch: refetchOraclePrice
  } = useReadContract({
    abi: morphoOracleConfig.abi,
    address: oracleAddress ?? '0x0000000000000000000000000000000000000000',
    functionName: 'price',
    args: [],
    query: { enabled: !!oracleAddress }
  });
  console.log('oraclePrice');
  console.log(oraclePrice);

  const irmAddress = marketConfig?.[3];
  console.log(irmAddress);
  const {
    data: rateAtTarget,
    isLoading: isRatLoading,
    isError: isRatError,
    error: ratError,
    refetch: refetchRateAtTarget
  } = useReadContract({
    abi: curveIrmConfig.abi,
    address: irmAddress ?? '0x0000000000000000000000000000000000000000',
    functionName: 'rateAtTarget',
    args: uniqueKey ? [uniqueKey as `0x${string}`] : undefined,
    query: { enabled: !!irmAddress && !!userAddress }
  });
  console.log('irmAddress');
  console.log(irmAddress);
  const {
    data: marketState,
    isLoading: isMsLoading,
    isError: isMsError,
    error: msError,
    refetch: refetchMarketState
  } = useReadContract({
    abi: morphoContractConfig.abi,
    address: chainConfig.contracts.Morpho,
    functionName: 'market',
    args: uniqueKey ? [uniqueKey as `0x${string}`] : undefined,
    query: { enabled: !!uniqueKey }
  });
  console.log('marketState');
  console.log(marketState);
  console.log(isMsError);
  const { data: collateralBalance, refetch: refetchCollateralBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: marketItemData?.collateralAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!marketItemData }
  });
  console.log('collateralBalance');
  console.log(collateralBalance);
  const { data: loanBalance, refetch: refetchLoanBalance } = useReadContract({
    abi: erc20ABIConfig.abi,
    address: marketItemData?.loanAsset.address as `0x${string}` | undefined,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!marketItemData }
  });
  console.log('loanBalance');
  console.log(loanBalance);
  const [marketParams, setMarketParams] = useState<MarketParams | null>(null);
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
    if (!position || !marketConfig || !oraclePrice || !rateAtTarget || !marketState) return;

    const marketParams = new MarketParams({
      loanToken: marketConfig[0],
      collateralToken: marketConfig[1],
      oracle: marketConfig[2],
      irm: marketConfig[3],
      lltv: marketConfig[4]
    });

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

    setMarketParams(marketParams);
    setMarket(market);
    setAccrualPosition(tmpAccrualPosition);
    setIsLoading(false);
  }, [position, marketConfig, oraclePrice, rateAtTarget, marketState, userAddress, marketIdParam]);
  console.log('accrualPosition');
  console.log(accrualPosition);
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
