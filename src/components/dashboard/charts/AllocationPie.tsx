'use client';

import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUSD } from '@/lib/utils';
import type { TokenHolding } from '@/types';

interface Props { walletId?: number | null; groupId?: number | null; }

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f97316','#22c55e','#06b6d4','#f59e0b','#ef4444','#a78bfa','#34d399'];

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color?: string;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

export function AllocationPie({ walletId, groupId }: Props) {
  const url = walletId
    ? `/api/tokens?walletId=${walletId}`
    : groupId
    ? `/api/tokens?groupId=${groupId}`
    : '/api/tokens';
  const { data, isLoading } = useQuery<{ tokens: TokenHolding[] }>({
    queryKey: ['tokens', walletId, groupId],
    queryFn: () => fetch(url).then((r) => r.json()),
  });

  const tokens = data?.tokens ?? [];
  const top = tokens.filter((t) => t.total_usd > 0).slice(0, 9);
  const otherUsd = tokens.slice(9).reduce((s, t) => s + t.total_usd, 0);
  const chartData = [
    ...top.map((t) => ({ name: t.symbol, value: t.total_usd })),
    ...(otherUsd > 0 ? [{ name: 'Other', value: otherUsd }] : []),
  ];

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-xl">
        <p className="font-medium">{payload[0].name}</p>
        <p className="text-muted-foreground">{formatUSD(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
