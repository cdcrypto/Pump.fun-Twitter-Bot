import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
  PublicKey,
} from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@project-serum/anchor';
import fetch from 'cross-fetch';
import axios from 'axios';

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const PRIORITY_RATE = 100_000; // Adjust this value if you need to set a priority fee
const JUPITER_V6_API = 'https://quote-api.jup.ag/v6';

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}

interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

interface RoutePlan {
  swapInfo: SwapInfo;
  percent: number;
}

interface Quote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: RoutePlan[];
  contextSlot: number;
  timeTaken: number;
}

interface DexScreenerToken {
  address: string;
  name: string;
  symbol: string;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken;
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  pairCreatedAt: number;
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[];
  pair?: DexScreenerPair;
}

class DexscreenerClient {
  private connection: Connection;
  private wallet: Keypair;
  private provider: AnchorProvider;
  private rpcEndpoint: string;
  private tradingSettings: any;

  constructor(
    connection: Connection,
    wallet: Keypair,
    rpcEndpoint?: string,
    tradingSettings?: any
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.rpcEndpoint =
      rpcEndpoint || process.env.NEXT_PUBLIC_HELIUS_RPC_URL || '';
    this.tradingSettings = tradingSettings;

    // Create a wallet adapter that implements the Wallet interface
    const walletAdapter: Wallet = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        if (tx instanceof VersionedTransaction) {
          tx.sign([wallet]);
          return tx as unknown as Transaction;
        } else {
          tx.partialSign(wallet);
          return tx;
        }
      },
      signAllTransactions: async (txs: Transaction[]): Promise<Transaction[]> => {
        return Promise.all(
          txs.map(async (tx) => {
            if (tx instanceof VersionedTransaction) {
              tx.sign([wallet]);
              return tx as unknown as Transaction;
            } else {
              tx.partialSign(wallet);
              return tx;
            }
          })
        );
      },
      payer: wallet,
    };

    // Initialize the provider with our wallet adapter
    this.provider = new AnchorProvider(connection, walletAdapter, {
      commitment: 'confirmed',
      skipPreflight: false,
    });
  }

  private async getBaseTokenAddress(pairIdOrAddress: string): Promise<string> {
    try {
      // First try as a pair address
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/pairs/solana/${pairIdOrAddress}`
      );
      const data: DexScreenerResponse = await response.json();

      // Check if we got a valid response with pairs
      if (data.pairs && data.pairs.length > 0) {
        return data.pairs[0].baseToken.address;
      }

      // If no pairs found, try as a token address
      const tokenResponse = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${pairIdOrAddress}`
      );
      const tokenData: DexScreenerResponse = await tokenResponse.json();

      if (tokenData.pairs && tokenData.pairs.length > 0) {
        // Find the first Solana pair
        const solanaPair = tokenData.pairs.find(
          (pair) => pair.chainId === 'solana'
        );
        if (solanaPair) {
          return solanaPair.baseToken.address;
        }
      }

      throw new Error(`Could not find base token address for ${pairIdOrAddress}`);
    } catch (error) {
      console.error('Error getting base token address:', error);
      throw error;
    }
  }

  public async getTokenPrice(
    pairIdOrAddress: string
  ): Promise<number | undefined> {
    try {
      // Get amount and slippage from trading settings
      const amountInSol = this.tradingSettings?.amount || 0.1; // Default to 0.1 SOL if not set
      const amountLamports = amountInSol * LAMPORTS_PER_SOL;

      const slippageBps = this.tradingSettings?.slippage
        ? Math.floor(this.tradingSettings.slippage * 100)
        : 100; // Default to 1% if not set

      console.log(
        `Getting price quote for ${amountInSol} SOL with ${slippageBps} bps slippage`
      );

      const quote = await this.getQuote({
        inputMint: WRAPPED_SOL_MINT,
        outputMint: pairIdOrAddress,
        amount: amountLamports,
        slippageBps,
      });

      if (!quote || !quote.outAmount) {
        console.log(`No quote available for token ${pairIdOrAddress}`);
        return undefined;
      }

      // Calculate price in SOL (outAmount will be in the token's smallest unit)
      const outAmount = BigInt(quote.outAmount);
      if (outAmount === 0n) {
        console.log(
          `Invalid outAmount from quote for token ${pairIdOrAddress}`
        );
        return undefined;
      }

      const priceInSol = Number(amountLamports) / Number(outAmount);
      return priceInSol;
    } catch (error) {
      console.error('Error getting token price:', error);
      return undefined;
    }
  }

  private async getQuote(params: SwapQuote): Promise<Quote> {
    try {
      const response = await axios.get(`${JUPITER_V6_API}/quote`, {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps || 100,
          onlyDirectRoutes: true
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error getting quote:', error);
      throw error;
    }
  }

  private async getSwapTransaction(quoteResponse: any): Promise<VersionedTransaction> {
    try {
      const response = await axios.post(`${JUPITER_V6_API}/swap`, {
        quoteResponse,
        userPublicKey: this.wallet.publicKey.toString(),
        wrapUnwrapSOL: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: PRIORITY_RATE,
      });
      
      const { swapTransaction } = response.data;
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      return VersionedTransaction.deserialize(swapTransactionBuf);
    } catch (error) {
      console.error('Error getting swap transaction:', error);
      throw error;
    }
  }

  public async buyToken(
    pairIdOrAddress: string,
    amountInSol: number
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      const baseTokenAddress = await this.getBaseTokenAddress(pairIdOrAddress);
      if (!baseTokenAddress) {
        return { success: false, error: 'Could not get base token address' };
      }

      const amountLamports = amountInSol * LAMPORTS_PER_SOL;
      
      // Get quote
      const quoteParams: SwapQuote = {
        inputMint: WRAPPED_SOL_MINT,
        outputMint: baseTokenAddress,
        amount: amountLamports,
        slippageBps: 100,
      };

      const quoteResponse = await this.getQuote(quoteParams);
      if (!quoteResponse) {
        return { success: false, error: 'Failed to get quote' };
      }

      // Get and execute swap transaction
      const swapTransaction = await this.getSwapTransaction(quoteResponse);
      if (!swapTransaction) {
        return { success: false, error: 'Failed to get swap transaction' };
      }

      // Execute the transaction
      const { success, signature, error } = await this.executeTransaction(swapTransaction);
      
      if (success && signature) {
        console.log(`Buy transaction completed successfully with signature: ${signature}`);
        return { success: true, signature };
      } else {
        console.error(`Buy transaction failed: ${error}`);
        return { success: false, error: error || 'Transaction failed' };
      }

    } catch (error) {
      console.error('Error in buyToken:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  private async executeTransaction(
    transaction: VersionedTransaction
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      transaction.message.recentBlockhash = blockhash;

      // Sign transaction
      try {
        transaction.sign([this.wallet]);
      } catch (signError) {
        // Check if transaction is already signed
        const walletKey = this.wallet.publicKey.toBase58();
        const isAlreadySigned = transaction.signatures.some((sig, index) => {
          const key = transaction.message.staticAccountKeys[index]?.toBase58();
          return key === walletKey && sig !== null;
        });
        
        if (!isAlreadySigned) {
          console.error('Transaction signing failed:', signError);
          return { success: false, error: 'Transaction signing failed' };
        }
      }

      // Send transaction
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      console.log(`Transaction sent: ${signature}`);

      // Confirm transaction
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        return { 
          success: false, 
          signature,
          error: `Transaction failed: ${confirmation.value.err}` 
        };
      }

      // Double check transaction status
      const status = await this.connection.getSignatureStatus(signature);
      if (status.value?.err) {
        return { 
          success: false, 
          signature,
          error: `Transaction failed: ${status.value.err}` 
        };
      }

      return { success: true, signature };
    } catch (error) {
      console.error('Transaction execution failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Transaction execution failed' 
      };
    }
  }

  public async getTokenCreationTime(
    mintAddress: string
  ): Promise<number | null> {
    // For now, return current time as we don't have a reliable way to get token creation time
    // This can be enhanced later to fetch actual creation time from chain or other sources
    return Math.floor(Date.now() / 1000);
  }

  public async shouldBuyToken(mintAddress: string): Promise<boolean> {
    const {
      autoBuyEnabled = false,
      followerCheckEnabled = false,
      minFollowers = 0,
      creationTimeEnabled = false,
      maxCreationTime = 60,
    } = this.tradingSettings || {};

    if (!autoBuyEnabled) {
      console.log('Autobuying is disabled');
      return false;
    }

    let creationTimeCheckPassed = true;

    // Check creation time if enabled
    if (creationTimeEnabled) {
      const tokenCreationTime = await this.getTokenCreationTime(mintAddress);
      if (!tokenCreationTime) {
        console.log('Could not determine token creation time');
        return false;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const tokenAgeInMinutes = (currentTime - tokenCreationTime) / 60;

      creationTimeCheckPassed = tokenAgeInMinutes <= maxCreationTime;
      if (!creationTimeCheckPassed) {
        console.log(
          `Token age (${Math.round(
            tokenAgeInMinutes
          )} minutes) exceeds maximum allowed age (${maxCreationTime} minutes)`
        );
      }
    }

    // For DexScreener tokens, we don't have follower information
    // So if follower check is enabled, we should not allow the buy
    if (followerCheckEnabled) {
      console.log(
        'Follower check is enabled but not supported for DexScreener tokens'
      );
      return false;
    }

    return creationTimeCheckPassed;
  }
}

export { DexscreenerClient };
