import { NextRequest, NextResponse } from 'next/server';
import { listWallets } from '@/lib/db/wallets';
import { getSolBalance, getTokenAccounts, getUniqueMints } from '@/lib/db/balances';
import { getPrices, SOL_MINT } from '@/lib/prices/jupiter';
import { getPortfolioHistory } from '@/lib/db/portfolio';
import { getWalletIdsInGroup } from '@/lib/db/groups';
import type { WalletWithBalance, PortfolioOverview } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletId = searchParams.get('walletId');
    const groupId = searchParams.get('groupId');
    const view = searchParams.get('view') ?? 'overview';

    const wallets = listWallets();
    if (wallets.length === 0) {
      return NextResponse.json({
        total_usd: 0,
        sol_usd: 0,
        tokens_usd: 0,
        wallet_count: 0,
        token_count: 0,
        change_24h_pct: null,
        wallets: [],
      } satisfies PortfolioOverview);
    }

    // Fetch all prices
    const mints = getUniqueMints();
    const prices = await getPrices(mints);
    const solPrice = prices.get(SOL_MINT)?.price_usd ?? 0;

    // Filter wallets by walletId or groupId
    let filteredWallets = wallets;
    if (walletId) {
      filteredWallets = wallets.filter((w) => w.id === parseInt(walletId, 10));
    } else if (groupId) {
      const groupWalletIds = new Set(getWalletIdsInGroup(parseInt(groupId, 10)));
      filteredWallets = wallets.filter((w) => groupWalletIds.has(w.id));
    }

    // Build per-wallet data
    const walletsWithBalances: WalletWithBalance[] = [];

    for (const w of filteredWallets) {
      const solBal = getSolBalance(w.id);
      const sol = solBal?.sol ?? 0;
      const sol_usd = sol * solPrice;

      const tokenAccs = getTokenAccounts(w.id);
      let tokens_usd = 0;
      for (const ta of tokenAccs) {
        tokens_usd += ta.ui_amount * (prices.get(ta.mint)?.price_usd ?? 0);
      }

      walletsWithBalances.push({
        ...w,
        sol,
        sol_usd,
        tokens_usd,
        total_usd: sol_usd + tokens_usd,
        token_count: tokenAccs.length,
      });
    }

    if (view === 'history') {
      const days = parseInt(searchParams.get('days') ?? '30', 10);
      if (walletId) {
        const history = getPortfolioHistory(parseInt(walletId, 10), days);
        return NextResponse.json({ history });
      }
      // For group or all: aggregate history (null = all wallets)
      const history = getPortfolioHistory(null, days);
      return NextResponse.json({ history });
    }

    const total_usd = walletsWithBalances.reduce((s, w) => s + w.total_usd, 0);
    const sol_usd = walletsWithBalances.reduce((s, w) => s + w.sol_usd, 0);
    const tokens_usd = walletsWithBalances.reduce((s, w) => s + w.tokens_usd, 0);

    const overview: PortfolioOverview = {
      total_usd,
      sol_usd,
      tokens_usd,
      wallet_count: filteredWallets.length,
      token_count: new Set(mints).size,
      change_24h_pct: null,
      wallets: walletsWithBalances,
    };

    return NextResponse.json(overview);
  } catch (err) {
    console.error('[api/portfolio]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
