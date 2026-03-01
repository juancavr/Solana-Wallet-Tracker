import { upsertPricesBatch, getCachedPrices } from '@/lib/db/prices';
import type { PriceCache } from '@/types';
import { SOL_MINT } from '@/lib/constants';

export { SOL_MINT };

// ─── Jupiter Price API v2 (lite endpoint — free, no API key required) ─────────
// api.jup.ag/price/v2 requires a paid API key (returns 401).
// lite-api.jup.ag/price/v2 is the free/public tier, rate-limited but no auth.
const JUPITER_V2_URL = 'https://lite-api.jup.ag/price/v2';

interface JupiterV2Entry {
  id: string;
  type: string;
  price: string; // NOTE: string in v2, not number
  extraInfo?: {
    lastSwappedPrice?: { lastJupiterSellPrice?: number };
    quotedPrice?: { buyPrice?: string; sellPrice?: string };
  };
}
interface JupiterV2Response {
  data: Record<string, JupiterV2Entry>;
  timeTaken: number;
}

// ─── DexScreener fallback ─────────────────────────────────────────────────────
// Covers virtually all Solana token pairs, free, no API key
// https://api.dexscreener.com/tokens/v1/solana/{mint1},{mint2},...
const DEXSCREENER_URL = 'https://api.dexscreener.com/tokens/v1/solana';
const DEXSCREENER_BATCH = 30; // DexScreener limit per request

interface DexScreenerPair {
  chainId: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
}
interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

// ─── CoinGecko – SOL-only fallback ───────────────────────────────────────────
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchFromJupiterV2(
  mints: string[]
): Promise<Map<string, { price_usd: number; symbol: string; change_24h: number | null }>> {
  const result = new Map<string, { price_usd: number; symbol: string; change_24h: number | null }>();
  const BATCH = 100;

  for (let i = 0; i < mints.length; i += BATCH) {
    const batch = mints.slice(i, i + BATCH);
    try {
      const url = `${JUPITER_V2_URL}?ids=${batch.join(',')}&showExtraInfo=true`;
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        console.warn(`[prices] Jupiter v2 HTTP ${res.status} for batch ${i}`);
        continue;
      }
      const json: JupiterV2Response = await res.json();
      for (const [mint, entry] of Object.entries(json.data ?? {})) {
        const price = parseFloat(entry.price);
        if (!isNaN(price) && price > 0) {
          result.set(mint, { price_usd: price, symbol: '', change_24h: null });
        }
      }
    } catch (err) {
      console.warn('[prices] Jupiter v2 error:', err);
    }
    // Small delay between batches to avoid rate-limiting
    if (i + BATCH < mints.length) await sleep(150);
  }
  return result;
}

async function fetchFromDexScreener(
  mints: string[]
): Promise<Map<string, { price_usd: number; symbol: string; change_24h: number | null }>> {
  const result = new Map<string, { price_usd: number; symbol: string; change_24h: number | null }>();

  for (let i = 0; i < mints.length; i += DEXSCREENER_BATCH) {
    const batch = mints.slice(i, i + DEXSCREENER_BATCH);
    try {
      const url = `${DEXSCREENER_URL}/${batch.join(',')}`;
      const res = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) continue;
      const json: DexScreenerResponse = await res.json();
      const pairs = json.pairs ?? [];

      // Group pairs by base token address; pick the highest-liquidity pair
      const bestPair = new Map<string, DexScreenerPair>();
      for (const pair of pairs) {
        if (!pair.priceUsd) continue;
        // Only use pairs where quoteToken is a stablecoin or SOL (avoid token/token pairs)
        const qtSym = pair.quoteToken.symbol?.toUpperCase() ?? '';
        if (!['USDC', 'USDT', 'SOL', 'WSOL', 'USD'].some((s) => qtSym.includes(s))) continue;
        const addr = pair.baseToken.address;
        const existing = bestPair.get(addr);
        const thisLiq = pair.liquidity?.usd ?? 0;
        const existingLiq = existing?.liquidity?.usd ?? 0;
        if (!existing || thisLiq > existingLiq) {
          bestPair.set(addr, pair);
        }
      }

      for (const [addr, pair] of bestPair.entries()) {
        const price = parseFloat(pair.priceUsd!);
        if (!isNaN(price) && price > 0) {
          result.set(addr, {
            price_usd: price,
            symbol: pair.baseToken.symbol ?? '',
            change_24h: pair.priceChange?.h24 ?? null,
          });
        }
      }
    } catch (err) {
      console.warn('[prices] DexScreener error:', err);
    }
    if (i + DEXSCREENER_BATCH < mints.length) await sleep(200);
  }
  return result;
}

async function fetchSolPriceFromCoinGecko(): Promise<number | null> {
  try {
    const url = `${COINGECKO_URL}?ids=solana&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.solana?.usd as number) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch prices for a list of mints.
 *
 * Strategy (cache-first, multi-source):
 *  1. Return cached prices (< 5 min TTL) immediately
 *  2. For stale/missing: try Jupiter v2
 *  3. For tokens still not found: try DexScreener
 *  4. SOL fallback: CoinGecko
 *
 * Returns a map of mint → PriceCache (only mints with a price are included).
 */
export async function getPrices(mints: string[]): Promise<Map<string, PriceCache>> {
  if (mints.length === 0) return new Map();

  const deduped = [...new Set([...mints, SOL_MINT])];
  const cached = getCachedPrices(deduped);

  const stale = deduped.filter((m) => !cached.has(m));
  if (stale.length === 0) return cached;

  console.log(`[prices] Fetching ${stale.length} stale/missing prices`);

  // ── Step 1: Jupiter v2
  const jupiterResult = await fetchFromJupiterV2(stale);

  // ── Step 2: DexScreener for mints Jupiter didn't price
  const stillMissing = stale.filter((m) => !jupiterResult.has(m));
  let dexResult = new Map<string, { price_usd: number; symbol: string; change_24h: number | null }>();
  if (stillMissing.length > 0) {
    console.log(`[prices] ${stillMissing.length} tokens not found in Jupiter → trying DexScreener`);
    dexResult = await fetchFromDexScreener(stillMissing);
    console.log(`[prices] DexScreener found ${dexResult.size}/${stillMissing.length}`);
  }

  // ── Step 3: CoinGecko for SOL if still missing
  if (!jupiterResult.has(SOL_MINT) && !dexResult.has(SOL_MINT)) {
    const solPrice = await fetchSolPriceFromCoinGecko();
    if (solPrice) {
      jupiterResult.set(SOL_MINT, { price_usd: solPrice, symbol: 'SOL', change_24h: null });
    }
  }

  // ── Merge results & persist to cache
  const now = Date.now();
  const toStore: PriceCache[] = [];

  for (const mint of stale) {
    const data = jupiterResult.get(mint) ?? dexResult.get(mint);
    if (!data) continue;
    const entry: PriceCache = {
      mint,
      symbol: data.symbol || null,
      name: null,
      price_usd: data.price_usd,
      change_24h: data.change_24h ?? null,
      market_cap: null,
      last_fetched: now,
    };
    toStore.push(entry);
    cached.set(mint, entry);
  }

  if (toStore.length > 0) {
    upsertPricesBatch(toStore);
    const notFound = stale.length - toStore.length;
    if (notFound > 0) {
      console.log(`[prices] ${notFound} tokens have no price data (illiquid/unknown)`);
    }
  }

  return cached;
}
