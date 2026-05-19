export interface MarketState {
  borrowAssets: number;
  supplyAssets: number;
  fee: number;
  utilization: number;
  dailyNetBorrowApy: number;
  totalLiquidity: string;
  totalLiquidityUsd: number;
  size: string;
  sizeUsd: number;
  netBorrowApy: number;
  netSupplyApy: number;
}

export interface Asset {
  address: string;
  symbol: string;
  decimals: number;
}

export interface MarketChain {
  id: number;
  network: string;
}

export interface MarketInterface {
  price: string;
  uniqueKey: string;
  lltv: string;
  oracleAddress: string;
  irmAddress: string;
  chain: MarketChain;
  loanAsset: Asset;
  collateralAsset: Asset;
  state: MarketState;
}

export interface MarketData {
  markets: {
    items: MarketInterface[];
  };
}
