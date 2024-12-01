'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTradingContext } from '../contexts/TradingContext';
import bs58 from 'bs58';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { PumpFunClient } from '../pumpFunClient';

// Extend Window interface for triggerTokenUpdate
declare global {
  interface Window {
    triggerTokenUpdate?: () => void;
  }
}

interface TokenHolding {
  mint: string;
  name: string;
  symbol: string;
  amount: number;
  decimals: number;
  pricePerToken?: number;
  totalValue?: number;
  isLoading?: boolean;
  sellAmount: number; // Changed to non-optional
  error?: string;
}

export default function PurchasedTokens() {
  const { privateKey, slippage } = useTradingContext();
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPurchaseTime, setLastPurchaseTime] = useState<number | null>(null);
  const [pumpFunClient, setPumpFunClient] = useState<PumpFunClient | null>(null);

  // Add refs for background updates
  const isUpdating = useRef(false);
  const needsUpdate = useRef(false);
  const mountedRef = useRef(true);
  const lastUpdateTime = useRef(0);

  const shouldUpdate = useCallback(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime.current;
    return timeSinceLastUpdate >= 60000; // 1 minute in milliseconds
  }, []);

  const fetchSolBalance = useCallback(async (publicKey: string) => {
    try {
      const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL);
      const balance = await connection.getBalance(new PublicKey(publicKey));
      if (mountedRef.current) {
        setSolBalance(balance / LAMPORTS_PER_SOL);
      }
    } catch (err) {
      console.error('Error fetching SOL balance:', err);
      if (mountedRef.current) {
        setError('Failed to fetch SOL balance');
      }
    }
  }, []);

  const fetchTokenHoldings = useCallback(async (showLoading = false, force = false) => {
    if (!privateKey || isUpdating.current) {
      needsUpdate.current = true;
      return;
    }

    if (!force && !shouldUpdate()) {
      return;
    }

    try {
      isUpdating.current = true;
      if (showLoading) setLoading(true);
      if (mountedRef.current) setError(null);

      const decodedKey = bs58.decode(privateKey);
      const publicKey = bs58.encode(decodedKey.slice(32));

      // Fetch SOL balance
      await fetchSolBalance(publicKey);

      const response = await fetch(process.env.NEXT_PUBLIC_HELIUS_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-test',
          method: 'searchAssets',
          params: {
            ownerAddress: publicKey,
            tokenType: "fungible"
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }

      const pumpTokens = data.result.items
        .filter((asset: any) => asset.id.toLowerCase().endsWith('pump'))
        .map((asset: any) => ({
          mint: asset.id,
          name: asset.content?.metadata?.name || 'Unknown Token',
          symbol: asset.content?.metadata?.symbol || '???',
          amount: asset.token_info?.balance / Math.pow(10, asset.token_info?.decimals || 0),
          decimals: asset.token_info?.decimals || 0,
          pricePerToken: asset.token_info?.price_info?.price_per_token,
          totalValue: asset.token_info?.price_info?.total_price,
          sellAmount: (holdings.find(h => h.mint === asset.id)?.sellAmount || 0)
        }));

      if (mountedRef.current) {
        setHoldings(pumpTokens);
        lastUpdateTime.current = Date.now();
      }
    } catch (err) {
      console.error('Error fetching token holdings:', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch token holdings');
      }
    } finally {
      isUpdating.current = false;
      if (showLoading && mountedRef.current) setLoading(false);
    }
  }, [privateKey, fetchSolBalance]);

  const fetchTokenPrices = useCallback(async () => {
    if (!holdings.length) return;

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_HELIUS_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-prices',
          method: 'searchAssets',
          params: {
            ownerAddress: null,
            tokenType: "fungible",
            grouping: ["mint"],
            compressed: true,
            page: 1,
            limit: 1000,
            displayOptions: {
              showCollectionMetadata: true,
              showUnverifiedCollections: true,
              showZeroBalance: true,
              showNativeBalance: true,
              showInscription: true
            }
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }

      const updatedHoldings = holdings.map(token => {
        const assetInfo = data.result.items.find((item: any) => 
          item.id === token.mint
        );

        return {
          ...token,
          pricePerToken: assetInfo?.token_info?.price_info?.price_per_token || token.pricePerToken,
          totalValue: assetInfo?.token_info?.price_info?.total_price || token.totalValue
        };
      });

      if (mountedRef.current) {
        setHoldings(updatedHoldings);
      }
    } catch (err) {
      console.error('Error fetching token prices:', err);
    }
  }, [holdings]);

  useEffect(() => {
    if (!privateKey) return;

    mountedRef.current = true;
    
    // Initial fetch with loading indicator
    fetchTokenHoldings(true, true);

    // Set up polling every minute
    const intervalId = setInterval(() => {
      fetchTokenHoldings(false, true);
    }, 60000);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [privateKey, fetchTokenHoldings]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (holdings.length > 0) {
        fetchTokenPrices();
      }
    }, 1000); // Delay price fetch by 1 second

    return () => clearTimeout(timeoutId);
  }, [holdings.length]); // Only depend on holdings.length, not the entire holdings array

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.triggerTokenUpdate = () => {
        fetchTokenHoldings(false, true);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.triggerTokenUpdate = undefined;
      }
    };
  }, [fetchTokenHoldings]);

  const onTokenPurchase = useCallback(() => {
    setLastPurchaseTime(Date.now());
    needsUpdate.current = true;
    fetchTokenHoldings(false, true); // Force update on purchase
  }, [fetchTokenHoldings]);

  const handleSellAmountChange = (mint: string, amount: number) => {
    setHoldings(prev => prev.map(token => {
      if (token.mint !== mint) return token;
      
      // Validate the amount
      if (amount < 0) amount = 0;
      if (amount > token.amount) amount = token.amount;
      
      return { 
        ...token, 
        sellAmount: amount,
        error: undefined // Clear any previous error
      };
    }));
  };

  const handleSellToken = async (mint: string) => {
    if (!privateKey || !pumpFunClient) return;

    const token = holdings.find(t => t.mint === mint);
    if (!token) return;

    // Get the sell amount
    const sellAmount = token.sellAmount;
    if (sellAmount <= 0 || sellAmount > token.amount) {
      setHoldings(prev => prev.map(t => 
        t.mint === mint ? { ...t, error: `Invalid sell amount. Must be between 0 and ${token.amount}` } : t
      ));
      return;
    }

    // Calculate percentage of total balance
    const percentage = (sellAmount / token.amount) * 100;

    setHoldings(prev => prev.map(t => 
      t.mint === mint ? { ...t, isLoading: true, error: undefined } : t
    ));

    try {
      const signature = await pumpFunClient.sell(mint, percentage, slippage);
      if (signature) {
        console.log('Sell successful:', signature);
        // Reset sell amount after successful sale
        handleSellAmountChange(mint, 0);
        // Refresh holdings after successful sale
        await fetchTokenHoldings();
      }
    } catch (err) {
      console.error('Error selling token:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to sell token';
      setHoldings(prev => prev.map(t => 
        t.mint === mint ? { ...t, error: errorMessage } : t
      ));
    } finally {
      setHoldings(prev => prev.map(t => 
        t.mint === mint ? { ...t, isLoading: false } : t
      ));
    }
  };

  const handleRefreshClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (shouldUpdate()) {
      fetchTokenHoldings(true, true); // Force update on manual refresh
    } else {
      const timeLeft = Math.ceil((60000 - (Date.now() - lastUpdateTime.current)) / 1000);
      setError(`Please wait ${timeLeft} seconds before refreshing again`);
    }
  }, [fetchTokenHoldings, shouldUpdate]);

  const initPumpFunClient = useCallback(async () => {
    try {
      if (!privateKey || !process.env.NEXT_PUBLIC_HELIUS_RPC_URL) return;
      
      const connection = new Connection(process.env.NEXT_PUBLIC_HELIUS_RPC_URL);
      const decodedKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(decodedKey);
      const client = new PumpFunClient(connection, keypair);
      setPumpFunClient(client);
    } catch (err) {
      console.error('Error initializing PumpFunClient:', err);
      setError('Failed to initialize trading client');
    }
  }, [privateKey]);

  useEffect(() => {
    if (privateKey) {
      initPumpFunClient();
    }
  }, [privateKey, initPumpFunClient]);

  if (!privateKey) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <p className="text-gray-400">Connect your wallet to view holdings</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* SOL Balance Card - Fixed at top */}
      <div className="bg-gray-800/30 rounded-lg p-3 mb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
              <img src="/solana-logo.png" alt="SOL" className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-gray-200 font-medium">Solana</h3>
              <p className="text-gray-400 text-xs">SOL</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-gray-200 font-medium">
              {solBalance !== null ? solBalance.toFixed(4) : '---'}
            </p>
            <p className="text-gray-400 text-xs">
              ≈ ${solBalance !== null ? (solBalance * 20).toFixed(2) : '---'}
            </p>
          </div>
        </div>
      </div>

      {/* Holdings Section - Scrollable */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between px-1 mb-2 flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-400">Token Holdings</h3>
          <button
            onClick={handleRefreshClick}
            className="text-blue-400 hover:text-blue-300 text-xs flex items-center space-x-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
              <p className="text-gray-400 text-xs mt-2">Loading holdings...</p>
            </div>
          ) : holdings.length > 0 ? (
            <div className="space-y-2 pb-2">
              {holdings.map((token) => (
                <div key={token.mint} className="bg-gray-800/30 rounded-lg p-2.5 hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 bg-gradient-to-br from-gray-700 to-gray-600 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-300">{token.symbol.slice(0, 2)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-gray-200 text-sm font-medium truncate">{token.name}</h4>
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-gray-400">{token.symbol}</span>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-400">{token.amount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-gray-200 text-sm">
                        ${token.pricePerToken ? (token.amount * token.pricePerToken).toFixed(2) : '---'}
                      </p>
                      <p className="text-gray-400 text-xs">
                        ${token.pricePerToken?.toFixed(6) || '---'}
                      </p>
                    </div>
                  </div>

                  {/* Sell Controls - Collapsible */}
                  <div className="mt-2.5 pt-2.5 border-t border-gray-700/50">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 min-w-0 grid grid-cols-4 gap-1">
                        {[25, 50, 75, 100].map((percent) => (
                          <button
                            key={percent}
                            onClick={() => handleSellAmountChange(token.mint, token.amount * (percent / 100))}
                            className="px-1.5 py-0.5 text-xs bg-gray-700/50 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                          >
                            {percent}%
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="number"
                          value={token.sellAmount || ''}
                          onChange={(e) => handleSellAmountChange(token.mint, parseFloat(e.target.value))}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 placeholder-gray-600"
                          placeholder="Amount"
                        />
                      </div>
                      <button
                        onClick={() => handleSellToken(token.mint)}
                        disabled={token.isLoading || !token.sellAmount || token.sellAmount <= 0}
                        className={`px-3 py-0.5 rounded text-xs font-medium transition-all ${
                          token.isLoading || !token.sellAmount || token.sellAmount <= 0
                            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                            : 'bg-red-500 hover:bg-red-600 text-white'
                        }`}
                      >
                        {token.isLoading ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white"></div>
                        ) : (
                          'Sell'
                        )}
                      </button>
                    </div>
                    {token.error && (
                      <p className="mt-2 text-red-400 text-xs">{token.error}</p>
                    )}
                    {token.sellAmount > 0 && (
                      <p className="mt-1.5 text-xs text-gray-400">
                        Selling {((token.sellAmount / token.amount) * 100).toFixed(1)}% 
                        {token.pricePerToken && (
                          <span className="ml-1">
                            (≈ ${(token.sellAmount * token.pricePerToken).toFixed(2)})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-10 h-10 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-gray-400 text-xs">No tokens found in your wallet</p>
              <p className="text-gray-500 text-xs mt-1">Tokens will appear here after purchase</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
