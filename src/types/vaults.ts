export interface Asset {
  id: string;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

export interface Chain {
  id: number;
  network: string;
}

export interface State {
  dailyNetApy: number;
}

export interface Vault {
  address: string;
  symbol: string;
  name: string;
  whitelisted: boolean;
  asset: Asset;
  chain: Chain;
  state: State;
}

export interface VaultsData {
  vaults: {
    items: Vault[];
  };
}
