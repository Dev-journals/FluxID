import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coldStartRetry,
  fetchWithColdStartRetry,
  formatCacheAge,
  isRetryableNetworkError,
  isRetryableStatus,
  resolveSegmentEmptyKind,
  segmentEmptyMessage,
} from "./protocolApi";

describe("cold-start retry", () => {
  const originalDelay = coldStartRetry.delay;
  const originalMax = coldStartRetry.maxAttempts;
  const originalDelayMs = coldStartRetry.delayMs;

  beforeEach(() => {
    coldStartRetry.delay = async () => {};
    coldStartRetry.maxAttempts = 3;
    coldStartRetry.delayMs = 1;
  });

  afterEach(() => {
    coldStartRetry.delay = originalDelay;
    coldStartRetry.maxAttempts = originalMax;
    coldStartRetry.delayMs = originalDelayMs;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries connection-closed failures and returns the first successful response", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("net::ERR_CONNECTION_CLOSED"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const onRetry = vi.fn();
    const res = await fetchWithColdStartRetry("http://localhost:8000/health", undefined, { onRetry });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("retries 503 from a still-booting proxy, then succeeds", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("starting", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithColdStartRetry("http://localhost:8000/health");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client 400 — the payload itself is wrong", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithColdStartRetry("http://localhost:8000/protocol/wallets", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and rethrows the last network error", async () => {
    const fetchMock = vi.fn<() => Promise<Response>>().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithColdStartRetry("http://localhost:8000/health")).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("classifies connection-closed and 502/503 as retryable", () => {
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableNetworkError(new TypeError("net::ERR_CONNECTION_CLOSED"))).toBe(true);
    expect(isRetryableNetworkError(new DOMException("aborted", "AbortError"))).toBe(false);
  });
});

describe("formatCacheAge", () => {
  it("uses seconds under a minute and minutes after that", () => {
    expect(formatCacheAge(1_000)).toBe("1 second ago");
    expect(formatCacheAge(12_000)).toBe("12 seconds ago");
    expect(formatCacheAge(60_000)).toBe("1 minute ago");
    expect(formatCacheAge(5 * 60_000)).toBe("5 minutes ago");
  });
});

describe("segment empty states", () => {
  it("distinguishes none scored, pipeline failure, and filter miss", () => {
    expect(resolveSegmentEmptyKind({ fetchFailed: true, totalScored: 0 })).toBe("pipeline-error");
    expect(resolveSegmentEmptyKind({ fetchFailed: true, totalScored: 3 })).toBe("pipeline-error");
    expect(resolveSegmentEmptyKind({ fetchFailed: false, totalScored: 0 })).toBe("none-scored");
    expect(resolveSegmentEmptyKind({ fetchFailed: false, totalScored: 3 })).toBe("no-match");
    expect(segmentEmptyMessage("none-scored")).toBe(
      "No wallets scored yet. Add wallets in the Protocol tab."
    );
    expect(segmentEmptyMessage("pipeline-error")).toBe(
      "Scoring pipeline encountered an error. Check backend logs."
    );
    expect(segmentEmptyMessage("no-match")).toBe(
      "No wallets match these criteria. Try adjusting your filters."
    );
  });
});
