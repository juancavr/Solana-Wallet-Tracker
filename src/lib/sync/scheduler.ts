/**
 * Scheduler: enqueues sync jobs for all wallets periodically.
 * Called once on server startup via instrumentation.ts.
 */
import { listWallets } from '@/lib/db/wallets';
import { enqueueJob } from '@/lib/db/sync';
import { startSyncLoop } from './engine';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (_schedulerTimer) return;

  // Enqueue initial sync for all wallets
  enqueueAllWallets();

  // Start the job processor
  startSyncLoop(15_000); // check for new jobs every 15s

  // Re-enqueue all wallets every 5 minutes
  _schedulerTimer = setInterval(enqueueAllWallets, SYNC_INTERVAL_MS);
  console.log('[scheduler] Started. Sync interval:', SYNC_INTERVAL_MS / 1000, 's');
}

function enqueueAllWallets(): void {
  try {
    const wallets = listWallets();
    for (const w of wallets) {
      enqueueJob(w.id, 'full');
    }
    console.log(`[scheduler] Enqueued sync for ${wallets.length} wallets`);
  } catch (err) {
    console.error('[scheduler] Failed to enqueue wallets:', err);
  }
}

export function stopScheduler(): void {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer);
    _schedulerTimer = null;
  }
}
