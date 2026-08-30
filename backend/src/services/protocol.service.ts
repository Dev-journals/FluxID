import type { NetworkType } from '../config/stellar.config.js';
import {
  appendProtocolHistory,
  clearProtocolHistory,
  getAllProtocolHistory,
  type ScoreHistoryEntry,
} from './history.service.js';
import { calculateWalletScore } from './scoring.service.js';
import { createHorizonService } from './horizon.service.js';
import { cacheService } from './cache.service.js';
import { validateAccountId } from '../utils/validators.js';
import { logger } from '../utils/logger.js';

export type RiskLevel = 'Low' | 'Medium' | 'High';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function latestPerWallet(entries: ScoreHistoryEntry[]): Map<string, ScoreHistoryEntry> {
  const map = new Map<string, ScoreHistoryEntry>();
  for (const e of entries) {
    const existing = map.get(e.wallet);
    if (!existing || e.timestamp > existing.timestamp) map.set(e.wallet, e);
  }
  return map;
}

function distributionOf(entries: ScoreHistoryEntry[]): Record<RiskLevel, number> {
  const dist: Record<RiskLevel, number> = { Low: 0, Medium: 0, High: 0 };
  for (const e of entries) dist[e.risk]++;
  return dist;
}

function avgScore(entries: ScoreHistoryEntry[]): number {
  if (entries.length === 0) return 0;
  const sum = entries.reduce((s, e) => s + e.score, 0);
  return sum / entries.length;
}

export interface ProtocolHealth {
  generatedAt: string;
  network: NetworkType;
  windowHours: number;
  totalWallets: number;
  avgScore: number;
  distribution: { low: number; medium: number; high: number };
  lowRiskPct: number;
  highRiskAlerts: number;
  delta: {
    avgScore: number | null;
    totalWallets: number | null;
    lowRiskPct: number | null;
    highRiskAlerts: number | null;
  };
}

export async function getHealthMetrics(
  network: NetworkType,
  windowHours = 24 * 30
): Promise<ProtocolHealth> {
  const now = Date.now();
  const windowStart = now - windowHours * HOUR_MS;
  const priorStart = windowStart - windowHours * HOUR_MS;

  const all = await getAllProtocolHistory({ network });
  const inWindow = all.filter((e) => e.timestamp >= windowStart);
  const inPrior = all.filter((e) => e.timestamp >= priorStart && e.timestamp < windowStart);

  const currentLatest = Array.from(latestPerWallet(inWindow).values());
  const priorLatest = Array.from(latestPerWallet(inPrior).values());

  const dist = distributionOf(currentLatest);
  const total = currentLatest.length;
  const lowRiskPct = total > 0 ? (dist.Low / total) * 100 : 0;
  const avg = avgScore(currentLatest);

  const priorDist = distributionOf(priorLatest);
  const priorTotal = priorLatest.length;
  const priorLowPct = priorTotal > 0 ? (priorDist.Low / priorTotal) * 100 : null;
  const priorAvg = priorTotal > 0 ? avgScore(priorLatest) : null;

  return {
    generatedAt: new Date(now).toISOString(),
    network,
    windowHours,
    totalWallets: total,
    avgScore: Number(avg.toFixed(1)),
    distribution: { low: dist.Low, medium: dist.Medium, high: dist.High },
    lowRiskPct: Number(lowRiskPct.toFixed(1)),
    highRiskAlerts: dist.High,
    delta: {
      avgScore: priorAvg === null ? null : Number((avg - priorAvg).toFixed(1)),
      totalWallets: priorTotal === 0 ? null : total - priorTotal,
      lowRiskPct: priorLowPct === null ? null : Number((lowRiskPct - priorLowPct).toFixed(1)),
      highRiskAlerts: priorTotal === 0 ? null : dist.High - priorDist.High,
    },
  };
}

export interface Cohort {
  id: string;
  name: string;
  count: number;
  color: string;
  description: string;
}

const VOLATILITY_THRESHOLD = 15;
const DORMANT_DAYS = 7;

export async function getCohorts(network: NetworkType): Promise<{ network: NetworkType; cohorts: Cohort[] }> {
  const all = await getAllProtocolHistory({ network });
  const byWallet = new Map<string, ScoreHistoryEntry[]>();
  for (const e of all) {
    const arr = byWallet.get(e.wallet) ?? [];
    arr.push(e);
    byWallet.set(e.wallet, arr);
  }

  let highTrust = 0;
  let steady = 0;
  let atRisk = 0;
  let dormant = 0;
  const now = Date.now();
  const dormantCutoff = DORMANT_DAYS * DAY_MS;

  for (const [, entries] of byWallet) {
    entries.sort((a, b) => b.timestamp - a.timestamp);
    const latest = entries[0];

    // High Trust: top scores. Works on the first upload.
    if (latest.score >= 75) highTrust++;

    // Steady Earners: currently at Low risk. With multi-observation data this
    // doubles as "consistently low risk"; with a single observation it
    // accurately reflects the wallet's current standing.
    if (latest.risk === 'Low') steady++;

    // At Risk: currently at High risk OR — when we have multi-observation data —
    // a meaningful score swing across observations. The OR keeps the cohort
    // populated from upload time and richer once history accrues.
    const isCurrentlyHighRisk = latest.risk === 'High';
    let hasVolatileSwing = false;
    if (entries.length >= 2) {
      const scores = entries.map((e) => e.score);
      hasVolatileSwing = Math.max(...scores) - Math.min(...scores) >= VOLATILITY_THRESHOLD;
    }
    if (isCurrentlyHighRisk || hasVolatileSwing) atRisk++;

    // Dormant: no observation in the last DORMANT_DAYS.
    if (now - latest.timestamp > dormantCutoff) dormant++;
  }

  const cohorts: Cohort[] = [
    {
      id: 'high-trust',
      name: 'High Trust',
      count: highTrust,
      color: 'var(--primary)',
      description: 'Wallets currently scoring 75 or above.',
    },
    {
      id: 'steady-earners',
      name: 'Steady Earners',
      count: steady,
      color: '#22c55e',
      description: 'Wallets currently classified as Low risk.',
    },
    {
      id: 'at-risk',
      name: 'At Risk',
      count: atRisk,
      color: '#eab308',
      description: `Currently High risk, or score swing ≥ ${VOLATILITY_THRESHOLD} across observations.`,
    },
    {
      id: 'dormant',
      name: 'Dormant Wallets',
      count: dormant,
      color: 'var(--foreground-dim)',
      description: `No score updates in the last ${DORMANT_DAYS} days.`,
    },
  ];

  return { network, cohorts };
}

export interface RiskBand {
  name: string;
  risk: number;
  activity: number;
  walletCount: number;
  avgScore: number;
}

const SCORE_BANDS: { label: string; min: number; max: number }[] = [
  { label: '0–20', min: 0, max: 20 },
  { label: '20–40', min: 20, max: 40 },
  { label: '40–60', min: 40, max: 60 },
  { label: '60–80', min: 60, max: 80 },
  { label: '80–100', min: 80, max: 101 },
];

export async function getRiskHeatmap(
  network: NetworkType
): Promise<{ network: NetworkType; bands: RiskBand[] }> {
  const all = await getAllProtocolHistory({ network });
  const latest = Array.from(latestPerWallet(all).values());

  const buckets = SCORE_BANDS.map((b) => {
    const inBand = latest.filter((e) => e.score >= b.min && e.score < b.max);
    const bandAvg = avgScore(inBand);
    return { band: b, count: inBand.length, bandAvg };
  });

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const bands: RiskBand[] = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: `Score ${b.band.label}`,
      risk: Math.round(100 - b.bandAvg),
      activity: Math.round((b.count / maxCount) * 100),
      walletCount: b.count,
      avgScore: Number(b.bandAvg.toFixed(1)),
    }));

  return { network, bands };
}

export type SegmentActivity = 'low' | 'medium' | 'high';

export interface SegmentQuery {
  minScore?: number;
  maxScore?: number;
  risk?: RiskLevel;
  activity?: SegmentActivity;
  consistent?: boolean;
  limit?: number;
}

export interface SegmentWallet {
  wallet: string;
  score: number;
  risk: RiskLevel;
  observations: number;
  activity: SegmentActivity;
  consistent: boolean;
  scoreRange: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SegmentResult {
  network: NetworkType;
  criteria: SegmentQuery;
  total: number;
  returned: number;
  wallets: SegmentWallet[];
}

function activityFor(observationCount: number): SegmentActivity {
  if (observationCount >= 4) return 'high';
  if (observationCount >= 2) return 'medium';
  return 'low';
}

export async function getSegments(
  network: NetworkType,
  query: SegmentQuery = {}
): Promise<SegmentResult> {
  const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
  const all = await getAllProtocolHistory({ network });

  const byWallet = new Map<string, ScoreHistoryEntry[]>();
  for (const e of all) {
    const arr = byWallet.get(e.wallet) ?? [];
    arr.push(e);
    byWallet.set(e.wallet, arr);
  }

  const matches: SegmentWallet[] = [];
  for (const [wallet, entries] of byWallet) {
    entries.sort((a, b) => b.timestamp - a.timestamp);
    const latest = entries[0];
    const oldest = entries[entries.length - 1];

    if (query.minScore !== undefined && latest.score < query.minScore) continue;
    if (query.maxScore !== undefined && latest.score > query.maxScore) continue;
    if (query.risk && latest.risk !== query.risk) continue;

    const activity = activityFor(entries.length);
    if (query.activity && activity !== query.activity) continue;

    const consistent = entries.length >= 2 && entries.every((e) => e.risk === latest.risk);
    if (query.consistent !== undefined && consistent !== query.consistent) continue;

    const scores = entries.map((e) => e.score);
    const scoreRange = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;

    matches.push({
      wallet,
      score: latest.score,
      risk: latest.risk,
      observations: entries.length,
      activity,
      consistent,
      scoreRange,
      firstSeenAt: new Date(oldest.timestamp).toISOString(),
      lastSeenAt: new Date(latest.timestamp).toISOString(),
    });
  }

  matches.sort((a, b) => b.score - a.score);

  return {
    network,
    criteria: query,
    total: matches.length,
    returned: Math.min(matches.length, limit),
    wallets: matches.slice(0, limit),
  };
}

export interface ProtocolAlert {
  id: string;
  title: string;
  desc: string;
  severity: 'Low' | 'Medium' | 'High';
  generatedAt: string;
}

export async function getAlerts(
  network: NetworkType,
  lookbackHours = 24
): Promise<{ network: NetworkType; alerts: ProtocolAlert[] }> {
  const now = Date.now();
  const windowStart = now - lookbackHours * HOUR_MS;
  const priorStart = windowStart - lookbackHours * HOUR_MS;
  const generatedAt = new Date(now).toISOString();

  const all = await getAllProtocolHistory({ network });
  const current = all.filter((e) => e.timestamp >= windowStart);
  const prior = all.filter((e) => e.timestamp >= priorStart && e.timestamp < windowStart);

  const alerts: ProtocolAlert[] = [];
  if (current.length === 0) {
    return { network, alerts };
  }

  const currentLatest = Array.from(latestPerWallet(current).values());
  const priorLatest = Array.from(latestPerWallet(prior).values());

  // Detection 1: avg score drop
  const currentAvg = avgScore(currentLatest);
  if (priorLatest.length > 0) {
    const priorAvg = avgScore(priorLatest);
    const drop = priorAvg - currentAvg;
    if (drop >= 5) {
      const severity: ProtocolAlert['severity'] = drop >= 10 ? 'High' : 'Medium';
      alerts.push({
        id: `avg-drop-${windowStart}`,
        title: 'Protocol Health Shift',
        desc: `Average liquidity score dropped ${drop.toFixed(1)} points in the last ${lookbackHours}h (from ${priorAvg.toFixed(1)} to ${currentAvg.toFixed(1)}).`,
        severity,
        generatedAt,
      });
    }
  }

  // Detection 2: % of wallets newly classified High
  const priorRiskByWallet = new Map<string, RiskLevel>();
  for (const e of priorLatest) priorRiskByWallet.set(e.wallet, e.risk);

  let newlyHigh = 0;
  let comparable = 0;
  for (const e of currentLatest) {
    const prev = priorRiskByWallet.get(e.wallet);
    if (!prev) continue;
    comparable++;
    if (prev !== 'High' && e.risk === 'High') newlyHigh++;
  }

  if (comparable > 0) {
    const pct = (newlyHigh / comparable) * 100;
    if (pct >= 10) {
      const severity: ProtocolAlert['severity'] = pct >= 15 ? 'High' : 'Medium';
      alerts.push({
        id: `risk-spike-${windowStart}`,
        title: 'Anomalous Risk Shift Detected',
        desc: `${pct.toFixed(0)}% of tracked wallets dropped into High risk within the last ${lookbackHours}h.`,
        severity,
        generatedAt,
      });
    }
  }

  // Detection 3: drop below score 50
  let droppedBelow50 = 0;
  const priorScoreByWallet = new Map<string, number>();
  for (const e of priorLatest) priorScoreByWallet.set(e.wallet, e.score);
  for (const e of currentLatest) {
    const prev = priorScoreByWallet.get(e.wallet);
    if (prev === undefined) continue;
    if (prev >= 50 && e.score < 50) droppedBelow50++;
  }
  if (comparable > 0 && droppedBelow50 > 0) {
    const pct = (droppedBelow50 / comparable) * 100;
    if (pct >= 10) {
      alerts.push({
        id: `score-50-${windowStart}`,
        title: 'Trust Erosion Warning',
        desc: `${pct.toFixed(0)}% of tracked wallets fell below a score of 50 in the last ${lookbackHours}h.`,
        severity: pct >= 20 ? 'High' : 'Medium',
        generatedAt,
      });
    }
  }

  return { network, alerts };
}

export interface ScoredWallet {
  wallet: string;
  score: number;
  risk: RiskLevel;
  cached: boolean;
  cacheAgeMs: number | null;
  horizonQueried: boolean;
}

export interface AddWalletsResult {
  network: NetworkType;
  requested: number;
  scored: number;
  failed: { wallet: string; reason: string }[];
  durationMs: number;
  cachedCount: number;
  maxCacheAgeMs: number | null;
  wallets: ScoredWallet[];
}

export interface AddWalletsOptions {
  /** When true (default), skip the in-process score cache and query Horizon. */
  refresh?: boolean;
}

const ADD_WALLETS_CONCURRENCY = 5;
const ADD_WALLETS_MAX = 100;

async function scoreOne(
  wallet: string,
  network: NetworkType,
  refresh: boolean
): Promise<
  | { ok: true } & ScoredWallet
  | { wallet: string; ok: false; reason: string }
> {
  try {
    const validated = validateAccountId(wallet);
    const cachedEntry = refresh ? null : cacheService.getEntry(validated, network);
    let result;
    let cached = false;
    let cacheAgeMs: number | null = null;

    if (cachedEntry) {
      result = cachedEntry.data;
      cached = true;
      cacheAgeMs = Date.now() - cachedEntry.timestamp;
    } else {
      result = await calculateWalletScore(validated, network, createHorizonService(network));
      cacheService.set(validated, network, result);
    }

    await appendProtocolHistory({
      wallet: validated,
      network,
      score: result.score,
      risk: result.risk,
      timestamp: Date.now(),
    });
    return {
      wallet: validated,
      ok: true,
      score: result.score,
      risk: result.risk,
      cached,
      cacheAgeMs,
      horizonQueried: !cached,
    };
  } catch (err) {
    const e = err as Error;
    logger.warn({ wallet, network, error: e.message }, 'Protocol-side scoring failed');
    let reason = e.message;
    if (reason.includes('Invalid Stellar')) reason = 'Invalid address';
    else if (reason.includes('Horizon API error: 404')) reason = 'Account not found on this network';
    return { wallet, ok: false, reason };
  }
}

export async function addWalletsToProtocol(
  walletsInput: string[],
  network: NetworkType,
  options: AddWalletsOptions = {}
): Promise<AddWalletsResult> {
  const started = Date.now();
  const refresh = options.refresh !== false;
  // Dedupe to keep the workload bounded; trim whitespace so paste-from-textarea works.
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const raw of walletsInput) {
    const w = raw.trim();
    if (!w || seen.has(w)) continue;
    seen.add(w);
    queue.push(w);
    if (queue.length >= ADD_WALLETS_MAX) break;
  }

  const failed: { wallet: string; reason: string }[] = [];
  const wallets: ScoredWallet[] = [];
  let scored = 0;

  for (let i = 0; i < queue.length; i += ADD_WALLETS_CONCURRENCY) {
    const batch = queue.slice(i, i + ADD_WALLETS_CONCURRENCY);
    const results = await Promise.all(batch.map((w) => scoreOne(w, network, refresh)));
    for (const r of results) {
      if (r.ok) {
        scored++;
        wallets.push({
          wallet: r.wallet,
          score: r.score,
          risk: r.risk,
          cached: r.cached,
          cacheAgeMs: r.cacheAgeMs,
          horizonQueried: r.horizonQueried,
        });
      } else {
        failed.push({ wallet: r.wallet, reason: r.reason });
      }
    }
  }

  const cachedAges = wallets.filter((w) => w.cached && w.cacheAgeMs !== null).map((w) => w.cacheAgeMs as number);

  return {
    network,
    requested: queue.length,
    scored,
    failed,
    durationMs: Date.now() - started,
    cachedCount: wallets.filter((w) => w.cached).length,
    maxCacheAgeMs: cachedAges.length === 0 ? null : Math.max(...cachedAges),
    wallets,
  };
}

export async function resetProtocolHistory(network?: NetworkType): Promise<number> {
  return clearProtocolHistory(network);
}
