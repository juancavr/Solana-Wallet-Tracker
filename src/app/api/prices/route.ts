import { NextRequest, NextResponse } from 'next/server';
import { getPrices, SOL_MINT } from '@/lib/prices/jupiter';
import { getUniqueMints } from '@/lib/db/balances';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mintsParam = searchParams.get('mints');
    const mints = mintsParam
      ? mintsParam.split(',').map((m) => m.trim()).filter(Boolean)
      : [SOL_MINT, ...getUniqueMints()];

    const priceMap = await getPrices(mints);
    const prices = Object.fromEntries(priceMap.entries());

    return NextResponse.json({ prices, count: priceMap.size });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
