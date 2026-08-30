import { describe, it, expect } from "vitest";
import {
  parseStoredAnalysis,
  parseStoredNetwork,
} from "./dashboardStorage";
import type { WalletAnalysis } from "./scoring";

const SAMPLE_G = "GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR";

const sampleAnalysis = {
  score: {
    score: 42,
    riskLevel: "Medium",
    factors: { inflowConsistency: 10, outflowStability: 20, transactionFrequency: 12 },
  },
  metrics: {
    totalInflow: 1,
    totalOutflow: 0,
    transactionCount: 3,
    inflowCount: 3,
    outflowCount: 0,
    swaps: [],
    totalSwapValue: 0,
  },
  transactions: [],
  flowSummary: {
    totalInflow: 1,
    totalOutflow: 0,
    transactionCount: 3,
    averageTransaction: 1,
    swaps: [],
    totalSwapValue: 0,
  },
} as WalletAnalysis;

describe("parseStoredNetwork", () => {
  it("restores a persisted mainnet selection", () => {
    expect(parseStoredNetwork("mainnet")).toBe("mainnet");
  });

  it("restores a persisted testnet selection", () => {
    expect(parseStoredNetwork("testnet")).toBe("testnet");
  });

  it("does not treat missing or unknown values as testnet", () => {
    expect(parseStoredNetwork(null)).toBe("mainnet");
    expect(parseStoredNetwork("TESTNET")).toBe("mainnet");
    expect(parseStoredNetwork("")).toBe("mainnet");
  });
});

describe("parseStoredAnalysis", () => {
  it("restores a saved analysis so results can show without re-analyzing", () => {
    const raw = JSON.stringify({
      address: SAMPLE_G,
      network: "mainnet",
      analysis: sampleAnalysis,
    });
    const stored = parseStoredAnalysis(raw);
    expect(stored?.address).toBe(SAMPLE_G);
    expect(stored?.network).toBe("mainnet");
    expect(stored?.analysis.score.score).toBe(42);
  });

  it("does not restore corrupt or incomplete snapshots", () => {
    expect(parseStoredAnalysis(null)).toBeNull();
    expect(parseStoredAnalysis("{not json")).toBeNull();
    expect(parseStoredAnalysis(JSON.stringify({ network: "mainnet", analysis: sampleAnalysis }))).toBeNull();
    expect(parseStoredAnalysis(JSON.stringify({ address: SAMPLE_G, network: "devnet", analysis: sampleAnalysis }))).toBeNull();
    expect(parseStoredAnalysis(JSON.stringify({ address: SAMPLE_G, network: "mainnet" }))).toBeNull();
  });
});
