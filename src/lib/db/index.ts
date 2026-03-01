import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-var
  var __coinstatDb: Database.Database | undefined;
}

const DB_PATH =
  process.env.DB_PATH ||
  path.join(process.cwd(), 'data', 'coinstat.db');

function createDb(): Database.Database {
  const resolvedPath = process.env.DB_PATH || DB_PATH;
  const dir = path.dirname(resolvedPath);
  if (resolvedPath !== ':memory:' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      address       TEXT UNIQUE NOT NULL,
      label         TEXT NOT NULL DEFAULT '',
      color         TEXT NOT NULL DEFAULT '#6366f1',
      created_at    INTEGER NOT NULL,
      last_synced_at INTEGER,
      sync_cursor   TEXT
    );

    CREATE TABLE IF NOT EXISTS sol_balances (
      wallet_id  INTEGER PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
      lamports   TEXT NOT NULL DEFAULT '0',
      sol        REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_accounts (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id             INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      mint                  TEXT NOT NULL,
      symbol                TEXT,
      name                  TEXT,
      decimals              INTEGER NOT NULL DEFAULT 0,
      raw_amount            TEXT NOT NULL DEFAULT '0',
      ui_amount             REAL NOT NULL DEFAULT 0,
      token_account_address TEXT,
      updated_at            INTEGER NOT NULL,
      UNIQUE(wallet_id, mint)
    );
    CREATE INDEX IF NOT EXISTS idx_ta_mint ON token_accounts(mint);
    CREATE INDEX IF NOT EXISTS idx_ta_wallet ON token_accounts(wallet_id);

    CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id  INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      signature  TEXT NOT NULL,
      block_time INTEGER,
      slot       INTEGER,
      fee        INTEGER,
      status     TEXT,
      type       TEXT NOT NULL DEFAULT 'unknown',
      raw_meta   TEXT,
      UNIQUE(wallet_id, signature)
    );
    CREATE INDEX IF NOT EXISTS idx_tx_wallet_time
      ON transactions(wallet_id, block_time DESC);

    CREATE TABLE IF NOT EXISTS price_cache (
      mint         TEXT PRIMARY KEY,
      symbol       TEXT,
      name         TEXT,
      price_usd    REAL NOT NULL DEFAULT 0,
      change_24h   REAL DEFAULT 0,
      market_cap   REAL,
      last_fetched INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id  INTEGER,
      total_usd  REAL NOT NULL DEFAULT 0,
      sol_usd    REAL NOT NULL DEFAULT 0,
      tokens_usd REAL NOT NULL DEFAULT 0,
      snapped_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snap_wallet_time
      ON portfolio_snapshots(wallet_id, snapped_at DESC);

    CREATE TABLE IF NOT EXISTS sync_jobs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id  INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      status     TEXT NOT NULL DEFAULT 'pending',
      type       TEXT NOT NULL DEFAULT 'full',
      attempts   INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_pending
      ON sync_jobs(status, updated_at);
  `);
}

export function getDb(): Database.Database {
  // Always use singleton — setup.ts tears it down in afterEach for tests
  if (!global.__coinstatDb) {
    global.__coinstatDb = createDb();
  }
  return global.__coinstatDb;
}

export default getDb;
