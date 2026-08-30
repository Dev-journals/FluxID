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
  // Network this analysis (or in-flight request) belongs to. Compared against the
  // currently selected network so a result never survives a network switch, no matter
  // which UI control (e.g. the Header's own network toggle) triggered that switch.
  resultNetwork: StellarNetwork | null;
  isAnalyzing: boolean;
  error: string | null;
}

interface AnalysisContextValue {
  analyzedAddress: string | null;
  analysis: WalletAnalysis | null;
  isAnalyzing: boolean;
  error: string | null;
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
    resultNetwork: null,
    isAnalyzing: false,
    error: null,
  });

  // In-memory and persisted results are only valid for the network they were computed
  // on — otherwise they're a leftover from before the last network switch and must not
  // be shown as if they were fresh, regardless of which control changed the network
  // (the Header's own toggle writes straight to storage, bypassing this provider).
  const sessionIsFresh = state.resultNetwork === network;
  const storedForNetwork = stored?.network === network ? stored : null;

  const analysis = state.isAnalyzing
    ? null
    : (sessionIsFresh ? state.analysis : null) ?? storedForNetwork?.analysis ?? null;
  const analyzedAddress =
    (sessionIsFresh || state.isAnalyzing ? state.analyzedAddress : null) ??
    storedForNetwork?.address ??
    null;

  const analyze = useCallback(async (address: string, networkOverride?: StellarNetwork) => {
    const selected = networkOverride ?? network;
    setState({
      analyzedAddress: address,
      analysis: null,
      resultNetwork: selected,
      isAnalyzing: true,
      error: null,
    });
    clearStoredResults();
    try {
      const result = await analyzeWallet(address, selected);
      setState({
        analyzedAddress: address,
        analysis: result,
        resultNetwork: selected,
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
      resultNetwork: null,
      isAnalyzing: false,
      error: null,
    });
    clearStoredAnalysis();
  }, []);

  return (
    <AnalysisContext.Provider
      value={{
        analysis,
        analyzedAddress,
        isAnalyzing: state.isAnalyzing,
        error: state.error,
        network,
        analyze,
        setNetwork,
        clear,
      }}
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
