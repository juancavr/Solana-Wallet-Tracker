import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const sig = req.nextUrl.searchParams.get('sig');
  if (!sig) return NextResponse.json({ error: 'Missing ?sig=' }, { status: 400 });

  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'HELIUS_API_KEY not set' }, { status: 500 });

  const res = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: [sig] }),
  });

  const raw = await res.json();
  return NextResponse.json(raw);
}
