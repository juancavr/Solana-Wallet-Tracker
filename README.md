# Solana Wallet Tracker

A local-first Solana portfolio tracker for **unlimited wallets** in a single window.
Built with Next.js 14 + TypeScript + SQLite (better-sqlite3) + TanStack Query + Recharts.

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Data fetching | TanStack Query v5 (client-side) |
| Charts | Recharts |
| UI | Tailwind CSS + Radix UI primitives |
| RPC | @solana/web3.js |
| Prices | Jupiter Price API v4 + CoinGecko fallback |

## Features

- **Unlimited wallet tracking** — add any number of Solana public keys
- **Auto background sync** — wallets sync on startup + every 5 minutes
- **Portfolio overview** — total USD value, SOL + token breakdown
- **Token holdings table** — sortable, searchable, aggregated across all wallets
- **Activity feed** — recent transactions with pagination
- **Top movers** — 24h gainers/losers
- **Charts** — portfolio value over time (7D/30D/90D) + allocation pie
- **Per-wallet drilldown** — full details without opening new windows
- **Import/Export** — CSV and JSON wallet lists
- **Local-first** — everything stored in `data/tracker.db`

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `DB_PATH` | `./data/tracker.db` | SQLite database file path |

Create `.env.local` to override:
```
SOLANA_RPC_URL=https://your-helius-or-quicknode-endpoint
```

> For best performance use a dedicated RPC provider (Helius, QuickNode, Alchemy) instead of the public endpoint.

## Architecture

```
Browser (single tab)
├── Sidebar: wallet list + nav
└── Main panel: views (overview / tokens / activity / movers / per-wallet)
    ↕ TanStack Query (30s polling)
Next.js API Routes
├── /api/wallets     - CRUD
├── /api/portfolio   - Aggregated + per-wallet value
├── /api/tokens      - Token holdings
├── /api/transactions- Activity feed
├── /api/prices      - Price cache
├── /api/sync        - Trigger sync
├── /api/export      - CSV/JSON export
└── /api/import      - Bulk import
    ↕
Sync Engine (background, Node.js)
├── Job queue (sync_jobs table)
├── Solana RPC (balances, token accounts, transactions)
└── Jupiter Price API (5-min TTL cache)
    ↕
SQLite (WAL mode, data/tracker.db)
├── wallets, sol_balances, token_accounts
├── transactions, price_cache
└── portfolio_snapshots, sync_jobs
```

## Running Tests

```bash
npm test
# or watch mode:
npm run test:watch
```

## Import Wallets

**Via UI:** Click "Import wallets" in the sidebar.

**JSON format:**
```json
[
  { "address": "YourSolanaAddress...", "label": "My Wallet" },
  { "address": "AnotherAddress...", "label": "DeFi Wallet" }
]
```

**CSV format:**
```
address,label
YourSolanaAddress...,My Wallet
AnotherAddress...,DeFi Wallet
```

**Via API:**
```bash
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d '{"wallets": [{"address": "...", "label": "..."}]}'
```

## Load Sample Wallets

```bash
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d @data/sample-wallets.json
```

## Design Decisions

- **No Electron/Tauri** — runs as localhost Next.js app; wrappable later in one step
- **better-sqlite3** over Prisma — synchronous, 2-3x faster for batch wallet ops, no ORM overhead
- **Incremental sync** — uses last-known signature as cursor; never re-fetches old transactions
- **Job queue in SQLite** — survives restarts; retry with backoff (max 3 attempts)
- **Price TTL** — 5-minute cache prevents rate-limit abuse across many wallets
- **Read-only** — zero private key exposure; all operations use public addresses only
