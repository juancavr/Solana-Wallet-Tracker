import { describe, it, expect } from 'vitest';
import { addWallet } from '@/lib/db/wallets';
import {
  upsertSolBalance,
  getSolBalance,
  upsertTokenAccount,
  getTokenAccounts,
  deleteStaleTokenAccounts,
} from '@/lib/db/balances';

const ADDR = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const MINT_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_B = '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj';

describe('balance storage', () => {
  it('upserts and retrieves SOL balance', () => {
    const w = addWallet(ADDR, 'test');
    upsertSolBalance(w.id, 2_500_000_000n);
    const bal = getSolBalance(w.id);
    expect(bal?.sol).toBeCloseTo(2.5, 4);
    expect(bal?.lamports).toBe('2500000000');
  });

  it('updates SOL balance on re-upsert', () => {
    const w = addWallet(ADDR, 'test');
    upsertSolBalance(w.id, 1_000_000_000n);
    upsertSolBalance(w.id, 3_000_000_000n);
    const bal = getSolBalance(w.id);
    expect(bal?.sol).toBeCloseTo(3.0, 4);
  });

  it('upserts token accounts', () => {
    const w = addWallet(ADDR, 'test');
    upsertTokenAccount(w.id, {
      mint: MINT_A,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      raw_amount: '1000000000',
      ui_amount: 1000,
      token_account_address: null,
    });
    const accounts = getTokenAccounts(w.id);
    expect(accounts.length).toBe(1);
    expect(accounts[0].symbol).toBe('USDC');
    expect(accounts[0].ui_amount).toBe(1000);
  });

  it('updates existing token account on re-upsert', () => {
    const w = addWallet(ADDR, 'test');
    upsertTokenAccount(w.id, { mint: MINT_A, symbol: 'USDC', name: null, decimals: 6, raw_amount: '1000000', ui_amount: 1, token_account_address: null });
    upsertTokenAccount(w.id, { mint: MINT_A, symbol: 'USDC', name: null, decimals: 6, raw_amount: '5000000', ui_amount: 5, token_account_address: null });
    const accounts = getTokenAccounts(w.id);
    expect(accounts.length).toBe(1);
    expect(accounts[0].ui_amount).toBe(5);
  });

  it('deletes stale token accounts', () => {
    const w = addWallet(ADDR, 'test');
    upsertTokenAccount(w.id, { mint: MINT_A, symbol: 'A', name: null, decimals: 6, raw_amount: '1', ui_amount: 0.000001, token_account_address: null });
    upsertTokenAccount(w.id, { mint: MINT_B, symbol: 'B', name: null, decimals: 9, raw_amount: '1', ui_amount: 0.000001, token_account_address: null });
    deleteStaleTokenAccounts(w.id, [MINT_A]);
    const remaining = getTokenAccounts(w.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].mint).toBe(MINT_A);
  });

  it('deletes all token accounts when active list is empty', () => {
    const w = addWallet(ADDR, 'test');
    upsertTokenAccount(w.id, { mint: MINT_A, symbol: 'A', name: null, decimals: 6, raw_amount: '1', ui_amount: 1, token_account_address: null });
    deleteStaleTokenAccounts(w.id, []);
    expect(getTokenAccounts(w.id).length).toBe(0);
  });
});
