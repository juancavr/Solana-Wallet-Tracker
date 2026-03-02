'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { WalletGroup } from '@/types';

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f97316','#22c55e','#06b6d4','#f59e0b','#ef4444'];

interface Props { open: boolean; onClose: () => void; }

export function AddWalletModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [groupId, setGroupId] = useState<number | null>(null);

  const { data: groupsData } = useQuery<{ groups: WalletGroup[] }>({
    queryKey: ['groups'],
    queryFn: () => fetch('/api/groups').then((r) => r.json()),
  });
  const groups = groupsData?.groups ?? [];

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, label, color, groupId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      return json;
    },
    onSuccess: () => {
      toast.success('Wallet added — syncing now…');
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
      setAddress('');
      setLabel('');
      setGroupId(null);
      onClose();
    },
    onError: (err) => toast.error(String(err.message)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    add.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            Add Solana Wallet
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Wallet Address *
            </label>
            <input
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Enter Solana public key…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Label (optional)
            </label>
            <input
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. My main wallet"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: color === c ? 'white' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
          {groups.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Group (optional)</label>
              <select
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={add.isPending || !address.trim()}>
              {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Wallet'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
