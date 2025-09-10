import { formatEther, formatUnits } from 'viem';

export const DECIMALS_SCALE_FACTOR = 3;
/**
 * Formats a blockchain amount (in wei) to a human-readable format
 * @param amount - Amount in wei as string
 * @param decimals - Number of decimal places to display
 * @returns Formatted amount as string
 */
export const formatTokenAmount = (amount: string | undefined, decimals: number = 4, fractionDigits: number = 6): string => {
  if (!amount) {
    amount = '0';
  }

  try {
    return (
      Number(formatUnits(BigInt(amount), decimals))
        // .toFixed(decimals)
        .toLocaleString('en-US', {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits
        })
    );

    // return `${Number(value).toLocaleString('en-US', {
    //   minimumFractionDigits: 2,
    //   maximumFractionDigits: 2
    // })}`;
  } catch (error) {
    console.error('Error formatting amount:', error);
    return '0.0000';
  }
};

/**
 * Shortens an Ethereum address for display
 * @param address - Ethereum address
 * @returns Shortened address (e.g. 0x1234...5678)
 */
export const shortenAddress = (address: string): string => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};
export const formatShortUSDS = (value: string | number) => {
  const num = Number(value);

  // For values under 1000, display normally
  if (num < 1000) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // For thousands (1K - 999K)
  if (num < 1000000) {
    return `${(num / 1000).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    })} K`;
  }

  // For millions (1M - 999M)
  if (num < 1000000000) {
    return `${(num / 1000000).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    })} M`;
  }

  // For billions and above
  return `${(num / 1000000000).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })} B`;
};

export const formatUSDS = (value: string | number) => {
  return `${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

export const formatLLTV = (lltv: string): number | null => {
  if (!lltv) return null;
  try {
    const lltvNumber = parseFloat(lltv) / 1e18;
    return lltvNumber * 100;
  } catch (e) {
    console.error(e);
    return null;
  }
};
