'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatUSD, cn } from '@/lib/utils';
import type { PortfolioSnapshot } from '@/types';

interface Props { walletId?: number | null; }

const RANGES = [
  { label: '7D',  days: 7  },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const DAY_MS = 86_400_000;

function formatAxisDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TooltipPayloadEntry {
  dataKey: string;
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
}

/**
 * Build a complete daily grid for the selected range.
 * Days with a real snapshot get the actual value.
 * Days without a snapshot carry the nearest known value forward
 * (and backward for leading empty days, using the first real data point).
 */
function buildChartGrid(
  history: PortfolioSnapshot[],
  days: number,
): { ts: number; total: number; sol: number; tokens: number }[] {
  const now    = Date.now();
  const today  = Math.floor(now    / DAY_MS) * DAY_MS;
  const start  = Math.floor((now - days * DAY_MS) / DAY_MS) * DAY_MS;

  // Map real data points to their calendar-day bucket
  const actual = new Map<number, { total: number; sol: number; tokens: number }>();
  for (const s of history) {
    const bucket = Math.floor(s.snapped_at / DAY_MS) * DAY_MS;
    actual.set(bucket, { total: s.total_usd, sol: s.sol_usd, tokens: s.tokens_usd });
  }

  // Find the first known value (used to carry-back for leading empty days)
  let seed: { total: number; sol: number; tokens: number } | null = null;
  for (let t = start; t <= today; t += DAY_MS) {
    if (actual.has(t)) { seed = actual.get(t)!; break; }
  }
  if (!seed && history.length > 0) {
    seed = { total: history[0].total_usd, sol: history[0].sol_usd, tokens: history[0].tokens_usd };
  }

  // Walk the grid left → right, carrying the last known value forward
  let last = seed;
  const grid: { ts: number; total: number; sol: number; tokens: number }[] = [];
  for (let t = start; t <= today; t += DAY_MS) {
    if (actual.has(t)) last = actual.get(t)!;
    grid.push({ ts: t, ...(last ?? { total: 0, sol: 0, tokens: 0 }) });
  }
  return grid;
}

export function PortfolioChart({ walletId }: Props) {
  const [days, setDays] = useState(30);

  const url = walletId
    ? `/api/portfolio?view=history&walletId=${walletId}&days=${days}`
    : `/api/portfolio?view=history&days=${days}`;

  const { data, isLoading } = useQuery<{ history: PortfolioSnapshot[] }>({
    queryKey: ['portfolio-history', walletId, days],
    queryFn: () => fetch(url).then((r) => r.json()),
    refetchInterval: 120_000,
  });

  const history  = data?.history ?? [];
  const chartData = buildChartGrid(history, days);

  // "Collecting history" notice when we have real data for fewer than half the window
  const realDays = history.length;
  const isLimitedHistory = realDays > 0 && realDays < Math.ceil(days / 2);

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    const date = label !== undefined ? formatAxisDate(label) : '';
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs">
        <p className="text-muted-foreground mb-1">{date}</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {formatUSD(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">Portfolio Value</CardTitle>
            {isLimitedHistory && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Tracking since {formatAxisDate(history[0].snapped_at)} · {realDays} of {days} days recorded
              </p>
            )}
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r.label}
                variant={days === r.days ? 'default' : 'ghost'}
                size="sm"
                className={cn('h-6 px-2 text-xs', days !== r.days && 'text-muted-foreground')}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : history.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
            <p>No data yet.</p>
            <p className="text-xs">Sync a wallet to start tracking.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215,28%,17%)" />
              <XAxis
                dataKey="ts"
                tickFormatter={formatAxisDate}
                tick={{ fontSize: 10, fill: 'hsl(215,20%,60%)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v) => formatUSD(v, true)}
                tick={{ fontSize: 10, fill: 'hsl(215,20%,60%)' }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#totalGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
