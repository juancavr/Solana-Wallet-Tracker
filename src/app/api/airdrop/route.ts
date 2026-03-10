import { NextRequest, NextResponse } from 'next/server';
import { getAirdropSummary } from '@/lib/db/transactions';
import { getWalletIdsInGroup } from '@/lib/db/groups';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletIdParam = searchParams.get('walletId');
    const groupIdParam  = searchParams.get('groupId');

    let walletIds: number[] | undefined;
    if (walletIdParam) {
      walletIds = [parseInt(walletIdParam, 10)];
    } else if (groupIdParam) {
      walletIds = getWalletIdsInGroup(parseInt(groupIdParam, 10));
    }

    const rows = getAirdropSummary(walletIds);

    const totals = {
      cashback_sol:    rows.reduce((s, r) => s + r.cashback_sol,    0),
      creator_fee_sol: rows.reduce((s, r) => s + r.creator_fee_sol, 0),
      total_sol:       rows.reduce((s, r) => s + r.total_sol,       0),
    };

    return NextResponse.json({ wallets: rows, totals });
  } catch (err) {
    console.error('[api/airdrop]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
