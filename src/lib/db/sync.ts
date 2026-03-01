import { getDb } from './index';
import type { SyncJob } from '@/types';

export function enqueueJob(
  walletId: number,
  type: SyncJob['type'] = 'full'
): SyncJob {
  const db = getDb();
  const now = Date.now();
  // If there's already a pending/running job of the same type, skip
  const existing = db
    .prepare(
      `SELECT * FROM sync_jobs
       WHERE wallet_id = ? AND type = ? AND status IN ('pending', 'running')
       LIMIT 1`
    )
    .get(walletId, type) as SyncJob | undefined;
  if (existing) return existing;

  const result = db
    .prepare(
      `INSERT INTO sync_jobs (wallet_id, type, status, attempts, created_at, updated_at)
       VALUES (?, ?, 'pending', 0, ?, ?)`
    )
    .run(walletId, type, now, now);
  return getJob(result.lastInsertRowid as number)!;
}

export function getJob(id: number): SyncJob | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM sync_jobs WHERE id = ?').get(id) as SyncJob) ?? null;
}

export function claimNextJob(): SyncJob | null {
  const db = getDb();
  const job = db
    .prepare(
      `SELECT * FROM sync_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get() as SyncJob | undefined;
  if (!job) return null;
  const now = Date.now();
  db.prepare(
    `UPDATE sync_jobs SET status = 'running', updated_at = ? WHERE id = ?`
  ).run(now, job.id);
  return { ...job, status: 'running' };
}

export function completeJob(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE sync_jobs SET status = 'done', updated_at = ? WHERE id = ?`
  ).run(Date.now(), id);
}

export function failJob(id: number, error: string, maxAttempts = 3): void {
  const db = getDb();
  const job = getJob(id);
  if (!job) return;
  const attempts = job.attempts + 1;
  const status = attempts >= maxAttempts ? 'failed' : 'pending';
  db.prepare(
    `UPDATE sync_jobs
     SET status = ?, attempts = ?, last_error = ?, updated_at = ?
     WHERE id = ?`
  ).run(status, attempts, error, Date.now(), id);
}

export function listJobs(walletId?: number): SyncJob[] {
  const db = getDb();
  if (walletId !== undefined) {
    return db
      .prepare('SELECT * FROM sync_jobs WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(walletId) as SyncJob[];
  }
  return db
    .prepare('SELECT * FROM sync_jobs ORDER BY created_at DESC LIMIT 50')
    .all() as SyncJob[];
}

export function countPendingJobs(): number {
  const db = getDb();
  const r = db
    .prepare("SELECT COUNT(*) as c FROM sync_jobs WHERE status IN ('pending','running')")
    .get() as { c: number };
  return r.c;
}

export function cleanOldJobs(keepDays = 7): void {
  const db = getDb();
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  db.prepare("DELETE FROM sync_jobs WHERE status IN ('done','failed') AND updated_at < ?").run(cutoff);
}
