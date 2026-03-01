import { describe, it, expect } from 'vitest';
import { addWallet } from '@/lib/db/wallets';
import {
  upsertTransaction,
  upsertTransactionsBatch,
  getTransactions,
  getLatestSignature,
  countTransactions,
} from '@/lib/db/transactions';

const ADDR = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

describe('transaction storage', () => {
  it('inserts and retrieves a transaction', () => {
    const w = addWallet(ADDR, 'test');
    upsertTransaction(w.id, {
      signature: 'sig1',
      block_time: 1700000000,
      slot: 12345,
      fee: 5000,
      status: 'success',
      type: 'transfer',
      raw_meta: null,
    });
    const txs = getTransactions(w.id);
    expect(txs.length).toBe(1);
    expect(txs[0].signature).toBe('sig1');
    expect(txs[0].type).toBe('transfer');
  });

  it('ignores duplicate signatures (INSERT OR IGNORE)', () => {
    const w = addWallet(ADDR, 'test');
    const tx = { signature: 'sig_dup', block_time: 1700000001, slot: 1, fee: 5000, status: 'success', type: 'transfer', raw_meta: null };
    upsertTransaction(w.id, tx);
    upsertTransaction(w.id, tx);
    expect(countTransactions(w.id)).toBe(1);
  });

  it('inserts batch of transactions', () => {
    const w = addWallet(ADDR, 'test');
    const batch = Array.from({ length: 10 }, (_, i) => ({
      signature: `batchsig${i}`,
      block_time: 1700000000 + i,
      slot: i,
      fee: 5000,
      status: 'success',
      type: 'unknown',
      raw_meta: null,
    }));
    upsertTransactionsBatch(w.id, batch);
    expect(countTransactions(w.id)).toBe(10);
  });

  it('returns latest signature', () => {
    const w = addWallet(ADDR, 'test');
    upsertTransaction(w.id, { signature: 'old_sig', block_time: 1699000000, slot: 1, fee: 5000, status: 'success', type: 'transfer', raw_meta: null });
    upsertTransaction(w.id, { signature: 'new_sig', block_time: 1700000000, slot: 2, fee: 5000, status: 'success', type: 'transfer', raw_meta: null });
    expect(getLatestSignature(w.id)).toBe('new_sig');
  });

  it('returns null latest signature for empty wallet', () => {
    const w = addWallet(ADDR, 'test');
    expect(getLatestSignature(w.id)).toBeNull();
  });

  it('paginates transactions', () => {
    const w = addWallet(ADDR, 'test');
    for (let i = 0; i < 30; i++) {
      upsertTransaction(w.id, {
        signature: `pagsig${i}`,
        block_time: 1700000000 + i,
        slot: i,
        fee: 5000,
        status: 'success',
        type: 'unknown',
        raw_meta: null,
      });
    }
    const page1 = getTransactions(w.id, 10, 0);
    const page2 = getTransactions(w.id, 10, 10);
    expect(page1.length).toBe(10);
    expect(page2.length).toBe(10);
    expect(page1[0].signature).not.toBe(page2[0].signature);
  });
});
