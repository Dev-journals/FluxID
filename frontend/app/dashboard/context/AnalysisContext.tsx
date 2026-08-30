"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { analyzeWallet, type StellarNetwork, type WalletAnalysis } from "../../../lib/scoring";
import { logEvent } from "../../../lib/metricsApi";

interface AnalysisState {
  analyzedAddress: string | null;
  analysis: WalletAnalysis | null;
  network: StellarNetwork;
  isAnalyzing: boolean;
  error: string | null;
}

interface AnalysisContextValue extends AnalysisState {
  analyze: (address: string, network?: StellarNetwork) => Promise<boolean>;
  setNetwork: (network: StellarNetwork) => void;
  clear: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

const LS_ADDRESS = "fluxid_last_analyzed_address";
const LS_NETWORK = "fluxid_network";

function readNetworkFromStorage(): StellarNetwork {
  if (typeof window === "undefined") return "mainnet";
  const saved = window.localStorage.getItem(LS_NETWORK);
  return saved === "testnet" ? "testnet" : "mainnet";
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AnalysisState>({
    analyzedAddress: null,
    analysis: null,
    network: "mainnet",
    isAnalyzing: false,
    error: null,
  });

  // Hydrate network preference from localStorage after mount to avoid SSR mismatch.
  useEffect(() => {
    const network = readNetworkFromStorage();
    const address = window.localStorage.getItem(LS_ADDRESS);
    setState((prev) => ({
      ...prev,
      network,
      // We intentionally DON'T auto-analyze on mount — we just remember the address
      // so the UI can pre-fill the input. Re-running analyze() unprompted would burn
      // Horizon/LLM calls every pageview.
      analyzedAddress: address,
    }));
  }, []);

  const analyze = useCallback(async (address: string, networkOverride?: StellarNetwork) => {
    const network = networkOverride ?? state.network;
    setState((prev) => ({ ...prev, isAnalyzing: true, error: null }));
    try {
      const result = await analyzeWallet(address, network);
      setState({
        analyzedAddress: address,
        analysis: result,
        network,
        isAnalyzing: false,
        error: null,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_ADDRESS, address);
      }
      // Best-effort usage log — a real wallet was scored. Never blocks the UI.
      void logEvent("score_run", address, network);
      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        error: err instanceof Error ? err.message : "Analysis failed",
      }));
      return false;
    }
  }, [state.network]);

  const setNetwork = useCallback((network: StellarNetwork) => {
    setState((prev) => ({ ...prev, network }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_NETWORK, network);
    }
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      analyzedAddress: null,
      analysis: null,
      error: null,
    }));
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_ADDRESS);
    }
  }, []);

  return (
    <AnalysisContext.Provider value={{ ...state, analyze, setNetwork, clear }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within <AnalysisProvider>");
  return ctx;
}
