import { getDb } from './index';
import type { PortfolioSnapshot } from '@/types';

export function insertSnapshot(snap: Omit<PortfolioSnapshot, 'id'>): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO portfolio_snapshots (wallet_id, total_usd, sol_usd, tokens_usd, snapped_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    snap.wallet_id ?? null,
    snap.total_usd,
    snap.sol_usd,
    snap.tokens_usd,
    snap.snapped_at
  );
}

export function getPortfolioHistory(
  walletId: number | null,
  days = 30
): PortfolioSnapshot[] {
  const db  = getDb();
  const since  = Date.now() - days * 24 * 60 * 60 * 1000;
  const DAY_MS = 86_400_000; // ms per day

  // ── Per-wallet view ────────────────────────────────────────────────────────
  // Return the latest snapshot for each calendar day that has real data.
  // The chart component is responsible for filling the full date-range grid.
  if (walletId !== null) {
    return db
      .prepare(
        `SELECT s.*
         FROM portfolio_snapshots s
         JOIN (
           SELECT (snapped_at / ${DAY_MS}) * ${DAY_MS} AS day,
                  MAX(snapped_at)                       AS max_snap
           FROM   portfolio_snapshots
           WHERE  wallet_id = ? AND snapped_at >= ?
           GROUP  BY (snapped_at / ${DAY_MS})
         ) d
           ON s.snapped_at = d.max_snap
          AND s.wallet_id  = ?
         ORDER BY s.snapped_at ASC`
      )
      .all(walletId, since, walletId) as PortfolioSnapshot[];
  }

  // ── Aggregate (overview) view ──────────────────────────────────────────────
  // 1. Prefer explicit aggregate rows (wallet_id IS NULL) written by the sync engine.
  const explicit = db
    .prepare(
      `SELECT s.*
       FROM portfolio_snapshots s
       JOIN (
         SELECT (snapped_at / ${DAY_MS}) * ${DAY_MS} AS day,
                MAX(snapped_at)                       AS max_snap
         FROM   portfolio_snapshots
         WHERE  wallet_id IS NULL AND snapped_at >= ?
         GROUP  BY (snapped_at / ${DAY_MS})
       ) daily
         ON s.snapped_at = daily.max_snap
        AND s.wallet_id IS NULL
       ORDER BY s.snapped_at ASC`
    )
    .all(since) as PortfolioSnapshot[];

  if (explicit.length >= 1) return explicit;

  // 2. Legacy fallback (pre-aggregate installs): sum latest per-wallet snapshot
  //    for each calendar day that has any per-wallet data.
  return db
    .prepare(
      `SELECT
         d.day_ts                         AS snapped_at,
         COALESCE(SUM(s.total_usd),  0)   AS total_usd,
         COALESCE(SUM(s.sol_usd),    0)   AS sol_usd,
         COALESCE(SUM(s.tokens_usd), 0)   AS tokens_usd,
         NULL                             AS wallet_id,
         0                                AS id
       FROM (
         SELECT DISTINCT (snapped_at / ${DAY_MS}) * ${DAY_MS} AS day_ts
         FROM   portfolio_snapshots
         WHERE  wallet_id IS NOT NULL AND snapped_at >= ?
       ) d
       CROSS JOIN (
         SELECT DISTINCT wallet_id FROM portfolio_snapshots WHERE wallet_id IS NOT NULL
       ) w
       JOIN portfolio_snapshots s
         ON  s.wallet_id  = w.wallet_id
         AND s.snapped_at = (
               SELECT MAX(p.snapped_at)
               FROM   portfolio_snapshots p
               WHERE  p.wallet_id  = w.wallet_id
                 AND  p.snapped_at <= d.day_ts + ${DAY_MS}
             )
       GROUP  BY d.day_ts
       ORDER  BY d.day_ts ASC`
    )
    .all(since) as PortfolioSnapshot[];
}

/**
 * Sum the most-recent snapshot for every wallet.
 * Used to write a fresh aggregate (wallet_id = NULL) snapshot after each sync.
 */
export function sumLatestPerWalletSnapshots(): {
  total_usd: number;
  sol_usd: number;
  tokens_usd: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         SUM(s.total_usd)  AS total_usd,
         SUM(s.sol_usd)    AS sol_usd,
         SUM(s.tokens_usd) AS tokens_usd
       FROM portfolio_snapshots s
       JOIN (
         SELECT wallet_id, MAX(snapped_at) AS latest
         FROM portfolio_snapshots
         WHERE wallet_id IS NOT NULL
         GROUP BY wallet_id
       ) l ON s.wallet_id = l.wallet_id AND s.snapped_at = l.latest`
    )
    .get() as { total_usd: number | null; sol_usd: number | null; tokens_usd: number | null };

  return {
    total_usd:  row?.total_usd  ?? 0,
    sol_usd:    row?.sol_usd    ?? 0,
    tokens_usd: row?.tokens_usd ?? 0,
  };
}

export function getLatestSnapshot(walletId: number | null): PortfolioSnapshot | null {
  const db = getDb();
  if (walletId === null) {
    return (
      (db
        .prepare(
          'SELECT * FROM portfolio_snapshots WHERE wallet_id IS NULL ORDER BY snapped_at DESC LIMIT 1'
        )
        .get() as PortfolioSnapshot) ?? null
    );
  }
  return (
    (db
      .prepare(
        'SELECT * FROM portfolio_snapshots WHERE wallet_id = ? ORDER BY snapped_at DESC LIMIT 1'
      )
      .get(walletId) as PortfolioSnapshot) ?? null
  );
}

// Prune old snapshots (keep last N days)
export function pruneSnapshots(keepDays = 90): void {
  const db = getDb();
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM portfolio_snapshots WHERE snapped_at < ?').run(cutoff);
}
