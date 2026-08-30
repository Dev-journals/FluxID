"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  Users,
  Activity,
  Star,
  MessageSquare,
  Server,
  AlertTriangle,
  RefreshCw,
  Lock,
  X,
  Search,
} from "lucide-react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { useFreighter, truncateAddress } from "../../context/FreighterContext";
import { ADMIN_ADDRESS, STELLAR_CONFIG } from "../../../lib/constants";
import { readContract } from "../../../lib/contractRead";
import {
  fetchAdminFeedback,
  fetchAdminStats,
  type FeedbackEntry,
  type FeedbackSummary,
  type UsageStats,
} from "../../../lib/metricsApi";

const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID || "CAUICITFNLDMHPXARAXARFBS3JKRGZZP5CE7B4DTLFBCJB5F4U24CKBP";
const AI_BACKEND_URL = process.env.NEXT_PUBLIC_AI_BACKEND_URL || "";

type ActionStatus = "idle" | "loading" | "success" | "error";

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color: "var(--primary)" }} />
        <span style={{ color: "var(--foreground-muted)", fontSize: 13 }}>{label}</span>
      </div>
      <div style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }}>{value}</div>
    </div>
  );
}

function FeedbackRow({ f }: { f: FeedbackEntry }) {
  return (
    <div className="pressed p-3 rounded-xl">
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: "var(--primary)" }} className="text-sm font-bold">
          {"★".repeat(f.rating)}
          <span style={{ color: "var(--border)" }}>{"★".repeat(5 - f.rating)}</span>
        </span>
        <span style={{ color: "var(--foreground-dim)", fontSize: 12 }}>
          {f.wallet ? truncateAddress(f.wallet) : "anon"} · {new Date(f.timestamp).toLocaleDateString()}
        </span>
      </div>
      <p style={{ color: "var(--foreground)", fontSize: 14 }}>{f.message}</p>
    </div>
  );
}

export default function AdminPage() {
  const { isConnected, publicKey, connect, getKit } = useFreighter();
  const isAdmin = isConnected && publicKey === ADMIN_ADDRESS;

  // ---- Monitoring + feedback data ----
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(false);
  const [feedbackQuery, setFeedbackQuery] = useState("");
  const [walletModal, setWalletModal] = useState(false);
  const [walletQuery, setWalletQuery] = useState("");

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const [s, f] = await Promise.all([fetchAdminStats(), fetchAdminFeedback()]);
    // Refresh must never blank the panel. Two failure shapes to guard against:
    //   1. null            → fetch failed / backend unreachable.
    //   2. valid-but-empty → the store was reset (Render's ephemeral disk gets
    //                        wiped on redeploy and on free-tier cold starts).
    // In both cases, if we already have data on screen we keep that last good
    // snapshot rather than overwriting it with nothing. A first load still shows
    // the true empty state (prev is null), so this only protects a populated view.
    setStats((prev) => {
      if (!s) return prev;
      if (s.totalEvents === 0 && prev && prev.totalEvents > 0) return prev;
      return s;
    });
    setFeedback((prev) => {
      if (!f) return prev;
      if (f.total === 0 && prev && prev.total > 0) return prev;
      return f;
    });
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void loadData();
  }, [isAdmin, loadData]);

  // ---- Contract admin state ----
  const [newAdmin, setNewAdmin] = useState("");
  const [transferStatus, setTransferStatus] = useState<ActionStatus>("idle");
  const [transferResult, setTransferResult] = useState<string | null>(null);

  const [onchainAdmin, setOnchainAdmin] = useState<string | null>(null);
  const [readStatus, setReadStatus] = useState<ActionStatus>("idle");

  const [oracleContractId, setOracleContractId] = useState("");
  const [oracleAddr, setOracleAddr] = useState("");
  const [oracleStatus, setOracleStatus] = useState<ActionStatus>("idle");
  const [oracleResult, setOracleResult] = useState<string | null>(null);

  // Registry wiring: the identity contract points at an oracle_registry, and
  // that registry authorizes individual oracle addresses. We show the current
  // wiring before letting the admin change it.
  const [registryId, setRegistryId] = useState("");
  const [registryStatus, setRegistryStatus] = useState<ActionStatus>("idle");
  const [registryResult, setRegistryResult] = useState<string | null>(null);
  const [currentRegistry, setCurrentRegistry] = useState<string | null>(null);
  const [oracleAuthState, setOracleAuthState] = useState<string | null>(null);

  // ---- Backend admin state ----
  const [backendMsg, setBackendMsg] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<ActionStatus>("idle");

  const readOnchainAdmin = useCallback(async () => {
    setReadStatus("loading");
    try {
      const admin = await readContract(CONTRACT_ID, "get_admin");
      if (typeof admin === "string") setOnchainAdmin(admin);
      setReadStatus("success");
    } catch {
      setReadStatus("error");
    }
  }, []);

  // Generic signed write against a Soroban contract, matching contract/page.tsx.
  const signAndSend = useCallback(
    async (contractId: string, method: string, ...args: StellarSdk.xdr.ScVal[]) => {
      if (!publicKey) throw new Error("Wallet not connected");
      const server = new StellarSdk.rpc.Server(STELLAR_CONFIG.SOROBAN_RPC_URL);
      const account = await server.getAccount(publicKey);
      const contract = new StellarSdk.Contract(contractId);
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(contract.call(method, ...args))
        .setTimeout(60)
        .build();
      const prepared = await server.prepareTransaction(tx);
      const kit = getKit();
      const signResult = await kit.signTransaction(prepared.toXDR(), {
        address: publicKey,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      });
      if (!signResult || !signResult.signedTxXdr) {
        throw new Error("Transaction signing was rejected or failed.");
      }
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(
        signResult.signedTxXdr,
        StellarSdk.Networks.TESTNET
      );
      const response = await server.sendTransaction(signedTx);
      if (response.status === "ERROR") throw new Error("Transaction failed on-chain.");
      return response.hash;
    },
    [publicKey, getKit]
  );

  const handleTransferAdmin = async () => {
    if (!publicKey) {
      await connect();
      return;
    }
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(newAdmin)) {
      setTransferStatus("error");
      setTransferResult("Enter a valid Stellar public key.");
      return;
    }
    setTransferStatus("loading");
    setTransferResult(null);
    try {
      const hash = await signAndSend(
        CONTRACT_ID,
        "transfer_admin",
        StellarSdk.nativeToScVal(publicKey, { type: "address" }),
        StellarSdk.nativeToScVal(newAdmin, { type: "address" })
      );
      setTransferStatus("success");
      setTransferResult(`Admin transferred. Hash: ${hash}`);
    } catch (err) {
      setTransferStatus("error");
      setTransferResult(err instanceof Error ? err.message : "Transfer failed.");
    }
  };

  const handleSetRegistry = async () => {
    if (!publicKey) {
      await connect();
      return;
    }
    if (!StellarSdk.StrKey.isValidContract(registryId)) {
      setRegistryStatus("error");
      setRegistryResult("Enter the oracle_registry contract ID (C...).");
      return;
    }
    setRegistryStatus("loading");
    setRegistryResult(null);
    try {
      const hash = await signAndSend(
        CONTRACT_ID,
        "set_oracle_registry",
        StellarSdk.nativeToScVal(publicKey, { type: "address" }),
        StellarSdk.nativeToScVal(registryId, { type: "address" })
      );
      setCurrentRegistry(registryId);
      setRegistryStatus("success");
      setRegistryResult(`Registry wired. Hash: ${hash}`);
    } catch (err) {
      setRegistryStatus("error");
      setRegistryResult(err instanceof Error ? err.message : "Failed to set oracle registry.");
    }
  };

  // The oracle_registry's only view function is is_oracle_authorized, so the
  // meaningful "current state" we can read is whether the entered oracle address
  // is currently allowed to write scores. (The identity contract stores the
  // registry ID but exposes no getter for it, so that link isn't readable live.)
  const readOracleState = async () => {
    if (!StellarSdk.StrKey.isValidContract(oracleContractId)) {
      setOracleStatus("error");
      setOracleResult("Enter the oracle_registry contract ID (C...) to read its state.");
      return;
    }
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(oracleAddr)) {
      setOracleStatus("error");
      setOracleResult("Enter an oracle wallet address (G...) to check its authorization.");
      return;
    }
    setOracleStatus("loading");
    setOracleResult(null);
    try {
      const authed = await readContract(
        oracleContractId,
        "is_oracle_authorized",
        StellarSdk.nativeToScVal(oracleAddr, { type: "address" })
      );
      setOracleAuthState(authed ? "authorized" : "not authorized");
      setOracleStatus("success");
    } catch (err) {
      setOracleStatus("error");
      setOracleResult(err instanceof Error ? err.message : "Could not read registry state.");
    }
  };

  const handleOracle = async (action: "add_oracle" | "remove_oracle") => {
    if (!publicKey) {
      await connect();
      return;
    }
    if (!StellarSdk.StrKey.isValidContract(oracleContractId)) {
      setOracleStatus("error");
      setOracleResult("Enter the oracle_registry contract ID (C...).");
      return;
    }
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(oracleAddr)) {
      setOracleStatus("error");
      setOracleResult("Enter a valid oracle wallet address (G...).");
      return;
    }
    setOracleStatus("loading");
    setOracleResult(null);
    try {
      const hash = await signAndSend(
        oracleContractId,
        action,
        StellarSdk.nativeToScVal(publicKey, { type: "address" }),
        StellarSdk.nativeToScVal(oracleAddr, { type: "address" })
      );
      setOracleStatus("success");
      setOracleAuthState(action === "add_oracle" ? "authorized" : "not authorized");
      setOracleResult(`${action === "add_oracle" ? "Authorized" : "Revoked"}. Hash: ${hash}`);
    } catch (err) {
      setOracleStatus("error");
      setOracleResult(err instanceof Error ? err.message : "Oracle update failed.");
    }
  };

  const callBackend = async (label: string, path: string, method: "GET" | "DELETE") => {
    if (!AI_BACKEND_URL) {
      setBackendStatus("error");
      setBackendMsg("NEXT_PUBLIC_AI_BACKEND_URL is not set.");
      return;
    }
    setBackendStatus("loading");
    setBackendMsg(null);
    try {
      const base = AI_BACKEND_URL.endsWith("/") ? AI_BACKEND_URL : AI_BACKEND_URL + "/";
      const res = await fetch(`${base}${path}`, { method });
      const body = await res.json();
      setBackendStatus("success");
      setBackendMsg(`${label}: ${JSON.stringify(body)}`);
    } catch (err) {
      setBackendStatus("error");
      setBackendMsg(err instanceof Error ? err.message : `${label} failed.`);
    }
  };

  // ---- Gates ----
  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="card p-8 max-w-md mx-auto text-center mt-10">
          <Lock size={32} style={{ color: "var(--primary)" }} className="mx-auto mb-4" />
          <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 22 }} className="mb-2">
            Admin access
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }} className="mb-6">
            Connect the admin wallet to manage FluxID.
          </p>
          <button onClick={connect} className="card-primary px-6 py-3 rounded-xl font-bold text-[var(--background)]">
            Connect Wallet
          </button>
        </div>
      </motion.div>
    );
  }

  if (!isAdmin) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="card p-8 max-w-md mx-auto text-center mt-10">
          <AlertTriangle size={32} style={{ color: "var(--error)" }} className="mx-auto mb-4" />
          <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 22 }} className="mb-2">
            Not authorized
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            The connected wallet ({truncateAddress(publicKey || "")}) is not the admin. Connect the
            admin wallet to continue.
          </p>
        </div>
      </motion.div>
    );
  }

  const resultPanel = (status: ActionStatus, msg: string | null) =>
    msg ? (
      <div
        className={`mt-3 p-3 rounded-xl pressed border ${
          status === "error" ? "border-[var(--error)] text-[var(--error)]" : "border-[#8FA828] text-[#8FA828]"
        }`}
      >
        <div className="flex items-start gap-2">
          {status === "error" && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
          <span className="text-sm font-medium break-all">{msg}</span>
        </div>
      </div>
    ) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg card-primary">
            <Shield className="h-5 w-5" style={{ color: "var(--background)" }} />
          </div>
          <div>
            <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
              Admin
            </h1>
            <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
              Monitoring, feedback, and contract/backend controls
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loadingData}
          className="btn btn-outline flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={16} className={loadingData ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Monitoring */}
      <h2 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }} className="mb-3">
        Usage monitoring
      </h2>
      {stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard icon={Users} label="Unique wallets" value={stats.uniqueWallets} />
          <StatCard icon={Activity} label="Wallet connects" value={stats.walletConnects} />
          <StatCard icon={Activity} label="Score runs" value={stats.scoreRuns} />
          <StatCard icon={Activity} label="Total events" value={stats.totalEvents} />
        </div>
      ) : (
        <div className="card p-5 mb-4">
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            {loadingData ? "Loading usage data..." : "No usage data yet (or backend unreachable)."}
          </p>
        </div>
      )}

      {stats && stats.recentWallets.length > 0 && (
        <div className="card p-6 mb-8 overflow-x-auto">
          <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14 }} className="mb-3">
            Recent wallets
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--foreground-muted)" }} className="text-left">
                <th className="pb-2 font-medium">Wallet</th>
                <th className="pb-2 font-medium">Events</th>
                <th className="pb-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentWallets.slice(0, 15).map((w) => (
                <tr key={w.wallet} style={{ color: "var(--foreground)" }} className="border-t border-[var(--border)]">
                  <td className="py-2 font-mono">{truncateAddress(w.wallet)}</td>
                  <td className="py-2">{w.events}</td>
                  <td className="py-2">{new Date(w.lastSeen).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.recentWallets.length > 15 && (
            <button
              onClick={() => setWalletModal(true)}
              className="btn btn-outline w-full mt-3"
            >
              View all {stats.recentWallets.length} wallets
            </button>
          )}
        </div>
      )}

      {/* Feedback */}
      <h2 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }} className="mb-3">
        User feedback
      </h2>
      <div className="card p-6 mb-8">
        {feedback && feedback.total > 0 ? (
          <>
            <div className="flex items-center gap-6 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Star size={20} style={{ color: "var(--primary)", fill: "var(--primary)" }} />
                <span style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 24 }}>
                  {feedback.averageRating ?? "—"}
                </span>
                <span style={{ color: "var(--foreground-muted)", fontSize: 13 }}>avg</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare size={16} style={{ color: "var(--foreground-muted)" }} />
                <span style={{ color: "var(--foreground)", fontSize: 14 }}>{feedback.total} responses</span>
              </div>
              <div className="flex items-center gap-1 text-xs" style={{ color: "var(--foreground-muted)" }}>
                {[5, 4, 3, 2, 1].map((r) => (
                  <span key={r} className="px-2 py-1 rounded pressed">
                    {r}★ {feedback.ratingCounts[r] || 0}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {feedback.entries.slice(0, 5).map((f, i) => (
                <FeedbackRow key={i} f={f} />
              ))}
            </div>
            {feedback.entries.length > 5 && (
              <button
                onClick={() => setFeedbackModal(true)}
                className="btn btn-outline w-full mt-3"
              >
                View all {feedback.entries.length} responses
              </button>
            )}
          </>
        ) : (
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            {loadingData ? "Loading feedback..." : "No feedback collected yet."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contract admin */}
        <div className="card p-6">
          <h2 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }} className="mb-1">
            Contract admin
          </h2>
          <p style={{ color: "var(--foreground-muted)", fontSize: 13 }} className="mb-4 break-all">
            {truncateAddress(CONTRACT_ID, 8, 6)}
          </p>

          <button onClick={readOnchainAdmin} className="btn btn-outline mb-2">
            {readStatus === "loading" ? "Reading..." : "Read on-chain admin"}
          </button>
          {onchainAdmin && (
            <p style={{ color: "var(--foreground)", fontSize: 13 }} className="mb-4 break-all font-mono">
              {onchainAdmin}
            </p>
          )}

          <label style={{ color: "var(--foreground-muted)", fontSize: 13 }} className="block mb-1 mt-2">
            Transfer admin to
          </label>
          <input
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            placeholder="G... new admin address"
            className="w-full pressed px-4 py-3 rounded-xl text-[var(--foreground)] outline-none mb-3 font-mono text-sm"
          />
          <button
            onClick={handleTransferAdmin}
            disabled={transferStatus === "loading"}
            className="w-full card-primary py-3 rounded-xl font-bold text-[var(--background)] disabled:opacity-70"
          >
            {transferStatus === "loading" ? "Signing..." : "Transfer admin"}
          </button>
          {resultPanel(transferStatus, transferResult)}

          <div className="border-t border-[var(--border)] my-5" />

          {/* Step 1: wire the identity contract to an oracle_registry (one-time) */}
          <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14 }} className="mb-2">
            Oracle registry wiring
          </h3>
          {currentRegistry && (
            <p style={{ color: "var(--foreground-muted)", fontSize: 12 }} className="mb-2 break-all font-mono">
              Registry admin / current: {currentRegistry}
            </p>
          )}
          <label style={{ color: "var(--foreground-muted)", fontSize: 12 }} className="block mb-1">
            oracle_registry contract to wire
          </label>
          <input
            value={registryId}
            onChange={(e) => setRegistryId(e.target.value)}
            placeholder="C... oracle_registry contract ID"
            className="w-full pressed px-4 py-3 rounded-xl text-[var(--foreground)] outline-none mb-3 font-mono text-sm"
          />
          <button
            onClick={handleSetRegistry}
            disabled={registryStatus === "loading"}
            className="w-full card-primary py-3 rounded-xl font-bold text-[var(--background)] disabled:opacity-70"
          >
            {registryStatus === "loading" ? "Signing..." : "Set oracle registry"}
          </button>
          {resultPanel(registryStatus, registryResult)}

          <div className="border-t border-[var(--border)] my-5" />

          {/* Step 2: authorize the backend oracle key inside the registry */}
          <h3 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14 }} className="mb-2">
            Authorize oracle
          </h3>
          <input
            value={oracleContractId}
            onChange={(e) => setOracleContractId(e.target.value)}
            placeholder="C... oracle_registry contract ID"
            className="w-full pressed px-4 py-3 rounded-xl text-[var(--foreground)] outline-none mb-2 font-mono text-sm"
          />
          <input
            value={oracleAddr}
            onChange={(e) => setOracleAddr(e.target.value)}
            placeholder="G... backend oracle address (ADMIN_SECRET_KEY public key)"
            className="w-full pressed px-4 py-3 rounded-xl text-[var(--foreground)] outline-none mb-2 font-mono text-sm"
          />
          {oracleAuthState && (
            <p
              style={{ fontSize: 12 }}
              className={`mb-2 font-medium ${oracleAuthState === "authorized" ? "text-[#8FA828]" : "text-[var(--foreground-muted)]"}`}
            >
              Current status: this oracle is {oracleAuthState}.
            </p>
          )}
          <button
            onClick={readOracleState}
            disabled={oracleStatus === "loading"}
            className="btn btn-outline w-full mb-2"
          >
            {oracleStatus === "loading" ? "Reading..." : "Check current status"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleOracle("add_oracle")}
              disabled={oracleStatus === "loading"}
              className="flex-1 card-primary py-3 rounded-xl font-bold text-[var(--background)] disabled:opacity-70"
            >
              Add oracle
            </button>
            <button
              onClick={() => handleOracle("remove_oracle")}
              disabled={oracleStatus === "loading"}
              className="flex-1 btn btn-outline"
            >
              Remove oracle
            </button>
          </div>
          {resultPanel(oracleStatus, oracleResult)}
        </div>

        {/* Backend admin */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} style={{ color: "var(--primary)" }} />
            <h2 style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>Backend admin</h2>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => callBackend("Health", "health", "GET")}
              disabled={backendStatus === "loading"}
              className="btn btn-outline w-full"
            >
              Health check
            </button>
            <button
              onClick={() => callBackend("Reset protocol history", "protocol/wallets", "DELETE")}
              disabled={backendStatus === "loading"}
              className="btn btn-outline w-full"
            >
              Reset protocol history
            </button>
          </div>
          {resultPanel(backendStatus, backendMsg)}
        </div>
      </div>

      {/* Full feedback modal — scrollable + filterable so a large volume of
          responses never floods the admin page itself. */}
      {feedbackModal && feedback && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setFeedbackModal(false)}
        >
          <div
            className="card w-full max-w-2xl max-h-[85vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 18 }}>
                All feedback ({feedback.total})
              </h3>
              <button onClick={() => setFeedbackModal(false)} className="btn btn-outline p-2">
                <X size={16} />
              </button>
            </div>
            <div className="relative mb-4">
              <Search
                size={16}
                style={{ color: "var(--foreground-muted)" }}
                className="absolute left-3 top-1/2 -translate-y-1/2"
              />
              <input
                value={feedbackQuery}
                onChange={(e) => setFeedbackQuery(e.target.value)}
                placeholder="Filter by message or wallet..."
                className="w-full pressed pl-9 pr-4 py-3 rounded-xl text-[var(--foreground)] outline-none text-sm"
              />
            </div>
            <div className="space-y-3 overflow-y-auto pr-1">
              {(() => {
                const q = feedbackQuery.trim().toLowerCase();
                const rows = q
                  ? feedback.entries.filter(
                      (f) =>
                        f.message.toLowerCase().includes(q) ||
                        (f.wallet ?? "").toLowerCase().includes(q)
                    )
                  : feedback.entries;
                if (rows.length === 0) {
                  return (
                    <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>No matching feedback.</p>
                  );
                }
                return rows.map((f, i) => <FeedbackRow key={i} f={f} />);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Full wallets modal — scrollable + filterable, mirrors the feedback modal pattern. */}
      {walletModal && stats && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setWalletModal(false)}
        >
          <div
            className="card w-full max-w-2xl max-h-[85vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 18 }}>
                All wallets ({stats.recentWallets.length})
              </h3>
              <button onClick={() => setWalletModal(false)} className="btn btn-outline p-2">
                <X size={16} />
              </button>
            </div>
            <div className="relative mb-4">
              <Search
                size={16}
                style={{ color: "var(--foreground-muted)" }}
                className="absolute left-3 top-1/2 -translate-y-1/2"
              />
              <input
                value={walletQuery}
                onChange={(e) => setWalletQuery(e.target.value)}
                placeholder="Filter by wallet address..."
                className="w-full pressed pl-9 pr-4 py-3 rounded-xl text-[var(--foreground)] outline-none text-sm"
              />
            </div>
            <div className="overflow-y-auto pr-1">
              {(() => {
                const q = walletQuery.trim().toLowerCase();
                const rows = q
                  ? stats.recentWallets.filter((w) => w.wallet.toLowerCase().includes(q))
                  : stats.recentWallets;
                if (rows.length === 0) {
                  return (
                    <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>No matching wallets.</p>
                  );
                }
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ color: "var(--foreground-muted)" }} className="text-left">
                        <th className="pb-2 font-medium">Wallet</th>
                        <th className="pb-2 font-medium">Events</th>
                        <th className="pb-2 font-medium">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((w) => (
                        <tr key={w.wallet} style={{ color: "var(--foreground)" }} className="border-t border-[var(--border)]">
                          <td className="py-2 font-mono">{truncateAddress(w.wallet)}</td>
                          <td className="py-2">{w.events}</td>
                          <td className="py-2">{new Date(w.lastSeen).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
