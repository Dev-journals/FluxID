import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SAMPLE = 'GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxid-history-test-'));
  process.env.FLUXID_DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.FLUXID_DATA_DIR;
  vi.restoreAllMocks();
});

async function loadHistory() {
  return import('./history.service.js');
}

describe('protocol history persistence', () => {
  it('returns a scored wallet from memory even when the disk write fails', async () => {
    vi.spyOn(fs, 'appendFile').mockRejectedValue(new Error('EROFS: read-only file system'));
    const { appendProtocolHistory, getAllProtocolHistory } = await loadHistory();

    await appendProtocolHistory({
      wallet: SAMPLE,
      network: 'mainnet',
      score: 81,
      risk: 'Low',
      timestamp: Date.now(),
    });

    const entries = await getAllProtocolHistory({ network: 'mainnet' });
    expect(entries).toHaveLength(1);
    expect(entries[0].wallet).toBe(SAMPLE);
    expect(entries[0].score).toBe(81);
  });

  it('does not leak a mainnet score into the testnet cohort read', async () => {
    const { appendProtocolHistory, getAllProtocolHistory } = await loadHistory();
    await appendProtocolHistory({
      wallet: SAMPLE,
      network: 'mainnet',
      score: 81,
      risk: 'Low',
      timestamp: Date.now(),
    });

    expect(await getAllProtocolHistory({ network: 'testnet' })).toHaveLength(0);
    expect(await getAllProtocolHistory({ network: 'mainnet' })).toHaveLength(1);
  });

  it('clears in-memory protocol history so a reset actually empties cohorts', async () => {
    const { appendProtocolHistory, getAllProtocolHistory, clearProtocolHistory } = await loadHistory();
    await appendProtocolHistory({
      wallet: SAMPLE,
      network: 'mainnet',
      score: 40,
      risk: 'Medium',
      timestamp: Date.now(),
    });
    expect(await clearProtocolHistory('mainnet')).toBe(1);
    expect(await getAllProtocolHistory({ network: 'mainnet' })).toHaveLength(0);
  });

  it('keeps concurrent appends on the same in-memory log', async () => {
    const { appendProtocolHistory, getAllProtocolHistory } = await loadHistory();
    const other = 'GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX';
    await Promise.all([
      appendProtocolHistory({
        wallet: SAMPLE,
        network: 'mainnet',
        score: 81,
        risk: 'Low',
        timestamp: Date.now(),
      }),
      appendProtocolHistory({
        wallet: other,
        network: 'mainnet',
        score: 40,
        risk: 'Medium',
        timestamp: Date.now(),
      }),
    ]);
    const entries = await getAllProtocolHistory({ network: 'mainnet' });
    expect(entries).toHaveLength(2);
  });
});
