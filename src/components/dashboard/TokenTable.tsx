'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUSD, formatNumber, formatPct, cn } from '@/lib/utils';
import { SOL_MINT } from '@/lib/constants';
import type { TokenHolding } from '@/types';

interface Props { walletId?: number | null; groupId?: number | null; }

type SortKey = 'total_usd' | 'price_usd' | 'total_ui_amount' | 'change_24h';
type Filter = 'all' | 'priced' | 'unpriced';

export function TokenTable({ walletId, groupId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('total_usd');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const url = walletId
    ? `/api/tokens?walletId=${walletId}`
    : groupId
    ? `/api/tokens?groupId=${groupId}`
    : '/api/tokens';
  const { data, isLoading } = useQuery<{ tokens: TokenHolding[] }>({
    queryKey: ['tokens', walletId, groupId],
    queryFn: () => fetch(url).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
      : <ArrowUpDown className="w-3 h-3 opacity-40" />;

  const allTokens = data?.tokens ?? [];
  const pricedCount = allTokens.filter((t) => t.price_usd > 0).length;
  const unpricedCount = allTokens.filter((t) => t.price_usd === 0).length;
  const pricedValue = allTokens.reduce((s, t) => s + t.total_usd, 0);

  const tokens = allTokens
    .filter((t) => {
      if (filter === 'priced' && t.price_usd === 0) return false;
      if (filter === 'unpriced' && t.price_usd > 0) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.mint.includes(q);
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-foreground">Token Holdings</CardTitle>
            {allTokens.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({allTokens.length} tokens · {formatUSD(pricedValue, true)} priced)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Filter tabs */}
            <div className="flex rounded-md overflow-hidden border border-border text-xs">
              {(['all', 'priced', 'unpriced'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-2.5 py-1 capitalize transition-colors',
                    filter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {f === 'all' ? `All (${allTokens.length})`
                    : f === 'priced' ? `Priced (${pricedCount})`
                    : `No price (${unpricedCount})`}
                </button>
              ))}
            </div>
            <input
              className="bg-muted border border-border rounded-md px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Unpriced warning banner */}
        {unpricedCount > 0 && filter !== 'priced' && (
          <div className="flex items-start gap-2 mt-2 p-2.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <strong>{unpricedCount} token{unpricedCount > 1 ? 's' : ''}</strong> have no price data
              (not found on Jupiter or DexScreener — typically illiquid, spam, or very new tokens).
              Their balance is shown but excluded from USD totals.
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : tokens.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {search || filter !== 'all'
              ? 'No tokens match your filter'
              : 'No token holdings yet. Add wallets and sync.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium text-xs">Token</th>
                  <th
                    className="text-right px-4 py-2 font-medium text-xs cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('price_usd')}
                  >
                    <span className="flex items-center justify-end gap-1">Price <SortIcon k="price_usd" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2 font-medium text-xs cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('change_24h')}
                  >
                    <span className="flex items-center justify-end gap-1">24h <SortIcon k="change_24h" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2 font-medium text-xs cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('total_ui_amount')}
                  >
                    <span className="flex items-center justify-end gap-1">Balance <SortIcon k="total_ui_amount" /></span>
                  </th>
                  <th
                    className="text-right px-4 py-2 font-medium text-xs cursor-pointer hover:text-foreground"
                    onClick={() => handleSort('total_usd')}
                  >
                    <span className="flex items-center justify-end gap-1">Value <SortIcon k="total_usd" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const ch = t.change_24h ?? 0;
                  const hasPrice = t.price_usd > 0;
                  return (
                    <tr
                      key={t.mint}
                      className={cn(
                        'border-b border-border/50 hover:bg-muted/50 transition-colors',
                        !hasPrice && t.mint !== SOL_MINT && 'opacity-60',
                        t.mint === SOL_MINT && 'bg-purple-500/5'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {t.mint === SOL_MINT ? (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-gradient-to-br from-purple-500/30 to-indigo-500/30 text-purple-300 ring-1 ring-purple-500/30">
                              ◎
                            </div>
                          ) : (
                            <div className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold',
                              hasPrice ? 'bg-muted text-muted-foreground' : 'bg-yellow-500/10 text-yellow-500/70'
                            )}>
                              {t.symbol.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className={cn(
                              'font-medium text-xs flex items-center gap-1',
                              t.mint === SOL_MINT && 'text-purple-300'
                            )}>
                              {t.symbol}
                              {!hasPrice && (
                                <AlertTriangle className="w-2.5 h-2.5 text-yellow-500/70" />
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {t.mint === SOL_MINT ? 'native · Solana' : `${t.mint.slice(0, 8)}…`}
                            </div>
                          </div>
                          {t.wallet_count > 1 && (
                            <Badge variant="secondary" className="text-[10px]">{t.wallet_count}w</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {hasPrice ? formatUSD(t.price_usd) : (
                          <a
                            href={`https://birdeye.so/token/${t.mint}?chain=solana`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-yellow-500/70 hover:text-yellow-400 text-[10px]"
                            title="No price — view on Birdeye"
                          >
                            No price <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>
                      <td className={cn(
                        'px-4 py-3 text-right text-xs font-mono',
                        ch > 0 ? 'text-green-400' : ch < 0 ? 'text-red-400' : 'text-muted-foreground'
                      )}>
                        {hasPrice && ch !== 0 ? formatPct(ch) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {formatNumber(t.total_ui_amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-medium">
                        {hasPrice ? formatUSD(t.total_usd) : (
                          <span className="text-muted-foreground text-[10px]">unknown</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
