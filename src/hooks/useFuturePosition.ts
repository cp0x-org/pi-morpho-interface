import { useMemo } from 'react';
import { Position, AccrualPosition, Market } from '@morpho-org/blue-sdk';
import { isMarketId, MarketId } from '@morpho-org/blue-sdk/lib/types';

export const useFuturePosition = ({
  currentPosition,
  market,
  userAddress,
  uniqueKey,
  diffBorrowAmount,
  diffCollateralAmount
}: {
  currentPosition: AccrualPosition | null;
  market: Market | null;
  uniqueKey?: string;
  userAddress: `0x${string}` | undefined;
  diffBorrowAmount?: bigint;
  diffCollateralAmount?: bigint;
}) => {
  const marketId = useMemo(() => {
    if (uniqueKey && isMarketId(uniqueKey)) {
      return uniqueKey as MarketId;
    }
    return undefined;
  }, [uniqueKey]);
  return useMemo(() => {
    if (!currentPosition || !market || !marketId || !userAddress) {
      return { futurePosition: null, isChanged: false };
    }

    let newBorrowShares = currentPosition.borrowShares;
    let newSupplyShares = currentPosition.supplyShares;
    let newCollateral = currentPosition.collateral;

    if (diffBorrowAmount && diffBorrowAmount !== 0n) {
      const borrowShares = market.toBorrowShares(diffBorrowAmount);
      newBorrowShares += borrowShares;
    }

    if (diffCollateralAmount && diffCollateralAmount !== 0n) {
      newCollateral += diffCollateralAmount;
    }
    console.log(newCollateral);

    // Если изменений нет
    if ((!diffBorrowAmount || diffBorrowAmount === 0n) && (!diffCollateralAmount || diffCollateralAmount === 0n)) {
      return { futurePosition: currentPosition, isChanged: false };
    }

    const newPosition = new Position({
      user: userAddress,
      marketId,
      supplyShares: newSupplyShares,
      borrowShares: newBorrowShares,
      collateral: newCollateral
    });

    const newAccrualPosition = new AccrualPosition(newPosition, market);
    let isChanged = false;
    if (
      newAccrualPosition.borrowShares != currentPosition.borrowShares ||
      newAccrualPosition.supplyShares != currentPosition.supplyShares ||
      newAccrualPosition.collateral != currentPosition.collateral
    ) {
      isChanged = true;
    }

    return { futurePosition: newAccrualPosition, isChanged: isChanged };
  }, [currentPosition, market, userAddress, marketId, diffBorrowAmount, diffCollateralAmount]);
};
