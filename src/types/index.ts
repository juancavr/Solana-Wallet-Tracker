export interface WalletGroup {
  id: number;
  name: string;
  color: string;
  position: number;
  created_at: number;
}

export interface Wallet {
  id: number;
  address: string;
  label: string;
  color: string;
  group_id: number | null;
  created_at: number;
  last_synced_at: number | null;
  sync_cursor: string | null;
}

export interface SolBalance {
  wallet_id: number;
  lamports: string;
  sol: number;
  updated_at: number;
}

export interface TokenAccount {
  id: number;
  wallet_id: number;
  mint: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  raw_amount: string;
  ui_amount: number;
  token_account_address: string | null;
  updated_at: number;
}

export interface Transaction {
  id: number;
  wallet_id: number;
  signature: string;
  block_time: number | null;
  slot: number | null;
  fee: number | null;
  status: string | null;
  type: string;
  raw_meta: string | null;
}

export interface PriceCache {
  mint: string;
  symbol: string | null;
  name: string | null;
  price_usd: number;
  change_24h: number | null;
  market_cap: number | null;
  last_fetched: number;
}

export interface PortfolioSnapshot {
  id: number;
  wallet_id: number | null;
  total_usd: number;
  sol_usd: number;
  tokens_usd: number;
  snapped_at: number;
}

export interface SyncJob {
  id: number;
  wallet_id: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  type: 'full' | 'balances' | 'transactions';
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

// Enriched / computed types
export interface WalletWithBalance extends Wallet {
  sol: number;
  sol_usd: number;
  tokens_usd: number;
  total_usd: number;
  token_count: number;
}

export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  total_ui_amount: number;
  price_usd: number;
  total_usd: number;
  change_24h: number;
  wallet_count: number;
}

export interface PortfolioOverview {
  total_usd: number;
  sol_usd: number;
  tokens_usd: number;
  wallet_count: number;
  token_count: number;
  change_24h_pct: number | null;
  wallets: WalletWithBalance[];
}

// ─── Transaction detail (stored as JSON in raw_meta) ─────────────────────────

export interface TxNativeTransfer {
  from:       string;
  to:         string;
  amount_sol: number;
}

export interface TxTokenTransfer {
  from:     string;  // user wallet address (not token account)
  to:       string;  // user wallet address
  amount:   number;
  mint:     string;
  symbol:   string;
  decimals: number;
}

export interface TxSwap {
  from_amount: number;
  from_mint:   string;
  from_symbol: string;
  to_amount:   number;
  to_mint:     string;
  to_symbol:   string;
  dex:         string;  // 'Jupiter', 'Raydium', etc.
}

export interface TxDetail {
  description:          string;   // Human-readable from Helius
  source:               string;   // 'Jupiter', 'System Program', etc.
  fee_sol:              number;
  helius_type?:         string;   // Raw Helius type: 'CASHBACK' | 'COLLECT_COIN_CREATOR_FEE' | …
  /** Net SOL change for feePayer from accountData (excludes tx fee). Negative = cost, positive = received. */
  feePayer_sol_change?: number;
  native_transfers:     TxNativeTransfer[];
  token_transfers:      TxTokenTransfer[];
  swap?:                TxSwap;
}

// ─── Activity item (transaction + wallet context) ─────────────────────────────

export interface ActivityItem {
  signature:      string;
  block_time:     number | null;
  wallet_id:      number;
  wallet_label:   string;
  wallet_address: string;
  type:           string;
  status:         string | null;
  fee:            number | null;
  detail:         TxDetail | null;
}

export interface SyncStatus {
  wallet_id: number;
  status: string;
  last_synced_at: number | null;
  pending_jobs: number;
}
