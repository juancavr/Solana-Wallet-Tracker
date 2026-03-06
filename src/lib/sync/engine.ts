import { claimNextJob, completeJob, failJob } from '@/lib/db/sync';
import { getWallet, markSynced, updateSyncCursor } from '@/lib/db/wallets';
import {
  upsertSolBalance,
  upsertTokenAccount,
  deleteStaleTokenAccounts,
} from '@/lib/db/balances';
import { upsertTransactionsBatch, getLatestSignature } from '@/lib/db/transactions';
import { insertSnapshot } from '@/lib/db/portfolio';
import { SOL_MINT } from '@/lib/constants';
import { upsertPricesBatch, getAllCachedPrices } from '@/lib/db/prices';
import {
  fetchSolBalance,
  fetchTokenAccounts,
  fetchSignatures,
} from '@/lib/solana/rpc';
import { isHeliusRpc, fetchAllAssetsWithDas } from '@/lib/solana/helius';
import { fetchParsedTransactionsHelius } from '@/lib/solana/helius-parse';
import type { PriceCache, SyncJob } from '@/types';

let _running = false;
// Minimum ms to wait after a job finishes before starting the next one.
// This prevents 3+ wallets from slamming the RPC back-to-back.
const POST_JOB_COOLDOWN_MS = 5_000;

export async function processNextJob(): Promise<boolean> {
  if (_running) return false;
  const job = claimNextJob();
  if (!job) return false;

  _running = true;
  try {
    await runJob(job);
    completeJob(job.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync] job ${job.id} failed:`, msg);
    failJob(job.id, msg);
  } finally {
    // Cooldown before the loop can start the next job, regardless of success/fail.
    await new Promise<void>((r) => setTimeout(r, POST_JOB_COOLDOWN_MS));
    _running = false;
  }
  return true;
}

async function runJob(job: SyncJob): Promise<void> {
  const wallet = getWallet(job.wallet_id);
  if (!wallet) throw new Error(`Wallet ${job.wallet_id} not found`);

  console.log(`[sync] Processing job ${job.id} type=${job.type} wallet=${wallet.address}`);

  if (job.type === 'full' || job.type === 'balances') {
    // Use Helius DAS if available — 1 call instead of 3, includes metadata + prices
    if (isHeliusRpc()) {
      await syncBalancesWithDas(wallet.id, wallet.address);
    } else {
      await syncBalances(wallet.id, wallet.address);
    }
  }

  if (job.type === 'full' || job.type === 'transactions') {
    await syncTransactions(wallet.id, wallet.address, wallet.sync_cursor ?? undefined);
  }

  markSynced(wallet.id);
  await takeSnapshot(wallet.id);
}

async function syncBalances(walletId: number, address: string): Promise<void> {
  // SOL balance
  const lamports = await fetchSolBalance(address);
  upsertSolBalance(walletId, lamports);

  // Token accounts
  const tokenAccounts = await fetchTokenAccounts(address);
  const activeMints: string[] = [];

  for (const ta of tokenAccounts) {
    upsertTokenAccount(walletId, {
      mint: ta.mint,
      symbol: ta.symbol ?? null,
      name: ta.name ?? null,
      decimals: ta.decimals,
      raw_amount: ta.rawAmount,
      ui_amount: ta.uiAmount,
      token_account_address: ta.tokenAccountAddress,
    });
    activeMints.push(ta.mint);
  }

  // Remove tokens that are no longer in the wallet
  deleteStaleTokenAccounts(walletId, activeMints);
}

/**
 * Helius DAS path: single RPC call returns SOL + all tokens + metadata + prices.
 * This replaces fetchSolBalance + fetchTokenAccounts (3 calls → 1 call).
 */
async function syncBalancesWithDas(walletId: number, address: string): Promise<void> {
  const { lamports, solPriceUsd, tokens } = await fetchAllAssetsWithDas(address);

  // Persist SOL balance
  upsertSolBalance(walletId, lamports);

  // Persist token accounts (with real symbol/name from DAS metadata)
  const activeMints: string[] = [];
  const pricesFromDas: PriceCache[] = [];
  const now = Date.now();

  for (const ta of tokens) {
    upsertTokenAccount(walletId, {
      mint: ta.mint,
      symbol: ta.symbol,
      name: ta.name,
      decimals: ta.decimals,
      raw_amount: ta.rawAmount,
      ui_amount: ta.uiAmount,
      token_account_address: ta.tokenAccountAddress,
    });
    activeMints.push(ta.mint);

    // If Helius returned a price for this token, seed the price cache
    if (ta.pricePerToken && ta.pricePerToken > 0) {
      pricesFromDas.push({
        mint: ta.mint,
        symbol: ta.symbol,
        name: ta.name,
        price_usd: ta.pricePerToken,
        change_24h: null,
        market_cap: null,
        last_fetched: now,
      });
    }
  }

  // Seed SOL price from DAS if available
  if (solPriceUsd && solPriceUsd > 0) {
    pricesFromDas.push({
      mint: SOL_MINT,
      symbol: 'SOL',
      name: 'Solana',
      price_usd: solPriceUsd,
      change_24h: null,
      market_cap: null,
      last_fetched: now,
    });
  }

  if (pricesFromDas.length > 0) {
    upsertPricesBatch(pricesFromDas);
    console.log(`[helius-das] Seeded ${pricesFromDas.length} prices from DAS response`);
  }

  // Remove tokens no longer held
  deleteStaleTokenAccounts(walletId, activeMints);
}

async function syncTransactions(
  walletId: number,
  address: string,
  cursor?: string
): Promise<void> {
  // Use existing latest signature as cursor for incremental fetch
  const latestSig = cursor ?? getLatestSignature(walletId) ?? undefined;

  // Fetch up to 50 signatures (newest first)
  const sigs = await fetchSignatures(address, 50, undefined);
  if (sigs.length === 0) return;

  // Update cursor to newest signature
  const newestSig = sigs[0].signature;
  updateSyncCursor(walletId, newestSig);

  // Filter to only new ones (after our last known)
  const newSigs = latestSig
    ? sigs.filter((s) => s.signature !== latestSig)
    : sigs;

  if (newSigs.length === 0) return;

  // ── Step 1: persist basic rows immediately so the feed shows up fast ────────
  const basicRecords = newSigs.map((s) => ({
    signature:  s.signature,
    block_time: s.blockTime,
    slot:       s.slot,
    fee:        null,
    status:     s.err ? 'failed' : 'success',
    type:       'unknown' as const,
    raw_meta:   null,
  }));
  upsertTransactionsBatch(walletId, basicRecords);

  // ── Step 2: enrich with Helius Enhanced Transactions (if Helius is configured)
  if (!isHeliusRpc()) return;
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return;

  try {
    const signatures = newSigs.map((s) => s.signature);
    // Helius accepts up to 100 per call; our batch is max 50
    const parsed = await fetchParsedTransactionsHelius(signatures);

    const enrichedRecords = parsed.map((p) => {
      const original = newSigs.find((s) => s.signature === p.signature);
      return {
        signature:  p.signature,
        block_time: original?.blockTime ?? null,
        slot:       original?.slot ?? null,
        fee:        Math.round(p.detail.fee_sol * 1e9), // lamports
        status:     original?.err ? 'failed' : 'success',
        type:       p.type,
        raw_meta:   JSON.stringify(p.detail),
      };
    });

    upsertTransactionsBatch(walletId, enrichedRecords);
    console.log(`[sync] Enriched ${enrichedRecords.length} txns with Helius details for wallet ${walletId}`);
  } catch (err) {
    // Non-fatal — we already have basic rows; just log the failure
    console.warn(`[sync] Helius tx enrichment failed for wallet ${walletId}:`, err instanceof Error ? err.message : err);
  }
}

async function takeSnapshot(walletId: number): Promise<void> {
  try {
    const { getSolBalance, getTokenAccounts } = await import('@/lib/db/balances');
    const solBal = getSolBalance(walletId);
    const tokenAccs = getTokenAccounts(walletId);

    const prices = getAllCachedPrices();

    const solPrice = prices.get(SOL_MINT)?.price_usd ?? 0;
    const sol_usd = (solBal?.sol ?? 0) * solPrice;

    let tokens_usd = 0;
    for (const ta of tokenAccs) {
      const p = prices.get(ta.mint)?.price_usd ?? 0;
      tokens_usd += ta.ui_amount * p;
    }

    const now = Date.now();

    // ── Per-wallet snapshot ───────────────────────────────────────────────────
    insertSnapshot({
      wallet_id: walletId,
      total_usd: sol_usd + tokens_usd,
      sol_usd,
      tokens_usd,
      snapped_at: now,
    });

    // ── Aggregate snapshot (wallet_id = NULL) ─────────────────────────────────
    // Computed fresh from current DB balances × current prices for ALL wallets.
    // We never read old stored USD values — that would diverge from the live
    // portfolio cards whenever prices changed between syncs.
    const { listWallets } = await import('@/lib/db/wallets');
    const allWallets = listWallets();

    const aggPrices = getAllCachedPrices();
    const aggSolPrice = aggPrices.get(SOL_MINT)?.price_usd ?? 0;

    let agg_sol_usd    = 0;
    let agg_tokens_usd = 0;

    for (const w of allWallets) {
      const wSol = getSolBalance(w.id);
      agg_sol_usd += (wSol?.sol ?? 0) * aggSolPrice;

      for (const t of getTokenAccounts(w.id)) {
        agg_tokens_usd += t.ui_amount * (aggPrices.get(t.mint)?.price_usd ?? 0);
      }
    }

    if (agg_sol_usd + agg_tokens_usd > 0) {
      insertSnapshot({
        wallet_id:  null,
        total_usd:  agg_sol_usd + agg_tokens_usd,
        sol_usd:    agg_sol_usd,
        tokens_usd: agg_tokens_usd,
        snapped_at: now,
      });
    }
  } catch (err) {
    console.error('[sync] snapshot failed:', err);
  }
}

// Background loop: runs every interval ms
let _loopTimer: ReturnType<typeof setInterval> | null = null;

export function startSyncLoop(intervalMs = 30_000): void {
  if (_loopTimer) return;
  console.log('[sync] Starting background sync loop');
  _loopTimer = setInterval(() => {
    processNextJob().catch(console.error);
  }, intervalMs);
}

export function stopSyncLoop(): void {
  if (_loopTimer) {
    clearInterval(_loopTimer);
    _loopTimer = null;
  }
}
