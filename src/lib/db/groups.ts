import { getDb } from './index';
import type { WalletGroup } from '@/types';

export function listGroups(): WalletGroup[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM wallet_groups ORDER BY position ASC, created_at ASC')
    .all() as WalletGroup[];
}

export function getGroup(id: number): WalletGroup | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM wallet_groups WHERE id = ?').get(id) as WalletGroup) ?? null;
}

export function createGroup(name: string, color?: string): WalletGroup {
  const db = getDb();
  const now = Date.now();
  const maxPos = (db.prepare('SELECT MAX(position) as m FROM wallet_groups').get() as { m: number | null })?.m ?? -1;
  const result = db
    .prepare('INSERT INTO wallet_groups (name, color, position, created_at) VALUES (?, ?, ?, ?)')
    .run(name.trim(), color ?? '#6366f1', maxPos + 1, now);
  return getGroup(result.lastInsertRowid as number)!;
}

export function updateGroup(
  id: number,
  patch: Partial<Pick<WalletGroup, 'name' | 'color' | 'position'>>
): WalletGroup | null {
  const db = getDb();
  const allowed = ['name', 'color', 'position'] as const;
  const entries = Object.entries(patch).filter(([k]) => (allowed as readonly string[]).includes(k));
  if (entries.length === 0) return getGroup(id);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  db.prepare(`UPDATE wallet_groups SET ${fields} WHERE id = ?`).run(...values, id);
  return getGroup(id);
}

export function deleteGroup(id: number): boolean {
  const db = getDb();
  // Wallets are automatically ungrouped via ON DELETE SET NULL
  const r = db.prepare('DELETE FROM wallet_groups WHERE id = ?').run(id);
  return r.changes > 0;
}

export function getWalletIdsInGroup(groupId: number): number[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT id FROM wallets WHERE group_id = ?')
    .all(groupId) as { id: number }[];
  return rows.map((r) => r.id);
}
