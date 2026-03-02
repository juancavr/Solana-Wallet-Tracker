import { NextRequest, NextResponse } from 'next/server';
import { getTokenAccounts, getAllTokenAccounts, getSolBalance } from '@/lib/db/balances';
import { listWallets } from '@/lib/db/wallets';
import { getWalletIdsInGroup } from '@/lib/db/groups';
import { getPrices, SOL_MINT } from '@/lib/prices/jupiter';
import type { TokenHolding } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletIdParam = searchParams.get('walletId');
    const groupIdParam = searchParams.get('groupId');
    const walletId = walletIdParam ? parseInt(walletIdParam, 10) : null;
    const groupId = groupIdParam ? parseInt(groupIdParam, 10) : null;

    let tokenAccs;
    if (walletId !== null) {
      tokenAccs = getTokenAccounts(walletId);
    } else if (groupId !== null) {
      const walletIds = getWalletIdsInGroup(groupId);
      tokenAccs = walletIds.flatMap((wid) => getTokenAccounts(wid));
    } else {
      tokenAccs = getAllTokenAccounts();
    }

    const mints = [...new Set(tokenAccs.map((t) => t.mint))];
    const prices = await getPrices([SOL_MINT, ...mints]);

    // ── Aggregate SPL/Token-2022 tokens by mint ──────────────────────────────
    const mintMap = new Map<string, {
      symbol: string;
      name: string;
      decimals: number;
      total_ui_amount: number;
      wallets: Set<number>;
    }>();

    for (const ta of tokenAccs) {
      if (!mintMap.has(ta.mint)) {
        mintMap.set(ta.mint, {
          symbol: ta.symbol ?? ta.mint.slice(0, 6),
          name: ta.name ?? 'Unknown',
          decimals: ta.decimals,
          total_ui_amount: 0,
          wallets: new Set(),
        });
      }
      const entry = mintMap.get(ta.mint)!;
      entry.total_ui_amount += ta.ui_amount;
      entry.wallets.add(ta.wallet_id);
      // Prefer non-null symbol/name from any account
      if (ta.symbol) entry.symbol = ta.symbol;
      if (ta.name) entry.name = ta.name;
    }

    const tokens: TokenHolding[] = [];

    for (const [mint, data] of mintMap.entries()) {
      const price = prices.get(mint);
      const price_usd = price?.price_usd ?? 0;
      tokens.push({
        mint,
        symbol: data.symbol,
        name: data.name,
        decimals: data.decimals,
        total_ui_amount: data.total_ui_amount,
        price_usd,
        total_usd: data.total_ui_amount * price_usd,
        change_24h: price?.change_24h ?? 0,
        wallet_count: data.wallets.size,
      });
    }

    // ── Inject SOL as a first-class holding ──────────────────────────────────
    // Collect SOL balance(s) for the requested scope
    const walletsInScope = walletId !== null
      ? [walletId]
      : groupId !== null
      ? getWalletIdsInGroup(groupId)
      : listWallets().map((w) => w.id);

    let totalSol = 0;
    const solWallets = new Set<number>();
    for (const wid of walletsInScope) {
      const bal = getSolBalance(wid);
      if (bal && bal.sol > 0) {
        totalSol += bal.sol;
        solWallets.add(wid);
      }
    }

    if (totalSol > 0) {
      const solPrice = prices.get(SOL_MINT);
      const price_usd = solPrice?.price_usd ?? 0;
      tokens.push({
        mint: SOL_MINT,
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        total_ui_amount: totalSol,
        price_usd,
        total_usd: totalSol * price_usd,
        change_24h: solPrice?.change_24h ?? 0,
        wallet_count: solWallets.size,
      });
    }

    // Sort by USD value desc (SOL typically floats to the top naturally)
    tokens.sort((a, b) => b.total_usd - a.total_usd);

    return NextResponse.json({ tokens });
  } catch (err) {
    console.error('[api/tokens]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
