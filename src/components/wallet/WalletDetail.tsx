'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2, ExternalLink, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OverviewCards } from '@/components/dashboard/OverviewCards';
import { TokenTable } from '@/components/dashboard/TokenTable';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { PortfolioChart } from '@/components/dashboard/charts/PortfolioChart';
import { AllocationPie } from '@/components/dashboard/charts/AllocationPie';
import type { Wallet, WalletGroup } from '@/types';
import { toast } from 'sonner';

interface Props {
  walletId: number;
  onBack: () => void;
}

export function WalletDetail({ walletId, onBack }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [labelInput, setLabelInput] = useState('');

  const { data: wData } = useQuery<{ wallet: Wallet }>({
    queryKey: ['wallet', walletId],
    queryFn: () => fetch(`/api/wallets/${walletId}`).then((r) => r.json()),
  });
  const wallet = wData?.wallet;

  const { data: groupsData } = useQuery<{ groups: WalletGroup[] }>({
    queryKey: ['groups'],
    queryFn: () => fetch('/api/groups').then((r) => r.json()),
  });
  const groups = groupsData?.groups ?? [];

  const moveToGroupMut = useMutation({
    mutationFn: (groupId: number | null) =>
      fetch(`/api/wallets/${walletId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet', walletId] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      toast.success('Wallet moved');
    },
  });

  const syncMut = useMutation({
    mutationFn: () =>
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId, type: 'full' }),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast.success('Sync started');
      setTimeout(() => qc.invalidateQueries(), 6000);
    },
  });

  const updateMut = useMutation({
    mutationFn: (label: string) =>
      fetch(`/api/wallets/${walletId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet', walletId] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      setEditing(false);
      toast.success('Label updated');
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => fetch(`/api/wallets/${walletId}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => {
      toast.success('Wallet removed');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      onBack();
    },
  });

  if (!wallet) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Wallet header */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: wallet.color }} />
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              className="bg-muted border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') updateMut.mutate(labelInput);
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateMut.mutate(labelInput)}>
              <Check className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <h2 className="text-lg font-semibold">{wallet.label || 'Unnamed Wallet'}</h2>
            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-50 hover:opacity-100"
              onClick={() => { setLabelInput(wallet.label); setEditing(true); }}>
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="text-xs"
          >
            <RotateCcw className={cn('w-3 h-3 mr-1', syncMut.isPending && 'animate-spin')} />
            Sync
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm('Remove this wallet?')) deleteMut.mutate();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <span className="font-mono">{wallet.address}</span>
        <a
          href={`https://solscan.io/account/${wallet.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline flex items-center gap-1"
        >
          Solscan <ExternalLink className="w-3 h-3" />
        </a>
        {groups.length > 0 && (
          <>
            <span className="text-border">|</span>
            <span>Group:</span>
            <select
              className="bg-muted border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              value={wallet.group_id ?? ''}
              onChange={(e) => moveToGroupMut.mutate(e.target.value ? parseInt(e.target.value, 10) : null)}
            >
              <option value="">None</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Dashboard content for this wallet */}
      <OverviewCards walletId={walletId} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2"><PortfolioChart walletId={walletId} /></div>
        <AllocationPie walletId={walletId} />
      </div>

      <TokenTable walletId={walletId} />
      <ActivityFeed walletId={walletId} />
    </div>
  );
}
