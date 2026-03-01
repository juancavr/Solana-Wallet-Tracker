import { NextRequest, NextResponse } from 'next/server';
import { getWallet, updateWallet, deleteWallet } from '@/lib/db/wallets';
import { enqueueJob } from '@/lib/db/sync';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  const wallet = getWallet(id);
  if (!wallet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ wallet });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  const body = await req.json();
  const wallet = updateWallet(id, body);
  if (!wallet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ wallet });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  const ok = deleteWallet(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // POST /api/wallets/:id  → trigger manual sync
  const id = parseInt(params.id, 10);
  const wallet = getWallet(id);
  if (!wallet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const job = enqueueJob(id, 'full');
  return NextResponse.json({ job });
}
