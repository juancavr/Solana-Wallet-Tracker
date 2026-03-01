import { describe, it, expect } from 'vitest';
import { addWallet } from '@/lib/db/wallets';
import { enqueueJob, claimNextJob, completeJob, failJob, countPendingJobs, listJobs } from '@/lib/db/sync';

const ADDR = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

describe('sync job queue', () => {
  it('enqueues a job', () => {
    const w = addWallet(ADDR, 'test');
    const job = enqueueJob(w.id, 'full');
    expect(job.status).toBe('pending');
    expect(job.type).toBe('full');
    expect(job.wallet_id).toBe(w.id);
  });

  it('does not enqueue duplicate pending job', () => {
    const w = addWallet(ADDR, 'test');
    const j1 = enqueueJob(w.id, 'full');
    const j2 = enqueueJob(w.id, 'full');
    expect(j1.id).toBe(j2.id);
    expect(countPendingJobs()).toBe(1);
  });

  it('claims a job and marks it running', () => {
    const w = addWallet(ADDR, 'test');
    enqueueJob(w.id, 'balances');
    const job = claimNextJob();
    expect(job).not.toBeNull();
    expect(job?.status).toBe('running');
  });

  it('returns null when no pending jobs', () => {
    expect(claimNextJob()).toBeNull();
  });

  it('completes a job', () => {
    const w = addWallet(ADDR, 'test');
    const j = enqueueJob(w.id, 'full');
    claimNextJob();
    completeJob(j.id);
    const jobs = listJobs(w.id);
    const done = jobs.find((x) => x.id === j.id);
    expect(done?.status).toBe('done');
  });

  it('fails a job and retries up to maxAttempts', () => {
    const w = addWallet(ADDR, 'test');
    const j = enqueueJob(w.id, 'full');
    claimNextJob();
    failJob(j.id, 'network error', 3); // attempt 1 → pending
    expect(countPendingJobs()).toBe(1);
    claimNextJob();
    failJob(j.id, 'network error', 3); // attempt 2 → pending
    expect(countPendingJobs()).toBe(1);
    claimNextJob();
    failJob(j.id, 'network error', 3); // attempt 3 → failed
    expect(countPendingJobs()).toBe(0);
    const jobs = listJobs(w.id);
    const failed = jobs.find((x) => x.id === j.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.last_error).toBe('network error');
  });

  it('counts pending jobs correctly', () => {
    const w = addWallet(ADDR, 'test');
    expect(countPendingJobs()).toBe(0);
    enqueueJob(w.id, 'full');
    expect(countPendingJobs()).toBe(1);
    enqueueJob(w.id, 'balances'); // different type
    expect(countPendingJobs()).toBe(2);
  });
});
