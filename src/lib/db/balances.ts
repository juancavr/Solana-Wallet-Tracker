import { getDb } from './index';
import type { SolBalance, TokenAccount } from '@/types';

export function upsertSolBalance(
  walletId: number,
  lamports: bigint,
  now = Date.now()
): void {
  const db = getDb();
  const sol = Number(lamports) / 1e9;
  db.prepare(
    `INSERT INTO sol_balances (wallet_id, lamports, sol, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(wallet_id) DO UPDATE SET
       lamports = excluded.lamports,
       sol = excluded.sol,
       updated_at = excluded.updated_at`
  ).run(walletId, lamports.toString(), sol, now);
}

export function getSolBalance(walletId: number): SolBalance | null {
  const db = getDb();
  return (
    (db
      .prepare('SELECT * FROM sol_balances WHERE wallet_id = ?')
      .get(walletId) as SolBalance) ?? null
  );
}

export function upsertTokenAccount(
  walletId: number,
  ta: Omit<TokenAccount, 'id' | 'wallet_id' | 'updated_at'>,
  now = Date.now()
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO token_accounts
       (wallet_id, mint, symbol, name, decimals, raw_amount, ui_amount, token_account_address, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(wallet_id, mint) DO UPDATE SET
       symbol = excluded.symbol,
       name = excluded.name,
       decimals = excluded.decimals,
       raw_amount = excluded.raw_amount,
       ui_amount = excluded.ui_amount,
       token_account_address = excluded.token_account_address,
       updated_at = excluded.updated_at`
  ).run(
    walletId,
    ta.mint,
    ta.symbol ?? null,
    ta.name ?? null,
    ta.decimals,
    ta.raw_amount,
    ta.ui_amount,
    ta.token_account_address ?? null,
    now
  );
}

export function deleteStaleTokenAccounts(walletId: number, activeMints: string[]): void {
  const db = getDb();
  if (activeMints.length === 0) {
    db.prepare('DELETE FROM token_accounts WHERE wallet_id = ?').run(walletId);
    return;
  }
  const placeholders = activeMints.map(() => '?').join(',');
  db.prepare(
    `DELETE FROM token_accounts WHERE wallet_id = ? AND mint NOT IN (${placeholders})`
  ).run(walletId, ...activeMints);
}

export function getTokenAccounts(walletId: number): TokenAccount[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM token_accounts WHERE wallet_id = ? ORDER BY ui_amount DESC')
    .all(walletId) as TokenAccount[];
}

export function getAllTokenAccounts(): TokenAccount[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM token_accounts ORDER BY ui_amount DESC')
    .all() as TokenAccount[];
}

export function getUniqueMints(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT mint FROM token_accounts WHERE ui_amount > 0
       UNION SELECT 'So11111111111111111111111111111111111111112'`
    )
    .all() as { mint: string }[];
  return rows.map((r) => r.mint);
}
