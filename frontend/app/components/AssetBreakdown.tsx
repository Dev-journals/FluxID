"use client";

import { motion } from "framer-motion";
import { AssetsBreakdown, UsdValuation } from "../../lib/scoring";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useXlmPrice } from "../../lib/useXlmPrice";

interface Props {
  assets?: AssetsBreakdown;
  usd?: UsdValuation;
  className?: string;
}

function fmt(n: number, maxFrac = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
}

function usdFmt(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function Row({
  label,
  amount,
  usdValue,
  color,
}: {
  label: string;
  amount: number;
  usdValue: number | null;
  color: string;
}) {
  if (amount <= 0) return null;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{label}</span>
      <div className="text-right">
        <span style={{ color, fontWeight: 700, fontSize: 13 }}>{fmt(amount)}</span>
        {usdValue !== null && (
          <span style={{ color: "var(--foreground-dim)", fontSize: 11 }} className="ml-2">
            ≈ {usdFmt(usdValue)}
          </span>
        )}
      </div>
    </div>
  );
}

function DirectionColumn({
  title,
  icon: Icon,
  tint,
  dir,
  xlmPrice,
}: {
  title: string;
  icon: typeof ArrowDownLeft;
  tint: string;
  dir: AssetsBreakdown["inflow"];
  xlmPrice: number | null;
}) {
  const hasAny = dir.XLM > 0 || dir.USDC > 0 || dir.other.length > 0;
  return (
    <div style={{ background: "var(--surface)", borderRadius: 12 }} className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color: tint }} />
        <span style={{ color: tint, fontSize: 12, fontWeight: 700 }} className="uppercase">
          {title}
        </span>
      </div>
      {!hasAny ? (
        <p style={{ color: "var(--foreground-dim)", fontSize: 12 }}>No activity</p>
      ) : (
        <>
          <Row
            label="XLM"
            amount={dir.XLM}
            usdValue={xlmPrice !== null && dir.XLM > 0 ? dir.XLM * xlmPrice : null}
            color={tint}
          />
          <Row label="USDC" amount={dir.USDC} usdValue={dir.USDC > 0 ? dir.USDC : null} color={tint} />
          {dir.other.map((o, i) => (
            <div
              key={`${o.code}-${o.issuer ?? ""}-${i}`}
              className="flex items-center justify-between py-1.5"
              title={o.issuer ? `${o.code} from ${o.issuer}` : o.code}
            >
              <span
                style={{ color: "var(--foreground-muted)", fontSize: 13 }}
                className="truncate max-w-[60%]"
              >
                {o.label}
                <span style={{ color: "var(--foreground-dim)", fontSize: 11 }} className="ml-1">
                  ({o.count})
                </span>
              </span>
              <div className="text-right">
                <span style={{ color: tint, fontWeight: 700, fontSize: 13 }}>{fmt(o.amount)}</span>
                <span style={{ color: "var(--foreground-dim)", fontSize: 11 }} className="ml-2">
                  — not priced
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function AssetBreakdown({ assets, usd, className = "" }: Props) {
  const xlmPrice = useXlmPrice(usd);

  if (!assets) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      className={`rounded-2xl p-6 ${className}`}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>
          Asset Breakdown
        </h3>
        {xlmPrice !== null && (
          <span style={{ color: "var(--foreground-dim)", fontSize: 11 }}>
            XLM = {usdFmt(xlmPrice)} · via {usd?.priceSource ?? "price feed"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DirectionColumn
          title="Inflow"
          icon={ArrowDownLeft}
          tint="#22c55e"
          dir={assets.inflow}
          xlmPrice={xlmPrice}
        />
        <DirectionColumn
          title="Outflow"
          icon={ArrowUpRight}
          tint="#ef4444"
          dir={assets.outflow}
          xlmPrice={xlmPrice}
        />
      </div>
    </motion.div>
  );
}
