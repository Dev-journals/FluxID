"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Download, Plus } from "lucide-react";
import ProtocolMetrics from "../../components/ProtocolMetrics";
import RiskHeatmap from "../../components/RiskHeatmap";
import EarlyWarningBanner from "../../components/EarlyWarningBanner";
import {
  addProtocolWallets,
  fetchProtocolCohorts,
  fetchProtocolHealth,
  fetchProtocolSegments,
  pingBackendHealth,
  resetProtocolHistory,
  formatCacheAge,
  resolveSegmentEmptyKind,
  segmentEmptyMessage,
  type AddWalletsResult,
  type ProtocolCohort,
  type ProtocolNetwork,
  type ProtocolRequestOptions,
  type SegmentActivity,
  type SegmentResult,
} from "../../../lib/protocolApi";
import { isAccountNotFoundMessage } from "../../../lib/scoring";
import AccountNotFoundHelp from "../../components/AccountNotFoundHelp";
import { useStoredNetwork } from "../../../lib/dashboardStorage";

type RiskFilter = "" | "Low" | "Medium" | "High";
type ActivityFilter = "" | SegmentActivity;

function truncateWallet(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export default function ProtocolDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const [cohorts, setCohorts] = useState<ProtocolCohort[] | null>(null);
  const [queryOpen, setQueryOpen] = useState(false);
  const [minScore, setMinScore] = useState<string>("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [risk, setRisk] = useState<RiskFilter>("");
  const [activity, setActivity] = useState<ActivityFilter>("");
  const [consistent, setConsistent] = useState(false);
  const [segmentResult, setSegmentResult] = useState<SegmentResult | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentFetchFailed, setSegmentFetchFailed] = useState(false);
  const [totalScored, setTotalScored] = useState(0);
  const [cohortsError, setCohortsError] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [protocolNetwork, setProtocolNetwork] = useStoredNetwork();
  const [walletInput, setWalletInput] = useState("");
  const [uploadResult, setUploadResult] = useState<AddWalletsResult | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [wakingServer, setWakingServer] = useState(false);

  const onRetry = useCallback(() => setWakingServer(true), []);
  const requestOptions: ProtocolRequestOptions = { onRetry };

  useEffect(() => {
    let active = true;
    setWakingServer(false);
    (async () => {
      await pingBackendHealth(requestOptions);
      if (!active) return;
      const [health, res] = await Promise.all([
        fetchProtocolHealth(protocolNetwork, requestOptions),
        fetchProtocolCohorts(protocolNetwork, requestOptions),
      ]);
      if (!active) return;
      setTotalScored(health?.totalWallets ?? 0);
      setCohortsError(res == null);
      setCohorts(res?.cohorts ?? []);
      setWakingServer(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, onRetry, protocolNetwork]);

  const cohortsLoading = cohorts === null;
  const cohortMax = cohorts && cohorts.length > 0
    ? Math.max(1, ...cohorts.map((c) => c.count))
    : 1;
  // Cohort buckets (High Trust / Low risk / At Risk / Dormant) can all be 0 even
  // when Medium wallets are scored. Use totalScored so we don't mislabel a
  // successful pipeline as "nothing scored yet".
  const noWalletsScored =
    !cohortsLoading && !cohortsError && totalScored === 0;

  const runSegmentQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setSegmentLoading(true);
    setSegmentFetchFailed(false);
    const [result, health] = await Promise.all([
      fetchProtocolSegments(
        {
          minScore: minScore === "" ? undefined : Number(minScore),
          maxScore: maxScore === "" ? undefined : Number(maxScore),
          risk: risk === "" ? undefined : risk,
          activity: activity === "" ? undefined : activity,
          consistent: consistent ? true : undefined,
          limit: 50,
        },
        protocolNetwork,
        requestOptions
      ),
      fetchProtocolHealth(protocolNetwork, requestOptions),
    ]);
    if (health) setTotalScored(health.totalWallets);
    setSegmentFetchFailed(result == null);
    setSegmentResult(
      result ?? {
        network: protocolNetwork,
        criteria: {},
        total: 0,
        returned: 0,
        wallets: [],
      }
    );
    setSegmentLoading(false);
    setWakingServer(false);
  };

  const runUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const wallets = walletInput
      .split(/[\s,]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (wallets.length === 0) return;
    setUploadLoading(true);
    setUploadResult(null);
    const result = await addProtocolWallets(wallets, protocolNetwork, requestOptions);
    setUploadResult(result);
    setUploadLoading(false);
    setWakingServer(false);
    if (result && result.scored > 0) {
      setRefreshKey((k) => k + 1);
    }
  };

  const refreshFromHorizon = async () => {
    const wallets = walletInput
      .split(/[\s,]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (wallets.length === 0) return;
    setUploadLoading(true);
    const result = await addProtocolWallets(wallets, protocolNetwork, {
      ...requestOptions,
      refresh: true,
    });
    setUploadResult(result);
    setUploadLoading(false);
    setWakingServer(false);
    if (result && result.scored > 0) {
      setRefreshKey((k) => k + 1);
    }
  };

  const runReset = async () => {
    if (!confirm("Reset protocol intelligence data? This clears all uploaded wallets.")) return;
    setResetting(true);
    await resetProtocolHistory(protocolNetwork, requestOptions);
    setWakingServer(false);
    setUploadResult(null);
    setRefreshKey((k) => k + 1);
    setResetting(false);
  };

  const runExportReport = async () => {
    setExporting(true);
    try {
      const [health, segments] = await Promise.all([
        fetchProtocolHealth(protocolNetwork, requestOptions),
        fetchProtocolSegments({ limit: 500 }, protocolNetwork, requestOptions),
      ]);
      setWakingServer(false);
      if (!health || !segments) {
        alert("Could not fetch protocol data — make sure the backend is reachable.");
        return;
      }
      if (segments.total === 0) {
        alert("No protocol wallets to export. Add some wallets first.");
        return;
      }

      const escape = (val: string | number | boolean): string => {
        const s = String(val);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const lines: string[] = [];
      lines.push("FluxID Protocol Intelligence Report");
      lines.push(`Generated,${health.generatedAt}`);
      lines.push(`Network,${health.network}`);
      lines.push("");
      lines.push("Summary");
      lines.push(`Total Wallets,${health.totalWallets}`);
      lines.push(`Average Score,${health.avgScore}`);
      lines.push(`Low Risk %,${health.lowRiskPct}`);
      lines.push(`High Risk Alerts,${health.highRiskAlerts}`);
      lines.push(`Distribution Low,${health.distribution.low}`);
      lines.push(`Distribution Medium,${health.distribution.medium}`);
      lines.push(`Distribution High,${health.distribution.high}`);
      lines.push("");
      lines.push("Wallets");
      lines.push(
        "wallet,score,risk,observations,activity,consistent,scoreRange,firstSeenAt,lastSeenAt"
      );
      for (const w of segments.wallets) {
        lines.push(
          [
            escape(w.wallet),
            w.score,
            w.risk,
            w.observations,
            w.activity,
            w.consistent,
            w.scoreRange,
            escape(w.firstSeenAt),
            escape(w.lastSeenAt),
          ].join(",")
        );
      }

      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `fluxid-protocol-${health.network}-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1
            style={{ color: "var(--foreground)", letterSpacing: "-0.04em" }}
            className="text-3xl sm:text-4xl font-black mb-2"
          >
            Protocol Intelligence
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 15 }}>
            Real-time health monitoring and risk analysis for your entire user-base.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            id="protocol-network-switcher"
            className="flex items-center p-0.5 rounded-lg card overflow-hidden"
            role="radiogroup"
            aria-label="Protocol network"
          >
            {(["mainnet", "testnet"] as ProtocolNetwork[]).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={protocolNetwork === n}
                onClick={() => setProtocolNetwork(n)}
                style={{
                  background: protocolNetwork === n ? "var(--primary)" : "transparent",
                  color: protocolNetwork === n ? "var(--background)" : "var(--foreground-muted)",
                  fontSize: 11,
                  fontWeight: 700,
                }}
                className="px-3 py-1.5 rounded-md uppercase"
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={runExportReport}
            disabled={exporting}
            className="btn btn-outline text-xs h-10 px-4 flex items-center gap-2"
            style={{ borderRadius: 12, opacity: exporting ? 0.5 : 1 }}
          >
            <Download size={14} /> {exporting ? "Exporting…" : "Export Report"}
          </button>
          <button
            onClick={() => setUploadOpen((v) => !v)}
            className="btn btn-primary text-xs h-10 px-4 flex items-center gap-2"
            style={{ borderRadius: 12 }}
          >
            <Plus size={14} /> {uploadOpen ? "Close" : "Add Wallets"}
          </button>
        </div>
      </div>

      {wakingServer && (
        <div
          role="status"
          className="mb-6 rounded-2xl px-4 py-3 text-sm font-semibold"
          style={{
            background: "#eab30815",
            border: "1px solid #eab30840",
            color: "var(--foreground)",
          }}
        >
          Waking up server, please wait...
          <span
            style={{ color: "var(--foreground-muted)", fontWeight: 500, marginLeft: 8 }}
          >
            The backend is starting after idle. Your request will retry automatically — nothing is lost.
          </span>
        </div>
      )}

      {uploadOpen && (
        <form
          onSubmit={runUpload}
          className="mb-8 rounded-2xl"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            padding: 20,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 16 }}
            >
              Add Wallets to Protocol Intelligence
            </h3>
            <div
              className="flex items-center p-0.5 rounded-lg card overflow-hidden"
            >
              {(["mainnet", "testnet"] as ProtocolNetwork[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setProtocolNetwork(n)}
                  style={{
                    background: protocolNetwork === n ? "var(--primary)" : "transparent",
                    color: protocolNetwork === n ? "var(--background)" : "var(--foreground-muted)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                  className="px-3 py-1 rounded-md uppercase"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p
            style={{ color: "var(--foreground-muted)", fontSize: 12 }}
            className="mb-3"
          >
            Paste Stellar wallet addresses (one per line, or comma-separated). In production this happens via the{" "}
            <code style={{ color: "var(--primary)" }}>POST /protocol/wallets</code> API; this is the same code path.
          </p>
          <textarea
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            placeholder={"GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX\nGAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR\n..."}
            rows={6}
            className="w-full px-3 py-2 rounded-lg font-mono"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              fontSize: 12,
            }}
          />
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button
              type="submit"
              disabled={uploadLoading || walletInput.trim() === ""}
              className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
              style={{
                background: "var(--primary)",
                color: "var(--background)",
                opacity: uploadLoading || walletInput.trim() === "" ? 0.5 : 1,
              }}
            >
              {uploadLoading
                ? wakingServer
                  ? "Waking up server, please wait..."
                  : "Scoring…"
                : "Score & Add"}
            </button>
            {uploadResult && (
              <span style={{ color: "var(--foreground-muted)", fontSize: 12 }}>
                Scored {uploadResult.scored}/{uploadResult.requested}
                {uploadResult.failed.length > 0
                  ? ` · ${uploadResult.failed.length} failed`
                  : ""}
                {" · "}
                {(uploadResult.durationMs / 1000).toFixed(1)}s
                {uploadResult.wallets?.some((w) => w.horizonQueried)
                  ? " · Horizon"
                  : ""}
              </span>
            )}
            <button
              type="button"
              onClick={runReset}
              disabled={resetting}
              className="ml-auto text-xs underline"
              style={{
                color: "var(--foreground-dim)",
                opacity: resetting ? 0.4 : 1,
              }}
            >
              {resetting ? "resetting…" : "reset protocol data"}
            </button>
          </div>
          {uploadResult && uploadResult.cachedCount > 0 && (
            <div
              className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--foreground-muted)",
                fontSize: 12,
              }}
            >
              <span>
                Using cached data from{" "}
                {formatCacheAge(uploadResult.maxCacheAgeMs ?? 0)}
              </span>
              <button
                type="button"
                onClick={refreshFromHorizon}
                disabled={uploadLoading}
                className="underline font-semibold"
                style={{ color: "var(--primary)" }}
              >
                Refresh from Horizon
              </button>
            </div>
          )}
          {uploadResult && uploadResult.failed.length > 0 && (
            <div
              className="mt-3 pt-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <p
                style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 700 }}
                className="uppercase mb-2"
              >
                Failed
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {uploadResult.failed.map((f) => (
                  <div
                    key={f.wallet}
                    className="flex items-center justify-between text-xs font-mono"
                    style={{ color: "var(--foreground-dim)" }}
                  >
                    <span className="truncate mr-2" title={f.wallet}>
                      {truncateWallet(f.wallet)}
                    </span>
                    <span style={{ color: "#ef4444" }}>{f.reason}</span>
                  </div>
                ))}
              </div>
              {uploadResult.failed.some((f) => isAccountNotFoundMessage(f.reason)) && (
                <AccountNotFoundHelp
                  network={protocolNetwork}
                  switcherHref="#protocol-network-switcher"
                  onSwitchNetwork={() =>
                    setProtocolNetwork(protocolNetwork === "mainnet" ? "testnet" : "mainnet")
                  }
                />
              )}
            </div>
          )}
        </form>
      )}

      {/* Early Warning System */}
      <EarlyWarningBanner refreshKey={refreshKey} network={protocolNetwork} />

      {/* High-Level Metrics */}
      <ProtocolMetrics refreshKey={refreshKey} network={protocolNetwork} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Risk Heatmap - 2/3 width */}
        <div className="lg:col-span-2">
          <RiskHeatmap refreshKey={refreshKey} network={protocolNetwork} />
        </div>

        {/* Cohort & Segmentation Engine - 1/3 width */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 20,
          }}
          className="p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3
              style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 18 }}
            >
              Cohort Engine
            </h3>
            <Search size={18} style={{ color: "var(--foreground-dim)" }} />
          </div>

          <div className="space-y-4">
            <div className="relative">
              <p
                style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 700 }}
                className="uppercase mb-2"
              >
                Quick Segments
              </p>
              <div className="space-y-2">
                {cohortsLoading && (
                  <p
                    style={{ color: "var(--foreground-dim)", fontSize: 12 }}
                    className="py-2"
                  >
                    Loading segments…
                  </p>
                )}
                {!cohortsLoading && cohortsError && (
                  <p
                    style={{ color: "var(--foreground-dim)", fontSize: 12 }}
                    className="py-2"
                  >
                    {segmentEmptyMessage("pipeline-error")}
                  </p>
                )}
                {noWalletsScored && (
                  <p
                    style={{ color: "var(--foreground-dim)", fontSize: 12 }}
                    className="py-2"
                  >
                    {segmentEmptyMessage("none-scored")}
                  </p>
                )}
                {!cohortsLoading && !cohortsError && !noWalletsScored && cohorts && cohorts.map((s) => (
                  <button
                    key={s.id}
                    title={s.description}
                    className="w-full text-left p-3 rounded-xl transition-colors hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)] group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        style={{ color: "var(--foreground)", fontSize: 13, fontWeight: 600 }}
                      >
                        {s.name}
                      </span>
                      <span
                        style={{ color: "var(--foreground-dim)", fontSize: 11 }}
                        className="font-bold"
                      >
                        {s.count}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-[var(--surface)] rounded-full overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${(s.count / cohortMax) * 100}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--border)]">
              <button
                onClick={() => setQueryOpen((v) => !v)}
                className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
              >
                {queryOpen ? "Hide Custom Segment" : "Create Custom Segment"}
              </button>

              {queryOpen && (
                <form
                  onSubmit={runSegmentQuery}
                  className="mt-4 space-y-3"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span
                        style={{ color: "var(--foreground-muted)", fontSize: 10, fontWeight: 700 }}
                        className="uppercase block mb-1"
                      >
                        Min Score
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={minScore}
                        onChange={(e) => setMinScore(e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 rounded-md text-xs"
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                        }}
                      />
                    </label>
                    <label className="block">
                      <span
                        style={{ color: "var(--foreground-muted)", fontSize: 10, fontWeight: 700 }}
                        className="uppercase block mb-1"
                      >
                        Max Score
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={maxScore}
                        onChange={(e) => setMaxScore(e.target.value)}
                        placeholder="100"
                        className="w-full px-2 py-1.5 rounded-md text-xs"
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                        }}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span
                        style={{ color: "var(--foreground-muted)", fontSize: 10, fontWeight: 700 }}
                        className="uppercase block mb-1"
                      >
                        Risk
                      </span>
                      <select
                        value={risk}
                        onChange={(e) => setRisk(e.target.value as RiskFilter)}
                        className="w-full px-2 py-1.5 rounded-md text-xs"
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                        }}
                      >
                        <option value="">Any</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </label>
                    <label className="block">
                      <span
                        style={{ color: "var(--foreground-muted)", fontSize: 10, fontWeight: 700 }}
                        className="uppercase block mb-1"
                      >
                        Activity
                      </span>
                      <select
                        value={activity}
                        onChange={(e) => setActivity(e.target.value as ActivityFilter)}
                        className="w-full px-2 py-1.5 rounded-md text-xs"
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                        }}
                      >
                        <option value="">Any</option>
                        <option value="low">Low (1 obs)</option>
                        <option value="medium">Medium (2-3)</option>
                        <option value="high">High (4+)</option>
                      </select>
                    </label>
                  </div>
                  <label
                    className="flex items-center gap-2 cursor-pointer"
                    style={{ color: "var(--foreground-muted)", fontSize: 11 }}
                  >
                    <input
                      type="checkbox"
                      checked={consistent}
                      onChange={(e) => setConsistent(e.target.checked)}
                    />
                    Consistent risk across observations
                  </label>
                  <button
                    type="submit"
                    disabled={segmentLoading}
                    className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                    style={{
                      background: "var(--primary)",
                      color: "var(--background)",
                      opacity: segmentLoading ? 0.6 : 1,
                    }}
                  >
                    {segmentLoading ? "Querying…" : "Find Wallets"}
                  </button>

                  {segmentResult && (
                    <div className="pt-3 mt-3 border-t border-[var(--border)]">
                      <p
                        style={{ color: "var(--foreground-muted)", fontSize: 11, fontWeight: 700 }}
                        className="uppercase mb-2"
                      >
                        {segmentFetchFailed
                          ? "Query failed"
                          : `${segmentResult.total} match${segmentResult.total === 1 ? "" : "es"}`}
                        {!segmentFetchFailed &&
                        segmentResult.total > segmentResult.returned
                          ? ` · showing ${segmentResult.returned}`
                          : ""}
                      </p>
                      {segmentResult.wallets.length === 0 ? (
                        <p
                          style={{ color: "var(--foreground-dim)", fontSize: 12 }}
                          className="py-2"
                        >
                          {segmentEmptyMessage(
                            resolveSegmentEmptyKind({
                              fetchFailed: segmentFetchFailed,
                              totalScored,
                            })
                          )}
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {segmentResult.wallets.map((w) => (
                            <div
                              key={w.wallet}
                              className="flex items-center justify-between px-2 py-1.5 rounded-md"
                              style={{ background: "var(--card)" }}
                              title={w.wallet}
                            >
                              <span
                                style={{ color: "var(--foreground-muted)", fontSize: 11 }}
                                className="font-mono"
                              >
                                {truncateWallet(w.wallet)}
                              </span>
                              <span
                                style={{
                                  color:
                                    w.risk === "Low"
                                      ? "#22c55e"
                                      : w.risk === "Medium"
                                        ? "#eab308"
                                        : "#ef4444",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {w.score}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Insights section */}
      <div
         style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
        }}
        className="p-8 text-center relative overflow-hidden card"
      >
        <div className="absolute inset-0 flex items-center justify-start pointer-events-none z-0">
          <img 
            src="/3d-imgs-assest/fluxid_protocol_intelligence.png" 
            alt="Protocol Background" 
            className="w-[400px] object-contain opacity-[0.08] translate-y-12 -translate-x-12 mix-blend-screen"
          />
        </div>
        <div className="relative z-10">
        <h3 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 20 }} className="mb-2">
          Protocol Intelligence API
        </h3>
        <p style={{ color: "var(--foreground-muted)", fontSize: 14 }} className="max-w-xl mx-auto mb-6">
          Access these trust signals programmatically. Integrate real-time liquidity scoring and risk monitoring into your lending logic, marketplaces, or AI agents.
        </p>
        <div className="flex justify-center gap-4">
          <code className="pressed px-4 py-2 text-[13px] rounded-lg text-primary">
            GET /protocol/health
          </code>
          <a 
            href="https://github.com/StellarVhibes/FluxID/blob/main/docs/api-docs/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] text-sm font-bold flex items-center gap-1 hover:underline"
          >
            View API Docs →
          </a>
        </div>
        </div>
      </div>
    </div>
  );
}
