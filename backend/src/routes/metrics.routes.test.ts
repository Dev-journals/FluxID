import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Mock process.exit so the auto-start in app.ts doesn't kill the test runner.
vi.stubGlobal('process', { ...process, exit: vi.fn() as never });

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fluxid-routes-test-'));
  process.env.FLUXID_DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.FLUXID_DATA_DIR;
  vi.restoreAllMocks();
});

async function buildTestServer() {
  const { buildServer } = await import('../app');
  return buildServer();
}

describe('metrics routes', () => {
  describe('POST /events', () => {
    it('records a valid event', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({
        method: 'POST',
        url: '/events',
        payload: { type: 'wallet_connect', wallet: 'GAAA...', network: 'testnet' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });

    it('rejects invalid event type', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({
        method: 'POST',
        url: '/events',
        payload: { type: 'invalid_type' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /feedback', () => {
    it('records valid feedback', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({
        method: 'POST',
        url: '/feedback',
        payload: { rating: 5, message: 'Great tool!' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
    });

    it('rejects invalid rating', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({
        method: 'POST',
        url: '/feedback',
        payload: { rating: 6, message: 'test' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects empty message', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({
        method: 'POST',
        url: '/feedback',
        payload: { rating: 5, message: '' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /admin/stats', () => {
    it('returns stats with default limit', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({ method: 'GET', url: '/admin/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.stats).toBeDefined();
      expect(body.stats.recentWallets).toBeDefined();
    });

    it('respects limit query param', async () => {
      const server = await buildTestServer();
      await server.ready();
      for (let i = 0; i < 5; i++) {
        await server.inject({
          method: 'POST',
          url: '/events',
          payload: { type: 'wallet_connect', wallet: `G${String(i).padStart(5, '0')}...` },
        });
      }
      const res = await server.inject({ method: 'GET', url: '/admin/stats?limit=2' });
      const body = JSON.parse(res.payload);
      expect(body.stats.recentWallets.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /admin/feedback', () => {
    it('returns feedback summary', async () => {
      const server = await buildTestServer();
      await server.ready();
      const res = await server.inject({ method: 'GET', url: '/admin/feedback' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.feedback).toBeDefined();
      expect(body.feedback.total).toBe(0);
    });
  });
});
