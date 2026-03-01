import { getDb } from './index';
import type { PriceCache } from '@/types';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedPrice(mint: string): PriceCache | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM price_cache WHERE mint = ?')
    .get(mint) as PriceCache | undefined;
  if (!row) return null;
  if (Date.now() - row.last_fetched > TTL_MS) return null;
  return row;
}

export function getCachedPrices(mints: string[]): Map<string, PriceCache> {
  if (mints.length === 0) return new Map();
  const db = getDb();
  const placeholders = mints.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM price_cache WHERE mint IN (${placeholders})`)
    .all(...mints) as PriceCache[];
  const now = Date.now();
  const map = new Map<string, PriceCache>();
  for (const row of rows) {
    if (now - row.last_fetched <= TTL_MS) {
      map.set(row.mint, row);
    }
  }
  return map;
}

export function upsertPrice(p: Omit<PriceCache, 'last_fetched'> & { last_fetched?: number }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO price_cache (mint, symbol, name, price_usd, change_24h, market_cap, last_fetched)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mint) DO UPDATE SET
       symbol = excluded.symbol,
       name = excluded.name,
       price_usd = excluded.price_usd,
       change_24h = excluded.change_24h,
       market_cap = excluded.market_cap,
       last_fetched = excluded.last_fetched`
  ).run(
    p.mint,
    p.symbol ?? null,
    p.name ?? null,
    p.price_usd,
    p.change_24h ?? null,
    p.market_cap ?? null,
    p.last_fetched ?? Date.now()
  );
}

export function upsertPricesBatch(prices: PriceCache[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO price_cache (mint, symbol, name, price_usd, change_24h, market_cap, last_fetched)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mint) DO UPDATE SET
       symbol = excluded.symbol,
       name = excluded.name,
       price_usd = excluded.price_usd,
       change_24h = excluded.change_24h,
       market_cap = excluded.market_cap,
       last_fetched = excluded.last_fetched`
  );
  const insertMany = db.transaction((items: PriceCache[]) => {
    for (const p of items) {
      stmt.run(p.mint, p.symbol ?? null, p.name ?? null, p.price_usd, p.change_24h ?? null, p.market_cap ?? null, p.last_fetched);
    }
  });
  insertMany(prices);
}

export function getAllCachedPrices(): Map<string, PriceCache> {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM price_cache').all() as PriceCache[];
  const map = new Map<string, PriceCache>();
  for (const r of rows) map.set(r.mint, r);
  return map;
}
