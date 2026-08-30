import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxid-metrics-test-'));
  process.env.FLUXID_DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.FLUXID_DATA_DIR;
});

async function loadMetrics() {
  const mod = await import('./metrics.service');
  return mod;
}

describe('metrics.service', () => {
  describe('recordEvent + getUsageStats', () => {
    it('records events and computes usage stats', async () => {
      const { recordEvent, getUsageStats } = await loadMetrics();
      await recordEvent({ type: 'wallet_connect', wallet: 'GAAA...', network: 'testnet', timestamp: 1000 });
      await recordEvent({ type: 'score_run', wallet: 'GAAA...', network: 'testnet', timestamp: 2000 });
      await recordEvent({ type: 'wallet_connect', wallet: 'GBBB...', network: 'testnet', timestamp: 3000 });

      const stats = await getUsageStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.uniqueWallets).toBe(2);
      expect(stats.walletConnects).toBe(2);
      expect(stats.scoreRuns).toBe(1);
      expect(stats.recentWallets).toHaveLength(2);
      expect(stats.recentWallets[0].wallet).toBe('GBBB...');
      expect(stats.recentWallets[0].events).toBe(1);
      expect(stats.recentWallets[1].wallet).toBe('GAAA...');
      expect(stats.recentWallets[1].events).toBe(2);
    });

    it('returns empty stats when no events exist', async () => {
      const { getUsageStats } = await loadMetrics();
      const stats = await getUsageStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.uniqueWallets).toBe(0);
      expect(stats.recentWallets).toHaveLength(0);
    });

    it('ignores events with null wallet', async () => {
      const { recordEvent, getUsageStats } = await loadMetrics();
      await recordEvent({ type: 'score_run', wallet: null, network: null, timestamp: 1000 });
      const stats = await getUsageStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.uniqueWallets).toBe(0);
    });

    it('applies limit to recentWallets', async () => {
      const { recordEvent, getUsageStats } = await loadMetrics();
      for (let i = 0; i < 10; i++) {
        await recordEvent({ type: 'wallet_connect', wallet: `G${String(i).padStart(5, '0')}...`, network: 'testnet', timestamp: i * 1000 });
      }
      const stats = await getUsageStats({ limit: 3 });
      expect(stats.recentWallets).toHaveLength(3);
    });

    it('applies search filter to recentWallets', async () => {
      const { recordEvent, getUsageStats } = await loadMetrics();
      await recordEvent({ type: 'wallet_connect', wallet: 'GAAAAAA...111', network: 'testnet', timestamp: 1000 });
      await recordEvent({ type: 'wallet_connect', wallet: 'GBBBBBB...222', network: 'testnet', timestamp: 2000 });
      await recordEvent({ type: 'wallet_connect', wallet: 'GCCCCCC...333', network: 'testnet', timestamp: 3000 });

      const stats = await getUsageStats({ search: 'BBBB' });
      expect(stats.recentWallets).toHaveLength(1);
      expect(stats.recentWallets[0].wallet).toBe('GBBBBBB...222');
    });
  });

  describe('recordFeedback + getFeedback', () => {
    it('records feedback and computes summary', async () => {
      const { recordFeedback, getFeedback } = await loadMetrics();
      await recordFeedback({ wallet: 'GAAA...', rating: 5, message: 'Great!', timestamp: 1000 });
      await recordFeedback({ wallet: 'GBBB...', rating: 3, message: 'OK', timestamp: 2000 });

      const fb = await getFeedback();
      expect(fb.total).toBe(2);
      expect(fb.averageRating).toBe(4);
      expect(fb.ratingCounts[5]).toBe(1);
      expect(fb.ratingCounts[3]).toBe(1);
      expect(fb.entries).toHaveLength(2);
      expect(fb.entries[0].message).toBe('OK');
    });

    it('returns null averageRating when no entries', async () => {
      const { getFeedback } = await loadMetrics();
      const fb = await getFeedback();
      expect(fb.total).toBe(0);
      expect(fb.averageRating).toBeNull();
    });
  });
});
