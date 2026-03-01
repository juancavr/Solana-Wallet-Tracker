import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { upsertPrice, upsertPricesBatch, getCachedPrice, getCachedPrices } from '@/lib/db/prices';
import type { PriceCache } from '@/types';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function makePrice(mint: string, price: number, ago = 0): PriceCache {
  return {
    mint,
    symbol: mint === SOL_MINT ? 'SOL' : 'USDC',
    name: null,
    price_usd: price,
    change_24h: 1.5,
    market_cap: null,
    last_fetched: Date.now() - ago,
  };
}

describe('price cache', () => {
  it('stores and retrieves a price', () => {
    upsertPrice(makePrice(SOL_MINT, 150.0));
    const cached = getCachedPrice(SOL_MINT);
    expect(cached).not.toBeNull();
    expect(cached?.price_usd).toBeCloseTo(150.0, 2);
    expect(cached?.symbol).toBe('SOL');
  });

  it('returns null for unknown mint', () => {
    expect(getCachedPrice('unknownmint')).toBeNull();
  });

  it('returns null for stale price (>5 min)', () => {
    upsertPrice(makePrice(SOL_MINT, 150.0, 6 * 60 * 1000)); // 6 min ago
    expect(getCachedPrice(SOL_MINT)).toBeNull();
  });

  it('returns fresh price within TTL', () => {
    upsertPrice(makePrice(SOL_MINT, 155.0, 2 * 60 * 1000)); // 2 min ago
    const cached = getCachedPrice(SOL_MINT);
    expect(cached?.price_usd).toBeCloseTo(155.0, 2);
  });

  it('upserts batch of prices', () => {
    const batch = [makePrice(SOL_MINT, 160), makePrice(USDC_MINT, 1.0)];
    upsertPricesBatch(batch);
    const map = getCachedPrices([SOL_MINT, USDC_MINT]);
    expect(map.size).toBe(2);
    expect(map.get(SOL_MINT)?.price_usd).toBeCloseTo(160, 2);
    expect(map.get(USDC_MINT)?.price_usd).toBeCloseTo(1.0, 4);
  });

  it('updates price on re-upsert', () => {
    upsertPrice(makePrice(SOL_MINT, 140.0));
    upsertPrice(makePrice(SOL_MINT, 175.0));
    expect(getCachedPrice(SOL_MINT)?.price_usd).toBeCloseTo(175.0, 2);
  });

  it('excludes stale entries from batch get', () => {
    upsertPrice(makePrice(SOL_MINT, 160, 0));
    upsertPrice(makePrice(USDC_MINT, 1.0, 10 * 60 * 1000)); // stale
    const map = getCachedPrices([SOL_MINT, USDC_MINT]);
    expect(map.has(SOL_MINT)).toBe(true);
    expect(map.has(USDC_MINT)).toBe(false);
  });
});
