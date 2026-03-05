'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Repeat2,
  HelpCircle,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SOL_MINT } from '@/lib/constants';
import { shortenAddress, timeAgo, formatNumber, cn } from '@/lib/utils';
import type { ActivityItem, TxDetail, TxNativeTransfer, TxTokenTransfer } from '@/types';

interface Props { walletId?: number | null; groupId?: number | null; }

// ─── Type styles ──────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  transfer: {
    icon:  <ArrowLeftRight className="w-3.5 h-3.5" />,
    color: 'text-blue-400 bg-blue-500/10',
    label: 'Transfer',
  },
  swap: {
    icon:  <Repeat2 className="w-3.5 h-3.5" />,
    color: 'text-purple-400 bg-purple-500/10',
    label: 'Swap',
  },
  nft: {
    icon:  <span className="text-[10px] font-bold">NFT</span>,
    color: 'text-pink-400 bg-pink-500/10',
    label: 'NFT',
  },
  unknown: {
    icon:  <HelpCircle className="w-3.5 h-3.5" />,
    color: 'text-muted-foreground bg-muted',
    label: 'Unknown',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddressPill({ address }: { address: string }) {
  return (
    <a
      href={`https://solscan.io/account/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[10px] text-primary/80 hover:text-primary hover:underline transition-colors"
      title={address}
    >
      {shortenAddress(address, 5)}
    </a>
  );
}

function TokenAmountBadge({
  amount,
  symbol,
  mint,
  signed,
}: {
  amount: number;
  symbol: string;
  mint: string;
  signed?: 'in' | 'out';
}) {
  const isSol = mint === SOL_MINT;
  const sign = signed === 'in' ? '+' : signed === 'out' ? '-' : '';
  const colorClass = signed === 'in'
    ? 'text-green-400'
    : signed === 'out'
    ? 'text-red-400'
    : 'text-foreground';

  return (
    <span className={cn('font-mono text-xs font-medium', colorClass)}>
      {sign}{formatNumber(amount)} {isSol ? '◎ SOL' : symbol || mint.slice(0, 6)}
    </span>
  );
}

// ─── Transfer detail line ─────────────────────────────────────────────────────

function TransferDetail({
  detail,
  walletAddress,
}: {
  detail: TxDetail;
  walletAddress: string;
}) {
  const solTxs = detail.native_transfers.filter((t) => t.amount_sol > 0.000001);
  const tokenTxs = detail.token_transfers.filter((t) => t.amount > 0);

  if (solTxs.length === 0 && tokenTxs.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {solTxs.map((t: TxNativeTransfer, i: number) => {
        const isOut = t.from === walletAddress;
        return (
          <div key={i} className="flex items-center gap-1 flex-wrap">
            <TokenAmountBadge
              amount={t.amount_sol}
              symbol="SOL"
              mint={SOL_MINT}
              signed={isOut ? 'out' : 'in'}
            />
            <span className="text-muted-foreground text-[10px]">
              <AddressPill address={t.from} />
              <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 opacity-50" />
              <AddressPill address={t.to} />
            </span>
          </div>
        );
      })}
      {tokenTxs.map((t: TxTokenTransfer, i: number) => {
        const isOut = t.from === walletAddress;
        return (
          <div key={i} className="flex items-center gap-1 flex-wrap">
            <TokenAmountBadge
              amount={t.amount}
              symbol={t.symbol}
              mint={t.mint}
              signed={isOut ? 'out' : 'in'}
            />
            <span className="text-muted-foreground text-[10px]">
              <AddressPill address={t.from} />
              <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 opacity-50" />
              <AddressPill address={t.to} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Swap detail line ─────────────────────────────────────────────────────────

function SwapDetail({ detail }: { detail: TxDetail }) {
  const swap = detail.swap;

  if (!swap) {
    // Fallback: show token transfers as in/out
    const ins  = detail.token_transfers.slice(0, 1);
    const outs = detail.token_transfers.slice(1, 2);
    if (ins.length === 0) return null;
    return (
      <div className="flex items-center gap-1 flex-wrap mt-0.5">
        {outs[0] && (
          <TokenAmountBadge amount={outs[0].amount} symbol={outs[0].symbol} mint={outs[0].mint} signed="out" />
        )}
        {outs[0] && <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50" />}
        <TokenAmountBadge amount={ins[0].amount} symbol={ins[0].symbol} mint={ins[0].mint} signed="in" />
        {detail.source && (
          <span className="text-muted-foreground text-[10px]">via {detail.source}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      <TokenAmountBadge amount={swap.from_amount} symbol={swap.from_symbol} mint={swap.from_mint} signed="out" />
      <ArrowRight className="w-3 h-3 text-muted-foreground opacity-50 flex-shrink-0" />
      <TokenAmountBadge amount={swap.to_amount} symbol={swap.to_symbol} mint={swap.to_mint} signed="in" />
      {swap.dex && (
        <span className="text-muted-foreground text-[10px] ml-0.5">via {swap.dex}</span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActivityFeed({ walletId, groupId }: Props) {
  const [offset, setOffset] = useState(0);
  const LIMIT = 25;

  const baseUrl = walletId
    ? `/api/transactions?walletId=${walletId}`
    : groupId
    ? `/api/transactions?groupId=${groupId}`
    : '/api/transactions';
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}limit=${LIMIT}&offset=${offset}`;

  const { data, isLoading } = useQuery<{ transactions: ActivityItem[]; total: number }>({
    queryKey: ['transactions', walletId, groupId, offset],
    queryFn: () => fetch(url).then((r) => r.json()),
  });

  const items = data?.transactions ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            Activity Feed
            {total > 0 && (
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                ({total} txns)
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No transactions yet. Sync wallets to fetch activity.
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {items.map((item) => {
                const type = item.type ?? 'unknown';
                const meta = TYPE_META[type] ?? TYPE_META.unknown;
                const detail: TxDetail | null = item.detail ?? null;
                const feeSol = detail?.fee_sol ?? (item.fee ? item.fee / 1e9 : null);

                return (
                  <div
                    key={item.signature}
                    className="px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    {/* ── Row 1: icon + type + status + wallet + time ── */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Type icon bubble */}
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                          meta.color
                        )}>
                          {meta.icon}
                        </div>

                        <div className="min-w-0">
                          {/* Type label + status */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold">{meta.label}</span>
                            {item.status === 'failed' ? (
                              <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-green-400/70 flex-shrink-0" />
                            )}
                            {item.wallet_label && (
                              <Badge variant="secondary" className="text-[10px] py-0">
                                {item.wallet_label}
                              </Badge>
                            )}
                            {detail?.source && detail.source !== 'System Program' && detail.source !== 'Token Program' && (
                              <span className="text-[10px] py-0 px-1.5 rounded-full border border-purple-500/30 text-purple-400">
                                {detail.source}
                              </span>
                            )}
                          </div>

                          {/* ── Row 2: rich detail ── */}
                          {detail && type === 'transfer' && (
                            <TransferDetail detail={detail} walletAddress={item.wallet_address} />
                          )}
                          {detail && type === 'swap' && (
                            <SwapDetail detail={detail} />
                          )}
                          {(!detail || (type !== 'transfer' && type !== 'swap')) && (
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {detail?.description
                                ? <span className="text-foreground/70 font-sans">{detail.description}</span>
                                : shortenAddress(item.signature, 6)
                              }
                            </div>
                          )}

                          {/* ── Row 3: fee + sig link ── */}
                          <div className="flex items-center gap-2 mt-1">
                            {feeSol !== null && feeSol > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Zap className="w-2.5 h-2.5" />
                                {(feeSol * 1e9).toFixed(0)} lamports fee
                              </span>
                            )}
                            <a
                              href={`https://solscan.io/tx/${item.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-muted-foreground hover:text-primary font-mono flex items-center gap-0.5 transition-colors"
                            >
                              {shortenAddress(item.signature, 4)}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Time (top-right) */}
                      <div className="text-[11px] text-muted-foreground flex-shrink-0 mt-0.5">
                        {timeAgo(item.block_time)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                >
                  ← Prev
                </Button>
                <span>
                  {Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset + LIMIT >= total}
                  onClick={() => setOffset(offset + LIMIT)}
                >
                  Next →
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
