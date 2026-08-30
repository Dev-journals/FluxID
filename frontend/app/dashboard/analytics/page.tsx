"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import FlowChart from "../../components/FlowChart";
import FlowSummary from "../../components/FlowSummary";
import AssetBreakdown from "../../components/AssetBreakdown";
import { useXlmPrice } from "../../../lib/useXlmPrice";
import type { TransactionData, UsdValuation } from "../../../lib/scoring";

function classifyAsset(asset: string | undefined): "XLM" | "USDC" | "OTHER" {
  if (!asset || asset === "XLM" || asset === "native") return "XLM";
  const [code] = asset.split(":");
  if (code === "USDC") return "USDC";
  return "OTHER";
}

// Convert a tx to a comparable USD magnitude (or null if we can't reliably price it).
function txToUsd(tx: TransactionData, xlmPriceUsd: number | null): number | null {
  const kind = classifyAsset(tx.asset);
  if (kind === "USDC") return tx.amount;
  if (kind === "XLM" && xlmPriceUsd !== null) return tx.amount * xlmPriceUsd;
  return null;
}

interface WeeklyBucket {
  weekStart: string; // YYYY-MM-DD (Monday)
  inflow: number;
  outflow: number;
}

function startOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // make Monday the start
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function buildWeeklyTrend(txs: TransactionData[], xlmPriceUsd: number | null): WeeklyBucket[] {
  const map = new Map<string, WeeklyBucket>();
  for (const tx of txs) {
    const usd = txToUsd(tx, xlmPriceUsd);
    if (usd === null) continue;
    const week = startOfWeek(new Date(tx.date));
    const bucket = map.get(week) ?? { weekStart: week, inflow: 0, outflow: 0 };
    if (tx.type === "inflow") bucket.inflow += usd;
    else bucket.outflow += usd;
    map.set(week, bucket);
  }
  return Array.from(map.values()).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)).slice(-8);
}

function computeVolatility(
  txs: TransactionData[],
  xlmPriceUsd: number | null
): { mean: number; stdDev: number; cv: number | null; min: number; max: number; count: number } {
  const values: number[] = [];
  for (const tx of txs) {
    const usd = txToUsd(tx, xlmPriceUsd);
    if (usd === null) continue;
    values.push(usd);
  }
  if (values.length === 0) return { mean: 0, stdDev: 0, cv: null, min: 0, max: 0, count: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return {
    mean,
    stdDev,
    cv: mean > 0 ? stdDev / mean : null,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
}

interface DistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

function buildDistribution(txs: TransactionData[], xlmPriceUsd: number | null): DistributionBucket[] {
  const buckets: DistributionBucket[] = [
    { label: "< $1", min: 0, max: 1, count: 0 },
    { label: "$1–10", min: 1, max: 10, count: 0 },
    { label: "$10–100", min: 10, max: 100, count: 0 },
    { label: "$100–1k", min: 100, max: 1000, count: 0 },
    { label: "$1k–10k", min: 1000, max: 10000, count: 0 },
    { label: "> $10k", min: 10000, max: Infinity, count: 0 },
  ];
  for (const tx of txs) {
    const usd = txToUsd(tx, xlmPriceUsd);
    if (usd === null) continue;
    const bucket = buckets.find((b) => usd >= b.min && usd < b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function AnalyticsPage() {
  const { analysis, isAnalyzing } = useAnalysis();
  const xlmPrice = useXlmPrice(analysis?.usd);

  const txs = analysis?.transactions ?? [];

  const weekly = useMemo(() => buildWeeklyTrend(txs, xlmPrice), [txs, xlmPrice]);
  const volatility = useMemo(() => computeVolatility(txs, xlmPrice), [txs, xlmPrice]);
  const distribution = useMemo(() => buildDistribution(txs, xlmPrice), [txs, xlmPrice]);

  const weeklyMax = Math.max(...weekly.map((w) => w.inflow + w.outflow), 1);
  const distMax = Math.max(...distribution.map((b) => b.count), 1);

  return (
    <>
      <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
        Analytics
      </h1>
      <p style={{ color: "var(--foreground-muted)", fontSize: 14 }} className="mb-6">
        Detailed charts and breakdown of the analyzed wallet&apos;s financial behavior.
      </p>

      {isAnalyzing && (
        <div className="card p-6 text-center">
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>Loading analytics…</p>
        </div>
      )}

      {!isAnalyzing && !analysis && (
        <div className="card p-8 text-center">
          <BarChart3 size={32} style={{ color: "var(--foreground-muted)", margin: "0 auto 12px" }} />
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            Analyze a wallet above to populate analytics.
          </p>
        </div>
      )}

      {analysis && !isAnalyzing && (
        <div className="space-y-6">
          <FlowSummary
            data={analysis.flowSummary}
            assets={analysis.assets}
            usd={analysis.usd}
          />

          <AssetBreakdown assets={analysis.assets} usd={analysis.usd} />

          <FlowChart transactions={txs} usd={analysis.usd} />

          <WeeklyTrend weekly={weekly} max={weeklyMax} canShowUsd={xlmPrice !== null} usd={analysis.usd} />

          <VolatilityCard volatility={volatility} canShowUsd={xlmPrice !== null} />

          <DistributionChart distribution={distribution} max={distMax} />
        </div>
      )}
    </>
  );
}

function formatWeekLabel(weekStart: string, allWeeks: WeeklyBucket[]): string {
  // weekStart is YYYY-MM-DD (Monday). Normally show MM-DD.
  // When the chart spans a year boundary, show MM-DD-YYYY on every label
  // so "12-29-2025" and "01-05-2026" are never ambiguous side-by-side.
  const years = new Set(allWeeks.map((w) => w.weekStart.slice(0, 4)));
  if (years.size <= 1) {
    // All weeks in the same year — short MM-DD label is unambiguous.
    return weekStart.slice(5);
  }
  // Multiple years present — show full MM-DD-YYYY on every label.
  const [yyyy, mm, dd] = weekStart.split("-");
  return `${mm}-${dd}-${yyyy}`;
}

function WeeklyTrend({
  weekly,
  max,
  canShowUsd,
  usd,
}: {
  weekly: WeeklyBucket[];
  max: number;
  canShowUsd: boolean;
  usd?: UsdValuation;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6 mb-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img 
          src="/3d-imgs-assest/fluxid_behavioral_graph.png" 
          alt="Behavior Graph" 
          className="w-full h-full object-cover opacity-10 mix-blend-screen"
        />
      </div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>Weekly Trend</h3>
        <span style={{ color: "var(--foreground-muted)", fontSize: 11 }}>
          {canShowUsd ? "USD per week (last 8 weeks) via CoinGecko" : "XLM price unavailable — USDC only"}
        </span>
      </div>
      {weekly.length === 0 ? (
        <p style={{ color: "var(--foreground-muted)", fontSize: 13 }} className="py-6 text-center">
          Not enough data for a weekly trend yet.
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2 h-44">
            {weekly.map((w) => {
              const inflowH = (w.inflow / max) * 100;
              const outflowH = (w.outflow / max) * 100;
              return (
                <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex gap-1 h-40">
                    <div
                      className="flex-1 rounded"
                      style={{ height: `${inflowH}%`, background: "#22c55e", alignSelf: "flex-end" }}
                      title={`Inflow ${w.weekStart}: ${fmtUsd(w.inflow)}`}
                    />
                    <div
                      className="flex-1 rounded"
                      style={{ height: `${outflowH}%`, background: "#ef4444", alignSelf: "flex-end" }}
                      title={`Outflow ${w.weekStart}: ${fmtUsd(w.outflow)}`}
                    />
                  </div>
                  <span style={{ color: "var(--foreground-dim)", fontSize: 10 }}>
                    {formatWeekLabel(w.weekStart, weekly)}
                  </span>
                </div>
              );
            })}
          </div>
          {usd?.priceFetchedAt && (
            <p style={{ color: "var(--foreground-dim)", fontSize: 10 }} className="mt-3 italic">
              Values converted using XLM = ${usd.xlmPriceUsd?.toFixed(4)} via {usd.priceSource}
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}

function VolatilityCard({
  volatility,
  canShowUsd,
}: {
  volatility: ReturnType<typeof computeVolatility>;
  canShowUsd: boolean;
}) {
  if (volatility.count === 0) return null;
  const cvPct = volatility.cv !== null ? (volatility.cv * 100).toFixed(0) : null;
  const interpretation =
    cvPct === null
      ? "No variance data."
      : Number(cvPct) < 50
        ? "Low volatility — transactions cluster around the mean."
        : Number(cvPct) < 100
          ? "Moderate volatility — some large outliers mixed in."
          : "High volatility — transaction sizes vary widely.";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6"
    >
      <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }} className="mb-4">
        Volatility
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        <Stat label="Mean" value={fmtUsd(volatility.mean)} />
        <Stat label="Std Dev" value={fmtUsd(volatility.stdDev)} />
        <Stat label="Min" value={fmtUsd(volatility.min)} />
        <Stat label="Max" value={fmtUsd(volatility.max)} />
      </div>
      <p style={{ color: "var(--foreground-muted)", fontSize: 13 }}>
        {cvPct !== null && (
          <>
            <strong style={{ color: "var(--foreground)" }}>CV: {cvPct}%</strong> —{" "}
          </>
        )}
        {interpretation}
        {canShowUsd && (
          <span style={{ color: "var(--foreground-dim)" }}> (via CoinGecko)</span>
        )}
        {!canShowUsd && (
          <span style={{ color: "var(--foreground-dim)" }}> (USDC only — XLM price unavailable)</span>
        )}
      </p>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 600 }} className="uppercase mb-1">
        {label}
      </p>
      <p style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 16 }} className="break-words">{value}</p>
    </div>
  );
}

function DistributionChart({ distribution, max }: { distribution: DistributionBucket[]; max: number }) {
  const total = distribution.reduce((sum, b) => sum + b.count, 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>Transaction Size Distribution</h3>
        <span style={{ color: "var(--foreground-muted)", fontSize: 11 }}>
          {total} priced {total === 1 ? "tx" : "txs"}
        </span>
      </div>
      {total === 0 ? (
        <p style={{ color: "var(--foreground-muted)", fontSize: 13 }} className="py-4 text-center">
          No priced transactions to distribute.
        </p>
      ) : (
        <div className="space-y-2.5">
          {distribution.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span
                style={{ color: "var(--foreground-muted)", fontSize: 12, width: 72 }}
                className="shrink-0"
              >
                {b.label}
              </span>
              <div
                className="flex-1 h-6 rounded overflow-hidden"
                style={{ background: "var(--surface)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${(b.count / max) * 100}%`,
                    background: "var(--primary)",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <span
                style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 12, width: 32 }}
                className="text-right shrink-0"
              >
                {b.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
