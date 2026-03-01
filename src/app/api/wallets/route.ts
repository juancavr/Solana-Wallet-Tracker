import { NextRequest, NextResponse } from 'next/server';
import { listWallets, addWallet } from '@/lib/db/wallets';
import { enqueueJob } from '@/lib/db/sync';
import { PublicKey } from '@solana/web3.js';

export async function GET() {
  try {
    const wallets = listWallets();
    return NextResponse.json({ wallets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, label, color } = body as {
      address: string;
      label?: string;
      color?: string;
    };

    if (!address) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 });
    }

    // Validate Solana public key
    try {
      new PublicKey(address.trim());
    } catch {
      return NextResponse.json({ error: 'Invalid Solana address' }, { status: 400 });
    }

    const wallet = addWallet(address, label ?? '', color);
    // Trigger immediate sync
    enqueueJob(wallet.id, 'full');

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err: unknown) {
    const msg = String(err);
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Wallet already tracked' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
