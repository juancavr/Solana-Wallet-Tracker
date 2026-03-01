import { NextRequest, NextResponse } from 'next/server';
import { addWallet, getWalletByAddress } from '@/lib/db/wallets';
import { enqueueJob } from '@/lib/db/sync';
import { PublicKey } from '@solana/web3.js';

interface WalletImport {
  address: string;
  label?: string;
  color?: string;
}

function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr.trim());
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { wallets: WalletImport[] };

    if (!Array.isArray(body.wallets)) {
      return NextResponse.json({ error: 'Expected { wallets: [...] }' }, { status: 400 });
    }

    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (const item of body.wallets) {
      if (!item.address) {
        results.errors.push('Missing address in entry');
        continue;
      }
      if (!isValidSolanaAddress(item.address)) {
        results.errors.push(`Invalid address: ${item.address}`);
        continue;
      }
      // Skip already tracked
      if (getWalletByAddress(item.address.trim())) {
        results.skipped++;
        continue;
      }
      try {
        const w = addWallet(item.address, item.label ?? '', item.color);
        enqueueJob(w.id, 'full');
        results.imported++;
      } catch (err) {
        results.errors.push(`${item.address}: ${String(err)}`);
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
