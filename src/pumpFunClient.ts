import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  SystemProgram,
  sendAndConfirmTransaction as web3SendAndConfirmTransaction,
  ComputeBudgetProgram,
  VersionedTransaction,
  TransactionMessage
} from '@solana/web3.js';
import * as token from '@solana/spl-token';
import BN from 'bn.js';
import {
  PUMP_FUN_PROGRAM,
  GLOBAL,
  FEE_RECIPIENT,
  EVENT_AUTHORITY,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM,
  RENT,
  SOL_DECIMAL,
  TOKEN_DECIMAL,
  COMPUTE_UNIT_LIMIT,
  PRIORITY_RATE
} from './constants';
import axios from 'axios';
import bs58 from 'bs58';

const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_V6_API = 'https://quote-api.jup.ag/v6';

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

interface Quote {
  outAmount: string;
  [key: string]: any;
}

interface CoinData {
  mint: string;
  name: string;
  symbol: string;
  bondingCurve: string;
  associatedBondingCurve: string;
  virtualTokenReserves: number;
  virtualSolReserves: number;
  tokenTotalSupply: number;
  complete: boolean;
  usdMarketCap: number;
  marketCap: number;
  creator: string;
  createdTimestamp: number;
}

enum PumpFunError {
  NotAuthorized = 6000,
  AlreadyInitialized = 6001,
  TooMuchSolRequired = 6002,
  TooLittleSolReceived = 6003,
  MintDoesNotMatchBondingCurve = 6004,
  BondingCurveComplete = 6005,
  BondingCurveNotComplete = 6006,
  NotInitialized = 6007
}

class PumpFunClient {
  private connection: Connection;
  private wallet: Keypair;
  private rpcEndpoint: string;
  private lastRequestId: number = 0;
  private tradingSettings: any;
  private lastBuyTimestamp: number = 0;
  private buyAttempts: Map<string, { timestamp: number; count: number }> = new Map();
  private readonly MIN_BUY_INTERVAL = 2000;
  private readonly MAX_BUY_ATTEMPTS = 3;
  private readonly BUY_ATTEMPT_WINDOW = 60000;

  constructor(connection: Connection, wallet: Keypair, rpcEndpoint?: string, tradingSettings?: any) {
    this.connection = connection;
    this.wallet = wallet;
    this.rpcEndpoint = rpcEndpoint || process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    this.tradingSettings = tradingSettings;
  }

  private async getCoinData(mintStr: string): Promise<CoinData | null> {
    try {
      const response = await axios.get(`/api/pump-proxy?mintAddress=${mintStr}`);

      if (response.status === 200) {
        const data = response.data;
        return {
          mint: mintStr,
          name: data.name,
          symbol: data.symbol,
          virtualTokenReserves: data.virtual_token_reserves,
          virtualSolReserves: data.virtual_sol_reserves,
          bondingCurve: data.bonding_curve,
          associatedBondingCurve: data.associated_bonding_curve,
          tokenTotalSupply: data.total_supply,
          complete: data.complete,
          usdMarketCap: data.usd_market_cap,
          marketCap: data.market_cap,
          creator: data.creator,
          createdTimestamp: data.created_timestamp
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching coin data:', error);
      return null;
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

  private async executeTransaction(
    transaction: VersionedTransaction
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      transaction.message.recentBlockhash = blockhash;

      try {
        transaction.sign([this.wallet]);
      } catch (signError) {
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

      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      console.log(`Transaction sent: ${signature}`);

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

  public async buy(
    mintAddress: string,
    amountInSol: number,
    slippage: number = 0.25
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      const amountLamports = amountInSol * LAMPORTS_PER_SOL;
      const slippageBps = Math.floor(slippage * 100);

      console.log(`Getting quote for ${amountInSol} SOL with ${slippageBps} bps slippage`);

      const quoteParams: SwapQuote = {
        inputMint: WRAPPED_SOL_MINT,
        outputMint: mintAddress,
        amount: amountLamports,
        slippageBps,
      };

      const quoteResponse = await this.getQuote(quoteParams);
      if (!quoteResponse) {
        return { success: false, error: 'Failed to get quote' };
      }

      const swapTransaction = await this.getSwapTransaction(quoteResponse);
      if (!swapTransaction) {
        return { success: false, error: 'Failed to get swap transaction' };
      }

      // Get the associated token account
      const associatedTokenAccount = token.getAssociatedTokenAddressSync(
        new PublicKey(mintAddress),
        this.wallet.publicKey
      );

      // Check if the associated token account exists
      const accountInfo = await this.connection.getAccountInfo(associatedTokenAccount);
      
      if (!accountInfo) {
        // Create associated token account if it doesn't exist
        const ataTransaction = new Transaction().add(
          token.createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            associatedTokenAccount,
            this.wallet.publicKey,
            new PublicKey(mintAddress)
          )
        );
        
        // Execute ATA creation first
        const ataResult = await this.executeTransaction(
          new VersionedTransaction(
            new TransactionMessage({
              payerKey: this.wallet.publicKey,
              recentBlockhash: (await this.connection.getLatestBlockhash()).blockhash,
              instructions: ataTransaction.instructions,
            }).compileToV0Message()
          )
        );
        
        if (!ataResult.success) {
          return { success: false, error: 'Failed to create token account' };
        }
      }

      // Now execute the swap transaction
      return await this.executeTransaction(swapTransaction);

    } catch (error) {
      console.error('Error in buy:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  public async sell(
    mintAddress: string,
    amountInTokens: number,
    slippage: number = 0.25
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      const slippageBps = Math.floor(slippage * 100);
      const amountInSmallestUnit = amountInTokens * TOKEN_DECIMAL;

      console.log(`Getting quote for ${amountInTokens} tokens with ${slippageBps} bps slippage`);

      const quoteParams: SwapQuote = {
        inputMint: mintAddress,
        outputMint: WRAPPED_SOL_MINT,
        amount: amountInSmallestUnit,
        slippageBps,
      };

      const quoteResponse = await this.getQuote(quoteParams);
      if (!quoteResponse) {
        return { success: false, error: 'Failed to get quote' };
      }

      const swapTransaction = await this.getSwapTransaction(quoteResponse);
      if (!swapTransaction) {
        return { success: false, error: 'Failed to get swap transaction' };
      }

      return await this.executeTransaction(swapTransaction);

    } catch (error) {
      console.error('Error in sell:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  public async getTokenPrice(mintAddress: string): Promise<number | undefined> {
    try {
      const amountInSol = this.tradingSettings?.amount || 0.1;
      const amountLamports = amountInSol * LAMPORTS_PER_SOL;
      const slippageBps = this.tradingSettings?.slippage
        ? Math.floor(this.tradingSettings.slippage * 100)
        : 100;

      console.log(
        `Getting price quote for ${amountInSol} SOL with ${slippageBps} bps slippage`
      );

      const quote = await this.getQuote({
        inputMint: WRAPPED_SOL_MINT,
        outputMint: mintAddress,
        amount: amountLamports,
        slippageBps,
      });

      if (!quote || !quote.outAmount) {
        console.log(`No quote available for token ${mintAddress}`);
        return undefined;
      }

      const outAmount = BigInt(quote.outAmount);
      if (outAmount === 0n) {
        console.log(`Invalid outAmount from quote for token ${mintAddress}`);
        return undefined;
      }

      const priceInSol = Number(amountLamports) / Number(outAmount);
      return priceInSol;
    } catch (error) {
      console.error('Error getting token price:', error);
      return undefined;
    }
  }

  public shouldBuyToken(coinData: any, twitterData: any): boolean {
    // If no trading settings exist, allow the buy (this is a manual buy)
    if (!this.tradingSettings) {
      return true;
    }

    // If this is a manual buy (no twitterData), allow it
    if (!twitterData) {
      return true;
    }

    // From this point on, we're dealing with autobuy

    // First check if autobuy is enabled
    if (!this.tradingSettings.autoBuyEnabled) {
      console.log('Autobuy is disabled');
      return false;
    }

    // If both checks are turned off, no autobuys should happen
    if (!this.tradingSettings.followerCheckEnabled && !this.tradingSettings.creationTimeEnabled) {
      console.log('Both follower and age checks are disabled - no autobuys will occur');
      return false;
    }

    let followerCheckPassed = false;
    let ageCheckPassed = false;

    // Check followers if enabled
    if (this.tradingSettings.followerCheckEnabled) {
      const followerCount = twitterData.user?.followers_count || 0;
      followerCheckPassed = followerCount >= this.tradingSettings.minFollowers;
      console.log(`Follower check ${followerCheckPassed ? 'passed' : 'failed'}: ${followerCount} ${followerCheckPassed ? '>=' : '<'} ${this.tradingSettings.minFollowers}`);
    }

    // Check age if enabled
    if (this.tradingSettings.creationTimeEnabled && coinData.createdTimestamp) {
      const tokenAge = (Date.now() / 1000) - coinData.createdTimestamp;
      const maxAgeInSeconds = this.tradingSettings.maxCreationTime * 60;
      ageCheckPassed = tokenAge <= maxAgeInSeconds;
      console.log(`Age check ${ageCheckPassed ? 'passed' : 'failed'}: ${Math.round(tokenAge / 60)} minutes ${ageCheckPassed ? '<=' : '>'} ${this.tradingSettings.maxCreationTime}`);
    }

    // If both checks are enabled, both must pass
    if (this.tradingSettings.followerCheckEnabled && this.tradingSettings.creationTimeEnabled) {
      const shouldBuy = followerCheckPassed && ageCheckPassed;
      console.log(`Both checks enabled: follower check ${followerCheckPassed}, age check ${ageCheckPassed} - ${shouldBuy ? 'buying' : 'not buying'}`);
      return shouldBuy;
    }

    // If only follower check is enabled
    if (this.tradingSettings.followerCheckEnabled) {
      console.log(`Only follower check enabled: ${followerCheckPassed ? 'buying' : 'not buying'}`);
      return followerCheckPassed;
    }

    // If only age check is enabled
    if (this.tradingSettings.creationTimeEnabled) {
      console.log(`Only age check enabled: ${ageCheckPassed ? 'buying' : 'not buying'}`);
      return ageCheckPassed;
    }

    // This line should never be reached due to earlier checks
    return false;
  }

  public async autoBuy(
    mintAddress: string,
    twitterData: any = null
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      // Check if enough time has passed since last buy
      const now = Date.now();
      if (now - this.lastBuyTimestamp < this.MIN_BUY_INTERVAL) {
        return { 
          success: false, 
          error: 'Rate limit: Too soon since last buy attempt' 
        };
      }

      // Check and update buy attempts for this token
      const buyAttempt = this.buyAttempts.get(mintAddress) || { timestamp: 0, count: 0 };
      if (now - buyAttempt.timestamp > this.BUY_ATTEMPT_WINDOW) {
        // Reset if window has expired
        buyAttempt.timestamp = now;
        buyAttempt.count = 1;
      } else if (buyAttempt.count >= this.MAX_BUY_ATTEMPTS) {
        return { 
          success: false, 
          error: `Max buy attempts (${this.MAX_BUY_ATTEMPTS}) reached for this token` 
        };
      } else {
        buyAttempt.count++;
      }
      this.buyAttempts.set(mintAddress, buyAttempt);

      // Get coin data and check if it meets criteria
      const coinData = await this.getCoinData(mintAddress);
      if (!coinData) {
        return { 
          success: false, 
          error: 'Failed to fetch coin data' 
        };
      }

      if (!this.shouldBuyToken(coinData, twitterData)) {
        return { 
          success: false, 
          error: 'Token does not meet buying criteria' 
        };
      }

      // Update last buy timestamp before attempting purchase
      this.lastBuyTimestamp = now;

      // Attempt to buy using settings from trading context
      const result = await this.buy(
        mintAddress,
        this.tradingSettings.buyAmount,
        this.tradingSettings.slippage
      );

      if (!result.success || !result.signature) {
        return { 
          success: false, 
          error: result.error || 'Buy transaction failed' 
        };
      }

      return { 
        success: true, 
        signature: result.signature 
      };

    } catch (error) {
      console.error('Error in autoBuy:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error in autoBuy' 
      };
    }
  }
}

export { PumpFunClient };

function bufferFromUInt64(value: number | string) {
  let buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value.toString()));
  return buffer;
}
