import { NextRequest, NextResponse } from 'next/server';
import {
  getAllActivity,
  getWalletActivity,
  countTransactions,
} from '@/lib/db/transactions';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletIdParam = searchParams.get('walletId');
    const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    if (walletIdParam) {
      const wid = parseInt(walletIdParam, 10);
      const transactions = getWalletActivity(wid, limit, offset);
      const total = countTransactions(wid);
      return NextResponse.json({ transactions, total, limit, offset });
    }

    const transactions = getAllActivity(limit, offset);
    const total = countTransactions();
    return NextResponse.json({ transactions, total, limit, offset });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
