"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fetchProtocolRiskHeatmap, type ProtocolNetwork, type ProtocolRiskBand } from "../../lib/protocolApi";

interface RiskHeatmapProps {
  refreshKey?: number;
  network?: ProtocolNetwork;
}

export default function RiskHeatmap({ refreshKey = 0, network }: RiskHeatmapProps) {
  const [bands, setBands] = useState<ProtocolRiskBand[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchProtocolRiskHeatmap(network).then((res) => {
      if (active) setBands(res?.bands ?? []);
    });
    return () => {
      active = false;
    };
  }, [refreshKey, network]);

  const isLoading = bands === null;
  const isEmpty = !isLoading && bands.length === 0;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 20,
      }}
      className="p-6 h-full"
    >
      <div className="flex items-center justify-between mb-6">
        <h3
          style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 18 }}
        >
          Risk Heatmap
        </h3>
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5" style={{ color: "#22c55e" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} /> Low
          </div>
          <div className="flex items-center gap-1.5" style={{ color: "#eab308" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#eab308" }} /> Med
          </div>
          <div className="flex items-center gap-1.5" style={{ color: "#ef4444" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /> High
          </div>
        </div>
      </div>

      {isLoading && (
        <p
          style={{ color: "var(--foreground-dim)", fontSize: 13 }}
          className="py-8 text-center"
        >
          Loading risk bands…
        </p>
      )}

      {isEmpty && (
        <p
          style={{ color: "var(--foreground-dim)", fontSize: 13 }}
          className="py-8 text-center"
        >
          No scored wallets yet — heatmap will populate as wallets are analyzed.
        </p>
      )}

      {!isLoading && !isEmpty && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {bands.map((region, i) => {
            const color =
              region.risk < 30 ? "#22c55e" : region.risk < 70 ? "#eab308" : "#ef4444";
            return (
              <motion.div
                key={region.name}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col items-center gap-3"
                title={`${region.walletCount} wallet${region.walletCount === 1 ? "" : "s"} · avg score ${region.avgScore}`}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    background: `radial-gradient(circle at center, ${color}40 0%, transparent 80%)`,
                    border: `1px solid ${color}30`,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: `${region.activity}%`,
                      height: `${region.activity}%`,
                      background: color,
                      opacity: 0.2,
                      borderRadius: "50%",
                      filter: "blur(8px)",
                    }}
                  />
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      background: "var(--surface)",
                      border: `2px solid ${color}`,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{ color: "var(--foreground)", fontWeight: 900, fontSize: 12 }}
                    >
                      {region.risk}
                    </span>
                  </div>
                </div>
                <span
                  style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 700 }}
                  className="uppercase tracking-widest"
                >
                  {region.name}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
      <p style={{ color: "var(--foreground-dim)", fontSize: 11 }} className="mt-8">
        Visualizing risk concentration across monitored wallet clusters.
      </p>
    </div>
  );
}
