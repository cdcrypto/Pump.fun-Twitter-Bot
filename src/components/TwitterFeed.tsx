"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { TwitterService } from '../services/twitterService';
import { Connection, Keypair } from '@solana/web3.js';
import { PumpFunClient } from '../pumpFunClient';
import { DexscreenerClient } from '../dexscreenerClient';
import { useTradingContext } from '../contexts/TradingContext';
import { useBlacklistContext } from '../contexts/BlacklistContext';
import { useBuylistContext } from '../contexts/BuylistContext';
import { Tweet as ImportedTweet, TokenInfo } from '../types';
import bs58 from 'bs58';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { OrderStatus } from '../contexts/TradingContext';
import { RPC_ENDPOINT } from '../constants';
import { HeliusService } from '../services/heliusService';

interface LocalTweet extends Omit<ImportedTweet, 'text'> {
  full_text: string;
  source_type: 'pumpfun' | 'dexscreener';
  tokenInfo?: TokenInfo;
  mintAddress?: string;
  pricePerToken?: number;
  lastPriceCheck?: number;
}

declare global {
  interface Window {
    triggerTokenUpdate?: () => void;
  }
}

export default function TwitterFeed() {
  const {
    privateKey,
    buyAmount,
    autoBuyEnabled,
    followerCheckEnabled,
    minFollowers,
    creationTimeEnabled,
    maxCreationTime,
    slippage,
    addOrder,
    updateOrder,
    orders,
  } = useTradingContext();

  const { blacklistedUsers, addToBlacklist, isBlacklisted } = useBlacklistContext();
  const { isBuylisted } = useBuylistContext();
  const [tweets, setTweets] = useState<LocalTweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedTweets, setExpandedTweets] = useState<Set<string>>(new Set());
  const [buyLoading, setBuyLoading] = useState<{ [key: string]: boolean }>({});
  const [txSignatures, setTxSignatures] = useState<{ [key: string]: string }>({});
  const [pumpFunClient, setPumpFunClient] = useState<PumpFunClient | null>(null);
  const [dexscreenerClient, setDexscreenerClient] = useState<DexscreenerClient | null>(null);
  const [lastTweetId, setLastTweetId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isMounted, setIsMounted] = useState(false);
  
  const [purchasedMints, setPurchasedMints] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pumpfun_purchased_mints');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    }
    return new Set();
  });

  const [activeSourceTypes, setActiveSourceTypes] = useState<Set<string>>(
    new Set(['pumpfun', 'dexscreener'])
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [minDisplayFollowers, setMinDisplayFollowers] = useState(0);
  const [isFollowerFilterActive, setIsFollowerFilterActive] = useState(false);
  const [autoBuyEnabledTimestamp, setAutoBuyEnabledTimestamp] = useState<number | null>(null);
  const [tokenInfoCache, setTokenInfoCache] = useState<{ [key: string]: TokenInfo }>({});
  const [processedTweets] = useState<Set<string>>(() => new Set());
  const [processedMintAddresses, setProcessedMintAddresses] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('processed_mint_addresses');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    }
    return new Set();
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sourceTypes = [
    { 
      type: 'pumpfun', 
      label: 'pump.fun', 
      activeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      dotClass: 'bg-blue-500'
    },
    { 
      type: 'dexscreener', 
      label: 'DexScreener', 
      activeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      dotClass: 'bg-green-500'
    }
  ];

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const priceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const twitterServiceRef = useRef(TwitterService.getInstance());

  const handleBuy = async (tweet: LocalTweet) => {
    if (!tweet.mintAddress) return;
    
    const client = tweet.source_type === 'pumpfun' ? pumpFunClient : dexscreenerClient;
    if (!client) return;
    
    let pendingOrder: OrderStatus | undefined;
    const tweetKey = `${tweet.source_type}_${tweet.id}`;
    
    try {
      setBuyLoading(prev => ({ ...prev, [tweetKey]: true }));

      // Create initial order with pending status
      const newOrder: Omit<OrderStatus, 'id' | 'timestamp'> = {
        tokenSymbol: tweet.tokenInfo?.symbol || '???',
        tokenName: tweet.tokenInfo?.name || 'Unknown Token',
        type: 'buy' as const,
        amount: buyAmount,
        status: 'pending' as const,
        mintAddress: tweet.mintAddress
      };
      
      // Add the order and get its ID
      pendingOrder = addOrder(newOrder);

      let result: { success: boolean; signature?: string; error?: string };
      
      if (tweet.source_type === 'pumpfun' && tweet.mintAddress) {  
        // For manual buys, skip trading settings checks
        const buyResult = await pumpFunClient!.buy(tweet.mintAddress, buyAmount, slippage);
        result = buyResult;
      } else if (tweet.source_type === 'dexscreener' && tweet.mintAddress) {
        result = await dexscreenerClient!.buyToken(tweet.mintAddress, buyAmount);
      } else {
        throw new Error('No mint address found for token');
      }
      
      if (result.success && result.signature) {  
        // Ensure signature is not undefined before setting
        setTxSignatures(prev => ({ ...prev, [tweetKey]: result.signature! }));
        
        // Update order status to success
        if (pendingOrder) {
          updateOrder(pendingOrder.id, {
            status: 'success',
            signature: result.signature!
          });

          // Remove successful order after 15 seconds
          setTimeout(() => {
            if (pendingOrder) {
              updateOrder(pendingOrder.id, { status: 'removed' });
            }
          }, 15000);
        }
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (error: any) {
      console.error('Buy error:', error);
      let errorMessage = 'Transaction failed';
      
      if (error.response?.data?.result?.value?.err) {
        errorMessage = error.response.data.result.value.err;
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (pendingOrder) {
        updateOrder(pendingOrder.id, {
          status: 'error',
          error: errorMessage
        });

        setTimeout(() => {
          if (pendingOrder) {
            updateOrder(pendingOrder.id, { status: 'removed' });
          }
        }, 15000);
      }
    } finally {
      setBuyLoading(prev => ({ ...prev, [tweetKey]: false }));
    }
  };

  const handleAutoBuy = async (tweet: LocalTweet) => {
    if (!tweet.mintAddress) return;
    
    // Check if we've already processed this mint address
    if (processedMintAddresses.has(tweet.mintAddress)) {
      console.log('Skipping auto-buy - already processed mint address:', tweet.mintAddress);
      return;
    }

    const autoBuyKey = `autobuy_${tweet.id}`;
    
    // Check if we've already tried to autobuy this tweet
    if (processedTweets.has(tweet.id)) {
      console.log('Skipping auto-buy - already processed tweet:', tweet.id);
      return;
    }
    
    let pendingOrder: OrderStatus | undefined;
    
    try {
      setBuyLoading(prev => ({ ...prev, [tweet.source_type + '_' + tweet.id]: true }));

      const client = tweet.source_type === 'pumpfun' ? pumpFunClient : dexscreenerClient;
      if (!client) return;

      // Check if autobuy is allowed before creating pending order
      if (tweet.source_type === 'pumpfun' && tweet.mintAddress) {
        // Only check trading settings for auto-buys
        const buyCheck = await pumpFunClient!.autoBuy(tweet.mintAddress, tweet);
        if (!buyCheck.success) {
          console.log('Skipping buy - PumpFun trading settings check failed:', buyCheck.error);
          return;
        }
      } else if (tweet.source_type === 'dexscreener' && tweet.mintAddress) {
        if (!dexscreenerClient!.shouldBuyToken(tweet.mintAddress)) {
          console.log('Skipping buy - Dexscreener trading settings check failed');
          return;
        }
      }

      // Create initial order with pending status
      const newOrder: Omit<OrderStatus, 'id' | 'timestamp'> = {
        tokenSymbol: tweet.tokenInfo?.symbol || '???',
        tokenName: tweet.tokenInfo?.name || 'Unknown Token',
        type: 'buy' as const,
        amount: buyAmount,
        status: 'pending' as const,
        mintAddress: tweet.mintAddress
      };
      
      // Add the order and get its ID
      pendingOrder = addOrder(newOrder);

      let result: { success: boolean; signature?: string; error?: string };
      
      if (tweet.source_type === 'pumpfun' && tweet.mintAddress) {  
        const buyResult = await pumpFunClient!.buy(tweet.mintAddress, buyAmount, slippage);
        result = buyResult;
      } else if (tweet.mintAddress) {  
        result = await dexscreenerClient!.buyToken(tweet.mintAddress, buyAmount);
      } else {
        throw new Error('No mint address found for token');
      }
      
      if (result.success && result.signature) {  
        // Mark mint address as processed
        setProcessedMintAddresses(prev => new Set([...prev, tweet.mintAddress!]));
        processedTweets.add(tweet.id);

        // Ensure signature is not undefined before setting
        const signature = result.signature;
        setTxSignatures(prev => ({ ...prev, [tweet.source_type + '_' + tweet.id]: signature! }));
        
        // Update order status to success
        if (pendingOrder) {
          updateOrder(pendingOrder.id, {
            status: 'success',
            signature: signature!
          });

          // Remove successful order after 15 seconds
          setTimeout(() => {
            if (pendingOrder) {
              updateOrder(pendingOrder.id, { status: 'removed' });
            }
          }, 15000);
        }
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (error: any) {
      console.error('Autobuy error:', error);
      let errorMessage = 'Transaction failed';
      
      if (error.response?.data?.result?.value?.err) {
        errorMessage = error.response.data.result.value.err;
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (pendingOrder) {
        updateOrder(pendingOrder.id, {
          status: 'error',
          error: errorMessage
        });

        setTimeout(() => {
          if (pendingOrder) {
            updateOrder(pendingOrder.id, { status: 'removed' });
          }
        }, 15000);
      }
    } finally {
      setBuyLoading(prev => ({ ...prev, [tweet.source_type + '_' + tweet.id]: false }));
    }
  };

  const checkAndAutoBuy = useCallback((tweet: LocalTweet) => {
    // Skip tweets that existed before auto-buy was enabled
    if (!autoBuyEnabledTimestamp) return;
    const tweetTimestamp = parseInt(tweet.created_at);
    if (tweetTimestamp < autoBuyEnabledTimestamp) {
      console.log('Skipping auto-buy for older tweet:', {
        tweetId: tweet.id,
        tweetTime: new Date(tweetTimestamp).toISOString(),
        autoBuyEnabledTime: new Date(autoBuyEnabledTimestamp).toISOString()
      });
      return;
    }

    // Check if we've already tried to autobuy this tweet
    const autoBuyKey = `autobuy_${tweet.id}`;
    
    const userIsBuylisted = isBuylisted(tweet.user.screen_name);
    const userIsBlacklisted = isBlacklisted(tweet.user.screen_name);

    // Only check follower requirement if followerCheckEnabled is true
    const meetsFollowerRequirement = followerCheckEnabled 
      ? tweet.user.followers_count >= minFollowers 
      : false;

    // Check if token meets creation time requirement only if creationTimeEnabled is true
    const tokenCreationTime = tweet.tokenInfo?.createdTimestamp || 0;
    const currentTime = Date.now() / 1000; // Convert to seconds
    const tokenAgeInMinutes = (currentTime - tokenCreationTime) / 60;
    const meetsCreationTimeRequirement = creationTimeEnabled 
      ? tokenAgeInMinutes <= maxCreationTime 
      : false;
    
    // Determine if we should buy based on user lists and settings
    const shouldBuyBasedOnUser = 
      // Always buy from buylisted users (unless blacklisted)
      (userIsBuylisted && !userIsBlacklisted) ||
      // For non-buylisted users, check if BOTH criteria are enabled and met
      (!userIsBuylisted && !userIsBlacklisted && (
        // If both checks are enabled, both must pass
        (followerCheckEnabled && creationTimeEnabled && meetsFollowerRequirement && meetsCreationTimeRequirement) ||
        // If only follower check is enabled, it must pass
        (followerCheckEnabled && !creationTimeEnabled && meetsFollowerRequirement) ||
        // If only creation time check is enabled, it must pass
        (!followerCheckEnabled && creationTimeEnabled && meetsCreationTimeRequirement) ||
        // If neither check is enabled, don't auto-buy
        (!followerCheckEnabled && !creationTimeEnabled && false)
      ));

    // Check all other conditions
    const shouldBuy = 
      autoBuyEnabled &&
      tweet.mintAddress &&
      tweet.tokenInfo &&
      !txSignatures[tweet.source_type + '_' + tweet.id] &&
      !buyLoading[tweet.source_type + '_' + tweet.id] &&
      privateKey &&
      (tweet.source_type === 'pumpfun' ? pumpFunClient : dexscreenerClient) &&
      !purchasedMints.has(tweet.mintAddress) &&
      !localStorage.getItem(autoBuyKey) &&
      shouldBuyBasedOnUser;

    if (shouldBuy) {
      // Log the reason for buying or not buying
      const buyReason = userIsBuylisted 
        ? 'User is buylisted' 
        : `Criteria check results: ${
            followerCheckEnabled ? `Followers (${tweet.user.followers_count} >= ${minFollowers}): ${meetsFollowerRequirement}` : 'Follower check disabled'
          }, ${
            creationTimeEnabled ? `Age (${Math.round(tokenAgeInMinutes)}m <= ${maxCreationTime}m): ${meetsCreationTimeRequirement}` : 'Age check disabled'
          }`;

      console.log('Auto-buying token from tweet:', {
        tweetId: tweet.id,
        user: tweet.user.screen_name,
        followers: tweet.user.followers_count,
        tokenAge: Math.round(tokenAgeInMinutes),
        mintAddress: tweet.mintAddress,
        tokenSymbol: tweet.tokenInfo?.symbol || 'Unknown',
        isBuylisted: userIsBuylisted,
        followerCheckEnabled,
        minFollowers: followerCheckEnabled ? minFollowers : 'disabled',
        creationTimeEnabled,
        maxCreationTime: creationTimeEnabled ? maxCreationTime : 'disabled',
        buyReason,
        tweetTime: new Date(tweetTimestamp).toISOString(),
        autoBuyEnabledTime: new Date(autoBuyEnabledTimestamp).toISOString()
      });
      handleAutoBuy(tweet);
    } else {
      console.log('Skipping auto-buy:', {
        tweetId: tweet.id,
        user: tweet.user.screen_name,
        reason: !shouldBuyBasedOnUser ? 'Does not meet criteria' : 'Other conditions not met',
        followers: tweet.user.followers_count,
        followerCheckEnabled,
        meetsFollowerRequirement,
        tokenAge: Math.round(tokenAgeInMinutes),
        creationTimeEnabled,
        meetsCreationTimeRequirement
      });
    }
  }, [autoBuyEnabled, minFollowers, followerCheckEnabled, txSignatures, buyLoading, privateKey, pumpFunClient, dexscreenerClient, isBlacklisted, purchasedMints, isBuylisted, creationTimeEnabled, maxCreationTime, autoBuyEnabledTimestamp]);

  useEffect(() => {
    if (autoBuyEnabled && tweets.length > 0) {
      tweets.forEach(tweet => {
        checkAndAutoBuy(tweet);
      });
    }
  }, [tweets, autoBuyEnabled, checkAndAutoBuy]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pumpfun_purchased_mints', JSON.stringify([...purchasedMints]));
    }
  }, [purchasedMints]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('processed_mint_addresses', JSON.stringify([...processedMintAddresses]));
    }
  }, [processedMintAddresses]);

  const addToPurchasedMints = useCallback((mintAddress: string) => {
    setPurchasedMints(prev => new Set([...prev, mintAddress]));
  }, []);

  const toggleTweetExpansion = (tweetId: string) => {
    setExpandedTweets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tweetId)) {
        newSet.delete(tweetId);
      } else {
        newSet.add(tweetId);
      }
      return newSet;
    });
  };

  const truncateText = (text: string, maxLength: number = 120) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const formatFollowerCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const formatMarketCap = (marketCap: number): string => {
    const roundedMarketCap = Math.round(marketCap);
    
    if (roundedMarketCap >= 1000000000) {
      return `${(roundedMarketCap / 1000000000).toFixed(1)}B`;
    } else if (roundedMarketCap >= 1000000) {
      return `${(roundedMarketCap / 1000000).toFixed(1)}M`;
    } else if (roundedMarketCap >= 1000) {
      return `${(roundedMarketCap / 1000).toFixed(1)}K`;
    }
    return roundedMarketCap.toString();
  };

  const formatTweetTime = (timestamp: string) => {
    const tweetTime = parseInt(timestamp);
    const now = Date.now();
    const diffInSeconds = Math.floor((now - tweetTime) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds}s`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d`;
    }
  };

  const formatCreationTime = (timestamp: number) => {
    // Handle both milliseconds and seconds timestamps
    const date = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
    if (isNaN(date.getTime()) || date.getFullYear() < 2020) {
      return 'Recently';
    }
    return formatDistanceToNow(date, { addSuffix: true });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchTokenInfo = async (idOrAddress: string, source_type: 'pumpfun' | 'dexscreener'): Promise<TokenInfo | undefined> => {
    // Check cache first
    if (tokenInfoCache[idOrAddress]) {
      console.log('Using cached token info for:', idOrAddress);
      return tokenInfoCache[idOrAddress];
    }

    try {
      console.log(`Fetching token info for ${idOrAddress} with source type: ${source_type}`);
      
      let tokenInfo: TokenInfo | undefined;

      if (source_type === 'pumpfun') {
        console.log('Using proxy for pump.fun token');
        try {
          const url = `/api/pump-proxy?mintAddress=${encodeURIComponent(idOrAddress)}`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            
            const createdTimestamp = data.created_timestamp 
              ? Math.floor(data.created_timestamp / 1000)
              : Math.floor(Date.now() / 1000);
            
            const marketCap = data.usd_market_cap || 0;
            const price = data.total_supply > 0 
              ? marketCap / (data.total_supply / 1e9) 
              : 0;
            
            tokenInfo = {
              symbol: data.symbol || '???',
              name: data.name || 'Unknown Token',
              imageUrl: data.image_uri || '',
              price: price,
              marketCap: marketCap,
              createdTimestamp: createdTimestamp
            };
          }
        } catch (error) {
          console.error('Error with pump-proxy:', error);
        }
      } 
      else if (source_type === 'dexscreener') {
        console.log('Using DexScreener API for token:', idOrAddress);
        try {
          // First try as a pair address
          const pairResponse = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${idOrAddress}`);
          const pairData = await pairResponse.json();
          
          if (pairData.pairs?.[0]) {
            const pair = pairData.pairs[0];
            tokenInfo = {
              symbol: pair.baseToken.symbol,
              name: pair.baseToken.name,
              imageUrl: '',
              price: parseFloat(pair.priceUsd) || 0,
              marketCap: pair.marketCap || 0,
              createdTimestamp: pair.pairCreatedAt ? Math.floor(pair.pairCreatedAt / 1000) : Math.floor(Date.now() / 1000)
            };
          } else {
            // If no pair found, try as a token address
            const tokenResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${idOrAddress}`);
            const tokenData = await tokenResponse.json();
            
            if (tokenData.pairs && tokenData.pairs.length > 0) {
              // Find the first Solana pair
              const solanaPair = tokenData.pairs.find((pair: any) => pair.chainId === 'solana');
              if (solanaPair) {
                tokenInfo = {
                  symbol: solanaPair.baseToken.symbol,
                  name: solanaPair.baseToken.name,
                  imageUrl: '',
                  price: parseFloat(solanaPair.priceUsd) || 0,
                  marketCap: solanaPair.marketCap || 0,
                  createdTimestamp: solanaPair.pairCreatedAt ? Math.floor(solanaPair.pairCreatedAt / 1000) : Math.floor(Date.now() / 1000)
                };
              }
            }
          }
        } catch (error) {
          console.error('Error fetching DexScreener token info:', error);
        }
      }

      // Cache the token info if we got it
      if (tokenInfo) {
        console.log('Caching token info for:', idOrAddress);
        setTokenInfoCache(prev => ({ ...prev, [idOrAddress]: tokenInfo! }));
      }

      return tokenInfo;
    } catch (error) {
      console.error('Error fetching token info:', error);
      return undefined;
    }
  };

  const updateTweetPrices = async () => {
    if (!pumpFunClient && !dexscreenerClient) return;

    console.log('Updating tweet prices...');
    const updatedTweets = await Promise.all(
      tweets.map(async tweet => {
        // Only update prices every 30 seconds
        if (!tweet.mintAddress || (tweet.lastPriceCheck && Date.now() - tweet.lastPriceCheck < 30000)) {
          return tweet;
        }

        try {
          let price: number | undefined;
          
          if (tweet.source_type === 'pumpfun' && pumpFunClient) {
            const pumpPrice = await pumpFunClient.getTokenPrice(tweet.mintAddress);
            price = pumpPrice ?? undefined;
            console.log(`Updated pump.fun price for ${tweet.mintAddress}: ${price}`);
          } else if (tweet.source_type === 'dexscreener' && dexscreenerClient) {
            price = await dexscreenerClient.getTokenPrice(tweet.mintAddress);
            console.log(`Updated DEXScreener price for ${tweet.mintAddress}: ${price}`);
          }

          if (price !== undefined) {
            if (tweet.tokenInfo) {
              tweet.tokenInfo.price = price;
            }
            return {
              ...tweet,
              pricePerToken: price,
              lastPriceCheck: Date.now()
            };
          }
        } catch (error) {
          console.error('Error updating price for tweet:', error);
        }
        return tweet;
      })
    );

    // Sort tweets by creation time
    const sortedTweets = updatedTweets.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setTweets(sortedTweets);
  };

  const extractMintAddress = (tweet: LocalTweet): string | undefined => {
    const url = tweet.entities.urls[0]?.expanded_url;
    if (!url) return undefined;

    if (tweet.source_type === 'pumpfun') {
      const match = url.match(/pump\.fun\/coin\/([A-Za-z0-9]+)/);
      return match?.[1] ?? undefined;
    } else {
      // For dexscreener, extract the pair ID
      const match = url.match(/dexscreener\.com\/solana\/([A-Za-z0-9]+)/);
      return match?.[1] ?? undefined;
    }
  };

  const initClients = async () => {
    try {
      if (!privateKey) {
        setPumpFunClient(null);
        setDexscreenerClient(null);
        return;
      }

      const decodedKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(decodedKey);
      const connection = new Connection(RPC_ENDPOINT, 'confirmed');
      
      // Initialize both clients with trading settings
      const pumpClient = new PumpFunClient(
        connection, 
        keypair,
        undefined, // rpcEndpoint is optional
        {
          autoBuyEnabled,
          followerCheckEnabled,
          minFollowers,
          creationTimeEnabled,
          maxCreationTime
        }
      );
      const dexClient = new DexscreenerClient(
        connection, 
        keypair, 
        undefined, // rpcEndpoint is optional
        {
          autoBuyEnabled,
          followerCheckEnabled,
          minFollowers,
          creationTimeEnabled,
          maxCreationTime
        }
      );
      
      setPumpFunClient(pumpClient);
      setDexscreenerClient(dexClient);
    } catch (err) {
      console.error('Error initializing clients:', err);
      setError('Failed to initialize trading clients');
      setPumpFunClient(null);
      setDexscreenerClient(null);
    }
  };

  useEffect(() => {
    initClients();
  }, [privateKey]);

  useEffect(() => {
    if (pumpFunClient) {
      initClients();
    }
  }, [followerCheckEnabled, minFollowers, creationTimeEnabled, maxCreationTime]);

  useEffect(() => {
    if (autoBuyEnabled) {
      setAutoBuyEnabledTimestamp(Date.now());
    } else {
      setAutoBuyEnabledTimestamp(null);
    }
  }, [autoBuyEnabled]);

  const handleNewTweets = async (newTweets: ImportedTweet[], type: 'pumpfun' | 'dexscreener', isInitialLoad: boolean = false) => {
    if (isPaused) {
      console.log('Tweet processing paused');
      return;
    }

    try {
      setLoading(true);
      
      // Process new tweets to get token info
      const processedTweets = await Promise.all(newTweets.map(async tweet => {
        // Skip if we've already processed this tweet
        const tweetKey = `${type}_${tweet.id}`;
        if (!isInitialLoad && localStorage.getItem(`processed_${tweetKey}`)) {
          console.log('Skipping already processed tweet:', tweetKey);
          return null;
        }

        const localTweet = {
          ...tweet,
          full_text: tweet.text,
          source_type: type
        } as LocalTweet;

        // Extract mint address
        const mintAddress = extractMintAddress(localTweet);
        if (mintAddress) {
          localTweet.mintAddress = mintAddress;
          // Fetch token info
          const tokenInfo = await fetchTokenInfo(mintAddress, type);
          if (tokenInfo) {
            localTweet.tokenInfo = tokenInfo;
            // Get initial price
            if (type === 'pumpfun' && pumpFunClient) {
              const pumpPrice = await pumpFunClient.getTokenPrice(mintAddress);
              localTweet.pricePerToken = pumpPrice ?? undefined;
            } else if (type === 'dexscreener' && dexscreenerClient) {
              localTweet.pricePerToken = await dexscreenerClient.getTokenPrice(mintAddress);
            }
            localTweet.lastPriceCheck = Date.now();
          }
        }

        // Mark tweet as processed
        if (!isInitialLoad) {
          localStorage.setItem(`processed_${tweetKey}`, 'true');
        }
        
        return localTweet;
      }));
      
      // Filter out null tweets (already processed ones)
      const validTweets = processedTweets.filter(tweet => tweet !== null) as LocalTweet[];
      
      if (validTweets.length > 0) {
        setTweets(prevTweets => {
          // Combine new and existing tweets
          const updatedTweets = [...validTweets, ...prevTweets];
          // Sort by creation time, newest first
          const sortedTweets = updatedTweets.sort((a, b) => 
            parseInt(b.created_at) - parseInt(a.created_at)
          );
          // Keep only the 100 most recent tweets
          return sortedTweets.slice(0, 100);
        });
      }

    } catch (err) {
      console.error('Error processing tweets:', err);
      setError('Failed to process tweets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const twitterService = twitterServiceRef.current;
    
    // Set up subscription for new tweets
    const cleanup = twitterService.subscribe((newTweets, type) => {
      handleNewTweets(newTweets, type, false);  // false = not initial load
    });

    // Load initial cached tweets
    const loadInitialTweets = async () => {
      setLoading(true);
      try {
        const pumpfunTweets = twitterService.getCachedTweets('pumpfun');
        const dexscreenerTweets = twitterService.getCachedTweets('dexscreener');
        
        if (pumpfunTweets.length > 0) {
          await handleNewTweets(pumpfunTweets, 'pumpfun', true);  // true = initial load
        }
        if (dexscreenerTweets.length > 0) {
          await handleNewTweets(dexscreenerTweets, 'dexscreener', true);  // true = initial load
        }

        // Force a reconnection to ensure we get fresh data
        twitterService.reconnect();
      } catch (error) {
        console.error('Error loading initial tweets:', error);
        setError('Failed to load initial tweets');
      } finally {
        setLoading(false);
      }
    };

    // Delay the initial load slightly to ensure proper hydration
    const timer = setTimeout(() => {
      loadInitialTweets();
    }, 100);

    // Update prices periodically
    const priceInterval = setInterval(updateTweetPrices, 30000);

    return () => {
      cleanup();
      clearInterval(priceInterval);
      clearTimeout(timer);
    };
  }, []);

  const filteredTweets = tweets.filter(tweet => {
    if (!tweet) {
      console.log('Found null tweet in filter');
      return false;
    }

    const matchesSearch = !searchTerm || 
      tweet.full_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tweet.user.screen_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = activeSourceTypes.has(tweet.source_type);
    
    const meetsFollowerRequirement = !isFollowerFilterActive || tweet.user.followers_count >= minDisplayFollowers;

    if (!matchesSearch || !matchesType || !meetsFollowerRequirement) {
      console.log(`Tweet ${tweet.id} filtered out:`, {
        matchesSearch,
        matchesType,
        meetsFollowerRequirement,
        activeSourceTypes: Array.from(activeSourceTypes),
        tweetType: tweet.source_type,
        followers: tweet.user.followers_count,
        minRequired: isFollowerFilterActive ? minDisplayFollowers : 'disabled'
      });
    }
    
    return matchesSearch && matchesType && meetsFollowerRequirement;
  });

  const getTweetUrl = (tweet: LocalTweet) => {
    return `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id}`;
  };

  const getDexscreenerUrl = (tweet: LocalTweet): string => {
    if (!tweet.entities.urls.length) return 'https://dexscreener.com';
    const url = tweet.entities.urls[0].expanded_url;
    const [baseUrl, params] = url.split('?');
    return baseUrl;
  };

  const getPumpFunUrl = (tweet: LocalTweet): string => {
    if (!tweet.mintAddress) return 'https://pump.fun';
    return `https://pump.fun/coin/${tweet.mintAddress}`;
  };

  const toggleSourceType = (type: string) => {
    setActiveSourceTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  const toggleFollowerFilter = () => {
    setIsFollowerFilterActive(!isFollowerFilterActive);
    if (!isFollowerFilterActive) {
      setMinDisplayFollowers(0);
    }
  };

  if (!isMounted) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-gray-500">Loading...</div>
    </div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1 rounded-md text-sm font-medium ${
              isPaused
                ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <div className="flex items-center space-x-2">
            {sourceTypes.map(({ type, label, activeClass, dotClass }) => (
              <button
                key={type}
                onClick={() => toggleSourceType(type)}
                className={`
                  flex items-center px-2 py-1 rounded text-sm transition-all
                  ${activeSourceTypes.has(type)
                    ? activeClass
                    : 'bg-gray-700 text-gray-300 opacity-50 hover:opacity-80'
                  }
                `}
              >
                <div className={`w-2 h-2 rounded-full ${dotClass} mr-2`} />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center">
            <button
              onClick={toggleFollowerFilter}
              className={`
                flex items-center px-2 py-1 rounded text-sm transition-all mr-2
                ${isFollowerFilterActive
                  ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
                  : 'bg-gray-700 text-gray-300 opacity-50 hover:opacity-80'
                }
              `}
            >
              <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span>Follower Filter</span>
            </button>
            {isFollowerFilterActive && (
              <div className="relative inline-flex items-center">
                <input
                  type="number"
                  min="0"
                  value={minDisplayFollowers}
                  onChange={(e) => setMinDisplayFollowers(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="Min followers"
                  className="w-24 px-2 py-1 text-sm bg-gray-800 border border-gray-600 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
                {minDisplayFollowers > 0 && (
                  <div className="absolute -top-5 left-0 right-0 text-center text-xs text-purple-400 whitespace-nowrap">
                    {formatFollowerCount(minDisplayFollowers)}+ followers
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && tweets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-b-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-500 text-sm">{error}</div>
          </div>
        ) : tweets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 text-sm">No tweets found</div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {filteredTweets
              .filter(tweet => !isBlacklisted(tweet.user.screen_name))
              .sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at))
              .map((tweet) => {
                // Create a unique key that combines source type and ID
                const tweetKey = `${tweet.source_type}_${tweet.id}`;
                return (
                  <div
                    key={tweetKey}
                    className={`bg-gray-900 rounded-lg shadow-lg border border-gray-700 p-3 hover:border-gray-600 transition-colors ${
                      tweet.source_type === 'pumpfun' 
                        ? 'border-l-4 border-l-blue-500'
                        : 'border-l-4 border-l-green-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-start space-x-3">
                        <img 
                          src={tweet.user.profile_image_url_https} 
                          alt={tweet.user.screen_name}
                          className="w-10 h-10 rounded-full"
                        />
                        <div>
                          <div className="flex items-center space-x-1">
                            <span className="font-medium text-white">{tweet.user.name}</span>
                            <span className="text-gray-500">@{tweet.user.screen_name}</span>
                          </div>
                          <div className="text-xs text-gray-500 flex items-center space-x-2">
                            <div className="flex items-center space-x-1">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                              </svg>
                              <span>{formatFollowerCount(tweet.user.followers_count)}</span>
                            </div>
                            {!isBlacklisted(tweet.user.screen_name) && (
                              <button
                                onClick={() => addToBlacklist(tweet.user.screen_name)}
                                className="text-gray-500 hover:text-gray-400 transition-colors"
                                title="Blacklist user"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex space-x-2">
                          <a
                            href={getTweetUrl(tweet)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-gray-400 transition-colors"
                            title="View on Twitter"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z" />
                          </svg>
                        </a>
                          <a
                            href={tweet.source_type === 'pumpfun' ? getPumpFunUrl(tweet) : getDexscreenerUrl(tweet)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-gray-400 transition-colors"
                            title={tweet.source_type === 'pumpfun' ? "View on pump.fun" : "View on DEXScreener"}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                        {privateKey && (
                          <button
                            onClick={() => handleBuy(tweet)}
                            disabled={buyLoading[tweetKey] || !!txSignatures[tweetKey]}
                            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
                              buyLoading[tweetKey]
                                ? 'bg-gray-500/10 text-gray-400 cursor-not-allowed border border-gray-500/20'
                                : txSignatures[tweetKey]
                                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                : privateKey
                                ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20'
                                : 'bg-gray-500/10 text-gray-400 cursor-not-allowed border border-gray-500/20'
                            }`}
                          >
                            {buyLoading[tweetKey]
                              ? 'Buying...'
                              : txSignatures[tweetKey]
                              ? 'Bought'
                              : 'Buy'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-grow">
                      {tweet.tokenInfo ? (
                        <div className="text-xs bg-gray-700/50 rounded p-2 space-y-1 flex-grow">
                          <div className="flex justify-between text-gray-400">
                            <span>Token:</span>
                            <span className="text-yellow-400">
                              {tweet.tokenInfo.symbol} ({tweet.tokenInfo.name})
                            </span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Market Cap:</span>
                            <span className="text-yellow-400">
                              ${formatMarketCap(tweet.tokenInfo.marketCap)}
                            </span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Created:</span>
                            <span className="text-yellow-400">
                              {formatCreationTime(tweet.tokenInfo.createdTimestamp)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500">Loading token information...</p>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      <span title={new Date(parseInt(tweet.created_at)).toLocaleString()}>
                        {formatTweetTime(tweet.created_at)}
                      </span>
                      {' • '}
                      <span>
                        {tweet.source_type === 'pumpfun' ? 'pump.fun' : 'DEXScreener'}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
