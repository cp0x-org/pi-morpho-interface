import { useQueries } from '@tanstack/react-query';
import React from 'react';

import { useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import {
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  CircularProgress,
  Chip,
  Link
} from '@mui/material';
import { visuallyHidden } from 'utils/a11y';
import { userPositionsQuery } from '@/api/userPositions';
import { supportedChains } from '@/wagmi-config';
import useViewedAccount from 'hooks/useViewedAccount';
import { DECIMALS_SCALE_FACTOR, formatShortUSDS, formatTokenAmount, shortenAddress } from 'utils/formatters';
import { type Address, formatUnits } from 'viem';
import { AccountLookup } from 'components/ViewedAccount';
import { CuratorIcon } from 'components/CuratorIcon';
import { TokenIcon } from 'components/TokenIcon';
import { getChainName } from 'utils/chains';
import { routes } from 'utils/routes';
import { withViewedAccount } from 'utils/viewedAccount';
import { normalizeVaultV2Position } from 'utils/vaults';
import { VaultVersionChip } from 'components/VaultVersionChip';
import { useMidnightOpenOrders } from 'hooks/midnight/useMidnightOpenOrders';
import { useMidnightUserPositions } from 'hooks/midnight/useMidnightUserPositions';
import { useNowInSeconds } from 'hooks/midnight/useNowInSeconds';
import { useTokensMetadata } from 'hooks/midnight/useTokensMetadata';
import { getOrderCollateralAmount, isOrderCollateral } from 'utils/midnight';
import FixedOrdersTable from './fixed/FixedOrdersTable';
import FixedPositionsTable from './fixed/FixedPositionsTable';
import { FormattedMessage, useIntl } from 'react-intl';

interface MorphoPositionsData {
  chainId: number;
  marketId: string;
  collateralSymbol: string;
  loanSymbol: string;
  collateralBalance: string;
  loanBalance: string;
  collateralDecimal: number;
  loanDecimal: number;
  borrowUsd: string;
  supplyUsd: string;
  borrowApy: string;
  healthFactor: number | null;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const viewed = useViewedAccount();
  const { account: userAddress, requestedAccount, isOther, rawAccount } = viewed;
  const lookup = <AccountLookup key={rawAccount ?? undefined} {...viewed} />;

  const positions = useQueries({
    queries: userAddress
      ? supportedChains.map(({ id }) => ({
          ...userPositionsQuery(id, userAddress, Boolean(requestedAccount)),
          refetchInterval: requestedAccount ? 30_000 : 0
        }))
      : []
  });
  const chainResults = positions.map((result, index) => ({
    chainId: supportedChains[index].id,
    result,
    unavailable: result.isError || result.isPaused || (result.isPending && result.errorUpdatedAt > 0)
  }));
  const failedChains = chainResults.filter(({ unavailable }) => unavailable);
  const anyLoading = positions.some((result) => result.isLoading);
  const chainsWithData = chainResults.flatMap(({ chainId, result, unavailable }) => {
    const user = result.data;
    if (unavailable || !user) return [];

    const marketPositions: MorphoPositionsData[] = user.marketPositions
      .filter((p) => parseFloat(p.state.collateral || '0') > 0 || parseFloat(p.state.borrowAssets || '0') > 0)
      .map((position) => ({
        chainId,
        marketId: position.market.marketId,
        collateralSymbol: position.market.collateralAsset.symbol,
        loanSymbol: position.market.loanAsset.symbol,
        collateralBalance: position.state.collateral || '0',
        loanBalance: position.state.borrowAssets || '0',
        collateralDecimal: position.market.collateralAsset.decimals,
        loanDecimal: position.market.loanAsset.decimals,
        borrowUsd: position.state.borrowAssetsUsd || '0',
        supplyUsd: position.state.supplyAssetsUsd || '0',
        borrowApy: position.market.state.borrowApy || '0',
        healthFactor: position.healthFactor
      }));

    const vaultPositions = [...user.vaultPositions, ...(user.vaultV2Positions ?? []).map(normalizeVaultV2Position)].filter(
      (p) => parseFloat(p.state.assets || '0') > 0
    );

    return marketPositions.length || vaultPositions.length ? [{ chainId, marketPositions, vaultPositions }] : [];
  });

  // Fixed-rate (Midnight) positions come from one call covering every chain.
  const nowSec = useNowInSeconds();
  const fixedPositionsQuery = useMidnightUserPositions(userAddress);
  const allFixedPositions = React.useMemo(() => fixedPositionsQuery.data ?? [], [fixedPositionsQuery.data]);
  const { orders: openOrders, refetch: refetchOpenOrders } = useMidnightOpenOrders(userAddress);
  // Collateral parked for an open borrow order belongs to that order, not to a position.
  const fixedPositions = React.useMemo(
    () => allFixedPositions.filter((position) => !isOrderCollateral(position, openOrders)),
    [allFixedPositions, openOrders]
  );
  const fixedTokenRefs = React.useMemo(
    () => [
      ...allFixedPositions.flatMap((position) => [
        { chainId: position.chainId, address: position.loanToken },
        ...position.collaterals.map((collateral) => ({ chainId: position.chainId, address: collateral.token }))
      ]),
      ...openOrders.flatMap((order) => [
        { chainId: order.chainId, address: order.loanToken },
        ...order.offers.flatMap((offer) => offer.collaterals.map((collateral) => ({ chainId: order.chainId, address: collateral.token })))
      ])
    ],
    [allFixedPositions, openOrders]
  );
  const { getToken } = useTokensMetadata(fixedTokenRefs);
  const viewedPositions = isOther
    ? chainsWithData
        .flatMap(({ marketPositions }) => marketPositions)
        .sort((left, right) => (left.healthFactor ?? Number.MAX_VALUE) - (right.healthFactor ?? Number.MAX_VALUE))
    : [];

  if (!userAddress) {
    return (
      <Box sx={{ padding: 2 }}>
        <Box component="h1" sx={visuallyHidden}>
          <FormattedMessage id="dashboard.title" />
        </Box>
        {lookup}
        {viewed.invalidAccount ? (
          <Alert severity="error">
            <FormattedMessage id="market.invalidAccount" />
          </Alert>
        ) : (
          <Typography variant="h4" component="p" role="status">
            <FormattedMessage id="dashboard.connectWallet" />
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Box component="h1" sx={visuallyHidden}>
        <FormattedMessage id="dashboard.title" />
      </Box>
      {lookup}
      {isOther && (
        <Alert severity="info" sx={{ mb: 2 }} title={userAddress}>
          <FormattedMessage id="portfolio.viewingAccount" values={{ address: shortenAddress(userAddress) }} />
        </Alert>
      )}
      {failedChains.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography fontWeight={600}>
            <FormattedMessage id="dashboard.incomplete" />
          </Typography>
          {failedChains.map(({ chainId, result }) => {
            const network = getChainName(chainId);
            const lastRead = result.dataUpdatedAt;
            return (
              <Box key={chainId} sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="body2">
                  {lastRead ? (
                    <FormattedMessage
                      id="dashboard.staleNetwork"
                      values={{
                        network,
                        time: (
                          <time dateTime={new Date(lastRead).toISOString()}>
                            {intl.formatDate(lastRead, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              timeZoneName: 'short'
                            })}
                          </time>
                        )
                      }}
                    />
                  ) : (
                    <FormattedMessage id="dashboard.unavailableNetwork" values={{ network }} />
                  )}
                </Typography>
                <Button size="small" disabled={result.isFetching} onClick={() => void result.refetch()}>
                  <FormattedMessage id="dashboard.retryNetwork" values={{ network }} />
                </Button>
              </Box>
            );
          })}
        </Alert>
      )}
      {viewedPositions.length > 0 && (
        <Box sx={{ mb: 5 }}>
          <VariablePositionsTable positions={viewedPositions} requestedAccount={requestedAccount} isOther />
        </Box>
      )}

      {fixedPositions.length > 0 && (
        <Box sx={{ marginBottom: 5 }}>
          <Typography variant="h2" component="h2" sx={{ marginBottom: 2 }}>
            <FormattedMessage id="fixed.positions.title" />
          </Typography>
          <FixedPositionsTable positions={fixedPositions} getToken={getToken} nowSec={nowSec} readOnly={isOther} />
        </Box>
      )}

      {openOrders.length > 0 && (
        <Box sx={{ marginBottom: 5 }}>
          <Typography variant="h2" component="h2" sx={{ marginBottom: 2 }}>
            <FormattedMessage id="fixed.orders.title" />
          </Typography>
          <FixedOrdersTable
            orders={openOrders}
            getToken={getToken}
            getOrderCollateral={(chainId, marketId) => getOrderCollateralAmount(allFixedPositions, openOrders, chainId, marketId)}
            nowSec={nowSec}
            onCancelled={refetchOpenOrders}
            readOnly={isOther}
          />
        </Box>
      )}

      {anyLoading && chainsWithData.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 4 }}>
          <CircularProgress aria-label={intl.formatMessage({ id: 'dashboard.loading' })} />
        </Box>
      )}

      {!anyLoading &&
        failedChains.length === 0 &&
        chainsWithData.length === 0 &&
        fixedPositions.length === 0 &&
        openOrders.length === 0 && (
          <Box sx={{ padding: 2 }}>
            <Typography variant="h4" component="p" role="status">
              <FormattedMessage id="dashboard.empty" />
            </Typography>
          </Box>
        )}

      {chainsWithData
        .filter(({ vaultPositions }) => !isOther || vaultPositions.length > 0)
        .map(({ chainId, marketPositions, vaultPositions }) => (
          <Box key={chainId} sx={{ marginBottom: 5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, marginBottom: 2 }}>
              <Typography variant="h2" component="h2">
                {getChainName(chainId)}
              </Typography>
              {anyLoading && (
                <CircularProgress
                  size={16}
                  aria-label={intl.formatMessage({ id: 'dashboard.refreshing' }, { network: getChainName(chainId) })}
                />
              )}
            </Box>

            {vaultPositions.length > 0 && (
              <Box sx={{ marginBottom: 3 }}>
                <Typography variant="h4" component="h3" gutterBottom sx={{ marginBottom: 1, color: 'text.secondary' }}>
                  <FormattedMessage id="dashboard.vaults" />
                </Typography>
                <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
                  <Table
                    sx={{ minWidth: 650 }}
                    aria-label={intl.formatMessage({ id: 'dashboard.vaultPositionsAria' }, { network: getChainName(chainId) })}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <FormattedMessage id="table.vault" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="table.balance" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="table.apy" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="table.totalDepositsUsd" />
                        </TableCell>
                        <TableCell>
                          <FormattedMessage id="table.curators" />
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vaultPositions.map((position) => (
                        <TableRow
                          key={position.vault.address}
                          hover={!isOther}
                          onClick={isOther ? undefined : () => navigate(routes.vault(position.vault.address, chainId, position.vault.name))}
                          sx={{ cursor: isOther ? undefined : 'pointer' }}
                        >
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TokenIcon symbol={position.vault.asset.symbol} />
                              {isOther ? (
                                position.vault.name || shortenAddress(position.vault.address)
                              ) : (
                                <Link
                                  component={RouterLink}
                                  to={routes.vault(position.vault.address, chainId, position.vault.name)}
                                  color="inherit"
                                  underline="none"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={intl.formatMessage(
                                    { id: 'dashboard.openVaultAria' },
                                    { name: position.vault.name || shortenAddress(position.vault.address), network: getChainName(chainId) }
                                  )}
                                >
                                  {position.vault.name || shortenAddress(position.vault.address)}
                                </Link>
                              )}
                              <VaultVersionChip version={position.vault.version} />
                            </Box>
                          </TableCell>
                          <TableCell>
                            {Number(formatUnits(BigInt(position.state.assets), position.vault.asset.decimals)).toFixed(6)} (
                            {Number(position.state.assetsUsd).toFixed(2)} $)
                          </TableCell>
                          <TableCell>{(Number(position.vault.state.avgNetApy) * 100).toFixed(2)} %</TableCell>
                          <TableCell>$ {formatShortUSDS(parseFloat(position.vault.state.totalAssetsUsd))}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {position.vault.state.curators?.map((curator: any) => (
                                <Box key={curator.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <CuratorIcon symbol={curator.id} /> {curator.name ? curator.name : curator.id}
                                </Box>
                              ))}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {!isOther && marketPositions.length > 0 && (
              <VariablePositionsTable positions={marketPositions} chainId={chainId} requestedAccount={requestedAccount} />
            )}
          </Box>
        ))}
    </Box>
  );
}

function VariablePositionsTable({
  positions,
  chainId,
  requestedAccount,
  isOther = false
}: {
  positions: MorphoPositionsData[];
  chainId?: number;
  requestedAccount?: Address;
  isOther?: boolean;
}) {
  const intl = useIntl();
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h4" component={isOther ? 'h2' : 'h3'} gutterBottom sx={{ mb: 1, color: 'text.secondary' }}>
        <FormattedMessage id="dashboard.markets" />
      </Typography>
      <TableContainer component={Paper}>
        <Table
          sx={{ minWidth: isOther ? 800 : 650 }}
          aria-label={
            chainId
              ? intl.formatMessage({ id: 'dashboard.marketPositionsAria' }, { network: getChainName(chainId) })
              : intl.formatMessage({ id: 'dashboard.markets' })
          }
        >
          <TableHead>
            <TableRow>
              <TableCell>
                <FormattedMessage id="table.market" />
              </TableCell>
              {isOther && (
                <TableCell>
                  <FormattedMessage id="table.network" />
                </TableCell>
              )}
              <TableCell>
                <FormattedMessage id="table.collateral" />
              </TableCell>
              <TableCell>
                <FormattedMessage id="table.loan" />
              </TableCell>
              {isOther ? (
                <>
                  <TableCell>
                    <FormattedMessage id="market.healthFactor" />
                  </TableCell>
                  <TableCell aria-label={intl.formatMessage({ id: 'market.actionsTitle' })} />
                </>
              ) : (
                <TableCell>
                  <FormattedMessage id="table.borrowApy" />
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {positions.map((position) => {
              const hasDebt = Number(position.loanBalance) > 0;
              const href = routes.variableMarket(position.marketId, position.chainId, position.loanSymbol, position.collateralSymbol);
              const manageHref = withViewedAccount(href, requestedAccount, isOther ? (hasDebt ? 'repay' : 'add') : undefined);
              return (
                <TableRow
                  key={`${position.chainId}:${position.marketId}`}
                  hover
                  onClick={() => navigate(manageHref)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={manageHref}
                      color="inherit"
                      underline="none"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={intl.formatMessage(
                        { id: 'dashboard.openMarketAria' },
                        { pair: `${position.collateralSymbol}/${position.loanSymbol}`, network: getChainName(position.chainId) }
                      )}
                    >
                      {position.collateralSymbol}/{position.loanSymbol}
                    </Link>
                  </TableCell>
                  {isOther && <TableCell>{getChainName(position.chainId)}</TableCell>}
                  <TableCell>
                    {Number(position.collateralBalance) > 0 ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TokenIcon symbol={position.collateralSymbol} avatarProps={{ alt: '' }} />
                        {formatTokenAmount(
                          position.collateralBalance,
                          position.collateralDecimal,
                          position.collateralDecimal / DECIMALS_SCALE_FACTOR
                        )}{' '}
                        {position.collateralSymbol}
                      </Box>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {hasDebt ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TokenIcon symbol={position.loanSymbol} avatarProps={{ alt: '' }} />
                        {formatTokenAmount(position.loanBalance, position.loanDecimal, position.loanDecimal / DECIMALS_SCALE_FACTOR)}{' '}
                        {position.loanSymbol}
                      </Box>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  {isOther ? (
                    <>
                      <TableCell>
                        {hasDebt ? (position.healthFactor?.toFixed(2) ?? '—') : '—'}
                        {hasDebt && position.healthFactor != null && position.healthFactor < 1 && (
                          <Typography display="block" variant="caption" color="error">
                            <FormattedMessage id="dashboard.liquidatable" />
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {hasDebt && (
                            <Button
                              component={RouterLink}
                              to={withViewedAccount(href, requestedAccount, 'repay')}
                              size="small"
                              variant="outlined"
                              color="secondary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <FormattedMessage id="market.tabRepay" />
                            </Button>
                          )}
                          <Button
                            component={RouterLink}
                            to={withViewedAccount(href, requestedAccount, 'add')}
                            size="small"
                            variant="outlined"
                            color="secondary"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <FormattedMessage id="portfolio.addCollateral" />
                          </Button>
                        </Box>
                      </TableCell>
                    </>
                  ) : (
                    <TableCell>{(Number(position.borrowApy) * 100).toFixed(2)} %</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
