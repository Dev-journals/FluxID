import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const WALLET_A = 'GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR';
const WALLET_B = 'GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX';

const horizonCalls = { count: 0 };

vi.mock('./price.service.js', () => ({
  getXlmUsdPrice: vi.fn(async () => ({
    usd: 0.12,
    source: 'test',
    fetchedAt: '2026-01-01T00:00:00.000Z',
  })),
}));

vi.mock('./horizon.service.js', () => ({
  createHorizonService: () => ({
    getAccountPayments: async (id: string) => {
      horizonCalls.count += 1;
      return [
        {
          id: `pay-${id}`,
          from: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
          to: id,
          amount: 250,
          asset: 'XLM',
          timestamp: new Date('2026-08-01T00:00:00Z'),
          isIncoming: true,
        },
      ];
    },
  }),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxid-protocol-test-'));
  process.env.FLUXID_DATA_DIR = tmpDir;
  horizonCalls.count = 0;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.FLUXID_DATA_DIR;
});

async function loadProtocol() {
  return import('./protocol.service.js');
}

describe('protocol scoring persistence', () => {
  it('persists scored wallets so health and cohorts on that network are non-zero', async () => {
    const { addWalletsToProtocol, getHealthMetrics, getSegments } = await loadProtocol();

    const added = await addWalletsToProtocol([WALLET_A, WALLET_B], 'mainnet');
    expect(added.scored).toBe(2);
    expect(added.failed).toHaveLength(0);

    const health = await getHealthMetrics('mainnet');
    expect(health.totalWallets).toBe(2);
    expect(health.avgScore).toBeGreaterThan(0);

    const segments = await getSegments('mainnet');
    expect(segments.total).toBe(2);

    const other = await getHealthMetrics('testnet');
    expect(other.totalWallets).toBe(0);
  });

  it('queries Horizon on each score by default and only reuses cache when refresh is false', async () => {
    const { addWalletsToProtocol } = await loadProtocol();

    const first = await addWalletsToProtocol([WALLET_A], 'mainnet');
    expect(first.cachedCount).toBe(0);
    expect(first.wallets[0].horizonQueried).toBe(true);
    expect(horizonCalls.count).toBe(1);

    const cached = await addWalletsToProtocol([WALLET_A], 'mainnet', { refresh: false });
    expect(cached.cachedCount).toBe(1);
    expect(cached.wallets[0].horizonQueried).toBe(false);
    expect(cached.maxCacheAgeMs).toBeGreaterThanOrEqual(0);
    expect(horizonCalls.count).toBe(1);

    const fresh = await addWalletsToProtocol([WALLET_A], 'mainnet', { refresh: true });
    expect(fresh.cachedCount).toBe(0);
    expect(fresh.wallets[0].horizonQueried).toBe(true);
    expect(horizonCalls.count).toBe(2);
  });
});
