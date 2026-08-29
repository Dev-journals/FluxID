"use client";

import { useState, useEffect } from "react";
import type { UsdValuation } from "./scoring";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd";

// Module-level in-flight promise so concurrent hook instances during the same
// render cycle share a single fetch instead of each firing their own request.
let inFlight: Promise<number | null> | null = null;

async function fetchXlmPriceOnce(): Promise<number | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(COINGECKO_URL, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { stellar?: { usd?: number } };
      return data?.stellar?.usd ?? null;
    } catch {
      return null;
    } finally {
      // Clear so the next page-load / hard refresh can re-fetch.
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Returns the XLM/USD price to use in a component.
 *
 * Priority:
 *   1. `usd.xlmPriceUsd` — already resolved by the backend, use it directly.
 *   2. A single shared CoinGecko fetch — all hook instances share the same
 *      in-flight request so only ONE network call is made per page load.
 *
 * Pass `usd` whenever the component already receives a UsdValuation prop so
 * the frontend fetch is skipped entirely when the backend has a price.
 */
export function useXlmPrice(usd?: UsdValuation): number | null {
  const backendPrice = usd?.xlmPriceUsd ?? null;
  const [frontendPrice, setFrontendPrice] = useState<number | null>(null);

  useEffect(() => {
    // Skip the fetch if the backend already provided a price.
    if (backendPrice !== null) return;
    fetchXlmPriceOnce().then(setFrontendPrice);
  }, [backendPrice]);

  return backendPrice ?? frontendPrice;
}
