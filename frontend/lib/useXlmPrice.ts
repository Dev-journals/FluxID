"use client";

import { useState, useEffect } from "react";
import type { UsdValuation } from "./scoring";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";
const CACHE_TTL_MS = 5 * 60 * 1000;

let inFlight: Promise<number | null> | null = null;
let cached: { value: number; expiresAt: number } | null = null;

async function fetchXlmPriceOnce(): Promise<number | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(COINGECKO_URL, {
        signal: AbortSignal.timeout(4000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { stellar?: { usd?: number } };
      const usd = data?.stellar?.usd;
      if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
      cached = { value: usd, expiresAt: Date.now() + CACHE_TTL_MS };
      return usd;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Live XLM/USD from CoinGecko. Backend `usd.xlmPriceUsd` is a fallback only
 * when the market fetch fails — a stale backend quote must not win.
 */
export function useXlmPrice(usd?: UsdValuation): number | null {
  const backendPrice =
    typeof usd?.xlmPriceUsd === "number" && usd.xlmPriceUsd > 0 ? usd.xlmPriceUsd : null;
  const [frontendPrice, setFrontendPrice] = useState<number | null>(cached?.value ?? null);

  useEffect(() => {
    fetchXlmPriceOnce().then(setFrontendPrice);
  }, []);

  return frontendPrice ?? backendPrice;
}
