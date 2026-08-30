import { useCallback, useSyncExternalStore } from "react";
import type { StellarNetwork, WalletAnalysis } from "./scoring";

export const LS_NETWORK = "fluxid_network";
export const LS_ADDRESS = "fluxid_last_analyzed_address";
export const LS_ANALYSIS = "fluxid_last_analysis";

const NETWORK_CHANGE_EVENT = "fluxid-network-change";

export interface StoredAnalysis {
  address: string;
  network: StellarNetwork;
  analysis: WalletAnalysis;
}

export function parseStoredNetwork(value: string | null | undefined): StellarNetwork {
  return value === "testnet" ? "testnet" : "mainnet";
}

export function readStoredNetwork(): StellarNetwork {
  if (typeof window === "undefined") return "mainnet";
  try {
    return parseStoredNetwork(window.localStorage.getItem(LS_NETWORK));
  } catch {
    return "mainnet";
  }
}

export function writeStoredNetwork(network: StellarNetwork): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_NETWORK, network);
    window.dispatchEvent(new CustomEvent(NETWORK_CHANGE_EVENT, { detail: network }));
  } catch {
    // private mode — kit still follows in-memory callers
  }
}

export function subscribeStoredNetwork(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => onStoreChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_NETWORK || e.key === null) onStoreChange();
  };
  window.addEventListener(NETWORK_CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(NETWORK_CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStoredNetwork(): [StellarNetwork, (network: StellarNetwork) => void] {
  const network = useSyncExternalStore(
    subscribeStoredNetwork,
    readStoredNetwork,
    () => "mainnet" as StellarNetwork
  );
  const setNetwork = useCallback((next: StellarNetwork) => {
    writeStoredNetwork(next);
  }, []);
  return [network, setNetwork];
}

export function parseStoredAnalysis(raw: string | null): StoredAnalysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAnalysis>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.address !== "string" || parsed.address.length === 0) return null;
    if (parsed.network !== "mainnet" && parsed.network !== "testnet") return null;
    if (!parsed.analysis || typeof parsed.analysis !== "object") return null;
    return parsed as StoredAnalysis;
  } catch {
    return null;
  }
}

export function readStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_ADDRESS);
  } catch {
    return null;
  }
}

export function readStoredAnalysis(): StoredAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredAnalysis(window.localStorage.getItem(LS_ANALYSIS));
  } catch {
    return null;
  }
}

export function writeStoredAnalysis(
  address: string,
  network: StellarNetwork,
  analysis: WalletAnalysis
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LS_ANALYSIS,
      JSON.stringify({ address, network, analysis } satisfies StoredAnalysis)
    );
    window.localStorage.setItem(LS_ADDRESS, address);
  } catch {
    // private mode / quota — in-memory state still holds the result
  }
}

export function clearStoredResults(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_ANALYSIS);
}

export function clearStoredAnalysis(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_ANALYSIS);
  window.localStorage.removeItem(LS_ADDRESS);
}
