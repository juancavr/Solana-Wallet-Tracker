import { describe, it, expect, beforeEach } from 'vitest';
import { addWallet, listWallets, getWallet, updateWallet, deleteWallet, getWalletByAddress } from '@/lib/db/wallets';

const VALID_ADDRESS = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';

describe('wallet CRUD', () => {
  it('adds a wallet and retrieves it', () => {
    const w = addWallet(VALID_ADDRESS, 'Test Wallet');
    expect(w.id).toBeGreaterThan(0);
    expect(w.address).toBe(VALID_ADDRESS);
    expect(w.label).toBe('Test Wallet');
    expect(w.color).toMatch(/^#/);
  });

  it('throws on duplicate address', () => {
    addWallet(VALID_ADDRESS, 'Wallet 1');
    expect(() => addWallet(VALID_ADDRESS, 'Wallet 2')).toThrow();
  });

  it('lists all wallets', () => {
    addWallet(VALID_ADDRESS, 'A');
    addWallet('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'B');
    const wallets = listWallets();
    expect(wallets.length).toBe(2);
  });

  it('updates wallet label and color', () => {
    const w = addWallet(VALID_ADDRESS, 'Old Label');
    const updated = updateWallet(w.id, { label: 'New Label', color: '#ff0000' });
    expect(updated?.label).toBe('New Label');
    expect(updated?.color).toBe('#ff0000');
  });

  it('deletes a wallet', () => {
    const w = addWallet(VALID_ADDRESS, 'To Delete');
    const ok = deleteWallet(w.id);
    expect(ok).toBe(true);
    expect(getWallet(w.id)).toBeNull();
  });

  it('returns null for non-existent wallet', () => {
    expect(getWallet(9999)).toBeNull();
  });

  it('finds wallet by address', () => {
    addWallet(VALID_ADDRESS, 'Findable');
    const found = getWalletByAddress(VALID_ADDRESS);
    expect(found).not.toBeNull();
    expect(found?.address).toBe(VALID_ADDRESS);
  });

  it('auto-assigns color cycling', () => {
    const addresses = [
      'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      'So11111111111111111111111111111111111111112',
    ];
    const colors = addresses.map((addr, i) => addWallet(addr, `Wallet ${i}`).color);
    // All should be valid hex colors
    colors.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
    // Should not all be the same
    expect(new Set(colors).size).toBeGreaterThan(1);
  });
});
