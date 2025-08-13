export interface MarketState {
  borrowAssets: number;
  supplyAssets: number;
  fee: number;
  utilization: number;
  dailyNetBorrowApy: number;
  totalLiquidityUsd: number;
  sizeUsd: number;
}

export interface Asset {
  address: string;
  symbol: string;
  decimals: number;
}

export interface MarketInterface {
  price: string;
  uniqueKey: string;
  lltv: string;
  oracleAddress: string;
  irmAddress: string;
  loanAsset: Asset;
  collateralAsset: Asset;
  state: MarketState;
}

export interface MarketData {
  markets: {
    items: MarketInterface[];
  };
}
