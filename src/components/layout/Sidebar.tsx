'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, Plus, RotateCcw, Download, Upload,
  ChevronRight, LayoutDashboard, Activity, Coins, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, shortenAddress, formatUSD } from '@/lib/utils';
import { AddWalletModal } from '@/components/wallet/AddWalletModal';
import { ImportModal } from '@/components/wallet/ImportModal';
import type { WalletWithBalance, PortfolioOverview } from '@/types';
import { toast } from 'sonner';

interface SidebarProps {
  selectedWalletId: number | null;
  onSelectWallet: (id: number | null) => void;
  activeView: string;
  onChangeView: (view: string) => void;
}

const navItems = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { id: 'tokens', icon: Coins, label: 'Holdings' },
  { id: 'activity', icon: Activity, label: 'Activity' },
  { id: 'movers', icon: TrendingUp, label: 'Top Movers' },
];

export function Sidebar({ selectedWalletId, onSelectWallet, activeView, onChangeView }: SidebarProps) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data: portfolio } = useQuery<PortfolioOverview>({
    queryKey: ['portfolio'],
    queryFn: () => fetch('/api/portfolio').then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const syncAll = useMutation({
    mutationFn: () =>
      fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).then((r) => r.json()),
    onSuccess: () => {
      toast.success('Sync started for all wallets');
      setTimeout(() => qc.invalidateQueries(), 5000);
    },
  });

  const wallets: WalletWithBalance[] = portfolio?.wallets ?? [];

  const handleExport = async (format: 'json' | 'csv') => {
    const res = await fetch(`/api/export?format=${format}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  return (
    <div className="flex flex-col h-full w-60 bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Coins className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-sm">CoinStat Sol</span>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">SOL</Badge>
      </div>

      {/* Nav */}
      <div className="px-2 py-3 border-b border-border">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { onSelectWallet(null); onChangeView(item.id); }}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors',
              activeView === item.id && !selectedWalletId
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Wallets header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Wallets ({wallets.length})
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
            title="Sync all"
          >
            <RotateCcw className={cn('w-3 h-3', syncAll.isPending && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setAddOpen(true)}
            title="Add wallet"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Wallet list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {wallets.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No wallets yet</p>
            <button
              className="mt-1 text-primary hover:underline"
              onClick={() => setAddOpen(true)}
            >
              Add your first wallet
            </button>
          </div>
        )}
        {wallets.map((w) => (
          <button
            key={w.id}
            onClick={() => { onSelectWallet(w.id); onChangeView('overview'); }}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 rounded-md text-left transition-colors',
              selectedWalletId === w.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: w.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate text-foreground">
                {w.label || shortenAddress(w.address)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {formatUSD(w.total_usd, true)}
              </div>
            </div>
            <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
          </button>
        ))}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border p-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground h-8 text-xs"
          onClick={() => setImportOpen(true)}
        >
          <Upload className="w-3 h-3 mr-2" /> Import wallets
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground h-8 text-xs"
          onClick={() => handleExport('json')}
        >
          <Download className="w-3 h-3 mr-2" /> Export JSON
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground h-8 text-xs"
          onClick={() => handleExport('csv')}
        >
          <Download className="w-3 h-3 mr-2" /> Export CSV
        </Button>
      </div>

      <AddWalletModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
