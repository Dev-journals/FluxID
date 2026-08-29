import { describe, it, expect } from "vitest";
import { calculateLiquidityScore, calculateLiquidityMetrics, type LiquidityMetrics } from "./scoring";

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

describe("calculateLiquidityMetrics", () => {
  it("filters zero-value operations from inflating inflow/outflow transaction counts", () => {
    const payments = [
      {
        id: "1",
        from: "GOTHER",
        to: "GWALLET",
        amount: "100",
        asset_type: "native",
        created_at: "2026-08-20T00:00:00Z",
        transaction_successful: true,
      },
      {
        id: "2",
        from: "GOTHER",
        to: "GWALLET",
        amount: "0",
        asset_type: "native",
        created_at: "2026-08-20T00:00:00Z",
        transaction_successful: true,
      },
      {
        id: "3",
        from: "GWALLET",
        to: "GOTHER",
        amount: "50",
        asset_type: "native",
        created_at: "2026-08-20T00:00:00Z",
        transaction_successful: true,
      },
    ];

    const result = calculateLiquidityMetrics(payments, "GWALLET");
    expect(result.inflowCount).toBe(1);
    expect(result.outflowCount).toBe(1);
    expect(result.transactionCount).toBe(2);
    expect(result.totalInflow).toBe(100);
    expect(result.totalOutflow).toBe(50);
  });
});
