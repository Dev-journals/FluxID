// Client helpers for the FluxID metrics/feedback backend.
// Mirrors lib/protocolApi.ts: reads NEXT_PUBLIC_AI_BACKEND_URL, unwraps the
// standard { success, data } envelope, and NEVER throws — every call returns a
// value or null so a missing/unreachable backend degrades gracefully.

const AI_BACKEND_URL = process.env.NEXT_PUBLIC_AI_BACKEND_URL || "";

export type EventType = "wallet_connect" | "score_run" | "contract_call" | "agent_query";

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

export interface FeedbackEntry {
  wallet: string | null;
  rating: number;
  message: string;
  timestamp: number;
}

export interface FeedbackSummary {
  total: number;
  averageRating: number | null;
  ratingCounts: Record<number, number>;
  entries: FeedbackEntry[];
}

function baseUrl(): string | null {
  if (!AI_BACKEND_URL) return null;
  return AI_BACKEND_URL.endsWith("/") ? AI_BACKEND_URL : AI_BACKEND_URL + "/";
}

/**
 * Fire-and-forget usage event. Best-effort: swallows every error so it can
 * never break the wallet-connect or score flow it's attached to.
 */
export async function logEvent(
  type: EventType,
  wallet?: string | null,
  network?: string | null
): Promise<void> {
  const base = baseUrl();
  if (!base) return;
  try {
    await fetch(`${base}events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, wallet: wallet ?? null, network: network ?? null }),
      keepalive: true,
    });
  } catch {
    // ignore — telemetry must never surface to the user
  }
}

const FEEDBACK_TIMEOUT_MS = 10_000;

export async function submitFeedback(
  rating: number,
  message: string,
  wallet?: string | null
): Promise<boolean> {
  const base = baseUrl();
  if (!base) return false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FEEDBACK_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, message, wallet: wallet ?? null }),
      signal: controller.signal,
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    // Covers network errors and the 10s timeout abort alike — the caller
    // treats both as "failed to send" and lets the user retry.
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAdminStats(): Promise<UsageStats | null> {
  const base = baseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}admin/stats`);
    const body = (await res.json()) as { success?: boolean; stats?: UsageStats };
    if (!body.success || !body.stats) return null;
    return body.stats;
  } catch {
    return null;
  }
}

export async function fetchAdminFeedback(): Promise<FeedbackSummary | null> {
  const base = baseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}admin/feedback`);
    const body = (await res.json()) as { success?: boolean; feedback?: FeedbackSummary };
    if (!body.success || !body.feedback) return null;
    return body.feedback;
  } catch {
    return null;
  }
}
