import { PublicKey } from '@solana/web3.js';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { TransactionInstruction } from '@solana/web3.js';

// Program IDs and Important Accounts
export const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
export const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// System Program IDs
export const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

// Decimals
export const SOL_DECIMAL = 1_000_000_000;  // 10^9
export const TOKEN_DECIMAL = 1_000_000;     // 10^6

// Transaction Settings
export const COMPUTE_UNIT_LIMIT = 400_000;
export const COMPUTE_UNIT_PRICE = 100;
export const PRIORITY_RATE = 100_000; // 10 LAMPORTS per CU for better priority

// Create the compute budget instruction
export const COMPUTE_BUDGET_IX = ComputeBudgetProgram.setComputeUnitLimit({
  units: COMPUTE_UNIT_LIMIT
});

// Create priority fee instruction
export const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: PRIORITY_RATE
});

// Commitment Levels
export const COMMITMENT_LEVEL = 'confirmed';

// RPC Settings
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
export const RPC_WEBSOCKET_ENDPOINT = process.env.NEXT_PUBLIC_HELIUS_RPC_URL?.replace('https://', 'wss://');

// Jito Settings
export const JITO_TIP_PROGRAM_ID = new PublicKey('4P1KYhBSn7RMGG5pYjvKmzGQPRXHBeCkFGfgVzVwGfXg');
export const JITO_TIP_ACCOUNT = new PublicKey('GZctHpWXmsZC1YHACTGGcHhYxjdRqQvTpYkb9LMvxDib');
export const JITO_FEE = 1000; // 0.00001 SOL

// Create JitoTip instruction
export const JITO_TIP_IX = new TransactionInstruction({
  keys: [
    {
      pubkey: JITO_TIP_ACCOUNT,
      isSigner: false,
      isWritable: true,
    },
  ],
  programId: JITO_TIP_PROGRAM_ID,
  data: Buffer.from([]),
});
