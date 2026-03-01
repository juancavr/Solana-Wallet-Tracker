import { NextRequest, NextResponse } from 'next/server';
import { listWallets } from '@/lib/db/wallets';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') ?? 'json';

    const wallets = listWallets();

    if (format === 'csv') {
      const header = 'address,label,color,created_at\n';
      const rows = wallets
        .map(
          (w) =>
            `"${w.address}","${w.label.replace(/"/g, '""')}","${w.color}",${w.created_at}`
        )
        .join('\n');
      const csv = header + rows;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="wallets.csv"',
        },
      });
    }

    // JSON export
    const json = JSON.stringify(
      wallets.map((w) => ({
        address: w.address,
        label: w.label,
        color: w.color,
      })),
      null,
      2
    );
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="wallets.json"',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
