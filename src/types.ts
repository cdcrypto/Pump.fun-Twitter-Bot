export interface TokenInfo {
  symbol: string;
  name: string;
  imageUrl: string;
  price: number;
  marketCap: number;
  createdTimestamp: number;
  mintAddress?: string; // Optional since pump.fun tokens might not have it
}

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  user: {
    name: string;
    screen_name: string;
    profile_image_url_https: string;
    verified: boolean;
    followers_count: number;
  };
  entities: {
    urls: Array<{
      display_url: string;
      expanded_url: string;
      url: string;
    }>;
  };
  retweet_count: number;
  favorite_count: number;
  views_count: number | null;
  bookmark_count: number | null;
  quoted_status?: Tweet;
  tokenInfo?: TokenInfo;
  mintAddress?: string;
  pricePerToken?: number;
  lastPriceCheck?: number;
  source_type?: 'pumpfun' | 'dexscreener';
}

export interface VirtualReserves {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

export interface CoinData {
  mint: string;
  bondingCurve: string;
  associatedBondingCurve: string;
  virtualTokenReserves: number;
  virtualSolReserves: number;
  tokenTotalSupply: number;
  complete: boolean;
}
