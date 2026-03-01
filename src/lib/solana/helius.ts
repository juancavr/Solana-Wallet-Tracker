/**
 * Helius DAS (Digital Asset Standard) integration.
 *
 * Why DAS instead of plain RPC calls?
 *  - getAssetsByOwner = 1 call to get SOL balance + all tokens + metadata + prices
 *  - Standard RPC needs: getBalance + getParsedTokenAccounts (v1) + getParsedTokenAccounts (v2) = 3 calls
 *  - DAS returns token name/symbol/decimals/price — no need for separate metadata fetches
 *  - Much higher rate-limit quota on Helius than public RPC
 */

export const HELIUS_RPC_URL =
  process.env.SOLANA_RPC_URL ?? 'https://mainnet.helius-rpc.com/?api-key=';

export function isHeliusRpc(): boolean {
  return (process.env.SOLANA_RPC_URL ?? '').includes('helius');
}

// ─── DAS response types ───────────────────────────────────────────────────────

interface HeliusPriceInfo {
  price_per_token?: number;
  total_price?: number;
  currency?: string;
}

interface HeliusTokenInfo {
  symbol?: string;
  balance?: number;   // raw integer balance (not UI amount)
  decimals?: number;
  token_program?: string;
  associated_token_address?: string;
  price_info?: HeliusPriceInfo;
}

interface HeliusAssetContent {
  metadata?: {
    name?: string;
    symbol?: string;
    description?: string;
  };
}

interface HeliusAsset {
  /** Mint address */
  id: string;
  /** 'FungibleToken' | 'FungibleAsset' | 'NonFungibleToken' | 'ProgrammableNFT' | etc. */
  interface: string;
  content?: HeliusAssetContent;
  token_info?: HeliusTokenInfo;
}

interface HeliusNativeBalance {
  /** Lamports as integer */
  lamports: number;
  /** SOL price in USD (Helius provides this on some plans) */
  price_per_sol?: number;
  total_price?: number;
}

interface HeliusDasResult {
  total: number;
  limit: number;
  page: number;
  items: HeliusAsset[];
  nativeBalance?: HeliusNativeBalance;
}

interface HeliusDasResponse {
  jsonrpc: string;
  id: string;
  result?: HeliusDasResult;
  error?: { code: number; message: string };
}

// ─── Public result types ──────────────────────────────────────────────────────

export interface DasTokenResult {
  mint: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  rawAmount: string;
  uiAmount: number;
  tokenAccountAddress: string | null;
  /** USD price per token from Helius (may be null if not available) */
  pricePerToken: number | null;
}

export interface DasSyncResult {
  /** Native SOL balance in lamports */
  lamports: bigint;
  /** SOL price from Helius (null if not on plan that provides it) */
  solPriceUsd: number | null;
  tokens: DasTokenResult[];
}

// ─── Core fetch function ──────────────────────────────────────────────────────

const FUNGIBLE_INTERFACES = new Set([
  'FungibleToken',
  'FungibleAsset',
]);

/**
 * Fetch all assets (SOL + tokens) for a wallet using Helius DAS API.
 * Handles pagination automatically (1000 items per page).
 */
export async function fetchAllAssetsWithDas(address: string): Promise<DasSyncResult> {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error('SOLANA_RPC_URL not set');

  const allItems: HeliusAsset[] = [];
  let nativeBalance: HeliusNativeBalance | undefined;
  let page = 1;
  const LIMIT = 1000;

  // Paginate until we have all assets
  while (true) {
    const body = {
      jsonrpc: '2.0',
      id: `das-${address.slice(0, 8)}-p${page}`,
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: address,
        page,
        limit: LIMIT,
        displayOptions: {
          showFungible: true,       // include SPL tokens
          showNativeBalance: true,  // include SOL balance + price
          showUnverifiedCollections: false,
          showCollectionMetadata: false,
          showGrandTotal: false,
          showInscription: false,
          showZeroBalance: false,   // skip empty token accounts
        },
      },
    };

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      throw new Error(`Helius DAS HTTP ${res.status}: ${await res.text()}`);
    }

    const json: HeliusDasResponse = await res.json();

    if (json.error) {
      throw new Error(`Helius DAS error ${json.error.code}: ${json.error.message}`);
    }

    const result = json.result;
    if (!result) throw new Error('Helius DAS returned no result');

    // Capture native balance from first page only
    if (page === 1 && result.nativeBalance) {
      nativeBalance = result.nativeBalance;
    }

    allItems.push(...result.items);

    // Stop if we got fewer items than the limit (last page)
    if (result.items.length < LIMIT) break;
    page++;
  }

  // ── Parse tokens (fungible assets only) ──
  const tokens: DasTokenResult[] = [];

  for (const asset of allItems) {
    // Only process fungible tokens (skip NFTs, compressed NFTs, etc.)
    if (!FUNGIBLE_INTERFACES.has(asset.interface)) continue;

    const ti = asset.token_info;
    if (!ti) continue;

    const rawBalance = ti.balance ?? 0;
    const decimals = ti.decimals ?? 0;
    const uiAmount = rawBalance / Math.pow(10, decimals);

    // Skip zero/dust balances
    if (uiAmount === 0) continue;

    // Prefer token_info symbol/name, fall back to content metadata
    const symbol =
      ti.symbol?.trim() ||
      asset.content?.metadata?.symbol?.trim() ||
      null;
    const name =
      asset.content?.metadata?.name?.trim() || symbol || null;

    tokens.push({
      mint: asset.id,
      symbol,
      name,
      decimals,
      rawAmount: String(rawBalance),
      uiAmount,
      tokenAccountAddress: ti.associated_token_address ?? null,
      pricePerToken: ti.price_info?.price_per_token ?? null,
    });
  }

  // ── Parse native SOL ──
  const lamports = BigInt(nativeBalance?.lamports ?? 0);
  const solPriceUsd = nativeBalance?.price_per_sol ?? null;

  console.log(
    `[helius-das] ${address.slice(0, 8)}… → ` +
    `${Number(lamports) / 1e9} SOL, ${tokens.length} tokens` +
    (solPriceUsd ? `, SOL=$${solPriceUsd}` : '')
  );

  return { lamports, solPriceUsd, tokens };
}
