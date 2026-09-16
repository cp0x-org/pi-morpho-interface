import { useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useSwitchChain } from 'wagmi';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import { Alert, CircularProgress, Typography } from '@mui/material';

import { useMidnightBook } from 'hooks/midnight/useMidnightBook';
import { useMidnightMarket } from 'hooks/midnight/useMidnightMarket';
import { useMidnightOnchainPosition } from 'hooks/midnight/useMidnightOnchainPosition';
import { useNowInSeconds } from 'hooks/midnight/useNowInSeconds';
import { useTokensMetadata } from 'hooks/midnight/useTokensMetadata';
import { midnightQueryKeys } from 'hooks/midnight/queryKeys';
import { visuallyHidden } from 'utils/a11y';
import { getChainName } from 'utils/chains';
import { shortenAddress } from 'utils/formatters';
import { formatMaturity, getMaxLif, isMatured, priceToApr, takerPrice, timeToMaturity } from 'utils/midnight';
import { dispatchError, dispatchInfo, dispatchSuccess } from 'utils/snackbar';
import FixedActionPanel from './fixed/FixedActionPanel';
import FixedManagePanel from './fixed/FixedManagePanel';
import FixedMarketActivity from './fixed/FixedMarketActivity';
import FixedMarketHeader from './fixed/FixedMarketHeader';
import FixedOrderBook from './fixed/FixedOrderBook';
import FixedPositionCard from './fixed/FixedPositionCard';
import PoweredByMorpho from './fixed/PoweredByMorpho';
import type { FixedMarketContext } from './fixed/types';

// ==============================|| FIXED RATE MARKET ||============================== //

export default function FixedMarketDetailPage() {
  const intl = useIntl();
  const { marketId: marketIdParam } = useParams<{ marketId: string }>();
  const { address: user, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const queryClient = useQueryClient();
  const nowSec = useNowInSeconds(30_000);

  const { marketId, market, marketParams, validationError, state, listed, isLoading, error, isNotFound, refetchState } =
    useMidnightMarket(marketIdParam);
  const chainId = market?.chainId;
  const bookQuery = useMidnightBook(marketId, 20, { enabled: !!marketParams });
  const onchain = useMidnightOnchainPosition({ chainId, marketId, marketParams, user });

  const tokenRefs = useMemo(
    () =>
      market
        ? [
            { chainId: market.chainId, address: market.loanToken },
            ...market.collaterals.map((collateral) => ({ chainId: market.chainId, address: collateral.token }))
          ]
        : [],
    [market]
  );
  const { getToken } = useTokensMetadata(tokenRefs);

  // Same behaviour as variable markets: follow the market's chain once a wallet is connected.
  useEffect(() => {
    if (chainId && walletChainId && walletChainId !== chainId) {
      const networkName = getChainName(chainId);
      dispatchInfo(intl.formatMessage({ id: 'network.switching' }, { network: networkName }));
      switchChain(
        { chainId },
        {
          onSuccess: () => dispatchSuccess(intl.formatMessage({ id: 'network.switched' }, { network: networkName })),
          onError: (err) =>
            dispatchError(intl.formatMessage({ id: 'network.switchFailed' }, { network: networkName, message: err.message }))
        }
      );
    }
  }, [chainId, walletChainId, intl, switchChain]);

  const { refetch: refetchOnchain } = onchain;
  // After a transaction the chain is the source of truth; the API catches up with an indexing lag.
  const refresh = useCallback(() => {
    refetchOnchain();
    refetchState();
    queryClient.invalidateQueries({ queryKey: midnightQueryKeys.all });
  }, [refetchOnchain, refetchState, queryClient]);

  const ctx = useMemo<FixedMarketContext | undefined>(() => {
    if (!market || !marketParams || !marketId || !chainId) return undefined;
    const loan = getToken(chainId, marketParams.loanToken);
    const ttm = timeToMaturity(market.maturity, nowSec);
    return {
      chainId,
      marketId,
      market,
      marketParams,
      state,
      sdkMarket: onchain.sdkMarket,
      book: bookQuery.data,
      loan: {
        token: marketParams.loanToken,
        symbol: loan?.symbol ?? shortenAddress(marketParams.loanToken),
        decimals: loan?.decimals,
        logoURI: loan?.logoURI,
        priceUsd: loan?.priceUsd,
        walletBalance: onchain.walletLoanBalance,
        allowanceBundles: onchain.loanAllowanceBundles
      },
      collaterals: marketParams.collateralParams.map((collateral, index) => {
        const token = getToken(chainId, collateral.token);
        return {
          index,
          token: collateral.token,
          symbol: token?.symbol ?? shortenAddress(collateral.token),
          decimals: token?.decimals,
          logoURI: token?.logoURI,
          lltv: collateral.lltv,
          liquidationCursor: collateral.liquidationCursor,
          oracle: collateral.oracle,
          oraclePrice: onchain.oraclePrices[index],
          maxLif: getMaxLif(collateral.lltv, collateral.liquidationCursor),
          positionAmount: onchain.position?.getCollateralBalanceByIndex(index) ?? 0n,
          walletBalance: onchain.walletCollateralBalances[index],
          allowanceBundles: onchain.collateralAllowanceBundles[index],
          allowanceMidnight: onchain.collateralAllowanceMidnight[index]
        };
      }),
      position: onchain.position,
      isBundlesAuthorized: onchain.isBundlesAuthorized,
      midnightBundles: onchain.midnightBundles,
      user,
      nowSec,
      isMatured: isMatured(market.maturity, nowSec),
      settlementFee: onchain.sdkMarket ? onchain.sdkMarket.getSettlementFee(ttm) : (state?.currentSettlementFeeWad ?? 0n),
      refresh
    };
  }, [
    market,
    marketParams,
    marketId,
    chainId,
    getToken,
    nowSec,
    state,
    bookQuery.data,
    onchain.sdkMarket,
    onchain.walletLoanBalance,
    onchain.loanAllowanceBundles,
    onchain.oraclePrices,
    onchain.position,
    onchain.walletCollateralBalances,
    onchain.collateralAllowanceBundles,
    onchain.collateralAllowanceMidnight,
    onchain.isBundlesAuthorized,
    onchain.midnightBundles,
    user,
    refresh
  ]);

  if (isNotFound) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" component="p" role="alert" color="error">
          <FormattedMessage id="market.notFound" />
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
        <CircularProgress aria-label={intl.formatMessage({ id: 'fixed.market.loading' })} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: 2 }}>
        <Typography role="alert" color="error">
          <FormattedMessage id="fixed.market.error" values={{ message: error.message }} />
        </Typography>
      </Box>
    );
  }

  if (validationError || !ctx) {
    return (
      <Box sx={{ padding: 2 }}>
        <Alert severity="error">
          <FormattedMessage id="fixed.market.validationFailed" values={{ message: validationError?.message ?? '' }} />
        </Alert>
      </Box>
    );
  }

  const bestAsk = ctx.book?.asks[0];
  const bestBid = ctx.book?.bids[0];
  const bestLendApr = bestAsk ? priceToApr(takerPrice('lend', bestAsk.price, ctx.settlementFee), ctx.market.maturity, nowSec) : undefined;
  const bestBorrowApr = bestBid
    ? priceToApr(takerPrice('borrow', bestBid.price, ctx.settlementFee), ctx.market.maturity, nowSec)
    : undefined;
  const pair = `${ctx.loan.symbol} / ${ctx.collaterals.map((collateral) => collateral.symbol).join(', ')}`;

  return (
    <Box sx={{ padding: '16px 0px' }}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="fixed.market.heading" values={{ pair, maturity: formatMaturity(intl, ctx.market.maturity, nowSec).date }} />
      </Box>

      <FixedMarketHeader ctx={ctx} bestLendApr={bestLendApr} bestBorrowApr={bestBorrowApr} />

      {listed === false && (
        <Alert severity="warning" sx={{ marginBottom: 3 }}>
          <FormattedMessage id="fixed.list.unlistedWarning" />
        </Alert>
      )}

      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 7 }}>
          <FixedActionPanel ctx={ctx} />
          <FixedManagePanel ctx={ctx} />
          <FixedOrderBook ctx={ctx} isLoading={bookQuery.isFetching} />
          <FixedMarketActivity ctx={ctx} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Box sx={{ position: 'sticky', top: '24px' }}>
            <FixedPositionCard ctx={ctx} />
          </Box>
        </Grid>
      </Grid>

      <PoweredByMorpho />
    </Box>
  );
}
