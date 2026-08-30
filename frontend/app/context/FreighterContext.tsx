"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useToast } from "../components/Toast";
import { logEvent } from "../../lib/metricsApi";
import { readStoredNetwork, subscribeStoredNetwork } from "../../lib/dashboardStorage";
import type { StellarNetwork } from "../../lib/scoring";
import { requestAccess, getAddress } from "@stellar/freighter-api";
import { currentFreighterHost, isFreighterInjected, isFreighterMobile, FREIGHTER_DOWNLOAD_URL } from "../../lib/freighterDetect";

import {
  StellarWalletsKit,
  Networks,
} from "@creit.tech/stellar-wallets-kit";

import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

function kitPassphrase(network: StellarNetwork) {
  return network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

// Initialize kit once outside component so it persists
let isKitInitialized = false;
function initKit() {
  if (typeof window === "undefined") return;
  const passphrase = kitPassphrase(readStoredNetwork());
  if (!isKitInitialized) {
    StellarWalletsKit.init({
      network: passphrase,
      selectedWalletId: "freighter",
      modules: [
        new FreighterModule(),
        new AlbedoModule(),
        new xBullModule()
      ],
    });
    isKitInitialized = true;
  } else {
    StellarWalletsKit.setNetwork(passphrase);
  }
}

interface WalletState {
  isInstalled: boolean;
  isConnected: boolean;
  publicKey: string | null;
  isLoading: boolean;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  getKit: () => typeof StellarWalletsKit;
}

const initialState: WalletState = {
  isInstalled: false,
  isConnected: false,
  publicKey: null,
  isLoading: false,
  error: null,
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function FreighterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);
  const { showToast } = useToast();

  useEffect(() => {
    initKit();
    const unsub = subscribeStoredNetwork(() => {
      StellarWalletsKit.setNetwork(kitPassphrase(readStoredNetwork()));
    });
    const installed = isFreighterInjected(currentFreighterHost());
    setState((prev) => ({ ...prev, isInstalled: installed }));
    const restoreSession = async () => {
      try {
        const { address } = await StellarWalletsKit.getAddress();
        if (address) {
          setState((prev) => ({
            ...prev,
            isInstalled: true,
            isConnected: true,
            publicKey: address,
          }));
        }
      } catch {
        // No active session or rejected, ignore silently
      }
    };
    restoreSession();
    return unsub;
  }, []);

  const connect = useCallback(async () => {
    try {
      initKit();
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let address: string;

      // The kit's Freighter module reports itself unavailable on the mobile
      // wrapper, so the modal would send the user to the download page.
      // Everywhere else, open the picker (Freighter / Albedo / xBull).
      if (isFreighterMobile(currentFreighterHost())) {
        const access = await requestAccess();
        if (access.error) {
          throw new Error(
            typeof access.error === "string" ? access.error : "Freighter access was denied."
          );
        }
        address = access.address;
        if (!address) {
          const got = await getAddress();
          if (got.error || !got.address) {
            throw new Error("Freighter did not return an address.");
          }
          address = got.address;
        }
      } else {
        const result = await StellarWalletsKit.authModal();
        address = result.address;
      }

      setState({
        isInstalled: true,
        isConnected: true,
        publicKey: address,
        isLoading: false,
        error: null,
      });
      showToast(`Connected to wallet`, "success");
      void logEvent("wallet_connect", address, readStoredNetwork());
    } catch (err) {
      console.error("Wallet selection error:", err);
      let errMsg = err instanceof Error ? err.message : "Failed to connect to wallet.";
      
      if (errMsg.toLowerCase().includes("reject") || errMsg.toLowerCase().includes("decline") || errMsg.toLowerCase().includes("cancel") || errMsg.toLowerCase().includes("closed the modal")) {
        errMsg = "Wallet connection rejected by user.";
      } else if (errMsg.toLowerCase().includes("not found") || errMsg.toLowerCase().includes("not installed")) {
        errMsg = `Freighter is not installed. Download it at ${FREIGHTER_DOWNLOAD_URL}`;
      }
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errMsg,
      }));
      showToast(errMsg, "error");
    }
  }, [showToast]);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch (e) {
      // ignore
    }
    setState({
      isInstalled: isFreighterInjected(currentFreighterHost()),
      isConnected: false,
      publicKey: null,
      isLoading: false,
      error: null,
    });
    showToast("Wallet disconnected", "success");
  }, [showToast]);

  const getKit = useCallback(() => {
    initKit();
    return StellarWalletsKit;
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, getKit }}>
      {children}
    </WalletContext.Provider>
  );
}

// Keep the useFreighter name so we don't have to refactor everything
export function useFreighter(): WalletContextValue {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useFreighter must be used within a <FreighterProvider>");
  }
  return context;
}

export function truncateAddress(address: string, start = 6, end = 4): string {
  if (!address || address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}
