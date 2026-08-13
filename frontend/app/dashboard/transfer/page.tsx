"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, Wallet, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { useAnalysis } from "../context/AnalysisContext";
import { useFreighter } from "../../context/FreighterContext";
import { useToast } from "../../components/Toast";
import * as StellarSdk from "@stellar/stellar-sdk";

export default function TransferPage() {
  const { analysis, analyzedAddress } = useAnalysis();
  const { isConnected, publicKey: connectedAddress, connect, getKit } = useFreighter();
  const { showToast } = useToast();
  
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  useEffect(() => {
    if (analyzedAddress) {
      setDestination(analyzedAddress);
    }
  }, [analyzedAddress]);

  const handleSend = async () => {
    if (!isConnected || !connectedAddress) {
      await connect();
      return;
    }
    if (!destination || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setStatus("error");
      const msg = "Please enter a valid destination address and amount.";
      setErrorMessage(msg);
      showToast(msg, "error");
      return;
    }

    try {
      setStatus("loading");
      setErrorMessage("");
      setTxHash("");

      const horizonUrl = network === "mainnet" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
      const server = new StellarSdk.Horizon.Server(horizonUrl);
      
      const account = await server.loadAccount(connectedAddress);

      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: network === "mainnet" ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: destination.trim(),
            asset: StellarSdk.Asset.native(),
            amount: amount.toString(),
          })
        )
        .setTimeout(60)
        .build();

      const kit = getKit();
      const signResult = await kit.signTransaction(transaction.toXDR(), {
        address: connectedAddress,
        networkPassphrase: network === "mainnet" ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET
      });

      if (!signResult || !signResult.signedTxXdr) {
        throw new Error("Transaction signing was rejected or failed.");
      }

      const signedTx = StellarSdk.TransactionBuilder.fromXDR(
        signResult.signedTxXdr, 
        network === "mainnet" ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET
      );
      
      const response = await server.submitTransaction(signedTx);
      
      setStatus("success");
      setTxHash(response.hash);
      setAmount("");
      showToast("Transaction successful!", "success");
    } catch (err) {
      console.error(err);
      setStatus("error");
      let errMsg = err instanceof Error ? err.message : "Failed to submit transaction.";
      
      if (errMsg.toLowerCase().includes("underfunded") || errMsg.toLowerCase().includes("insufficient balance") || errMsg.toLowerCase().includes("op_underfunded")) {
        errMsg = "Insufficient balance to execute this transaction.";
      } else if (errMsg.toLowerCase().includes("reject") || errMsg.toLowerCase().includes("cancel")) {
        errMsg = "Transaction was rejected by user.";
      }
      
      setErrorMessage(errMsg);
      showToast(errMsg, "error");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center gap-3 mb-8">
        <div 
          className="flex h-10 w-10 items-center justify-center rounded-lg card-primary"
        >
          <Send className="h-5 w-5 text-[var(--background)]" />
        </div>
        <div>
          <h1 style={{ color: "var(--foreground)", fontWeight: 800, fontSize: 28 }} className="mb-1">
            Send Liquidity
          </h1>
          <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
            Fund trusted wallets seamlessly using Freighter.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card p-8">
          <h2 className="text-lg font-bold mb-6 text-[var(--foreground)]">Transfer Details</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                Network
              </label>
              <div className="flex p-1 rounded-xl pressed">
                <button
                  onClick={() => setNetwork("testnet")}
                  className={`flex-1 text-sm font-bold py-2.5 rounded-lg transition-all duration-200 ${
                    network === "testnet" ? "card text-[var(--primary)]" : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Testnet
                </button>
                <button
                  onClick={() => setNetwork("mainnet")}
                  className={`flex-1 text-sm font-bold py-2.5 rounded-lg transition-all duration-200 ${
                    network === "mainnet" ? "card text-[var(--primary)]" : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  Mainnet
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                Destination Address
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="G..."
                className="w-full pressed px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm font-mono text-[var(--foreground)]"
              />
              {analysis && destination === analyzedAddress && (
                <p className="mt-2 text-xs text-[var(--primary)] font-semibold flex items-center gap-1">
                  <CheckCircle size={12} /> Auto-filled from currently analyzed wallet. Score: {analysis.score.score}/100
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                Amount (XLM)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.1"
                  className="w-full pressed px-4 py-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-[var(--primary)] text-lg font-bold text-[var(--foreground)] pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-[var(--foreground-muted)]">
                  XLM
                </span>
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={status === "loading"}
              className="w-full card-primary py-4 rounded-xl font-bold text-[var(--background)] flex items-center justify-center gap-2 transition-transform hover:-translate-y-1 disabled:opacity-70 disabled:hover:translate-y-0 mt-4"
            >
              {status === "loading" ? (
                <div className="w-5 h-5 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  {isConnected ? "Sign & Send Transaction" : "Connect Wallet to Send"}
                </>
              )}
            </button>

            {status === "error" && (
              <div className="p-4 rounded-xl pressed border border-[var(--error)] flex items-start gap-3 mt-4">
                <AlertCircle className="text-[var(--error)] shrink-0" size={18} />
                <p className="text-sm text-[var(--error)]">{errorMessage}</p>
              </div>
            )}

            {status === "success" && (
              <div className="p-4 rounded-xl pressed border border-[#8FA828] flex flex-col gap-2 mt-4">
                <div className="flex items-center gap-2 text-[#8FA828] font-bold">
                  <CheckCircle size={18} />
                  <span>Transaction Successful!</span>
                </div>
                <p className="text-xs text-[var(--foreground-muted)] font-mono break-all">
                  Hash: {txHash}
                </p>
                <a
                  href={`https://stellar.expert/explorer/${network}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1 font-semibold mt-1"
                >
                  View on Stellar Expert <ArrowRight size={12} />
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card p-6">
            <h3 className="font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">
              <Wallet size={18} className="text-[var(--primary)]" />
              Connected Wallet
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              When you click &quot;Sign &amp; Send&quot;, your Freighter wallet extension will pop up. 
              Review the transaction details and approve it. No private keys ever leave your browser.
            </p>
            {!isConnected && (
              <button 
                onClick={connect}
                className="mt-4 px-4 py-2 rounded-lg pressed text-sm font-semibold text-[var(--primary)] hover:text-[var(--foreground)] transition-colors"
              >
                Connect Freighter
              </button>
            )}
          </div>
          <div className="card p-6 border-l-4 border-l-[var(--primary)]">
            <h3 className="font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">
              <CheckCircle size={18} className="text-[var(--primary)]" />
              Trust Scoring
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              Never send funds blindly. FluxID uses on-chain ML-driven pattern recognition 
              to give you confidence before you hit send.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
