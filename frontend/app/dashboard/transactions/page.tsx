"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Activity, Filter, ArrowLeftRight, ChevronDown } from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import { truncateAddress } from "../../context/FreighterContext";
import type { TransactionData } from "../../../lib/scoring";

type DirectionFilter = "all" | "inflow" | "outflow" | "swap";

// "All" keeps its text on every screen; the three direction filters collapse to
// icon-only on mobile so the row never outgrows the card.
const FILTERS: { key: DirectionFilter; label: string; Icon: typeof ArrowDownLeft | null }[] = [
  { key: "all", label: "All", Icon: null },
  { key: "inflow", label: "Inflow", Icon: ArrowDownLeft },
  { key: "outflow", label: "Outflow", Icon: ArrowUpRight },
  { key: "swap", label: "Swap", Icon: ArrowLeftRight },
];

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function assetLabel(asset: string): string {
  if (!asset || asset === "XLM" || asset === "native") return "XLM";
  const [code, issuer] = asset.split(":");
  if (code === "USDC") return "USDC";
  return issuer ? `${code}` : code;
}

function StatHint({ text }: { text: string }) {
  const [pinned, setPinned] = useState(false);

  return (
    <span className="relative inline-flex group/hint">
      <button
        onClick={() => setPinned((p) => !p)}
        aria-label="More info"
        className="p-0.5 rounded transition-colors hover:bg-[var(--surface)]"
        style={{ color: "var(--foreground-dim)" }}
      >
        <ChevronDown size={12} />
      </button>
      {pinned && (
        <span
          className="absolute top-full left-0 mt-1 z-50 w-56 p-2.5 rounded-lg text-left shadow-lg"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground-muted)",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {text}
        </span>
      )}
      <span
        className="absolute top-full left-0 mt-1 z-50 w-56 p-2.5 rounded-lg text-left shadow-lg pointer-events-none opacity-0 group-hover/hint:opacity-100 transition-opacity"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          color: "var(--foreground-muted)",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        {text}
      </span>
    </span>
  );
}

export default function TransactionsPage() {
  const { analysis, analyzedAddress, isAnalyzing } = useAnalysis();
  const [filter, setFilter] = useState<DirectionFilter>("all");

  const txs: TransactionData[] = analysis?.transactions ?? [];

  const filtered = useMemo(() => {
    if (filter === "all") return txs;
    return txs.filter((t) => t.type === filter);
  }, [txs, filter]);

  const stats = useMemo(() => {
    const inCount = txs.filter((t) => t.type === "inflow").length;
    const outCount = txs.filter((t) => t.type === "outflow").length;
    const swapCount = txs.filter((t) => t.type === "swap").length;
    return { inCount, outCount, swapCount, total: txs.length };
  }, [txs]);

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
            Transactions
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            {analyzedAddress
              ? "Complete transaction history for this wallet"
              : "Analyze a wallet to see its transactions."}
          </p>
        </div>
      </div>

      {isAnalyzing && (
        <div className="card p-6 text-center">
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>Loading transactions…</p>
        </div>
      )}

      {!isAnalyzing && !analysis && (
        <div className="card p-8 text-center">
          <Activity size={32} style={{ color: "var(--foreground-muted)", margin: "0 auto 12px" }} />
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            No wallet analyzed yet. Paste an address above to see its transactions here.
          </p>
        </div>
      )}

      {analysis && !isAnalyzing && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total" value={stats.total} color="var(--foreground)" hint="Showing payment transfers only. The Analytics page counts all on-chain operations (including account setup, data writes, etc.) — the totals may differ." />
            <StatCard label="Inflows" value={stats.inCount} color="#22c55e" />
            <StatCard label="Outflows" value={stats.outCount} color="#ef4444" />
            <StatCard label="Swaps" value={stats.swapCount} color="#8FA828" />
          </div>

          <div className="card overflow-hidden">
            <div
              className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-border"
            >
              <span style={{ color: "var(--foreground-muted)", fontSize: 12 }} className="flex items-center gap-1.5 shrink-0">
                <Filter size={12} /> {filtered.length}<span className="hidden sm:inline"> transaction{filtered.length === 1 ? "" : "s"}</span>
              </span>
              <div
                className="pressed p-0.5 flex items-center gap-0.5"
              >
                {FILTERS.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    aria-label={label}
                    title={label}
                    style={{
                      background: filter === key ? "var(--primary)" : "transparent",
                      color: filter === key ? "var(--background)" : "var(--foreground-muted)",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                    className="px-2 sm:px-3 py-1.5 rounded-md uppercase transition-colors flex items-center gap-1"
                  >
                    {Icon ? <Icon size={13} /> : null}
                    <span className={Icon ? "hidden sm:inline" : ""}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <p style={{ color: "var(--foreground-muted)", fontSize: 13 }}>
                  {txs.length === 0
                    ? "No transactions found"
                    : "No transactions matching the filter."}
                </p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {/* Mobile: stacked cards so nothing scrolls sideways. */}
                <div className="sm:hidden divide-y divide-[var(--border)]">
                  {filtered.map((tx) => {
                    const dirColor =
                      tx.type === "inflow" ? "#22c55e" : tx.type === "outflow" ? "#ef4444" : "#8FA828";
                    return (
                      <div key={tx.id} className="px-4 py-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          {tx.type === "inflow" ? (
                            <span style={{ color: dirColor }} className="inline-flex items-center gap-1 text-xs font-semibold">
                              <ArrowDownLeft size={12} /> IN
                            </span>
                          ) : tx.type === "outflow" ? (
                            <span style={{ color: dirColor }} className="inline-flex items-center gap-1 text-xs font-semibold">
                              <ArrowUpRight size={12} /> OUT
                            </span>
                          ) : (
                            <span style={{ color: dirColor }} className="inline-flex items-center gap-1 text-xs font-semibold">
                              <ArrowLeftRight size={12} /> SWAP
                            </span>
                          )}
                          <span style={{ color: "var(--foreground-muted)", fontSize: 11 }}>{tx.date}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <span
                            className="font-mono break-all"
                            style={{ color: "var(--foreground-muted)", fontSize: 12 }}
                            title={tx.address}
                          >
                            {truncateAddress(tx.address)}
                          </span>
                          <span className="font-semibold text-right break-all" style={{ color: dirColor, fontSize: 13 }}>
                            {tx.type === "swap" && tx.swapDetails ? (
                              <>
                                {formatAmount(tx.swapDetails.fromAmount)} {tx.swapDetails.fromAsset}
                                {" → "}
                                {formatAmount(tx.swapDetails.toAmount)} {tx.swapDetails.toAsset}
                              </>
                            ) : (
                              <>
                                {tx.type === "inflow" ? "+" : "−"}
                                {formatAmount(tx.amount)}{" "}
                                <span style={{ color: "var(--foreground-muted)", fontWeight: 400 }}>
                                  {assetLabel(tx.asset)}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: full table. */}
                <table className="hidden sm:table w-full text-sm">
                  <thead>
                    <tr style={{ color: "var(--foreground-muted)", fontSize: 11 }}>
                      <th className="text-left px-5 py-3 font-semibold uppercase">Date</th>
                      <th className="text-left px-5 py-3 font-semibold uppercase">Direction</th>
                      <th className="text-left px-5 py-3 font-semibold uppercase">Counterparty</th>
                      <th className="text-right px-5 py-3 font-semibold uppercase">Amount</th>
                      <th className="text-right px-5 py-3 font-semibold uppercase">Asset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((tx, i) => (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.01, 0.3) }}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td className="px-5 py-3" style={{ color: "var(--foreground-muted)", fontSize: 12 }}>
                          {tx.date}
                        </td>
                        <td className="px-5 py-3">
                          {tx.type === "inflow" ? (
                            <span style={{ color: "#22c55e" }} className="inline-flex items-center gap-1 text-xs font-semibold">
                              <ArrowDownLeft size={12} /> IN
                            </span>
                          ) : tx.type === "outflow" ? (
                            <span style={{ color: "#ef4444" }} className="inline-flex items-center gap-1 text-xs font-semibold">
                              <ArrowUpRight size={12} /> OUT
                            </span>
                          ) : (
                            <span style={{ color: "#8FA828" }} className="inline-flex items-center gap-1 text-xs font-semibold">
                              <ArrowLeftRight size={12} /> SWAP
                            </span>
                          )}
                        </td>
                        <td
                          className="px-5 py-3 font-mono"
                          style={{ color: "var(--foreground-muted)", fontSize: 12 }}
                          title={tx.address}
                        >
                          {truncateAddress(tx.address)}
                        </td>
                        <td
                          className="px-5 py-3 text-right font-semibold"
                          style={{
                            color: tx.type === "inflow" ? "#22c55e" : tx.type === "outflow" ? "#ef4444" : "#8FA828"
                          }}
                        >
                          {tx.type === "swap" && tx.swapDetails ? (
                            <>
                              ⇄ {formatAmount(tx.swapDetails.fromAmount)} {tx.swapDetails.fromAsset}
                              {" → "}
                              {formatAmount(tx.swapDetails.toAmount)} {tx.swapDetails.toAsset}
                            </>
                          ) : (
                            <>
                              {tx.type === "inflow" ? "+" : "−"}
                              {formatAmount(tx.amount)}
                            </>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right" style={{ color: "var(--foreground-muted)", fontSize: 12 }}>
                          {tx.type === "swap" && tx.swapDetails
                            ? `${tx.swapDetails.fromAsset} → ${tx.swapDetails.toAsset}`
                            : assetLabel(tx.asset)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function StatCard({ label, value, color, hint }: { label: string; value: number; color: string; hint?: string }) {
  return (
    <div
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      className="rounded-xl p-4"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <p style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 600 }} className="uppercase">
          {label}
        </p>
        {hint && <StatHint text={hint} />}
      </div>
      <p style={{ color, fontSize: 24, fontWeight: 900 }}>{value}</p>
    </div>
  );
}
