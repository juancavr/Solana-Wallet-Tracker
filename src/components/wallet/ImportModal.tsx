'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function ImportModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const imp = useMutation({
    mutationFn: async () => {
      let parsed: { address: string; label?: string }[];
      const trimmed = text.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const json = JSON.parse(trimmed);
        parsed = Array.isArray(json) ? json : json.wallets ?? [];
      } else {
        // CSV: address,label per line
        parsed = trimmed.split('\n').filter(Boolean).map((line) => {
          const [address, label] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
          return { address, label };
        });
      }
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} wallet(s), skipped ${data.skipped}`);
      if (data.errors?.length > 0) toast.warning(`${data.errors.length} error(s) during import`);
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      setText('');
      onClose();
    },
    onError: (err) => toast.error(String(err.message)),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Import Wallets
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Paste JSON array <code className="bg-muted px-1 rounded">[&#123;&quot;address&quot;:&quot;...&quot;,&quot;label&quot;:&quot;...&quot;&#125;]</code> or CSV <code className="bg-muted px-1 rounded">address,label</code> per line.
          </p>
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-primary hover:underline mb-2">
              <FileText className="w-3 h-3" />
              <span>Or upload a file</span>
              <input type="file" accept=".json,.csv,.txt" className="hidden" onChange={handleFile} />
            </label>
            <textarea
              className="w-full h-36 bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder={'[{"address": "...", "label": "My wallet"}]'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={imp.isPending || !text.trim()} onClick={() => imp.mutate()}>
              {imp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
