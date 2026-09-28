import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { formatUnits, isAddressEqual } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { ChainIcon } from 'components/ChainIcon';
import { TokenIcon } from 'components/TokenIcon';
import type { TokenMetadata } from 'hooks/midnight/useTokensMetadata';
import type { MidnightUserPosition } from 'types/midnight';
import { getChainName } from 'utils/chains';
import { shortenAddress } from 'utils/formatters';
import { formatMaturity, formatWadPercent } from 'utils/midnight';
import { routes } from 'utils/routes';

interface FixedPositionsTableProps {
  positions: MidnightUserPosition[];
  getToken: (chainId: number, address?: string) => TokenMetadata | undefined;
  nowSec: bigint;
}

type PositionStatus = 'active' | 'redeem' | 'overdue' | 'matured';

const STATUS_LABELS: Record<PositionStatus, string> = {
  active: 'fixed.positions.statusActive',
  redeem: 'fixed.positions.statusRedeem',
  overdue: 'fixed.positions.statusOverdue',
  matured: 'fixed.positions.statusMatured'
};

const STATUS_COLORS: Record<PositionStatus, 'success' | 'info' | 'error' | 'default'> = {
  active: 'success',
  redeem: 'info',
  overdue: 'error',
  matured: 'default'
};

const TYPE_LABELS = {
  lend: 'fixed.positions.typeLend',
  borrow: 'fixed.positions.typeBorrow',
  collateral_only: 'fixed.positions.typeCollateralOnly'
};

// ==============================|| FIXED-RATE POSITIONS TABLE ||============================== //

export default function FixedPositionsTable({ positions, getToken, nowSec }: FixedPositionsTableProps) {
  const intl = useIntl();
  const navigate = useNavigate();

  const formatAmount = (amount: bigint, token?: TokenMetadata) =>
    token
      ? `${Number(formatUnits(amount, token.decimals)).toLocaleString(intl.locale, { maximumFractionDigits: 6 })} ${token.symbol}`
      : '-';

  return (
    <TableContainer component={Paper} sx={{ marginBottom: 2 }}>
      <Table sx={{ minWidth: 800 }} aria-label={intl.formatMessage({ id: 'fixed.positions.tableAria' })}>
        <TableHead>
          <TableRow>
            <TableCell>
              <FormattedMessage id="fixed.positions.market" />
            </TableCell>
            <TableCell>
              <FormattedMessage id="fixed.positions.network" />
            </TableCell>
            <TableCell>
              <FormattedMessage id="fixed.positions.type" />
            </TableCell>
            <TableCell>
              <FormattedMessage id="fixed.positions.amount" />
            </TableCell>
            <TableCell>
              <FormattedMessage id="fixed.positions.collateral" />
            </TableCell>
            <TableCell>
              <FormattedMessage id="fixed.positions.effectiveApr" />
            </TableCell>
            <TableCell>
              <FormattedMessage id="fixed.positions.status" />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {positions.map((position) => {
            const loan = getToken(position.chainId, position.loanToken);
            const loanSymbol = loan?.symbol ?? shortenAddress(position.loanToken);
            // The loan token is lent, never shown as collateral (see `findCollateralIndex`).
            const collateral = position.collaterals.find((item) => item.amount > 0n && !isAddressEqual(item.token, position.loanToken));
            const collateralToken = collateral ? getToken(position.chainId, collateral.token) : undefined;
            const collateralSymbol = collateral ? (collateralToken?.symbol ?? shortenAddress(collateral.token)) : undefined;
            const pair = collateralSymbol ? `${loanSymbol} / ${collateralSymbol}` : loanSymbol;
            const maturity = formatMaturity(intl, position.maturity, nowSec);
            const faceValue = position.credit > position.pendingFee ? position.credit - position.pendingFee : 0n;
            const status: PositionStatus = !maturity.isMatured
              ? 'active'
              : position.debt > 0n
                ? 'overdue'
                : faceValue > 0n
                  ? 'redeem'
                  : 'matured';
            const href = routes.fixedMarket(position.marketId, loanSymbol, collateralSymbol, position.maturity);

            return (
              <TableRow key={`${position.chainId}:${position.marketId}`} hover onClick={() => navigate(href)} sx={{ cursor: 'pointer' }}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TokenIcon symbol={loanSymbol} logoURI={loan?.logoURI} avatarProps={{ alt: '' }} />
                    <Box>
                      <Link
                        component={RouterLink}
                        to={href}
                        color="inherit"
                        underline="none"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={intl.formatMessage({ id: 'fixed.positions.openAria' }, { pair })}
                      >
                        {pair}
                      </Link>
                      <Typography variant="body2" color="text.secondary">
                        {maturity.date} · {maturity.relative}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <ChainIcon chainId={position.chainId} showName />
                </TableCell>
                <TableCell>{position.type ? intl.formatMessage({ id: TYPE_LABELS[position.type] }) : '-'}</TableCell>
                <TableCell>
                  {position.debt > 0n ? formatAmount(position.debt, loan) : faceValue > 0n ? formatAmount(faceValue, loan) : '-'}
                </TableCell>
                <TableCell>{collateral ? formatAmount(collateral.amount, collateralToken) : '-'}</TableCell>
                <TableCell>{formatWadPercent(position.effectiveRateWad) ?? '-'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={STATUS_COLORS[status]}
                    variant={status === 'active' ? 'outlined' : 'filled'}
                    label={intl.formatMessage({ id: STATUS_LABELS[status] })}
                    aria-label={`${intl.formatMessage({ id: STATUS_LABELS[status] })}, ${getChainName(position.chainId)}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
