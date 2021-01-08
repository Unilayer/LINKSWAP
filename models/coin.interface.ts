export interface ICoin {

  coingecko_id: string;

  image: string;

  description: string;

  rank: number;

  marketRank: number;

  trustScore: string;

  isTrust: boolean;

  token: {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
    total_supply: number;
    max_supply: number;
    circulating_supply: number; 
  }

  price: {
    usd: number,
    eth: number,
    change: number,
  };

  price_high: {
    usd: number,
    eth: number
  };

  price_low: {
    usd: number,
    eth: number
  };

  volume: {
    usd: number,
    eth: number,
    change: number
  };

  liquidity: {
    usd: number,
    eth: number,
    change: number
  };

  uniswap: {
    address: string;
    trade_url: string;
    info_url: string
  };

  sparkline: number[];

  social: {
    homepage: string;
    twitter: string;
    facebook: string;
    telegram: string;
    chat: string;
    github: string;
  }

  favorite: boolean
  
  updatedAt: Date;

}