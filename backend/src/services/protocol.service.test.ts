import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const WALLET_A = 'GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR';
const WALLET_B = 'GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX';

vi.mock('./price.service.js', () => ({
  getXlmUsdPrice: vi.fn(async () => ({
    usd: 0.12,
    source: 'test',
    fetchedAt: '2026-01-01T00:00:00.000Z',
  })),
}));

vi.mock('./horizon.service.js', () => ({
  createHorizonService: () => ({
    getAccountPayments: async (id: string) => [
      {
        id: `pay-${id}`,
        from: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
        to: id,
        amount: 250,
        asset: 'XLM',
        timestamp: new Date('2026-08-01T00:00:00Z'),
        isIncoming: true,
      },
    ],
  }),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxid-protocol-test-'));
  process.env.FLUXID_DATA_DIR = tmpDir;
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
    const { addWalletsToProtocol, getHealthMetrics, getCohorts } = await loadProtocol();

    const added = await addWalletsToProtocol([WALLET_A, WALLET_B], 'mainnet');
    expect(added.scored).toBe(2);
    expect(added.failed).toHaveLength(0);

    const health = await getHealthMetrics('mainnet');
    expect(health.totalWallets).toBe(2);
    expect(health.avgScore).toBeGreaterThan(0);

    const { cohorts } = await getCohorts('mainnet');
    const totalCount = cohorts.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBeGreaterThan(0);

    const other = await getHealthMetrics('testnet');
    expect(other.totalWallets).toBe(0);
  });
});
