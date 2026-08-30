"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchProtocolAlerts, type ProtocolAlert, type ProtocolNetwork } from "../../lib/protocolApi";

interface EarlyWarningBannerProps {
  refreshKey?: number;
  network?: ProtocolNetwork;
}

export default function EarlyWarningBanner({ refreshKey = 0, network }: EarlyWarningBannerProps) {
  const [alerts, setAlerts] = useState<ProtocolAlert[]>([]);

  useEffect(() => {
    let active = true;
    fetchProtocolAlerts(network).then((res) => {
      if (active) setAlerts(res?.alerts ?? []);
    });
    return () => {
      active = false;
    };
  }, [refreshKey, network]);

  const removeAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3 mb-8" id="early-warning-system">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            style={{
              background: alert.severity === "High" ? "#ef444415" : "#eab30815",
              border: `1px solid ${alert.severity === "High" ? "#ef444430" : "#eab30830"}`,
              borderRadius: 16,
            }}
            className="overflow-hidden"
          >
            <div className="p-4 flex items-start gap-4">
              <div
                style={{
                  color: alert.severity === "High" ? "#ef4444" : "#eab308",
                  marginTop: 2,
                }}
              >
                <AlertCircle size={20} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h4
                    style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 14 }}
                  >
                    {alert.title}
                  </h4>
                  <span
                    style={{
                      background: alert.severity === "High" ? "#ef4444" : "#eab308",
                      color: "white",
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                    className="px-2 py-0.5 rounded-full uppercase"
                  >
                    {alert.severity} Risk
                  </span>
                </div>
                <p
                  style={{ color: "var(--foreground-muted)", fontSize: 13, lineHeight: 1.5 }}
                >
                  {alert.desc}
                </p>
                <button
                  className="mt-3 flex items-center gap-1 text-xs font-bold uppercase transition-opacity hover:opacity-80"
                  style={{ color: alert.severity === "High" ? "#ef4444" : "#eab308" }}
                >
                  Investigate <ChevronRight size={12} />
                </button>
              </div>
              <button
                onClick={() => removeAlert(alert.id)}
                className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                style={{ color: "var(--foreground-dim)" }}
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
