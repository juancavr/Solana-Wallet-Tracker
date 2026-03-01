/**
 * Helius Enhanced Transactions API
 *
 * POST https://api.helius.xyz/v0/transactions?api-key=KEY
 * Body: { "transactions": ["sig1", "sig2", ...] }  (max 100 per request)
 *
 * Returns rich, pre-parsed transaction objects with human-readable descriptions,
 * typed transfer/swap events, and balance-change breakdowns — no manual Solana
 * parsing required.
 */

import { SOL_MINT } from '@/lib/constants';
import type { TxDetail, TxNativeTransfer, TxTokenTransfer, TxSwap } from '@/types';

const LAMPORTS_PER_SOL = 1_000_000_000;

// ─── Helius API response types ────────────────────────────────────────────────

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
}

interface HeliusTokenTransfer {
  fromTokenAccount: string;
  toTokenAccount: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  tokenStandard?: string;
  mint: string;
  symbol?: string;
}

interface HeliusRawTokenAmount {
  tokenAmount: string;
  decimals: number;
}

interface HeliusTokenIO {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: HeliusRawTokenAmount;
}

interface HeliusNativeIO {
  account: string;
  amount: string; // lamports as string
}

interface HeliusSwapEvent {
  nativeInput?: HeliusNativeIO;
  nativeOutput?: HeliusNativeIO;
  tokenInputs?: HeliusTokenIO[];
  tokenOutputs?: HeliusTokenIO[];
  programInfo?: { source?: string; account?: string };
}

interface HeliusAccountData {
  account: string;
  nativeBalanceChange: number; // lamports, can be negative
  tokenBalanceChanges: Array<{
    userAccount: string;
    tokenAccount: string;
    mint: string;
    rawTokenAmount: HeliusRawTokenAmount;
  }>;
}

interface HeliusEnhancedTx {
  description: string;
  type: string;   // 'TRANSFER' | 'SWAP' | 'TOKEN_MINT' | 'NFT_SALE' | 'UNKNOWN' | …
  source: string; // 'SYSTEM_PROGRAM' | 'JUPITER' | 'RAYDIUM' | 'ORCA' | …
  fee: number;    // lamports
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  nativeTransfers: HeliusNativeTransfer[];
  tokenTransfers: HeliusTokenTransfer[];
  accountData: HeliusAccountData[];
  transactionError: unknown;
  instructions: unknown[];
  events: {
    swap?: HeliusSwapEvent;
    nft?: unknown;
    compressed?: unknown;
  };
}

// ─── Result type stored in raw_meta ──────────────────────────────────────────

/** Maps Helius source strings to clean display names */
const SOURCE_LABELS: Record<string, string> = {
  JUPITER:           'Jupiter',
  JUPITER_DCA:       'Jupiter DCA',
  RAYDIUM:           'Raydium',
  ORCA:              'Orca',
  METEORA:           'Meteora',
  PHOENIX:           'Phoenix',
  OPENBOOK:          'OpenBook',
  MANGO:             'Mango',
  DRIFT:             'Drift',
  SYSTEM_PROGRAM:    'System Program',
  TOKEN_PROGRAM:     'Token Program',
  STAKE_PROGRAM:     'Stake Program',
  ASSOCIATED_TOKEN_ACCOUNT_PROGRAM: 'ATA Program',
};

function sourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Classify a Helius type string into our 4 canonical types */
function mapType(heliusType: string, source: string): string {
  const t = heliusType.toUpperCase();
  if (t === 'SWAP')                                                   return 'swap';
  if (t === 'TRANSFER')                                               return 'transfer';
  if (t.includes('NFT') || t.includes('MINT') || t.includes('BURN')) return 'nft';
  // Infer swap from source even when type is UNKNOWN
  const swapSources = ['JUPITER', 'RAYDIUM', 'ORCA', 'METEORA', 'PHOENIX'];
  if (swapSources.includes(source.toUpperCase()))                     return 'swap';
  return 'unknown';
}

/**
 * Convert a raw token amount to UI amount (divides by 10^decimals).
 * Guards against NaN / division by zero.
 */
function toUiAmount(raw: string | number, decimals: number): number {
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (!Number.isFinite(n) || decimals < 0) return 0;
  return n / Math.pow(10, decimals);
}

// ─── Core parse function ──────────────────────────────────────────────────────

function parseEnhancedTx(htx: HeliusEnhancedTx): TxDetail {
  const fee_sol = htx.fee / LAMPORTS_PER_SOL;
  const type = mapType(htx.type, htx.source);
  const source = sourceLabel(htx.source);

  // ── Native (SOL) transfers ────────────────────────────────────────────────
  const native_transfers: TxNativeTransfer[] = (htx.nativeTransfers ?? [])
    .filter((nt) => nt.amount > 0)
    .map((nt) => ({
      from:       nt.fromUserAccount,
      to:         nt.toUserAccount,
      amount_sol: nt.amount / LAMPORTS_PER_SOL,
    }));

  // ── Token transfers ───────────────────────────────────────────────────────
  const token_transfers: TxTokenTransfer[] = (htx.tokenTransfers ?? [])
    .filter((tt) => tt.tokenAmount > 0)
    .map((tt) => ({
      from:     tt.fromUserAccount,
      to:       tt.toUserAccount,
      amount:   tt.tokenAmount,
      mint:     tt.mint,
      symbol:   tt.symbol ?? '',
      decimals: 0, // not available in tokenTransfers; enriched from price_cache if needed
    }));

  // ── Swap details ──────────────────────────────────────────────────────────
  let swap: TxSwap | undefined;
  const swapEvent = htx.events?.swap;
  if (swapEvent) {
    // Determine what went IN (sold) and OUT (bought)
    let from_amount = 0, from_mint = '', from_symbol = '';
    let to_amount   = 0, to_mint   = '', to_symbol   = '';

    if (swapEvent.nativeInput) {
      from_amount = parseFloat(swapEvent.nativeInput.amount) / LAMPORTS_PER_SOL;
      from_mint   = SOL_MINT;
      from_symbol = 'SOL';
    } else if (swapEvent.tokenInputs?.length) {
      const inp = swapEvent.tokenInputs[0];
      from_amount = toUiAmount(inp.rawTokenAmount.tokenAmount, inp.rawTokenAmount.decimals);
      from_mint   = inp.mint;
      from_symbol = token_transfers.find((t) => t.mint === inp.mint)?.symbol ?? inp.mint.slice(0, 6);
    }

    if (swapEvent.nativeOutput) {
      to_amount = parseFloat(swapEvent.nativeOutput.amount) / LAMPORTS_PER_SOL;
      to_mint   = SOL_MINT;
      to_symbol = 'SOL';
    } else if (swapEvent.tokenOutputs?.length) {
      const out = swapEvent.tokenOutputs[0];
      to_amount = toUiAmount(out.rawTokenAmount.tokenAmount, out.rawTokenAmount.decimals);
      to_mint   = out.mint;
      to_symbol = token_transfers.find((t) => t.mint === out.mint)?.symbol ?? out.mint.slice(0, 6);
    }

    if (from_amount > 0 || to_amount > 0) {
      swap = { from_amount, from_mint, from_symbol, to_amount, to_mint, to_symbol, dex: source };
    }
  }

  // If type is 'swap' but no swap event, try to reconstruct from tokenTransfers
  if (type === 'swap' && !swap && token_transfers.length >= 1) {
    // For the wallet: negative balance change = sold, positive = bought
    // We'll just grab first out + first in from accountData if possible
    const accountDelta = htx.accountData?.find((a) => a.account === htx.feePayer);
    if (accountDelta) {
      // SOL change (excluding fee)
      const solDelta = (accountDelta.nativeBalanceChange + htx.fee) / LAMPORTS_PER_SOL;
      const tokenChanges = accountDelta.tokenBalanceChanges ?? [];
      const sent     = tokenChanges.filter((tc) => {
        const d = toUiAmount(tc.rawTokenAmount.tokenAmount, tc.rawTokenAmount.decimals);
        return d < 0;
      });
      const received = tokenChanges.filter((tc) => {
        const d = toUiAmount(tc.rawTokenAmount.tokenAmount, tc.rawTokenAmount.decimals);
        return d > 0;
      });

      if (solDelta < 0 && received.length) {
        const out = received[0];
        swap = {
          from_amount: Math.abs(solDelta),
          from_mint:   SOL_MINT,
          from_symbol: 'SOL',
          to_amount:   toUiAmount(out.rawTokenAmount.tokenAmount, out.rawTokenAmount.decimals),
          to_mint:     out.mint,
          to_symbol:   token_transfers.find((t) => t.mint === out.mint)?.symbol ?? '',
          dex:         source,
        };
      } else if (solDelta > 0 && sent.length) {
        const inp = sent[0];
        swap = {
          from_amount: toUiAmount(Math.abs(parseInt(inp.rawTokenAmount.tokenAmount)), inp.rawTokenAmount.decimals),
          from_mint:   inp.mint,
          from_symbol: token_transfers.find((t) => t.mint === inp.mint)?.symbol ?? '',
          to_amount:   solDelta,
          to_mint:     SOL_MINT,
          to_symbol:   'SOL',
          dex:         source,
        };
      }
    }
  }

  return {
    description:      htx.description || '',
    source,
    fee_sol,
    native_transfers,
    token_transfers,
    swap,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParsedTxResult {
  signature: string;
  type:      string;
  detail:    TxDetail;
}

/**
 * Fetch and parse up to 100 signatures at a time using the Helius
 * Enhanced Transactions API.
 */
export async function fetchParsedTransactionsHelius(
  signatures: string[]
): Promise<ParsedTxResult[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('HELIUS_API_KEY not set');
  if (signatures.length === 0) return [];

  const url = `https://api.helius.xyz/v0/transactions?api-key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: signatures }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Helius Enhanced Transactions HTTP ${res.status}: ${body}`);
  }

  const data: HeliusEnhancedTx[] = await res.json();

  return data.map((htx) => ({
    signature: htx.signature,
    type:      mapType(htx.type, htx.source),
    detail:    parseEnhancedTx(htx),
  }));
}
