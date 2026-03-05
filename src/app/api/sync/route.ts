import { NextRequest, NextResponse } from 'next/server';
import { enqueueJob, listJobs, countPendingJobs, clearPendingJobs } from '@/lib/db/sync';
import { listWallets, getWallet } from '@/lib/db/wallets';
import { processNextJob } from '@/lib/sync/engine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const walletId = searchParams.get('walletId');
    const jobs = walletId ? listJobs(parseInt(walletId, 10)) : listJobs();
    const pending = countPendingJobs();
    return NextResponse.json({ jobs, pending });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const cleared = clearPendingJobs();
    return NextResponse.json({ cleared });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { walletId, type = 'full', all = false } = body as {
      walletId?: number;
      type?: 'full' | 'balances' | 'transactions';
      all?: boolean;
    };

    const jobs = [];

    if (all) {
      const wallets = listWallets();
      for (const w of wallets) {
        jobs.push(enqueueJob(w.id, type));
      }
    } else if (walletId) {
      const wallet = getWallet(walletId);
      if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
      jobs.push(enqueueJob(walletId, type));
    } else {
      return NextResponse.json({ error: 'walletId or all=true required' }, { status: 400 });
    }

    // Immediately process one job (fire-and-forget, don't await fully)
    processNextJob().catch(console.error);

    return NextResponse.json({ jobs, queued: jobs.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
