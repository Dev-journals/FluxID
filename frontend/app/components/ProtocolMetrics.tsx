"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp, AlertTriangle, Activity } from "lucide-react";
import { fetchProtocolHealth, type ProtocolHealth, type ProtocolNetwork } from "../../lib/protocolApi";

interface Metric {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: typeof Activity;
  color: string;
}

function deltaParts(
  delta: number | null,
  suffix: string,
  upIsGood: boolean
): { change: string; trend: "up" | "down" } {
  if (delta === null) return { change: "—", trend: "up" };
  if (delta === 0) return { change: `0${suffix}`, trend: "up" };
  const sign = delta > 0 ? "+" : "";
  const formatted = suffix === "%" ? delta.toFixed(1) : delta.toString();
  const change = `${sign}${formatted}${suffix}`;
  const isPositive = delta > 0;
  const isGood = upIsGood ? isPositive : !isPositive;
  return { change, trend: isGood ? "up" : "down" };
}

interface ProtocolMetricsProps {
  refreshKey?: number;
  network?: ProtocolNetwork;
}

export default function ProtocolMetrics({ refreshKey = 0, network }: ProtocolMetricsProps) {
  const [health, setHealth] = useState<ProtocolHealth | null>(null);

  useEffect(() => {
    let active = true;
    fetchProtocolHealth(network).then((h) => {
      if (active) setHealth(h);
    });
    return () => {
      active = false;
    };
  }, [refreshKey, network]);

  const avgScoreDelta = deltaParts(health?.delta.avgScore ?? null, "", true);
  const totalWalletsDelta = deltaParts(health?.delta.totalWallets ?? null, "", true);
  const lowRiskDelta = deltaParts(health?.delta.lowRiskPct ?? null, "%", true);
  const highRiskDelta = deltaParts(health?.delta.highRiskAlerts ?? null, "", false);

  const metrics: Metric[] = [
    {
      label: "Average Liquidity Score",
      value: health ? health.avgScore.toFixed(1) : "—",
      change: avgScoreDelta.change,
      trend: avgScoreDelta.trend,
      icon: Activity,
      color: "var(--primary)",
    },
    {
      label: "Active Wallets Monitored",
      value: health ? health.totalWallets.toLocaleString() : "—",
      change: totalWalletsDelta.change,
      trend: totalWalletsDelta.trend,
      icon: Users,
      color: "#3b82f6",
    },
    {
      label: "Low Risk User-Base",
      value: health ? `${Math.round(health.lowRiskPct)}%` : "—",
      change: lowRiskDelta.change,
      trend: lowRiskDelta.trend,
      icon: TrendingUp,
      color: "#22c55e",
    },
    {
      label: "High Risk Alerts",
      value: health ? String(health.highRiskAlerts) : "—",
      change: highRiskDelta.change,
      trend: highRiskDelta.trend,
      icon: AlertTriangle,
      color: "#ef4444",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {metrics.map((m, i) => (
        <motion.div
          key={m.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 20,
          }}
          className="p-5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div
              style={{
                background: `${m.color}15`,
                color: m.color,
                borderRadius: 10,
              }}
              className="w-10 h-10 flex items-center justify-center"
            >
              <m.icon size={20} />
            </div>
            <span
              style={{
                color: m.trend === "up" ? "#22c55e" : "#ef4444",
                background: m.trend === "up" ? "#22c55e15" : "#ef444415",
                fontSize: 12,
                fontWeight: 700,
              }}
              className="px-2 py-0.5 rounded-full"
            >
              {m.change}
            </span>
          </div>
          <div>
            <p
              style={{ color: "var(--foreground-muted)", fontSize: 13 }}
              className="mb-1"
            >
              {m.label}
            </p>
            <h3
              style={{ color: "var(--foreground)", fontWeight: 900, fontSize: 24 }}
            >
              {m.value}
            </h3>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
