import { getDb } from './index';
import type { Transaction, ActivityItem, TxDetail } from '@/types';

// ─── Insert / upsert ──────────────────────────────────────────────────────────

/**
 * Upsert a single transaction.
 * ON CONFLICT updates type + fee + raw_meta so existing "unknown" rows
 * get enriched when the sync engine re-processes them with Helius data.
 */
export function upsertTransaction(
  walletId: number,
  tx: Omit<Transaction, 'id' | 'wallet_id'>
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO transactions
       (wallet_id, signature, block_time, slot, fee, status, type, raw_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(wallet_id, signature) DO UPDATE SET
       type     = excluded.type,
       fee      = COALESCE(excluded.fee, fee),
       raw_meta = COALESCE(excluded.raw_meta, raw_meta)`
  ).run(
    walletId,
    tx.signature,
    tx.block_time ?? null,
    tx.slot ?? null,
    tx.fee ?? null,
    tx.status ?? null,
    tx.type,
    tx.raw_meta ?? null
  );
}

export function upsertTransactionsBatch(
  walletId: number,
  txs: Omit<Transaction, 'id' | 'wallet_id'>[]
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO transactions
       (wallet_id, signature, block_time, slot, fee, status, type, raw_meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(wallet_id, signature) DO UPDATE SET
       type     = excluded.type,
       fee      = COALESCE(excluded.fee, fee),
       raw_meta = COALESCE(excluded.raw_meta, raw_meta)`
  );
  const insertMany = db.transaction((items: typeof txs) => {
    for (const tx of items) {
      insert.run(
        walletId,
        tx.signature,
        tx.block_time ?? null,
        tx.slot ?? null,
        tx.fee ?? null,
        tx.status ?? null,
        tx.type,
        tx.raw_meta ?? null
      );
    }
  });
  insertMany(txs);
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function getTransactions(
  walletId: number,
  limit = 50,
  offset = 0
): Transaction[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM transactions WHERE wallet_id = ?
       ORDER BY block_time DESC NULLS LAST
       LIMIT ? OFFSET ?`
    )
    .all(walletId, limit, offset) as Transaction[];
}

/** Parse raw_meta JSON and attach as TxDetail, or return null if absent/invalid */
export function parseDetail(raw_meta: string | null): TxDetail | null {
  if (!raw_meta) return null;
  try {
    return JSON.parse(raw_meta) as TxDetail;
  } catch {
    return null;
  }
}

export function getAllActivity(limit = 100, offset = 0): ActivityItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        t.signature, t.block_time, t.wallet_id, t.type, t.status, t.fee,
        t.raw_meta,
        w.label   AS wallet_label,
        w.address AS wallet_address
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       ORDER BY t.block_time DESC NULLS LAST
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as (ActivityItem & { raw_meta: string | null })[];

  return rows.map(({ raw_meta, ...row }) => ({
    ...row,
    detail: parseDetail(raw_meta),
  }));
}

export function getWalletActivity(
  walletId: number,
  limit = 50,
  offset = 0
): ActivityItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        t.signature, t.block_time, t.wallet_id, t.type, t.status, t.fee,
        t.raw_meta,
        w.label   AS wallet_label,
        w.address AS wallet_address
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE t.wallet_id = ?
       ORDER BY t.block_time DESC NULLS LAST
       LIMIT ? OFFSET ?`
    )
    .all(walletId, limit, offset) as (ActivityItem & { raw_meta: string | null })[];

  return rows.map(({ raw_meta, ...row }) => ({
    ...row,
    detail: parseDetail(raw_meta),
  }));
}

export function getLatestSignature(walletId: number): string | null {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT signature FROM transactions WHERE wallet_id = ? ORDER BY block_time DESC LIMIT 1'
    )
    .get(walletId) as { signature: string } | undefined;
  return row?.signature ?? null;
}

export function countTransactions(walletId?: number): number {
  const db = getDb();
  if (walletId !== undefined) {
    const r = db
      .prepare('SELECT COUNT(*) as c FROM transactions WHERE wallet_id = ?')
      .get(walletId) as { c: number };
    return r.c;
  }
  const r = db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number };
  return r.c;
}

export function getGroupActivity(
  walletIds: number[],
  limit = 50,
  offset = 0
): ActivityItem[] {
  if (walletIds.length === 0) return [];
  const db = getDb();
  const placeholders = walletIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT
        t.signature, t.block_time, t.wallet_id, t.type, t.status, t.fee,
        t.raw_meta,
        w.label   AS wallet_label,
        w.address AS wallet_address
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE t.wallet_id IN (${placeholders})
       ORDER BY t.block_time DESC NULLS LAST
       LIMIT ? OFFSET ?`
    )
    .all(...walletIds, limit, offset) as (ActivityItem & { raw_meta: string | null })[];

  return rows.map(({ raw_meta, ...row }) => ({
    ...row,
    detail: parseDetail(raw_meta),
  }));
}

export function countGroupTransactions(walletIds: number[]): number {
  if (walletIds.length === 0) return 0;
  const db = getDb();
  const placeholders = walletIds.map(() => '?').join(',');
  const r = db
    .prepare(`SELECT COUNT(*) as c FROM transactions WHERE wallet_id IN (${placeholders})`)
    .get(...walletIds) as { c: number };
  return r.c;
}

// ─── Airdrop (cashback + creator fees) aggregation ───────────────────────────

export interface WalletAirdropRow {
  wallet_id:       number;
  wallet_label:    string;
  wallet_address:  string;
  cashback_sol:    number;
  creator_fee_sol: number;
  total_sol:       number;
}

export function getAirdropSummary(walletIds?: number[]): WalletAirdropRow[] {
  const db = getDb();

  const whereWallets = walletIds && walletIds.length > 0
    ? `AND t.wallet_id IN (${walletIds.map(() => '?').join(',')})`
    : '';

  const rows = db.prepare(`
    SELECT t.wallet_id, t.raw_meta, w.address, w.label
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE t.status = 'success'
      AND t.raw_meta IS NOT NULL
      AND (
        json_extract(t.raw_meta, '$.helius_type') IN ('CASHBACK', 'COLLECT_COIN_CREATOR_FEE')
        OR lower(json_extract(t.raw_meta, '$.description')) LIKE '%cashback%'
        OR lower(json_extract(t.raw_meta, '$.description')) LIKE '%creator fee%'
        OR lower(json_extract(t.raw_meta, '$.description')) LIKE '%creator_fee%'
        -- Pump.fun collect_creator_fee / collect_coin_creator_fee: Helius returns type=WITHDRAW
        OR (
          json_extract(t.raw_meta, '$.helius_type') IN ('WITHDRAW', 'UNKNOWN')
          AND json_extract(t.raw_meta, '$.source') LIKE '%Pump%'
          AND json_extract(t.raw_meta, '$.swap') IS NULL
        )
      )
      ${whereWallets}
  `).all(...(walletIds ?? [])) as { wallet_id: number; raw_meta: string; address: string; label: string }[];

  const map = new Map<number, WalletAirdropRow>();

  for (const row of rows) {
    const detail = parseDetail(row.raw_meta);
    if (!detail) continue;

    const heliusType   = detail.helius_type ?? '';
    const desc         = (detail.description ?? '').toLowerCase();
    const source       = detail.source ?? '';
    const isCashback   = heliusType === 'CASHBACK'                 || desc.includes('cashback');
    const isCreatorFee = heliusType === 'COLLECT_COIN_CREATOR_FEE' || desc.includes('creator fee') || desc.includes('creator_fee');
    // Pump.fun collect_creator_fee / collect_coin_creator_fee: Helius returns type=WITHDRAW (or UNKNOWN)
    const isPumpFeeCollection = (heliusType === 'WITHDRAW' || heliusType === 'UNKNOWN') && source.toLowerCase().includes('pump') && !detail.swap;
    if (!isCashback && !isCreatorFee && !isPumpFeeCollection) continue;

    // Sum native SOL received. WSOL is already included via the ATA-close native transfer,
    // so we do NOT add token_transfers for SOL_MINT to avoid double-counting.
    const totalReceived = (detail.native_transfers ?? [])
      .filter((nt) => nt.to === row.address)
      .reduce((sum, nt) => sum + nt.amount_sol, 0);

    // For Pump.fun fee collections, require actual SOL/WSOL received to avoid false positives
    if (isPumpFeeCollection && totalReceived <= 0) continue;

    if (!map.has(row.wallet_id)) {
      map.set(row.wallet_id, {
        wallet_id:       row.wallet_id,
        wallet_label:    row.label,
        wallet_address:  row.address,
        cashback_sol:    0,
        creator_fee_sol: 0,
        total_sol:       0,
      });
    }
    const entry = map.get(row.wallet_id)!;
    if (isCashback)                       entry.cashback_sol    += totalReceived;
    if (isCreatorFee || isPumpFeeCollection) entry.creator_fee_sol += totalReceived;
  }

  return [...map.values()].map((e) => ({ ...e, total_sol: e.cashback_sol + e.creator_fee_sol }));
}
