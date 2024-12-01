export interface TokenInfo {
  symbol: string;
  name: string;
  imageUrl: string;
  price: number;
  marketCap: number;
  createdTimestamp: number;
}

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  user: {
    name: string;
    screen_name: string;
    profile_image_url_https: string;
    followers_count: number;
    verified: boolean;
  };
  entities: {
    urls: Array<{
      display_url: string;
      expanded_url: string;
      url: string;
    }>;
  };
  source_type: 'pumpfun' | 'dexscreener';
  retweet_count: number;
  favorite_count: number;
  views_count?: number;
  bookmark_count?: number;
  quoted_status?: Tweet;
  mintAddress?: string;
  tokenInfo?: TokenInfo;
  pricePerToken?: number;
  lastPriceCheck?: number;
}
