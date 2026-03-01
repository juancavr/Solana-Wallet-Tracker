import { getDb } from './index';
import type { Wallet, WalletWithBalance } from '@/types';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#22c55e', '#06b6d4', '#f59e0b', '#ef4444',
];

export function listWallets(): Wallet[] {
  const db = getDb();
  return db.prepare('SELECT * FROM wallets ORDER BY created_at ASC').all() as Wallet[];
}

export function getWallet(id: number): Wallet | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM wallets WHERE id = ?').get(id) as Wallet) ?? null;
}

export function getWalletByAddress(address: string): Wallet | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM wallets WHERE address = ?').get(address) as Wallet) ?? null;
}

export function addWallet(address: string, label: string, color?: string): Wallet {
  const db = getDb();
  const existing = listWallets();
  const pickedColor = color ?? COLORS[existing.length % COLORS.length];
  const now = Date.now();
  const result = db
    .prepare(
      'INSERT INTO wallets (address, label, color, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(address.trim(), label.trim() || address.slice(0, 8), pickedColor, now);
  return getWallet(result.lastInsertRowid as number)!;
}

export function updateWallet(
  id: number,
  patch: Partial<Pick<Wallet, 'label' | 'color'>>
): Wallet | null {
  const db = getDb();
  const fields = Object.keys(patch)
    .filter((k) => ['label', 'color'].includes(k))
    .map((k) => `${k} = ?`)
    .join(', ');
  if (!fields) return getWallet(id);
  db.prepare(`UPDATE wallets SET ${fields} WHERE id = ?`).run(
    ...Object.values(patch),
    id
  );
  return getWallet(id);
}

export function deleteWallet(id: number): boolean {
  const db = getDb();
  const r = db.prepare('DELETE FROM wallets WHERE id = ?').run(id);
  return r.changes > 0;
}

export function updateSyncCursor(id: number, cursor: string): void {
  const db = getDb();
  db.prepare('UPDATE wallets SET sync_cursor = ? WHERE id = ?').run(cursor, id);
}

export function markSynced(id: number): void {
  const db = getDb();
  db.prepare('UPDATE wallets SET last_synced_at = ? WHERE id = ?').run(Date.now(), id);
}

export function listWalletsWithBalances(): WalletWithBalance[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        w.*,
        COALESCE(sb.sol, 0)          AS sol,
        0                            AS sol_usd,
        0                            AS tokens_usd,
        0                            AS total_usd,
        COUNT(ta.id)                 AS token_count
       FROM wallets w
       LEFT JOIN sol_balances sb ON sb.wallet_id = w.id
       LEFT JOIN token_accounts ta ON ta.wallet_id = w.id AND ta.ui_amount > 0
       GROUP BY w.id
       ORDER BY w.created_at ASC`
    )
    .all() as WalletWithBalance[];
  return rows;
}
