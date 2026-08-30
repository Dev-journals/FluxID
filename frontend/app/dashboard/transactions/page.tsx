"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Activity, Filter, ArrowLeftRight, ExternalLink, Info, ChevronDown } from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import { truncateAddress } from "../../context/FreighterContext";
import type { TransactionData } from "../../../lib/scoring";

type DirectionFilter = "all" | "inflow" | "outflow" | "swap";

const FILTERS: { key: DirectionFilter; label: string; Icon: typeof ArrowDownLeft | null }[] = [
  { key: "all", label: "All", Icon: null },
  { key: "inflow", label: "Inflow", Icon: ArrowDownLeft },
  { key: "outflow", label: "Outflow", Icon: ArrowUpRight },
  { key: "swap", label: "Swap", Icon: ArrowLeftRight },
];

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function assetCode(asset: string): string {
  if (!asset || asset === "XLM" || asset === "native") return "XLM";
  const [code] = asset.split(":");
  return code || asset;
}

export interface AssetMeta {
  code: string;
  issuer?: string;
  domain?: string;
  name?: string;
  description?: string;
  isStandard?: boolean;
  stellarExpertUrl: string;
}

export function getAssetMeta(assetStr: string): AssetMeta {
  if (!assetStr || assetStr === "XLM" || assetStr === "native") {
    return {
      code: "XLM",
      name: "Stellar Lumens",
      description: "Native token of the Stellar network",
      isStandard: true,
      stellarExpertUrl: "https://stellar.expert/explorer/public/asset/XLM",
    };
  }

  const parts = assetStr.split(":");
  const code = parts[0];
  const issuer = parts[1];

  if (code === "USDC") {
    const usdcIssuer = issuer || "GA5Z3543JZG3A5Y36Y645C227X43D2M3H33N75";
    return {
      code: "USDC",
      issuer: usdcIssuer,
      domain: "centre.io",
      name: "USD Coin",
      description: "Circle USD Stablecoin on Stellar",
      isStandard: true,
      stellarExpertUrl: `https://stellar.expert/explorer/public/asset/USDC-${usdcIssuer}`,
    };
  }

  if (code === "yUSDC" || assetStr.toLowerCase().includes("yusdc")) {
    const yIssuer = issuer || "GD5J6ZEFBCW4SPO4XM5JGKT4P4HSE2W5EOADYA6FZWWZ7BSEJJN3SXSZ";
    return {
      code: "yUSDC",
      issuer: yIssuer,
      domain: "ultracapital.xyz",
      name: "yUSDC (wrapped USDC)",
      description: "Yield-bearing wrapped USDC token on Stellar by Ultra Capital",
      isStandard: false,
      stellarExpertUrl: `https://stellar.expert/explorer/public/asset/yUSDC-${yIssuer}`,
    };
  }

  const url = issuer
    ? `https://stellar.expert/explorer/public/asset/${code}-${issuer}`
    : `https://stellar.expert/explorer/public/asset/${code}`;

  return {
    code: code || assetStr,
    issuer,
    name: `${code} Asset`,
    description: issuer ? `${code} — Custom Stellar Asset` : `${code} asset`,
    isStandard: !issuer,
    stellarExpertUrl: url,
  };
}

function AssetBadge({ asset }: { asset: string }) {
  const meta = getAssetMeta(asset);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-flex items-center gap-1">
      <a
        href={meta.stellarExpertUrl}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className="inline-flex items-center gap-1 font-mono text-xs font-semibold hover:underline cursor-pointer group"
        style={{ color: meta.isStandard ? "var(--foreground-muted)" : "var(--primary)" }}
        title={`Verify ${meta.code} on stellar.expert`}
      >
        <span>{meta.code}</span>
        {!meta.isStandard && (
          <span
            style={{ fontSize: 10, background: "rgba(143, 168, 40, 0.15)", color: "#8FA828" }}
            className="px-1 py-0.5 rounded font-sans font-medium"
          >
            wrapped
          </span>
        )}
        <ExternalLink size={10} className="opacity-60 group-hover:opacity-100 transition-opacity" />
      </a>

      {showTooltip && (
        <div
          className="absolute z-50 bottom-full right-0 mb-2 w-64 p-3 rounded-xl shadow-xl text-left pointer-events-auto"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div className="flex items-center justify-between gap-1 mb-1 pb-1 border-b border-[var(--border)]">
            <span className="font-bold text-xs flex items-center gap-1" style={{ color: "var(--primary)" }}>
              <Info size={12} /> {meta.name || meta.code}
            </span>
            {meta.domain && (
              <span className="text-[10px] text-muted-foreground font-mono bg-[var(--background)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                {meta.domain}
              </span>
            )}
          </div>

          <p className="text-[11px] mb-2" style={{ color: "var(--foreground-muted)" }}>
            {meta.description}
          </p>

          {meta.issuer && (
            <div className="text-[10px] font-mono break-all mb-2 p-1.5 rounded bg-[var(--background)] border border-[var(--border)]">
              <span className="text-[9px] font-sans font-bold block" style={{ color: "var(--foreground-muted)" }}>
                ISSUER ADDRESS:
              </span>
              <span>{meta.issuer}</span>
            </div>
          )}

          <a
            href={meta.stellarExpertUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:underline"
          >
            Verify on stellar.expert <ExternalLink size={10} />
          </a>
        </div>
      )}
    </div>
  );
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
    const inTxs = txs.filter((t) => t.type === "inflow" && t.amount > 0);
    const outTxs = txs.filter((t) => t.type === "outflow" && t.amount > 0);
    const swapTxs = txs.filter((t) => t.type === "swap" && (t.amount > 0 || !!t.swapDetails));

    const totalRealTransfers = inTxs.length + outTxs.length + swapTxs.length;

    return {
      allIn: inTxs.length,
      allOut: outTxs.length,
      allSwap: swapTxs.length,
      allTotal: totalRealTransfers,
      displayTotal:
        filter === "all"
          ? totalRealTransfers
          : filter === "inflow"
          ? inTxs.length
          : filter === "outflow"
          ? outTxs.length
          : swapTxs.length,
      displayIn: filter === "all" || filter === "inflow" ? inTxs.length : 0,
      displayOut: filter === "all" || filter === "outflow" ? outTxs.length : 0,
      displaySwap: filter === "all" || filter === "swap" ? swapTxs.length : 0,
    };
  }, [txs, filter]);

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
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 px-1">
              <span style={{ color: "var(--foreground-muted)", fontSize: 12, fontWeight: 600 }} className="flex items-center gap-1.5">
                {filter === "all" ? (
                  <>
                    <span>All-time totals</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] font-normal">
                      Reflects all real transfer volume
                    </span>
                  </>
                ) : (
                  <>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary uppercase">
                      Filtered Stats ({filter})
                    </span>
                    <span>
                      Showing {stats.displayTotal} of {stats.allTotal} real transfers
                    </span>
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Total"
                value={stats.displayTotal}
                color="var(--foreground)"
                subtext={filter === "all" ? "All real transfers" : `Filtered: ${filter}`}
                hint="Total count reflects value transfers (payments, swaps). Non-monetary operations like trustline setups are listed with amount 0."
                isActive={true}
                isFiltered={filter !== "all"}
              />
              <StatCard
                label="Inflows"
                value={stats.displayIn}
                color="#22c55e"
                subtext={filter === "all" ? "Real incoming transfers" : filter === "inflow" ? "Active filter" : "Filtered out"}
                isActive={filter === "all" || filter === "inflow"}
                isFiltered={filter !== "all"}
              />
              <StatCard
                label="Outflows"
                value={stats.displayOut}
                color="#ef4444"
                subtext={filter === "all" ? "Real outgoing transfers" : filter === "outflow" ? "Active filter" : "Filtered out"}
                isActive={filter === "all" || filter === "outflow"}
                isFiltered={filter !== "all"}
              />
              <StatCard
                label="Swaps"
                value={stats.displaySwap}
                color="#8FA828"
                subtext={filter === "all" ? "Asset conversions" : filter === "swap" ? "Active filter" : "Filtered out"}
                isActive={filter === "all" || filter === "swap"}
                isFiltered={filter !== "all"}
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-border">
              <span style={{ color: "var(--foreground-muted)", fontSize: 12 }} className="flex items-center gap-1.5 shrink-0">
                <Filter size={12} /> {filtered.length}<span className="hidden sm:inline"> transaction{filtered.length === 1 ? "" : "s"}</span>
              </span>
              <div className="pressed p-0.5 flex items-center gap-0.5">
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
                            ) : tx.amount === 0 ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span style={{ color: "var(--foreground-muted)" }}>0</span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "#f59e0b",
                                    border: "1px solid rgba(245, 158, 11, 0.25)",
                                  }}
                                  className="px-1.5 py-0.5 rounded font-sans font-semibold"
                                >
                                  Non-transfer
                                </span>
                              </span>
                            ) : (
                              <>
                                {tx.type === "inflow" ? "+" : "−"}
                                {formatAmount(tx.amount)}{" "}
                                <span style={{ color: "var(--foreground-muted)", fontWeight: 400 }}>
                                  {assetCode(tx.asset)}
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
                            color: tx.type === "inflow" ? "#22c55e" : tx.type === "outflow" ? "#ef4444" : "#8FA828",
                          }}
                        >
                          {tx.type === "swap" && tx.swapDetails ? (
                            <>
                              ⇄ {formatAmount(tx.swapDetails.fromAmount)} {tx.swapDetails.fromAsset}
                              {" → "}
                              {formatAmount(tx.swapDetails.toAmount)} {tx.swapDetails.toAsset}
                            </>
                          ) : tx.amount === 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span style={{ color: "var(--foreground-muted)" }}>0</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  background: "rgba(245, 158, 11, 0.15)",
                                  color: "#f59e0b",
                                  border: "1px solid rgba(245, 158, 11, 0.25)",
                                }}
                                className="px-1.5 py-0.5 rounded font-sans font-semibold"
                                title="Protocol operation with zero monetary transfer volume (e.g. trustline / claimable balance setup)"
                              >
                                Non-transfer
                              </span>
                            </div>
                          ) : (
                            <>
                              {tx.type === "inflow" ? "+" : "−"}
                              {formatAmount(tx.amount)}
                            </>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right" style={{ color: "var(--foreground-muted)", fontSize: 12 }}>
                          {tx.type === "swap" && tx.swapDetails ? (
                            <div className="inline-flex items-center gap-1 justify-end">
                              <AssetBadge asset={tx.swapDetails.fromAsset} />
                              <span>→</span>
                              <AssetBadge asset={tx.swapDetails.toAsset} />
                            </div>
                          ) : (
                            <AssetBadge asset={tx.asset} />
                          )}
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

function StatCard({
  label,
  value,
  color,
  subtext,
  hint,
  isActive = true,
  isFiltered = false,
}: {
  label: string;
  value: number;
  color: string;
  subtext?: string;
  hint?: string;
  isActive?: boolean;
  isFiltered?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: isActive ? `1px solid ${color}` : "1px solid var(--border)",
        boxShadow: isActive && isFiltered ? `0 0 12px ${color}20` : "none",
        opacity: isActive ? 1 : 0.45,
      }}
      className="rounded-xl p-4 transition-all"
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1">
          <p style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 600 }} className="uppercase">
            {label}
          </p>
          {hint && <StatHint text={hint} />}
        </div>
        {isFiltered && isActive && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase">
            Active
          </span>
        )}
      </div>
      <p style={{ color, fontSize: 24, fontWeight: 900 }}>{value}</p>
      {subtext && (
        <p style={{ color: "var(--foreground-muted)", fontSize: 10 }} className="mt-1">
          {subtext}
        </p>
      )}
    </div>
  );
}
