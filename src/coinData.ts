import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Buffer } from 'buffer';
import { PUMP_FUN_PROGRAM } from './constants';
import { VirtualReserves, CoinData } from './types';

/**
 * Safely converts a bigint to a number with validation
 * @param value The bigint value to convert
 * @param fieldName The name of the field for error reporting
 * @returns The converted number value
 * @throws Error if the value exceeds safe integer limits
 */
function safeConvertBigIntToNumber(value: bigint, fieldName: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds maximum safe integer value`);
  }
  return Number(value);
}

/**
 * Retrieves and parses the virtual reserves data for a bonding curve account
 * @param connection The Solana connection instance
 * @param bondingCurve The public key of the bonding curve account
 * @returns The parsed virtual reserves data or null if not found
 */
export async function getVirtualReserves(
  connection: Connection,
  bondingCurve: PublicKey
): Promise<VirtualReserves | null> {
  try {
    const accountInfo = await connection.getAccountInfo(bondingCurve);
    if (!accountInfo?.data || accountInfo.data.length < 41) { // 8 (discriminator) + 32 (reserves) + 1 (complete flag)
      console.error('Invalid account data length for bonding curve');
      return null;
    }

    // Skip first 8 bytes (discriminator)
    const dataBuffer = accountInfo.data.slice(8);
    
    // Parse the data using DataView for consistent byte reading
    const view = new DataView(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength);
    
    // Validate buffer has enough bytes
    if (view.byteLength < 41) {
      throw new Error('Insufficient data in bonding curve account');
    }

    const virtualReserves: VirtualReserves = {
      virtualTokenReserves: view.getBigUint64(0, true),  // true for little-endian
      virtualSolReserves: view.getBigUint64(8, true),
      realTokenReserves: view.getBigUint64(16, true),
      realSolReserves: view.getBigUint64(24, true),
      tokenTotalSupply: view.getBigUint64(32, true),
      complete: Boolean(view.getUint8(40))  // Flag is 1 byte
    };

    // Validate reserves are non-negative
    if (virtualReserves.virtualTokenReserves < BigInt(0) ||
        virtualReserves.virtualSolReserves < BigInt(0) ||
        virtualReserves.realTokenReserves < BigInt(0) ||
        virtualReserves.realSolReserves < BigInt(0) ||
        virtualReserves.tokenTotalSupply < BigInt(0)) {
      throw new Error('Invalid negative reserve values detected');
    }

    return virtualReserves;
  } catch (error) {
    console.error('Error getting virtual reserves:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return null;
  }
}

/**
 * Derives the bonding curve and associated token accounts for a given mint
 * @param mint The mint address as a string
 * @returns A tuple of [bondingCurve, associatedBondingCurve] public keys or [null, null] if derivation fails
 */
export async function deriveBondingCurveAccounts(
  mint: string
): Promise<[PublicKey, PublicKey] | [null, null]> {
  try {
    if (!PublicKey.isOnCurve(new PublicKey(mint))) {
      throw new Error('Invalid mint address provided');
    }

    const mintPubkey = new PublicKey(mint);
    const seeds = [
      Buffer.from('bonding-curve'),
      mintPubkey.toBuffer()
    ];

    const [bondingCurve] = PublicKey.findProgramAddressSync(
      seeds,
      PUMP_FUN_PROGRAM
    );

    const associatedBondingCurve = await getAssociatedTokenAddress(
      mintPubkey,
      bondingCurve,
      true  // allowOwnerOffCurve set to true
    );

    return [bondingCurve, associatedBondingCurve];
  } catch (error) {
    console.error('Error deriving bonding curve accounts:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return [null, null];
  }
}

// Cache structure
interface CoinDataCache {
  data: CoinData;
  timestamp: number;
}

const coinDataCache = new Map<string, CoinDataCache>();
const CACHE_DURATION = 10000; // 10 seconds cache

/**
 * Retrieves comprehensive coin data for a given mint address
 * @param connection The Solana connection instance
 * @param mintStr The mint address as a string
 * @returns The coin data or null if retrieval fails
 */
export async function getCoinData(
  connection: Connection,
  mintStr: string
): Promise<CoinData | null> {
  try {
    // Check cache first
    const now = Date.now();
    const cached = coinDataCache.get(mintStr);
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const [bondingCurve, associatedBondingCurve] = await deriveBondingCurveAccounts(mintStr);
    if (!bondingCurve || !associatedBondingCurve) {
      throw new Error('Failed to derive bonding curve accounts');
    }

    const virtualReserves = await getVirtualReserves(connection, bondingCurve);
    if (!virtualReserves) {
      throw new Error('Failed to fetch virtual reserves');
    }

    const coinData = {
      mint: mintStr,
      bondingCurve: bondingCurve.toString(),
      associatedBondingCurve: associatedBondingCurve.toString(),
      virtualTokenReserves: safeConvertBigIntToNumber(virtualReserves.virtualTokenReserves, 'virtualTokenReserves'),
      virtualSolReserves: safeConvertBigIntToNumber(virtualReserves.virtualSolReserves, 'virtualSolReserves'),
      tokenTotalSupply: safeConvertBigIntToNumber(virtualReserves.tokenTotalSupply, 'tokenTotalSupply'),
      complete: virtualReserves.complete
    };

    // Update cache
    coinDataCache.set(mintStr, {
      data: coinData,
      timestamp: now
    });

    return coinData;
  } catch (error) {
    console.error('Error processing coin data:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return null;
  }
}
