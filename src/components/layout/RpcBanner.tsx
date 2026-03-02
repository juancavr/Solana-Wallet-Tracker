'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, ExternalLink, Zap } from 'lucide-react';

const RPC_LABEL = process.env.NEXT_PUBLIC_RPC_LABEL ?? '';
const IS_PREMIUM = RPC_LABEL.length > 0 && RPC_LABEL !== 'Public RPC';

export function RpcBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!IS_PREMIUM) {
      setDismissed(!!localStorage.getItem('rpc-banner-dismissed'));
    }
  }, []);

  useEffect(() => {
    if (IS_PREMIUM && !dismissed) {
      const t = setTimeout(() => setDismissed(true), 5_000);
      return () => clearTimeout(t);
    }
  }, [dismissed]);

  const dismiss = () => {
    if (!IS_PREMIUM) {
      localStorage.setItem('rpc-banner-dismissed', '1');
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  // ── Premium / Helius connected ──────────────────────────────────────────────
  if (IS_PREMIUM) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20 text-green-400 text-xs">
        <Zap className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1">
          <strong>{RPC_LABEL}</strong> RPC connected — enhanced DAS sync active
          (SOL + token metadata + prices in a single call).
        </span>
        <button onClick={dismiss} className="flex-shrink-0 hover:text-green-300 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ── Public RPC warning ──────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-400 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1">
        <strong>Using the public Solana RPC</strong> — rate-limited (429 errors) with many
        tokens or wallets. Set{' '}
        <code className="bg-yellow-500/10 px-1 rounded font-mono">SOLANA_RPC_URL</code> in{' '}
        <code className="bg-yellow-500/10 px-1 rounded font-mono">.env.local</code> to a free{' '}
        <a
          href="https://dev.helius.xyz/dashboard/app"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-yellow-300 inline-flex items-center gap-0.5"
        >
          Helius <ExternalLink className="w-2.5 h-2.5" />
        </a>{' '}
        or{' '}
        <a
          href="https://www.quicknode.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-yellow-300 inline-flex items-center gap-0.5"
        >
          QuickNode <ExternalLink className="w-2.5 h-2.5" />
        </a>{' '}
        endpoint (both have free tiers).
      </span>
      <button
        onClick={dismiss}
        className="flex-shrink-0 hover:text-yellow-300 transition-colors"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
