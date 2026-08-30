"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { analyzeWallet, type StellarNetwork, type WalletAnalysis } from "../../../lib/scoring";
import { logEvent } from "../../../lib/metricsApi";
import {
  clearStoredAnalysis,
  clearStoredResults,
  useStoredAnalysis,
  useStoredNetwork,
  writeStoredAnalysis,
} from "../../../lib/dashboardStorage";

interface AnalysisState {
  analyzedAddress: string | null;
  analysis: WalletAnalysis | null;
  isAnalyzing: boolean;
  error: string | null;
}

interface AnalysisContextValue extends AnalysisState {
  network: StellarNetwork;
  analyze: (address: string, network?: StellarNetwork) => Promise<boolean>;
  setNetwork: (network: StellarNetwork) => void;
  clear: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useStoredNetwork();
  const stored = useStoredAnalysis();
  const [state, setState] = useState<AnalysisState>({
    analyzedAddress: null,
    analysis: null,
    isAnalyzing: false,
    error: null,
  });

  const analysis = state.isAnalyzing ? null : (state.analysis ?? stored?.analysis ?? null);
  const analyzedAddress = state.analyzedAddress ?? stored?.address ?? null;

  const analyze = useCallback(async (address: string, networkOverride?: StellarNetwork) => {
    const selected = networkOverride ?? network;
    setState((prev) => ({ ...prev, isAnalyzing: true, error: null, analysis: null, analyzedAddress: address }));
    clearStoredResults();
    try {
      const result = await analyzeWallet(address, selected);
      setState({
        analyzedAddress: address,
        analysis: result,
        isAnalyzing: false,
        error: null,
      });
      writeStoredAnalysis(address, selected, result);
      void logEvent("score_run", address, selected);
      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        error: err instanceof Error ? err.message : "Analysis failed",
      }));
      return false;
    }
  }, [network]);

  const clear = useCallback(() => {
    setState({
      analyzedAddress: null,
      analysis: null,
      isAnalyzing: false,
      error: null,
    });
    clearStoredAnalysis();
  }, []);

  return (
    <AnalysisContext.Provider
      value={{ ...state, analysis, analyzedAddress, network, analyze, setNetwork, clear }}
    >
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within <AnalysisProvider>");
  return ctx;
}
