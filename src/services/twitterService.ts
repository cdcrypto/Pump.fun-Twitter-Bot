import { Tweet } from '../types';

export type TweetType = 'pumpfun' | 'dexscreener';

interface TwitterUser {
  id: number;
  id_str: string;
  name: string;
  screen_name: string;
  profile_image_url_https: string;
  followers_count: number;
  verified: boolean;
}

interface TwitterEntities {
  urls: Array<{
    display_url: string;
    expanded_url: string;
    indices: number[];
    url: string;
  }>;
  media?: Array<{
    display_url: string;
    expanded_url: string;
    media_url_https: string;
    type: string;
    url: string;
  }>;
}

interface RawTweet {
  created_at: string;
  id: number;
  id_str: string;
  text: string | null;
  full_text: string;
  user: TwitterUser;
  entities: TwitterEntities;
  quoted_status?: RawTweet;
  retweet_count: number;
  favorite_count: number;
  views_count: number | null;
  bookmark_count: number | null;
  tweet_created_at: string;
  mint_address?: string;
  token_info?: {
    symbol: string;
    name: string;
    image_url: string;
    price: number;
    market_cap: number;
    created_timestamp: number;
  };
}

interface WebSocketMessage {
  type: 'tweets';
  queryType: TweetType;
  data: RawTweet[];
}

interface SearchConfig {
  type: TweetType;
  urlPattern: string;
}

export class TwitterService {
  private static instance: TwitterService | null = null;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly wsUrl = 'wss://web-production-9ecc.up.railway.app';
  private subscribers: ((tweets: Tweet[], type: TweetType) => void)[] = [];
  private cachedTweets: { [key in TweetType]: Tweet[] } = {
    pumpfun: [],
    dexscreener: []
  };
  private searchConfigs: SearchConfig[];

  private constructor() {
    this.searchConfigs = [
      { 
        type: 'pumpfun',
        urlPattern: 'pump.fun/coin/'
      },
      { 
        type: 'dexscreener',
        urlPattern: 'dexscreener.com/solana/'
      }
    ];

    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public static getInstance(): TwitterService {
    if (!TwitterService.instance) {
      TwitterService.instance = new TwitterService();
    }
    return TwitterService.instance;
  }

  private transformTweet(rawTweet: RawTweet): Tweet {
    // Handle null text content
    if (!rawTweet.text && !rawTweet.full_text) {
      console.log('Tweet has no text content, skipping transformation:', rawTweet.id_str);
      return {
        id: rawTweet.id_str,
        text: '',
        created_at: Date.now().toString(),
        user: rawTweet.user,
        entities: {
          urls: []
        },
        source_type: 'pumpfun',
        retweet_count: rawTweet.retweet_count,
        favorite_count: rawTweet.favorite_count,
        views_count: rawTweet.views_count ?? null,
        bookmark_count: rawTweet.bookmark_count ?? null,
        mintAddress: rawTweet.mint_address,
        tokenInfo: rawTweet.token_info ? {
          symbol: rawTweet.token_info.symbol,
          name: rawTweet.token_info.name,
          imageUrl: rawTweet.token_info.image_url,
          price: rawTweet.token_info.price,
          marketCap: rawTweet.token_info.market_cap,
          createdTimestamp: rawTweet.token_info.created_timestamp
        } : undefined
      };
    }

    // Combine URLs from both entities.urls and entities.media
    const urls = [
      ...(rawTweet.entities?.urls || []),
      ...(rawTweet.entities?.media || [])
    ].map(url => ({
      display_url: url.display_url,
      expanded_url: url.expanded_url,
      url: url.url
    }));

    console.log('Transforming tweet:', rawTweet.id_str);
    
    console.log('Raw tweet timestamp:', rawTweet.tweet_created_at);
    // Parse the timestamp and convert to current timezone
    const createdAtMs = new Date(rawTweet.tweet_created_at?.replace('.000000Z', 'Z') || Date.now()).getTime();
    console.log('Converted timestamp:', createdAtMs);
    
    const tweet: Tweet = {
      id: rawTweet.id_str,
      text: rawTweet.full_text || rawTweet.text || '',
      created_at: createdAtMs.toString(),
      user: {
        name: rawTweet.user.name,
        screen_name: rawTweet.user.screen_name,
        profile_image_url_https: rawTweet.user.profile_image_url_https,
        followers_count: rawTweet.user.followers_count,
        verified: rawTweet.user.verified
      },
      entities: {
        urls: urls
      },
      source_type: 'pumpfun', 
      retweet_count: rawTweet.retweet_count,
      favorite_count: rawTweet.favorite_count,
      views_count: rawTweet.views_count ?? null,
      bookmark_count: rawTweet.bookmark_count ?? null,
      mintAddress: rawTweet.mint_address,
      tokenInfo: rawTweet.token_info ? {
        symbol: rawTweet.token_info.symbol,
        name: rawTweet.token_info.name,
        imageUrl: rawTweet.token_info.image_url,
        price: rawTweet.token_info.price,
        marketCap: rawTweet.token_info.market_cap,
        createdTimestamp: rawTweet.token_info.created_timestamp
      } : undefined
    };

    if (rawTweet.quoted_status) {
      tweet.quoted_status = this.transformTweet(rawTweet.quoted_status);
    }

    console.log('Transformed tweet:', tweet);
    return tweet;
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.log('Connecting to tweet stream...');
    this.ws = new WebSocket(this.wsUrl);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('Connected to tweet stream');
      this.reconnectAttempts = 0;
      this.subscribeToAllTweets();
    };

    this.ws.onmessage = (event) => {
      try {
        console.log('Received WebSocket message:', event.data);
        const message = JSON.parse(event.data) as WebSocketMessage;
        
        if (message.type === 'tweets' && Array.isArray(message.data)) {
          console.log(`Processing ${message.data.length} tweets of type ${message.queryType}`);
          const tweets = message.data.map(tweet => {
            const transformedTweet = this.transformTweet(tweet);
            transformedTweet.source_type = message.queryType;
            return transformedTweet;
          });

          // Cache tweets
          this.cachedTweets[message.queryType] = [...this.cachedTweets[message.queryType], ...tweets];

          // Notify subscribers
          console.log('Notifying subscribers with processed tweets:', tweets);
          this.subscribers.forEach(callback => {
            callback(tweets, message.queryType);
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
      this.handleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private subscribeToAllTweets() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.searchConfigs.forEach(config => {
      const subscription = {
        query: config.urlPattern,
        type: config.type
      };
      console.log('Sent subscription:', subscription);
      this.ws?.send(JSON.stringify(subscription));
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  public subscribe(callback: (tweets: Tweet[], type: TweetType) => void) {
    this.subscribers.push(callback);
    return () => this.subscribers = this.subscribers.filter(cb => cb !== callback);
  }

  public unsubscribe(callback: (tweets: Tweet[], type: TweetType) => void) {
    this.subscribers = this.subscribers.filter(cb => cb !== callback);
  }

  public getCachedTweets(type: TweetType): Tweet[] {
    return this.cachedTweets[type].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribers = [];
    this.cachedTweets = {
      pumpfun: [],
      dexscreener: []
    };
  }

  public reconnect() {
    console.log('Forcing reconnection to tweet stream...');
    if (this.ws) {
      this.ws.close();
    }
    this.reconnectAttempts = 0;
    this.connect();
  }
}

// Export singleton instance
export const twitterService = TwitterService.getInstance();
