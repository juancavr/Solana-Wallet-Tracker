'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Wallet, Coins, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatUSD, formatPct, cn } from '@/lib/utils';
import type { PortfolioOverview } from '@/types';
import { toast } from 'sonner';

interface Props { walletId?: number | null; }

export function OverviewCards({ walletId }: Props) {
  const qc = useQueryClient();
  const url = walletId ? `/api/portfolio?walletId=${walletId}` : '/api/portfolio';

  const { data, isLoading, error } = useQuery<PortfolioOverview>({
    queryKey: ['portfolio', walletId],
    queryFn: () => fetch(url).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const syncMut = useMutation({
    mutationFn: () =>
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(walletId ? { walletId, type: 'full' } : { all: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast.success('Sync queued');
      setTimeout(() => qc.invalidateQueries(), 8000);
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader><CardTitle className="h-3 bg-muted rounded w-24" /></CardHeader>
            <CardContent><div className="h-8 bg-muted rounded w-32" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">
        Failed to load portfolio data. <button className="text-primary hover:underline" onClick={() => qc.invalidateQueries()}>Retry</button>
      </Card>
    );
  }

  const change = data.change_24h_pct;
  const isPos = (change ?? 0) >= 0;

  const cards = [
    {
      label: 'Total Portfolio',
      value: formatUSD(data.total_usd),
      sub: change !== null ? (
        <span className={cn('flex items-center gap-1 text-xs', isPos ? 'text-green-400' : 'text-red-400')}>
          {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {formatPct(change)} 24h
        </span>
      ) : null,
      icon: <TrendingUp className="w-4 h-4 text-primary" />,
    },
    {
      label: 'SOL Value',
      value: formatUSD(data.sol_usd),
      sub: <span className="text-xs text-muted-foreground">{formatPct(null)} of total</span>,
      icon: <Coins className="w-4 h-4 text-yellow-400" />,
    },
    {
      label: 'Token Value',
      value: formatUSD(data.tokens_usd),
      sub: <span className="text-xs text-muted-foreground">{data.token_count} tokens</span>,
      icon: <Coins className="w-4 h-4 text-blue-400" />,
    },
    {
      label: 'Wallets Tracked',
      value: data.wallet_count.toString(),
      sub: <span className="text-xs text-muted-foreground">Across {data.token_count} tokens</span>,
      icon: <Wallet className="w-4 h-4 text-purple-400" />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {walletId ? 'Wallet Overview' : 'Portfolio Overview'}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="text-xs text-muted-foreground"
        >
          <RotateCcw className={cn('w-3 h-3 mr-1', syncMut.isPending && 'animate-spin')} />
          Sync
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {c.label}
                {c.icon}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{c.value}</div>
              {c.sub && <div className="mt-1">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
