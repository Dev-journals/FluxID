import fs from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { logger } from '../utils/logger.js';

// Usage + feedback capture for the Green Belt admin panel.
//
// Two interchangeable backends, chosen at startup:
//   1. Upstash Redis — when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//      are set. Durable across restarts/redeploys, so this is what production
//      (Render free tier, whose disk is ephemeral) should use.
//   2. Append-only JSONL files under FLUXID_DATA_DIR — the zero-config fallback
//      for local dev and any deploy without Redis configured.
//
// Both store the SAME UsageEvent / FeedbackEntry shapes, so everything below
// the append/readLines primitives is backend-agnostic.

const DATA_DIR = process.env.FLUXID_DATA_DIR || path.join(process.cwd(), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.jsonl');

// Redis list keys, keyed by the same basenames used for the JSONL files.
const EVENTS_KEY = 'fluxid:events';
const FEEDBACK_KEY = 'fluxid:feedback';

// Lazily construct the Redis client so the module still imports cleanly when
// the env vars are absent (fallback path). Null means "use JSONL files".
const redis: Redis | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const client = new Redis({ url, token });
    logger.info('Metrics store: Upstash Redis (durable)');
    return client;
  } catch (err) {
    logger.warn({ error: (err as Error).message }, 'Redis init failed; falling back to JSONL files');
    return null;
  }
})();

if (!redis) {
  logger.info({ dir: DATA_DIR }, 'Metrics store: JSONL files (ephemeral on Render free tier)');
}

// Map a file path to its Redis list key so the two primitives share one call site.
function redisKeyFor(file: string): string {
  return file === EVENTS_FILE ? EVENTS_KEY : FEEDBACK_KEY;
}

export type EventType = 'wallet_connect' | 'score_run' | 'contract_call' | 'agent_query';

export interface UsageEvent {
  type: EventType;
  wallet: string | null;
  network: string | null;
  timestamp: number;
}

export interface FeedbackEntry {
  wallet: string | null;
  rating: number; // 1-5
  message: string;
  timestamp: number;
}

let dirEnsured = false;
async function ensureDataDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  dirEnsured = true;
}

async function append(file: string, entry: unknown): Promise<void> {
  try {
    if (redis) {
      // Upstash stores JSON values natively; rpush keeps insertion order.
      await redis.rpush(redisKeyFor(file), entry as Record<string, unknown>);
      return;
    }
    await ensureDataDir();
    // Atomic per-call for writes under PIPE_BUF (4096B) on POSIX — our lines
    // are far smaller, so concurrent appends never interleave bytes.
    await fs.appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    logger.warn({ error: (err as Error).message, file }, 'Failed to append metrics entry');
  }
}

async function readLines<T>(file: string): Promise<T[]> {
  try {
    if (redis) {
      // lrange returns the parsed objects in insertion order.
      const items = await redis.lrange<T>(redisKeyFor(file), 0, -1);
      return items ?? [];
    }
    await ensureDataDir();
    const content = await fs.readFile(file, 'utf8');
    const out: T[] = [];
    for (const line of content.split('\n')) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        // malformed line — skip
      }
    }
    return out;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return [];
    logger.warn({ error: e.message, file }, 'Failed to read metrics file');
    return [];
  }
}

export async function recordEvent(event: UsageEvent): Promise<void> {
  await append(EVENTS_FILE, event);
}

export async function recordFeedback(entry: FeedbackEntry): Promise<void> {
  await append(FEEDBACK_FILE, entry);
}

export interface UsageStats {
  totalEvents: number;
  uniqueWallets: number;
  byType: Record<string, number>;
  walletConnects: number;
  scoreRuns: number;
  firstSeen: number | null;
  lastSeen: number | null;
  recentWallets: Array<{ wallet: string; lastSeen: number; events: number }>;
}

export async function getUsageStats(opts?: { limit?: number; search?: string }): Promise<UsageStats> {
  const events = await readLines<UsageEvent>(EVENTS_FILE);
  const byType: Record<string, number> = {};
  const wallets = new Map<string, { lastSeen: number; events: number }>();
  let firstSeen: number | null = null;
  let lastSeen: number | null = null;

  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (firstSeen === null || e.timestamp < firstSeen) firstSeen = e.timestamp;
    if (lastSeen === null || e.timestamp > lastSeen) lastSeen = e.timestamp;
    if (e.wallet) {
      const prev = wallets.get(e.wallet);
      wallets.set(e.wallet, {
        lastSeen: Math.max(prev?.lastSeen ?? 0, e.timestamp),
        events: (prev?.events ?? 0) + 1,
      });
    }
  }

  let recentWallets = [...wallets.entries()]
    .map(([wallet, v]) => ({ wallet, lastSeen: v.lastSeen, events: v.events }))
    .sort((a, b) => b.lastSeen - a.lastSeen);

  if (opts?.search) {
    const q = opts.search.toLowerCase();
    recentWallets = recentWallets.filter((w) => w.wallet.toLowerCase().includes(q));
  }

  const limit = opts?.limit && opts.limit > 0 ? opts.limit : 50;
  recentWallets = recentWallets.slice(0, limit);

  return {
    totalEvents: events.length,
    uniqueWallets: wallets.size,
    byType,
    walletConnects: byType['wallet_connect'] || 0,
    scoreRuns: byType['score_run'] || 0,
    firstSeen,
    lastSeen,
    recentWallets,
  };
}

export interface FeedbackSummary {
  total: number;
  averageRating: number | null;
  ratingCounts: Record<number, number>;
  entries: FeedbackEntry[];
}

export async function getFeedback(): Promise<FeedbackSummary> {
  const entries = (await readLines<FeedbackEntry>(FEEDBACK_FILE)).sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let rated = 0;
  for (const f of entries) {
    if (f.rating >= 1 && f.rating <= 5) {
      ratingCounts[f.rating] = (ratingCounts[f.rating] || 0) + 1;
      ratingSum += f.rating;
      rated += 1;
    }
  }
  return {
    total: entries.length,
    averageRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : null,
    ratingCounts,
    entries,
  };
}
