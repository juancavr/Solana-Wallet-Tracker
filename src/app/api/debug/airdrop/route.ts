import { NextResponse } from 'next/server';
import path from 'path';
import { getDb } from '@/lib/db/index';

export async function GET() {
  const db = getDb();

  // ── 0. DB diagnostics ────────────────────────────────────────────────────
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'tracker.db');
  const walletList = db.prepare(`SELECT id, address, label, created_at FROM wallets LIMIT 20`).all();

  // ── 1. Transaction counts (total vs enriched) ────────────────────────────
  const totalTxs        = (db.prepare(`SELECT COUNT(*) as c FROM transactions`).get() as { c: number }).c;
  const withMeta        = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NOT NULL`).get() as { c: number }).c;
  const withoutMeta     = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NULL`).get() as { c: number }).c;
  const withSuccess     = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NOT NULL AND status = 'success'`).get() as { c: number }).c;
  const withNullStatus  = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NOT NULL AND status IS NULL`).get() as { c: number }).c;

  // ── 2. Wallets count ─────────────────────────────────────────────────────
  const walletCount = (db.prepare(`SELECT COUNT(*) as c FROM wallets`).get() as { c: number }).c;

  // ── 3. Sample of unenriched transactions (raw_meta = null) ───────────────
  const unenrichedSample = db.prepare(`
    SELECT signature, status, block_time, type
    FROM transactions
    WHERE raw_meta IS NULL
    ORDER BY block_time DESC NULLS LAST
    LIMIT 5
  `).all() as { signature: string; status: string | null; block_time: number | null; type: string }[];

  // ── 4. Pump.fun transactions ─────────────────────────────────────────────
  const pumpRows = db.prepare(`
    SELECT t.signature, t.status,
      json_extract(t.raw_meta, '$.source') as source,
      json_extract(t.raw_meta, '$.helius_type') as helius_type,
      json_extract(t.raw_meta, '$.description') as description
    FROM transactions t
    WHERE json_extract(t.raw_meta, '$.source') LIKE '%ump%'
    ORDER BY t.block_time DESC
    LIMIT 20
  `).all() as { signature: string; status: string | null; source: string; helius_type: string | null; description: string }[];

  // ── 5. All distinct sources ──────────────────────────────────────────────
  const sources = db.prepare(`
    SELECT json_extract(raw_meta, '$.source') as source, COUNT(*) as c
    FROM transactions
    WHERE raw_meta IS NOT NULL
    GROUP BY source
    ORDER BY c DESC
    LIMIT 30
  `).all() as { source: string; c: number }[];

  // ── 6. Keyword matches ───────────────────────────────────────────────────
  const keywordMatches = db.prepare(`
    SELECT t.signature, t.status,
      json_extract(t.raw_meta, '$.source') as source,
      json_extract(t.raw_meta, '$.helius_type') as helius_type,
      json_extract(t.raw_meta, '$.description') as description
    FROM transactions t
    WHERE raw_meta IS NOT NULL
      AND (
        lower(json_extract(t.raw_meta, '$.description')) LIKE '%cashback%'
        OR lower(json_extract(t.raw_meta, '$.description')) LIKE '%creator%'
        OR lower(json_extract(t.raw_meta, '$.description')) LIKE '%fee%'
        OR json_extract(t.raw_meta, '$.helius_type') IN ('CASHBACK', 'COLLECT_COIN_CREATOR_FEE')
      )
    ORDER BY t.block_time DESC
    LIMIT 20
  `).all() as { signature: string; status: string | null; source: string; helius_type: string | null; description: string }[];

  // ── 7. Recent enriched sample ────────────────────────────────────────────
  const recentSample = db.prepare(`
    SELECT t.signature, t.status,
      json_extract(t.raw_meta, '$.source') as source,
      json_extract(t.raw_meta, '$.helius_type') as helius_type,
      json_extract(t.raw_meta, '$.description') as description
    FROM transactions t
    WHERE raw_meta IS NOT NULL
    ORDER BY t.block_time DESC
    LIMIT 10
  `).all() as { signature: string; status: string | null; source: string; helius_type: string | null; description: string }[];

  return NextResponse.json({
    db_path: dbPath,
    cwd: process.cwd(),
    wallets: walletList,
    counts: {
      wallets: walletCount,
      total_transactions: totalTxs,
      with_meta: withMeta,
      without_meta: withoutMeta,
      enriched_success: withSuccess,
      enriched_null_status: withNullStatus,
    },
    unenriched_sample: unenrichedSample,
    pump_fun_transactions: pumpRows,
    keyword_matches: keywordMatches,
    all_sources: sources,
    recent_enriched_sample: recentSample,
  }, { status: 200 });
}
