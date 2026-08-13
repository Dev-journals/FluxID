"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useFreighter } from "../../context/FreighterContext";
import { ADMIN_ADDRESS } from "../../../lib/constants";
import { readContract } from "../../../lib/contractRead";
import * as StellarSdk from "@stellar/stellar-sdk";
import { Shield, BookOpen, Send, AlertTriangle } from "lucide-react";

const DEFAULT_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "CAUICITFNLDMHPXARAXARFBS3JKRGZZP5CE7B4DTLFBCJB5F4U24CKBP";

export default function ContractPage() {
  const { isConnected, publicKey, connect, getKit } = useFreighter();
  // Only the contract admin can set_score on-chain — so the Write card is
  // gated to the admin wallet. Everyone else gets a read-only lookup.
  const isAdmin = isConnected && publicKey === ADMIN_ADDRESS;
  const [contractId, setContractId] = useState(DEFAULT_CONTRACT_ID);
  
  // Read state
  const [readWallet, setReadWallet] = useState(publicKey || "");
  const [readStatus, setReadStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [readResult, setReadResult] = useState<string | null>(null);

  // Write state
  const [writeScore, setWriteScore] = useState("85");
  const [writeRisk, setWriteRisk] = useState("0"); // 0 = Low, 1 = Medium, 2 = High (Enum format)
  const [writeStatus, setWriteStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [writeResult, setWriteResult] = useState<string | null>(null);

  const handleRead = async () => {
    if (!readWallet || !contractId) return;
    try {
      setReadStatus("loading");
      setReadResult(null);

      // get_wallet_info returns None (null) when nothing is stored, unlike
      // get_score which returns 0 both for "unset" and a real zero score.
      const info = await readContract(
        contractId,
        "get_wallet_info",
        StellarSdk.nativeToScVal(readWallet, { type: "address" })
      );

      if (!info || typeof info !== "object") {
        setReadResult("No score stored on-chain yet for this wallet.");
      } else {
        const rec = info as { score?: number; risk?: unknown; last_updated?: bigint | number };
        const risk =
          typeof rec.risk === "string"
            ? rec.risk
            : (rec.risk as { tag?: string })?.tag ?? "—";
        const when = rec.last_updated
          ? new Date(Number(rec.last_updated) * 1000).toLocaleString()
          : "—";
        setReadResult(`On-chain score: ${rec.score ?? "—"} · Risk: ${risk} · Updated: ${when}`);
      }
      setReadStatus("success");
    } catch (err) {
      console.error("Read error", err);
      setReadStatus("error");
      setReadResult(err instanceof Error ? err.message : "Failed to read from contract.");
    }
  };

  const handleWrite = async () => {
    if (!isConnected || !publicKey) {
      await connect();
      return;
    }
    
    try {
      setWriteStatus("loading");
      setWriteResult(null);

      const server = new StellarSdk.rpc.Server("https://soroban-testnet.stellar.org");
      const account = await server.getAccount(publicKey);
      const contract = new StellarSdk.Contract(contractId);

      // Dummy hash for the score_input_hash requirement
      const dummyHash = new Uint8Array(32);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(
          contract.call(
            "set_score",
            StellarSdk.nativeToScVal(publicKey, { type: "address" }), // admin
            StellarSdk.nativeToScVal(publicKey, { type: "address" }), // wallet
            StellarSdk.nativeToScVal(Number(writeScore), { type: "u32" }), // score
            StellarSdk.nativeToScVal(Number(writeRisk), { type: "u32" }), // risk (u32 mapping for enum)
            StellarSdk.nativeToScVal(Buffer.from(dummyHash), { type: "bytes" }) // hash
          )
        )
        .setTimeout(60)
        .build();

      const preparedTx = await server.prepareTransaction(tx);
      
      const kit = getKit();
      const signResult = await kit.signTransaction(preparedTx.toXDR(), {
        address: publicKey,
        networkPassphrase: StellarSdk.Networks.TESTNET
      });

      if (!signResult || !signResult.signedTxXdr) {
        throw new Error("Transaction signing was rejected or failed.");
      }

      const signedTx = StellarSdk.TransactionBuilder.fromXDR(
        signResult.signedTxXdr, 
        StellarSdk.Networks.TESTNET
      );
      
      const response = await server.sendTransaction(signedTx);
      
      if (response.status === "ERROR") {
        throw new Error("Transaction failed on-chain. Unauthorized: only admin can set scores.");
      }

      setWriteStatus("success");
      setWriteResult(`Transaction submitted! Hash: ${response.hash}`);
    } catch (err) {
      console.error("Write error", err);
      setWriteStatus("error");
      
      let errMsg = err instanceof Error ? err.message : "Failed to write to contract.";
      if (errMsg.toLowerCase().includes("rejected")) {
        errMsg = "Transaction was rejected by wallet.";
      } else if (errMsg.includes("Unauthorized") || errMsg.includes("HostError: Error(WasmVm, InvalidAction)")) {
        errMsg = "Unauthorized: Only the contract admin can set scores.";
      }
      
      setWriteResult(errMsg);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg card-primary">
          <Shield className="h-5 w-5 text-[var(--background)]" />
        </div>
        <div>
          <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
            Contract Interface
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            {isAdmin
              ? "Directly interact with the FluxID Soroban smart contract via RPC."
              : "Look up any wallet's on-chain liquidity score directly from the contract."}
          </p>
        </div>
      </div>

      <div className="mb-8 card p-6">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
          Contract ID
        </label>
        <input
          type="text"
          value={contractId}
          onChange={(e) => setContractId(e.target.value)}
          className="w-full pressed px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm font-mono text-[var(--foreground)]"
        />
      </div>

      <div className={`grid grid-cols-1 gap-8 ${isAdmin ? "lg:grid-cols-2" : "max-w-xl"}`}>
        {/* Read Card */}
        <div className="card p-6">
          <h2 className="text-lg font-bold mb-6 text-[var(--foreground)] flex items-center gap-2">
            <BookOpen size={20} className="text-[var(--primary)]" /> Read Score
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--foreground-muted)] mb-2">
                Wallet Address
              </label>
              <input
                type="text"
                value={readWallet}
                onChange={(e) => setReadWallet(e.target.value)}
                placeholder="G..."
                className="w-full pressed px-4 py-3 rounded-xl text-sm font-mono text-[var(--foreground)] outline-none"
              />
            </div>

            <button
              onClick={handleRead}
              disabled={readStatus === "loading"}
              className="w-full card-primary py-3 rounded-xl font-bold text-[var(--background)] disabled:opacity-70 flex justify-center items-center"
            >
              {readStatus === "loading" ? "Reading..." : "Read from Contract"}
            </button>

            {readResult && (
              <div className={`p-4 rounded-xl pressed border ${readStatus === "error" ? "border-[var(--error)] text-[var(--error)]" : "border-[#8FA828] text-[#8FA828]"}`}>
                {readResult}
              </div>
            )}
          </div>
        </div>

        {/* Write Card — admin only (set_score is admin-gated on-chain) */}
        {isAdmin && (
        <div className="card p-6">
          <h2 className="text-lg font-bold mb-6 text-[var(--foreground)] flex items-center gap-2">
            <Send size={20} className="text-[var(--primary)]" /> Write Score
          </h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--foreground-muted)] mb-2">
                  Score (0-100)
                </label>
                <input
                  type="number"
                  value={writeScore}
                  onChange={(e) => setWriteScore(e.target.value)}
                  className="w-full pressed px-4 py-3 rounded-xl text-sm font-mono text-[var(--foreground)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--foreground-muted)] mb-2">
                  Risk Level
                </label>
                <select
                  value={writeRisk}
                  onChange={(e) => setWriteRisk(e.target.value)}
                  className="w-full pressed px-4 py-3 rounded-xl text-sm text-[var(--foreground)] outline-none appearance-none"
                >
                  <option value="0">Low</option>
                  <option value="1">Medium</option>
                  <option value="2">High</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleWrite}
              disabled={writeStatus === "loading"}
              className="w-full card-primary py-3 rounded-xl font-bold text-[var(--background)] disabled:opacity-70 flex justify-center items-center"
            >
              {writeStatus === "loading" ? "Signing..." : "Sign & Write to Contract"}
            </button>

            {writeResult && (
              <div className={`p-4 rounded-xl pressed border ${writeStatus === "error" ? "border-[var(--error)] text-[var(--error)]" : "border-[#8FA828] text-[#8FA828]"}`}>
                <div className="flex items-start gap-2">
                  {writeStatus === "error" && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  <span className="text-sm font-medium">{writeResult}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </motion.div>
  );
}
