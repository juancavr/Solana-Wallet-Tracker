import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';

export async function GET() {
  const db = getDb();

  // 1. Total transactions with raw_meta
  const total = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NOT NULL`).get() as { c: number }).c;
  const withSuccess = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NOT NULL AND status = 'success'`).get() as { c: number }).c;
  const withNullStatus = (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE raw_meta IS NOT NULL AND status IS NULL`).get() as { c: number }).c;

  // 2. Pump.fun transactions (source = 'Pump Fun')
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

  // 3. Sample of all distinct sources
  const sources = db.prepare(`
    SELECT json_extract(raw_meta, '$.source') as source, COUNT(*) as c
    FROM transactions
    WHERE raw_meta IS NOT NULL
    GROUP BY source
    ORDER BY c DESC
    LIMIT 30
  `).all() as { source: string; c: number }[];

  // 4. Sample descriptions containing relevant keywords
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

  // 5. Sample of 10 recent enriched txs (any type) to see the description format
  const recentSample = db.prepare(`
    SELECT t.signature, t.status,
      json_extract(t.raw_meta, '$.source') as source,
      json_extract(t.raw_meta, '$.helius_type') as helius_type,
      json_extract(t.raw_meta, '$.description') as description
    FROM transactions t
    WHERE raw_meta IS NOT NULL AND t.status = 'success'
    ORDER BY t.block_time DESC
    LIMIT 10
  `).all() as { signature: string; status: string | null; source: string; helius_type: string | null; description: string }[];

  return NextResponse.json({
    counts: { total_with_meta: total, with_success_status: withSuccess, with_null_status: withNullStatus },
    pump_fun_transactions: pumpRows,
    keyword_matches: keywordMatches,
    all_sources: sources,
    recent_enriched_sample: recentSample,
  }, { status: 200 });
}
