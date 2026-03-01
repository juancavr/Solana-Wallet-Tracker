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
