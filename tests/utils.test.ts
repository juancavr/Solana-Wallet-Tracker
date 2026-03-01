import { describe, it, expect } from 'vitest';
import { formatUSD, formatSOL, formatPct, shortenAddress, formatNumber } from '@/lib/utils';

describe('formatUSD', () => {
  it('formats positive values', () => {
    expect(formatUSD(1234.56)).toContain('1,234.56');
    expect(formatUSD(1234.56)).toContain('$');
  });

  it('formats compact large values', () => {
    expect(formatUSD(1_500_000, true)).toBe('$1.50M');
    expect(formatUSD(2500, true)).toBe('$2.50K');
  });

  it('formats tiny values with more decimals', () => {
    const result = formatUSD(0.000123);
    expect(result).toContain('$');
  });
});

describe('formatSOL', () => {
  it('appends SOL unit', () => {
    expect(formatSOL(1.5)).toBe('1.5 SOL');
  });

  it('formats with up to 4 decimals', () => {
    expect(formatSOL(3.14159265)).toContain('3.1416');
  });
});

describe('formatPct', () => {
  it('adds + sign for positive', () => {
    expect(formatPct(5.2)).toBe('+5.20%');
  });
  it('keeps - sign for negative', () => {
    expect(formatPct(-3.1)).toBe('-3.10%');
  });
  it('returns dash for null', () => {
    expect(formatPct(null)).toBe('—');
  });
});

describe('shortenAddress', () => {
  it('shortens long addresses', () => {
    const full = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
    const short = shortenAddress(full, 4);
    expect(short).toBe('HN7c...YWrH');
  });
  it('returns short addresses unchanged', () => {
    expect(shortenAddress('abc', 4)).toBe('abc');
  });
});

describe('formatNumber', () => {
  it('formats zero', () => expect(formatNumber(0)).toBe('0'));
  it('uses exponential for very small', () => {
    const r = formatNumber(0.0000001);
    expect(r).toContain('e');
  });
  it('formats normal values', () => {
    expect(formatNumber(12345.6789, 2)).toContain('12,345');
  });
});
