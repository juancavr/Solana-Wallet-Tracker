'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Wallet, Plus, RotateCcw, Download, Upload,
  ChevronRight, ChevronDown, LayoutDashboard, Activity, Coins,
  FolderPlus, MoreHorizontal, Pencil, Trash2, Layers, Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, shortenAddress, formatUSD } from '@/lib/utils';
import { AddWalletModal } from '@/components/wallet/AddWalletModal';
import { ImportModal } from '@/components/wallet/ImportModal';
import type { WalletWithBalance, PortfolioOverview, WalletGroup } from '@/types';
import { toast } from 'sonner';

interface SidebarProps {
  selectedWalletId: number | null;
  onSelectWallet: (id: number | null) => void;
  selectedGroupId: number | null;
  onSelectGroup: (id: number | null) => void;
  activeView: string;
  onChangeView: (view: string) => void;
}

const navItems = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { id: 'tokens', icon: Coins, label: 'Holdings' },
  { id: 'activity', icon: Activity, label: 'Activity' },
];

const GROUP_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#22c55e', '#06b6d4', '#f59e0b', '#ef4444',
];

// ─── Wallet list item (reused in groups and ungrouped) ───────────────────────

function WalletItem({
  w, selected, onSelect,
}: {
  w: WalletWithBalance;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-left transition-colors',
        selected
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
  );
}

// ─── Create Group Dialog ─────────────────────────────────────────────────────

function CreateGroupDialog({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState(GROUP_COLORS[0]);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group created');
      setName('');
      onClose();
    },
    onError: (err) => toast.error(String(err.message)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FolderPlus className="w-4 h-4 text-primary" />
            Create Wallet Group
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Group Name *</label>
            <input
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. DeFi Wallets"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
            <div className="flex gap-2">
              {GROUP_COLORS.map((c) => (
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
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={create.isPending || !name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rename Group Dialog ─────────────────────────────────────────────────────

function RenameGroupDialog({
  group, open, onClose,
}: {
  group: WalletGroup;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);

  const rename = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group renamed');
      onClose();
    },
    onError: (err) => toast.error(String(err.message)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-sm">Rename Group</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) rename.mutate(); }}
          className="space-y-4"
        >
          <input
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={rename.isPending || !name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Group Context Menu ──────────────────────────────────────────────────────

function GroupMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[140px] bg-card border border-border rounded-md p-1 shadow-xl z-50"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted outline-none"
            onSelect={onRename}
          >
            <Pencil className="w-3 h-3" /> Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted text-red-400 outline-none"
            onSelect={onDelete}
          >
            <Trash2 className="w-3 h-3" /> Delete group
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Main Sidebar ────────────────────────────────────────────────────────────

export function Sidebar({
  selectedWalletId, onSelectWallet,
  selectedGroupId, onSelectGroup,
  activeView, onChangeView,
}: SidebarProps) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [renameGroup, setRenameGroup] = useState<WalletGroup | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());

  const { data: portfolio } = useQuery<PortfolioOverview>({
    queryKey: ['portfolio'],
    queryFn: () => fetch('/api/portfolio').then((r) => r.json()),
  });

  const { data: groupsData } = useQuery<{ groups: WalletGroup[] }>({
    queryKey: ['groups'],
    queryFn: () => fetch('/api/groups').then((r) => r.json()),
  });

  const groups: WalletGroup[] = groupsData?.groups ?? [];

  const syncAll = useMutation({
    mutationFn: () =>
      fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).then((r) => r.json()),
    onSuccess: () => {
      toast.success('Sync started for all wallets');
      setTimeout(() => qc.invalidateQueries(), 5000);
    },
  });

  const resetQueue = useMutation({
    mutationFn: () => fetch('/api/sync', { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: (data) => toast.success(`Queue cleared (${data.cleared} jobs removed)`),
    onError: () => toast.error('Failed to clear queue'),
  });

  const deleteGroupMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      if (selectedGroupId !== null) onSelectGroup(null);
      toast.success('Group deleted (wallets kept)');
    },
  });

  const wallets: WalletWithBalance[] = portfolio?.wallets ?? [];

  // Organize wallets by group
  const groupedWallets = new Map<number, WalletWithBalance[]>();
  const ungrouped: WalletWithBalance[] = [];
  for (const w of wallets) {
    if (w.group_id) {
      const list = groupedWallets.get(w.group_id) ?? [];
      list.push(w);
      groupedWallets.set(w.group_id, list);
    } else {
      ungrouped.push(w);
    }
  }

  const toggleGroup = (id: number) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const isAllWalletsSelected = selectedWalletId === null && selectedGroupId === null;

  return (
    <div className="flex flex-col h-full w-60 bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Coins className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-sm">Solana Wallet Tracker</span>
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
              activeView === item.id && selectedWalletId === null
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
            onClick={() => setCreateGroupOpen(true)}
            title="New group"
          >
            <FolderPlus className="w-3 h-3" />
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

      {/* Wallet list with groups */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {wallets.length === 0 && groups.length === 0 && (
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

        {/* "All Wallets" button */}
        {(wallets.length > 0 || groups.length > 0) && (
          <button
            onClick={() => { onSelectWallet(null); onSelectGroup(null); }}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-left text-xs transition-colors',
              isAllWalletsSelected
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            All Wallets
            <span className="ml-auto text-[10px] opacity-70">{formatUSD(portfolio?.total_usd ?? 0, true)}</span>
          </button>
        )}

        {/* Groups */}
        {groups.map((group) => {
          const groupWallets = groupedWallets.get(group.id) ?? [];
          const isOpen = openGroups.has(group.id);
          const isGroupSelected = selectedGroupId === group.id && selectedWalletId === null;
          const groupTotal = groupWallets.reduce((s, w) => s + w.total_usd, 0);

          return (
            <Collapsible.Root
              key={group.id}
              open={isOpen}
              onOpenChange={() => toggleGroup(group.id)}
            >
              <div className={cn(
                'flex items-center gap-1 rounded-md transition-colors',
                isGroupSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
              )}>
                {/* Chevron toggle */}
                <Collapsible.Trigger asChild>
                  <button className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0">
                    {isOpen
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </button>
                </Collapsible.Trigger>

                {/* Group name (click to select group filter) */}
                <button
                  className={cn(
                    'flex-1 flex items-center gap-1.5 py-1.5 text-left min-w-0',
                    isGroupSelected ? 'text-primary' : 'text-foreground'
                  )}
                  onClick={() => onSelectGroup(group.id)}
                >
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: group.color }}
                  />
                  <span className="text-xs font-medium truncate">{group.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto mr-1">
                    {groupWallets.length}w · {formatUSD(groupTotal, true)}
                  </span>
                </button>

                {/* Context menu */}
                <GroupMenu
                  onRename={() => setRenameGroup(group)}
                  onDelete={() => deleteGroupMut.mutate(group.id)}
                />
              </div>

              <Collapsible.Content>
                <div className="pl-4 space-y-0.5 mt-0.5">
                  {groupWallets.length === 0 && (
                    <p className="text-[10px] text-muted-foreground px-3 py-1">No wallets in group</p>
                  )}
                  {groupWallets.map((w) => (
                    <WalletItem
                      key={w.id}
                      w={w}
                      selected={selectedWalletId === w.id}
                      onSelect={() => { onSelectWallet(w.id); onChangeView('overview'); }}
                    />
                  ))}
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}

        {/* Ungrouped wallets */}
        {ungrouped.length > 0 && groups.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-3 py-1">
              Ungrouped
            </p>
          </div>
        )}
        {ungrouped.map((w) => (
          <WalletItem
            key={w.id}
            w={w}
            selected={selectedWalletId === w.id}
            onSelect={() => { onSelectWallet(w.id); onChangeView('overview'); }}
          />
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

      {/* Admin utilities */}
      <div className="border-t border-border p-2 space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-1 pb-0.5">
          Admin
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground h-8 text-xs hover:text-orange-400"
          onClick={() => resetQueue.mutate()}
          disabled={resetQueue.isPending}
          title="Delete all pending and running sync jobs from the queue"
        >
          <Wrench className="w-3 h-3 mr-2" /> Reset sync queue
        </Button>
      </div>

      <AddWalletModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <CreateGroupDialog open={createGroupOpen} onClose={() => setCreateGroupOpen(false)} />
      {renameGroup && (
        <RenameGroupDialog
          group={renameGroup}
          open={!!renameGroup}
          onClose={() => setRenameGroup(null)}
        />
      )}
    </div>
  );
}
