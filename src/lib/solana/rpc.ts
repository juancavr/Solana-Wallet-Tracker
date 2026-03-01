import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';

const DEFAULT_RPC =
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

let _connection: Connection | null = null;

export function getConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  if (!_connection || (_connection as Connection & { _rpcEndpoint?: string })._rpcEndpoint !== url) {
    _connection = new Connection(url, {
      commitment: 'confirmed',
      // Disable web3.js built-in 429 retry — we control retries ourselves via
      // withRetry() below. Without this, both layers fight each other and you
      // get a cascade of logged retries that exhaust the rate limit faster.
      disableRetryOnRateLimit: true,
    });
  }
  return _connection;
}

/**
 * Retry with full-jitter exponential backoff.
 * Caps at 16 s per attempt. Total wait before final throw: ~31 s for 4 retries.
 * Using full jitter (random between 0 and cap) rather than pure exponential to
 * spread retries across wallets and avoid a thundering-herd when multiple jobs
 * are queued.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  baseDelay = 1_000
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const cap = baseDelay * Math.pow(2, i);      // 1s, 2s, 4s, 8s, 16s
      const delay = Math.random() * Math.min(cap, 16_000); // full-jitter
      console.warn(`[rpc] attempt ${i + 1}/${retries} failed, retrying in ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchSolBalance(address: string): Promise<bigint> {
  const conn = getConnection();
  const pk = new PublicKey(address);
  const lamports = await withRetry(() => conn.getBalance(pk));
  return BigInt(lamports);
}

export interface RawTokenAccount {
  mint: string;
  tokenAccountAddress: string;
  rawAmount: string;
  uiAmount: number;
  decimals: number;
  symbol?: string;
  name?: string;
}

interface ParsedTokenAccountInfo {
  mint: string;
  tokenAmount: {
    uiAmount: number | null;
    amount: string;
    decimals: number;
  };
}

interface ParsedAccountData {
  parsed?: {
    info?: ParsedTokenAccountInfo;
    type?: string;
  };
}

export async function fetchTokenAccounts(address: string): Promise<RawTokenAccount[]> {
  const conn = getConnection();
  const pk = new PublicKey(address);
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

  // Fetch sequentially (not in parallel) to avoid hitting the public RPC's
  // per-connection rate limit with two heavy getParsedTokenAccounts calls at once.
  const v1Accounts = await withRetry(() =>
    conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID })
  );
  await sleep(300); // small gap between calls
  const v2Accounts = await withRetry(() =>
    conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_2022_PROGRAM_ID })
  );

  const all = [...v1Accounts.value, ...v2Accounts.value];

  return all
    .map((a) => {
      const parsed = (a.account.data as unknown as ParsedAccountData).parsed;
      const info = parsed?.info;
      if (!info) return null;
      const ui = info.tokenAmount?.uiAmount ?? 0;
      if (ui === 0) return null; // skip zero-balance
      return {
        mint: info.mint,
        tokenAccountAddress: a.pubkey.toBase58(),
        rawAmount: info.tokenAmount?.amount ?? '0',
        uiAmount: ui,
        decimals: info.tokenAmount?.decimals ?? 0,
      } satisfies RawTokenAccount;
    })
    .filter((x): x is RawTokenAccount => x !== null);
}

export interface RawSignature {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: object | null;
}

export async function fetchSignatures(
  address: string,
  limit = 50,
  before?: string
): Promise<RawSignature[]> {
  const conn = getConnection();
  const pk = new PublicKey(address);
  const sigs: ConfirmedSignatureInfo[] = await withRetry(() =>
    conn.getSignaturesForAddress(pk, { limit, before })
  );
  return sigs.map((s) => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    err: (s.err as object | null) ?? null,
  }));
}

export async function fetchParsedTransactions(
  signatures: string[]
): Promise<(ParsedTransactionWithMeta | null)[]> {
  const conn = getConnection();
  if (signatures.length === 0) return [];
  // Batch in groups of 10 to avoid rate limits
  const results: (ParsedTransactionWithMeta | null)[] = [];
  for (let i = 0; i < signatures.length; i += 10) {
    const batch = signatures.slice(i, i + 10);
    const parsed = await withRetry(() =>
      conn.getParsedTransactions(batch, { maxSupportedTransactionVersion: 0 })
    );
    results.push(...parsed);
    if (i + 10 < signatures.length) await sleep(200); // rate limit buffer
  }
  return results;
}

interface ParsedInstruction {
  parsed?: {
    type?: string;
  };
}

interface ParsedMessage {
  instructions?: ParsedInstruction[];
}

export function classifyTransaction(
  tx: ParsedTransactionWithMeta | null
): string {
  if (!tx) return 'unknown';
  const logs = tx.meta?.logMessages ?? [];
  const logStr = logs.join(' ').toLowerCase();
  if (logStr.includes('swap') || logStr.includes('jupiter') || logStr.includes('raydium') || logStr.includes('orca')) {
    return 'swap';
  }
  if (logStr.includes('nft') || logStr.includes('metaplex') || logStr.includes('candy')) {
    return 'nft';
  }
  // Check for simple SOL transfer
  const message = tx.transaction?.message as unknown as ParsedMessage;
  const instructions: ParsedInstruction[] = message?.instructions ?? [];
  for (const ix of instructions) {
    if (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') {
      return 'transfer';
    }
  }
  return 'unknown';
}
