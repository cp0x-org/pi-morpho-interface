import type { ReactNode } from 'react';
import { formatUnits } from 'viem';
import { FormattedMessage, useIntl } from 'react-intl';
import Box from '@mui/material/Box';
import { IconButton, Link, Paper, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { ChainIcon } from 'components/ChainIcon';
import { TokenIcon } from 'components/TokenIcon';
import { useCopyToClipboard } from 'hooks/useCopyToClipboard';
import { useExplorerUrl } from 'hooks/midnight/useExplorerUrl';
import { MarketInterface } from 'types/market';
import { formatLLTV, shortenAddress } from 'utils/formatters';

interface MarketDetailsCardProps {
  market: MarketInterface;
  chainId?: number;
  /** 1e36-scaled oracle price, read on-chain: loan base units per collateral base unit. */
  oraclePrice?: bigint;
}

const ORACLE_PRICE_SCALE = 10n ** 36n;

// ==============================|| VARIABLE-RATE MARKET DETAILS ||============================== //
//
// The immutable side of a market: which tokens, which oracle, which liquidation limit. It used to be split
// between the page header and the position card (LLTV sat next to the user's balances even though it never
// changes per user), which left the right column empty below the position.

export default function MarketDetailsCard({ market, chainId, oraclePrice }: MarketDetailsCardProps) {
  const theme = useTheme();
  const intl = useIntl();
  const explorer = useExplorerUrl(chainId);
  const { copySuccessMsg, copyToClipboard } = useCopyToClipboard();
  const copyTitle = copySuccessMsg || intl.formatMessage({ id: 'common.copyAddress' });

  const lltv = formatLLTV(market.lltv);
  const oracleAddress = market.oracle?.address;
  const oracleLink = oracleAddress ? explorer.address(oracleAddress) : undefined;

  // 1 collateral token priced in loan tokens, both scaled out of their own decimals.
  const oraclePriceLabel =
    oraclePrice != null && market.collateralAsset?.decimals != null && market.loanAsset?.decimals != null
      ? `1 ${market.collateralAsset.symbol} = ${Number(
          formatUnits((oraclePrice * 10n ** BigInt(market.collateralAsset.decimals)) / ORACLE_PRICE_SCALE, market.loanAsset.decimals)
        ).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${market.loanAsset.symbol}`
      : undefined;

  const renderCopy = (ariaLabel: string, text: string) => (
    <Tooltip title={copyTitle} placement="top">
      <IconButton aria-label={ariaLabel} onClick={() => copyToClipboard(text)} sx={{ padding: '3px' }}>
        <ContentCopyIcon sx={{ fontSize: '14px', color: theme.palette.grey[500] }} />
      </IconButton>
    </Tooltip>
  );

  const renderToken = (asset: { symbol: string; address: string } | null | undefined, copyAriaId: string) =>
    asset ? (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TokenIcon symbol={asset.symbol} sx={{ display: 'flex' }} avatarProps={{ alt: '', sx: { width: 20, height: 20 } }} />
        <Typography variant="body2" fontWeight="bold">
          {asset.symbol}
        </Typography>
        {renderCopy(intl.formatMessage({ id: copyAriaId }, { symbol: asset.symbol, address: asset.address }), asset.address)}
      </Box>
    ) : (
      <Typography variant="body2">{intl.formatMessage({ id: 'common.naShort' })}</Typography>
    );

  const rows: { labelId: string; value: ReactNode }[] = [
    { labelId: 'market.detailsNetwork', value: chainId ? <ChainIcon chainId={chainId} showName /> : '-' },
    { labelId: 'market.loan', value: renderToken(market.loanAsset, 'market.copyLoanAria') },
    { labelId: 'market.collateral', value: renderToken(market.collateralAsset, 'market.copyCollateralAria') },
    {
      labelId: 'market.lltv',
      value: (
        <Typography variant="body2" fontWeight="bold">
          {lltv != null ? `${lltv.toFixed(2)}%` : intl.formatMessage({ id: 'common.naShort' })}
        </Typography>
      )
    },
    {
      labelId: 'market.detailsOracle',
      value: oracleAddress ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {oracleLink ? (
            <Link
              href={oracleLink}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              aria-label={intl.formatMessage({ id: 'market.oracleAria' }, { address: oracleAddress })}
            >
              {shortenAddress(oracleAddress)}
            </Link>
          ) : (
            <Typography variant="body2">{shortenAddress(oracleAddress)}</Typography>
          )}
          {renderCopy(intl.formatMessage({ id: 'market.oracleAria' }, { address: oracleAddress }), oracleAddress)}
        </Box>
      ) : (
        <Typography variant="body2">{intl.formatMessage({ id: 'common.naShort' })}</Typography>
      )
    },
    ...(oraclePriceLabel
      ? [{ labelId: 'market.detailsOraclePrice', value: <Typography variant="body2">{oraclePriceLabel}</Typography> }]
      : []),
    {
      labelId: 'market.detailsMarketId',
      value: (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2">{shortenAddress(market.marketId)}</Typography>
          {renderCopy(intl.formatMessage({ id: 'market.copyMarketIdAria' }, { id: market.marketId }), market.marketId)}
        </Box>
      )
    }
  ];

  return (
    <Paper>
      <Typography variant="h4" component="h2" gutterBottom sx={{ marginBottom: '16px' }}>
        <FormattedMessage id="market.detailsTitle" />
      </Typography>
      {/* Pairs flow into two columns on a wide screen: stretched across the full width, a label and its value
          ended up at opposite edges with a gap of dead space between them. */}
      <Box
        component="dl"
        sx={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          rowGap: 1.5,
          columnGap: 5
        }}
      >
        {rows.map((row) => (
          <Box key={row.labelId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, minWidth: 0 }}>
            <Typography component="dt" variant="body2" sx={{ color: theme.palette.grey[500] }}>
              <FormattedMessage id={row.labelId} />
            </Typography>
            <Box component="dd" sx={{ margin: 0, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {row.value}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
