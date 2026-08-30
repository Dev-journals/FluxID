import { describe, it, expect } from "vitest";
import {
  calculateLiquidityScore,
  horizonAnalyzeError,
  isHorizonNotFound,
  resolveAnalyzeAddress,
  type LiquidityMetrics,
} from "./scoring";

function metrics(partial: Partial<LiquidityMetrics>): LiquidityMetrics {
  return {
    totalInflow: 0,
    totalOutflow: 0,
    transactionCount: 0,
    inflowCount: 0,
    outflowCount: 0,
    swaps: [],
    totalSwapValue: 0,
    ...partial,
  };
}

describe("calculateLiquidityScore", () => {
  it("returns a zero, High-risk score for a wallet with no transactions", () => {
    const result = calculateLiquidityScore(metrics({ transactionCount: 0 }));
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe("High");
  });

  it("caps the score at 100 even with very large flows", () => {
    const result = calculateLiquidityScore(
      metrics({
        totalInflow: 1_000_000,
        inflowCount: 1,
        totalOutflow: 0,
        outflowCount: 0,
        transactionCount: 500,
      })
    );
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThan(0);
  });

  it("assigns a Low risk level once the score clears the 70 threshold", () => {
    const result = calculateLiquidityScore(
      metrics({
        totalInflow: 4000, // avgInflow 4000 -> inflowConsistency capped at 40
        inflowCount: 1,
        totalOutflow: 0, // outflowStability stays at 30
        outflowCount: 0,
        transactionCount: 50, // frequency capped at 30
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.riskLevel).toBe("Low");
  });
});

const SAMPLE_G = "GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR";

describe("resolveAnalyzeAddress", () => {
  it("uses a valid typed address over the connected wallet", () => {
    expect(resolveAnalyzeAddress(`  ${SAMPLE_G}  `, "GOTHER")).toBe(SAMPLE_G);
  });

  it("falls back to the connected wallet when the input is empty", () => {
    expect(resolveAnalyzeAddress("", SAMPLE_G)).toBe(SAMPLE_G);
  });

  it("does not analyze when neither the input nor the connected key is valid", () => {
    expect(resolveAnalyzeAddress("not-an-address", null)).toBeNull();
    expect(resolveAnalyzeAddress("", "GSHORT")).toBeNull();
  });
});

describe("horizonAnalyzeError", () => {
  it("maps a Horizon 404 to an account-not-found message on mainnet", () => {
    expect(isHorizonNotFound({ name: "NotFoundError", response: { status: 404 } })).toBe(true);
    expect(horizonAnalyzeError({ name: "NotFoundError", response: { status: 404 } }, "mainnet")).toBe(
      "Account not found on mainnet. Check the address or switch network."
    );
  });

  it("maps other Horizon failures to a visible analysis error", () => {
    expect(horizonAnalyzeError(new Error("Network request failed"), "mainnet")).toBe(
      "Wallet analysis failed on mainnet. Network request failed"
    );
  });
});
