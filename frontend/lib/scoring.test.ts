import { describe, it, expect } from "vitest";
import {
  calculateLiquidityScore,
  horizonAnalyzeError,
  isHorizonNotFound,
  resolveAnalyzeAddress,
  formatTransactionCount,
  computeAssetsBreakdown,
  holdingsFromBalances,
  assetKindsLabel,
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

describe("formatTransactionCount", () => {
  it("shows a count when Horizon returned activity", () => {
    expect(formatTransactionCount(12)).toBe("12");
  });

  it("says No transactions found instead of 0 transactions", () => {
    expect(formatTransactionCount(0)).toBe("No transactions found");
  });
});

describe("assetKindsLabel", () => {
  it("lists held assets even when payment flow is empty", () => {
    expect(
      assetKindsLabel(
        { inflow: { XLM: 0, USDC: 0, other: [] }, outflow: { XLM: 0, USDC: 0, other: [] } },
        [{ code: "XLM", balance: 12 }, { code: "USDC", issuer: "GISS", balance: 5 }]
      )
    ).toBe("XLM, USDC");
  });

  it("does not report None when a trustline-only wallet still holds XLM", () => {
    expect(assetKindsLabel(undefined, [{ code: "XLM", balance: 1 }])).toBe("XLM");
  });

  it("returns None only when there are no holdings and no flow assets", () => {
    expect(
      assetKindsLabel({
        inflow: { XLM: 0, USDC: 0, other: [] },
        outflow: { XLM: 0, USDC: 0, other: [] },
      })
    ).toBe("None");
  });
});

describe("holdingsFromBalances", () => {
  it("detects native and credit balances and skips zeros", () => {
    const holdings = holdingsFromBalances([
      { asset_type: "native", balance: "10.5" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GISSUER", balance: "3" },
      { asset_type: "credit_alphanum4", asset_code: "DEAD", balance: "0" },
    ]);
    expect(holdings).toEqual([
      { code: "XLM", balance: 10.5 },
      { code: "USDC", issuer: "GISSUER", balance: 3 },
    ]);
  });
});

describe("computeAssetsBreakdown", () => {
  it("counts a create_account credit as XLM inflow", () => {
    const assets = computeAssetsBreakdown(
      [
        {
          id: "op-1",
          type: "create_account",
          from: "GFUNDER",
          to: SAMPLE_G,
          amount: "0",
          asset_type: "native",
          created_at: "2024-01-01T00:00:00Z",
          starting_balance: "20",
          account: SAMPLE_G,
          funder: "GFUNDER",
        },
      ],
      SAMPLE_G
    );
    expect(assets.inflow.XLM).toBe(20);
  });
});
