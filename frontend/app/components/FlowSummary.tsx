"use client";

import { motion } from "framer-motion";
import { AssetsBreakdown, FlowSummary as FlowSummaryType, UsdValuation } from "../../lib/scoring";
import { ArrowDownLeft, ArrowUpRight, Activity, Coins, ArrowLeftRight } from "lucide-react";
import { useXlmPrice } from "../../lib/useXlmPrice";

interface FlowSummaryProps {
  data: FlowSummaryType | null;
  assets?: AssetsBreakdown;
  usd?: UsdValuation;
  isLoading?: boolean;
  className?: string;
}

function formatAmount(n: number, maxFrac = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function directionCaption(dir: { XLM: number; USDC: number; other: unknown[] }): string {
  const parts: string[] = [];
  if (dir.XLM > 0) parts.push(`${formatAmount(dir.XLM)} XLM`);
  if (dir.USDC > 0) parts.push(`${formatAmount(dir.USDC)} USDC`);
  if (dir.other.length > 0) {
    const totalCount = dir.other.reduce(
      (sum: number, o) => sum + ((o as { count: number }).count ?? 1),
      0
    );
    parts.push(`+${totalCount} other`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function FlowSummary({ data, assets, usd, isLoading, className = "" }: FlowSummaryProps) {
  const xlmPrice = useXlmPrice(usd);

  if (isLoading) {    return (
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse h-28 bg-var(--surface) rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const hasPrice = xlmPrice !== null;

  // Calculate USD totals using the price
  let inflowUsd: number | null = null;
  let outflowUsd: number | null = null;
  
  if (hasPrice && assets) {
    inflowUsd = assets.inflow.XLM * xlmPrice + assets.inflow.USDC;
    outflowUsd = assets.outflow.XLM * xlmPrice + assets.outflow.USDC;
  }

  const hasUsd = hasPrice && assets && (inflowUsd !== null || outflowUsd !== null);
  const inflowCaption = assets ? directionCaption(assets.inflow) : `${formatAmount(data.totalInflow)} (mixed)`;
  const outflowCaption = assets ? directionCaption(assets.outflow) : `${formatAmount(data.totalOutflow)} (mixed)`;

  const inflowPrimary = hasUsd && inflowUsd !== null ? formatUsd(inflowUsd) : inflowCaption;
  const outflowPrimary = hasUsd && outflowUsd !== null ? formatUsd(outflowUsd) : outflowCaption;

  // For inflow/outflow - show USD as primary, XLM/USDC breakdown as caption
  const inflowColor = hasUsd && inflowUsd !== null ? "#22c55e" : "var(--foreground)";
  const outflowColor = hasUsd && outflowUsd !== null ? "#ef4444" : "var(--foreground)";

  // Format swaps for display. When there are multiple distinct pairs, include
  // per-pair counts so "USDC → XLM (2) · XLM → USDC (1)" is readable at a glance.
  const showSwapCounts = (data.swaps?.length ?? 0) > 1;
  const swapsLabel = data.swaps && data.swaps.length > 0
    ? data.swaps
        .map((s) => {
          const pair = `${s.fromAsset} → ${s.toAsset}`;
          return showSwapCounts ? `${pair} (${s.count})` : pair;
        })
        .join(" · ")
    : null;
  
  const stats = [
    {
      label: "Total Inflow",
      primary: inflowPrimary,
      caption: inflowCaption,
      icon: ArrowDownLeft,
      color: inflowColor,
      isPrimaryUsd: hasUsd && inflowUsd !== null,
    },
    {
      label: "Total Outflow",
      primary: outflowPrimary,
      caption: outflowCaption,
      icon: ArrowUpRight,
      color: outflowColor,
      isPrimaryUsd: hasUsd && outflowUsd !== null,
    },
    {
      label: "Transactions",
      primary: data.transactionCount.toString(),
      caption: null,
      icon: Activity,
      color: "var(--primary)",
      isPrimaryUsd: false,
    },
    {
      label: "Assets",
      primary: assets ? assetCountLabel(assets) : "—",
      caption: xlmPrice
        ? `XLM = ${formatUsd(xlmPrice)}`
        : "XLM price unavailable",
      icon: Coins,
      color: "var(--foreground)",
      isPrimaryUsd: false,
    },
  ];

  // Add Conversions stat if there are swaps
  if (data.swaps && data.swaps.length > 0) {
    stats.push({
      label: "Conversions",
      primary: data.swaps.length.toString(),
      caption: swapsLabel,
      icon: ArrowLeftRight,
      color: "#8FA828",
      isPrimaryUsd: false,
    });
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            className="rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={14} style={{ color: stat.color }} />
              <span
                style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 600 }}
                className="uppercase"
              >
                {stat.label}
              </span>
            </div>
            <p 
              style={{ 
                color: stat.color, 
                fontWeight: 900, 
                fontSize: stat.isPrimaryUsd ? 24 : 20, 
                lineHeight: 1.1 
              }}
            >
              {stat.primary}
            </p>
            {stat.caption && (
              <p
                style={{ color: "var(--foreground-muted)", fontSize: 11 }}
                className="mt-1 truncate"
                title={stat.caption}
              >
                {stat.caption}
              </p>
            )}
          </motion.div>
        ))}
      </div>
      {usd?.note && (
        <p style={{ color: "var(--foreground-dim)", fontSize: 11 }} className="italic">
          {usd.note}
          {usd.priceFetchedAt && usd.xlmPriceUsd !== null
            ? ` Price fetched ${new Date(usd.priceFetchedAt).toLocaleTimeString()} from ${usd.priceSource}.`
            : ""}
        </p>
      )}
      {!usd?.note && xlmPrice && (
        <p style={{ color: "var(--foreground-dim)", fontSize: 11 }} className="italic">
          XLM price fetched via CoinGecko
        </p>
      )}
    </div>
  );
}

function assetCountLabel(assets: AssetsBreakdown): string {
  const kinds = new Set<string>();
  for (const dir of [assets.inflow, assets.outflow]) {
    if (dir.XLM > 0) kinds.add("XLM");
    if (dir.USDC > 0) kinds.add("USDC");
    for (const o of dir.other) kinds.add(o.code);
  }
  if (kinds.size === 0) return "None";
  if (kinds.size <= 3) return Array.from(kinds).join(", ");
  return `${kinds.size} assets`;
}
