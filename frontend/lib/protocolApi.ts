const AI_BACKEND_URL = process.env.NEXT_PUBLIC_AI_BACKEND_URL || "";

export type ProtocolNetwork = "mainnet" | "testnet";

export interface ProtocolHealth {
  generatedAt: string;
  network: ProtocolNetwork;
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

export interface ProtocolCohort {
  id: string;
  name: string;
  count: number;
  color: string;
  description: string;
}

export interface ProtocolRiskBand {
  name: string;
  risk: number;
  activity: number;
  walletCount: number;
  avgScore: number;
}

export interface ProtocolAlert {
  id: string;
  title: string;
  desc: string;
  severity: "Low" | "Medium" | "High";
  generatedAt: string;
}

export type SegmentActivity = "low" | "medium" | "high";

export interface SegmentQuery {
  minScore?: number;
  maxScore?: number;
  risk?: "Low" | "Medium" | "High";
  activity?: SegmentActivity;
  consistent?: boolean;
  limit?: number;
}

export interface SegmentWallet {
  wallet: string;
  score: number;
  risk: "Low" | "Medium" | "High";
  observations: number;
  activity: SegmentActivity;
  consistent: boolean;
  scoreRange: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SegmentResult {
  network: ProtocolNetwork;
  criteria: SegmentQuery;
  total: number;
  returned: number;
  wallets: SegmentWallet[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ScoredWallet {
  wallet: string;
  score: number;
  risk: "Low" | "Medium" | "High";
  cached: boolean;
  cacheAgeMs: number | null;
  horizonQueried: boolean;
}

export interface AddWalletsResult {
  network: ProtocolNetwork;
  requested: number;
  scored: number;
  failed: { wallet: string; reason: string }[];
  durationMs: number;
  cachedCount: number;
  maxCacheAgeMs: number | null;
  wallets: ScoredWallet[];
}

export interface ProtocolRequestOptions {
  onRetry?: (attempt: number, maxAttempts: number) => void;
  refresh?: boolean;
}

export function formatCacheAge(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  }
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

/**
 * Render free-tier sleeps after idle. The first TCP handshake is often reset
 * (ERR_CONNECTION_CLOSED / failed to fetch) while the process is still booting.
 * Retry the same request until the instance is up so the caller never loses the
 * payload they already submitted.
 */
export const coldStartRetry = {
  maxAttempts: 8,
  delayMs: 2000,
  delay: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|err_connection|econnreset|econnrefused|enotfound|socket|load failed|network request failed/i.test(
    message
  );
}

function backendBase(): string | null {
  if (!AI_BACKEND_URL) return null;
  return AI_BACKEND_URL.endsWith("/") ? AI_BACKEND_URL : AI_BACKEND_URL + "/";
}

export async function fetchWithColdStartRetry(
  url: string,
  init?: RequestInit,
  options?: ProtocolRequestOptions
): Promise<Response> {
  const maxAttempts = Math.max(1, coldStartRetry.maxAttempts);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!isRetryableStatus(res.status) || attempt === maxAttempts) {
        return res;
      }
      options?.onRetry?.(attempt, maxAttempts);
      await coldStartRetry.delay(coldStartRetry.delayMs * attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }
      options?.onRetry?.(attempt, maxAttempts);
      await coldStartRetry.delay(coldStartRetry.delayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Backend unreachable");
}

async function getJson<T>(
  path: string,
  network?: ProtocolNetwork,
  options?: ProtocolRequestOptions
): Promise<T | null> {
  const base = backendBase();
  if (!base) return null;
  const url = new URL(path, base);
  if (network) url.searchParams.set("network", network);
  try {
    const res = await fetchWithColdStartRetry(url.toString(), undefined, options);
    const body = (await res.json()) as ApiEnvelope<T>;
    if (!body.success || !body.data) return null;
    return body.data;
  } catch {
    return null;
  }
}

export function fetchProtocolHealth(network?: ProtocolNetwork, options?: ProtocolRequestOptions) {
  return getJson<ProtocolHealth>("protocol/health", network, options);
}

export function fetchProtocolCohorts(network?: ProtocolNetwork, options?: ProtocolRequestOptions) {
  return getJson<{ network: ProtocolNetwork; cohorts: ProtocolCohort[] }>(
    "protocol/cohorts",
    network,
    options
  );
}

export function fetchProtocolRiskHeatmap(network?: ProtocolNetwork, options?: ProtocolRequestOptions) {
  return getJson<{ network: ProtocolNetwork; bands: ProtocolRiskBand[] }>(
    "protocol/risk-heatmap",
    network,
    options
  );
}

export function fetchProtocolAlerts(network?: ProtocolNetwork, options?: ProtocolRequestOptions) {
  return getJson<{ network: ProtocolNetwork; alerts: ProtocolAlert[] }>(
    "protocol/alerts",
    network,
    options
  );
}

export async function addProtocolWallets(
  wallets: string[],
  network: ProtocolNetwork,
  options?: ProtocolRequestOptions
): Promise<AddWalletsResult | null> {
  const base = backendBase();
  if (!base) return null;
  const url = `${base}protocol/wallets`;
  try {
    const res = await fetchWithColdStartRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallets,
          network,
          refresh: options?.refresh !== false,
        }),
      },
      options
    );
    const body = (await res.json()) as ApiEnvelope<AddWalletsResult>;
    if (!body.success || !body.data) return null;
    return body.data;
  } catch {
    return null;
  }
}

export async function resetProtocolHistory(
  network?: ProtocolNetwork,
  options?: ProtocolRequestOptions
): Promise<{ removed: number; network: string } | null> {
  const base = backendBase();
  if (!base) return null;
  const url = new URL("protocol/wallets", base);
  if (network) url.searchParams.set("network", network);
  try {
    const res = await fetchWithColdStartRetry(url.toString(), { method: "DELETE" }, options);
    const body = (await res.json()) as ApiEnvelope<{ removed: number; network: string }>;
    if (!body.success || !body.data) return null;
    return body.data;
  } catch {
    return null;
  }
}

export async function fetchProtocolSegments(
  query: SegmentQuery = {},
  network?: ProtocolNetwork,
  options?: ProtocolRequestOptions
): Promise<SegmentResult | null> {
  const base = backendBase();
  if (!base) return null;
  const url = new URL("protocol/segments", base);
  if (network) url.searchParams.set("network", network);
  if (query.minScore !== undefined) url.searchParams.set("minScore", String(query.minScore));
  if (query.maxScore !== undefined) url.searchParams.set("maxScore", String(query.maxScore));
  if (query.risk) url.searchParams.set("risk", query.risk);
  if (query.activity) url.searchParams.set("activity", query.activity);
  if (query.consistent !== undefined) url.searchParams.set("consistent", String(query.consistent));
  if (query.limit) url.searchParams.set("limit", String(query.limit));

  try {
    const res = await fetchWithColdStartRetry(url.toString(), undefined, options);
    const body = (await res.json()) as ApiEnvelope<SegmentResult>;
    if (!body.success || !body.data) return null;
    return body.data;
  } catch {
    return null;
  }
}

/** Ping GET /health so a sleeping Render instance starts before the user submits wallets. */
export async function pingBackendHealth(options?: ProtocolRequestOptions): Promise<boolean> {
  const base = backendBase();
  if (!base) return false;
  try {
    const res = await fetchWithColdStartRetry(`${base}health`, undefined, options);
    return res.ok;
  } catch {
    return false;
  }
}
