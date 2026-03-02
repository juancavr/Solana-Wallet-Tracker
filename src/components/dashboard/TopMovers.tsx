'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUSD, formatPct, cn } from '@/lib/utils';
import type { TokenHolding } from '@/types';

interface Props { groupId?: number | null; }

export function TopMovers({ groupId }: Props) {
  const url = groupId ? `/api/tokens?groupId=${groupId}` : '/api/tokens';
  const { data, isLoading } = useQuery<{ tokens: TokenHolding[] }>({
    queryKey: ['tokens', null, groupId],
    queryFn: () => fetch(url).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const tokens = (data?.tokens ?? []).filter(
    (t) => t.change_24h !== null && t.change_24h !== 0 && t.total_usd > 0
  );

  const gainers = [...tokens].sort((a, b) => (b.change_24h ?? 0) - (a.change_24h ?? 0)).slice(0, 5);
  const losers = [...tokens].sort((a, b) => (a.change_24h ?? 0) - (b.change_24h ?? 0)).slice(0, 5);

  const MoverItem = ({ t, positive }: { t: TokenHolding; positive: boolean }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold',
          positive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400')}>
          {t.symbol.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-xs font-medium">{t.symbol}</div>
          <div className="text-[10px] text-muted-foreground">{formatUSD(t.price_usd)}</div>
        </div>
      </div>
      <div className={cn('flex items-center gap-1 text-xs font-mono', positive ? 'text-green-400' : 'text-red-400')}>
        {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {formatPct(t.change_24h)}
      </div>
    </div>
  );

  if (isLoading) return null;
  if (tokens.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-foreground">Top Movers</CardTitle></CardHeader>
        <CardContent className="text-center text-muted-foreground text-sm py-6">
          Price data needed. Sync wallets first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-green-400 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Top Gainers (24h)
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 pt-0">
          {gainers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No data</p>
          ) : gainers.map((t) => <MoverItem key={t.mint} t={t} positive />)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-red-400 flex items-center gap-1">
            <TrendingDown className="w-4 h-4" /> Top Losers (24h)
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 pt-0">
          {losers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No data</p>
          ) : losers.map((t) => <MoverItem key={t.mint} t={t} positive={false} />)}
        </CardContent>
      </Card>
    </div>
  );
}
