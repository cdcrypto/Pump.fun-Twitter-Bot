import { TokenInfo } from '@/types';

export class HeliusService {
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async getAsset(mintAddress: string): Promise<TokenInfo | undefined> {
    try {
      console.log('Sending Helius RPC request for mint:', mintAddress);
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-test',
          method: 'getAsset',
          params: {
            id: mintAddress,
            displayOptions: {
              showFungible: true
            }
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Helius raw response:', data);

      if (data.error) {
        throw new Error(`Helius API error: ${data.error.message}`);
      }

      const asset = data.result;
      if (!asset) {
        console.log('No asset data in Helius response');
        return undefined;
      }

      // Extract token info from Helius response
      const tokenInfo = {
        symbol: asset.symbol || '???',
        name: asset.name || 'Unknown Token',
        imageUrl: asset.image || '',
        price: 0,  // Will be updated if price info exists
        marketCap: 0,  // Will be updated if we can calculate it
        createdTimestamp: asset.created_at ? Math.floor(new Date(asset.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000)
      };

      // Try to get price information
      if (asset.price_info) {
        tokenInfo.price = asset.price_info.price_per_token || 0;
        
        // Calculate market cap if we have supply info
        if (asset.supply && asset.decimals !== undefined) {
          const adjustedSupply = Number(asset.supply) / Math.pow(10, asset.decimals);
          tokenInfo.marketCap = tokenInfo.price * adjustedSupply;
        }
      }

      console.log('Processed token info:', tokenInfo);
      return tokenInfo;
    } catch (error) {
      console.error('Error fetching asset:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      return undefined;
    }
  }

  async searchAssets(ownerAddress: string): Promise<TokenInfo[]> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-test',
          method: 'searchAssets',
          params: {
            ownerAddress,
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

      return data.result.items
        .filter((asset: any) => asset.id.toLowerCase().endsWith('pump'))
        .map((asset: any) => {
          const pricePerToken = asset.token_info?.price_info?.price_per_token;
          const supply = asset.token_info?.supply || 0;
          const decimals = asset.token_info?.decimals || 0;
          const adjustedSupply = supply / Math.pow(10, decimals);
          const marketCap = pricePerToken && supply ? pricePerToken * adjustedSupply : 0;

          return {
            symbol: asset.content?.metadata?.symbol || '???',
            name: asset.content?.metadata?.name || 'Unknown Token',
            imageUrl: asset.content?.links?.image || '',
            price: pricePerToken,
            marketCap,
            createdTimestamp: asset.created_at ? Math.floor(new Date(asset.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000)
          };
        });
    } catch (error) {
      console.error('Error searching assets:', error);
      return [];
    }
  }

  async getPairTokenInfo(pairId: string): Promise<TokenInfo | undefined> {
    try {
      console.log('Fetching pair info from Dexscreener:', pairId);
      const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairId}`);
      
      if (!response.ok) {
        throw new Error(`Dexscreener API error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Dexscreener response:', data);

      if (!data.pair) {
        console.log('No pair data found in Dexscreener response');
        return undefined;
      }

      const { pair } = data;
      
      return {
        symbol: pair.baseToken.symbol || '???',
        name: pair.baseToken.name || 'Unknown Token',
        imageUrl: pair.info?.imageUrl || '',
        price: parseFloat(pair.priceUsd) || 0,
        marketCap: pair.marketCap || 0,
        createdTimestamp: Math.floor(pair.pairCreatedAt / 1000), // Convert from milliseconds to seconds
        mintAddress: pair.baseToken.address // Store the mint address for later use in Jupiter
      };
    } catch (error) {
      console.error('Error fetching pair info:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      return undefined;
    }
  }
}
