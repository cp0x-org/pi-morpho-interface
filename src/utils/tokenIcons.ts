/**
 * Utility functions for working with token icons
 */

/**
 * Try to load a token icon based on the symbol
 * @param symbol The token symbol
 * @returns The icon path or null if not found
 */
export const getTokenIconPath = (symbol: string): string | null => {
  try {
    // Convert symbol to lowercase to match filenames
    const normalizedSymbol = symbol.toLowerCase();
    
    // Dynamic import of the token icon
    return require(`../assets/images/morpho/tokens/${normalizedSymbol}.svg`);
  } catch (e) {
    // Return null for unsupported tokens
    console.warn(`Token icon for ${symbol} not found`);
    return null;
  }
};
