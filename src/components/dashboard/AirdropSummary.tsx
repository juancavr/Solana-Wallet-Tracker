'use client';

import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WalletAirdropRow } from '@/lib/db/transactions';

interface AirdropResponse {
  wallets: WalletAirdropRow[];
  totals: {
    cashback_sol:    number;
    creator_fee_sol: number;
    total_sol:       number;
  };
}

interface Props {
  walletId?: number | null;
  groupId?:  number | null;
}

function formatSol(sol: number): string {
  return sol.toFixed(4) + ' SOL';
}

export function AirdropSummary({ walletId, groupId }: Props) {
  const url = walletId
    ? `/api/airdrop?walletId=${walletId}`
    : groupId
    ? `/api/airdrop?groupId=${groupId}`
    : '/api/airdrop';

  const { data, isLoading } = useQuery<AirdropResponse>({
    queryKey: ['airdrop', walletId, groupId],
    queryFn: () => fetch(url).then((r) => r.json()),
  });

  const totals = data?.totals ?? { cashback_sol: 0, creator_fee_sol: 0, total_sol: 0 };
  const wallets = data?.wallets ?? [];

  const summaryCards = [
    {
      label: 'Cashback',
      value: formatSol(totals.cashback_sol),
      color: 'text-blue-400',
    },
    {
      label: 'Creator Fees',
      value: formatSol(totals.creator_fee_sol),
      color: 'text-green-400',
    },
    {
      label: 'Total Airdrop',
      value: formatSol(totals.total_sol),
      color: 'text-yellow-400',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><CardTitle className="h-3 bg-muted rounded w-24" /></CardHeader>
              <CardContent><div className="h-6 bg-muted rounded w-28" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Airdrop Income (pump.fun)
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {summaryCards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                {c.label}
                <Coins className={`w-4 h-4 ${c.color}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold font-mono ${c.color}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-wallet breakdown — only shown when multiple wallets are in scope */}
      {wallets.length > 1 && (
        <Card>
          <CardContent className="pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs uppercase border-b border-border">
                  <th className="text-left pb-2">Wallet</th>
                  <th className="text-right pb-2">Cashback</th>
                  <th className="text-right pb-2">Creator Fees</th>
                  <th className="text-right pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {wallets
                  .sort((a, b) => b.total_sol - a.total_sol)
                  .map((w) => (
                    <tr key={w.wallet_id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-medium">{w.wallet_label}</td>
                      <td className="py-2 text-right font-mono text-blue-400">
                        {w.cashback_sol > 0 ? formatSol(w.cashback_sol) : '—'}
                      </td>
                      <td className="py-2 text-right font-mono text-green-400">
                        {w.creator_fee_sol > 0 ? formatSol(w.creator_fee_sol) : '—'}
                      </td>
                      <td className="py-2 text-right font-mono text-yellow-400 font-semibold">
                        {formatSol(w.total_sol)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
