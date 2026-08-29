"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useFreighter, truncateAddress } from "../context/FreighterContext";
import { Wallet, LogOut, Bell, ChevronDown, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useToast } from "./Toast";

export default function Header() {
  const pathname = usePathname();
  const {
    publicKey: address,
    isConnected,
    isLoading,
    connect,
    disconnect,
  } = useFreighter();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { showToast } = useToast();
  // Client-mount guard for next-themes (avoids SSR hydration mismatch on the
  // theme icon) without a setState-in-effect. Returns false on the server and
  // during the first client render, true thereafter.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [balances, setBalances] = useState<{ xlm: string; usdc: string }>({
    xlm: "...",
    usdc: "...",
  });
  const [isFetchingBalances, setIsFetchingBalances] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch balances when dropdown opens or network changes
  useEffect(() => {
    if (!isDropdownOpen || !address) return;
    let active = true;
    const horizonUrl =
      network === "mainnet"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org";

    async function loadBalances() {
      setIsFetchingBalances(true);
      try {
        const res = await fetch(`${horizonUrl}/accounts/${address}`);
        if (!res.ok) throw new Error("Account not found");
        const data = await res.json();

        let xlm = "0.00";
        let usdc = "0.00";
        if (data.balances) {
          for (const b of data.balances) {
            if (b.asset_type === "native") {
              xlm = parseFloat(b.balance).toFixed(2);
            } else if (b.asset_code === "USDC") {
              usdc = parseFloat(b.balance).toFixed(2);
            }
          }
        }
        if (active) setBalances({ xlm, usdc });
      } catch (err) {
        console.error(`Failed to fetch balances on ${network}`, err);
        if (active) setBalances({ xlm: "0.00", usdc: "0.00" });
      } finally {
        if (active) setIsFetchingBalances(false);
      }
    }

    loadBalances();
    return () => {
      active = false;
    };
  }, [isDropdownOpen, address, network]);

  const handleThemeToggle = () => {
    if (theme === "system") {
      const next = resolvedTheme === "dark" ? "light" : "dark";
      setTheme(next);
      showToast(
        `Switched to ${next} mode — System preference overridden`,
        "info",
      );
      return;
    }
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--surface)",
      }}
      className={
        pathname === "/"
          ? "card fixed top-4 left-0 right-0 mx-auto w-[calc(100%-2rem)] max-w-7xl z-40 h-20"
          : "card fixed top-4 left-4 right-4 z-40 h-20"
      }
    >
      <div
        className={`h-full mx-auto px-4 sm:px-6 flex items-center justify-between ${pathname === "/" ? "w-full" : "max-w-[1600px]"}`}
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-4 sm:gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/header_assets/fluxID-logo.png"
              alt="FluxID"
              width={34}
              height={42}
              className="sm:w-10 sm:h-[46px]"
            />
            <span
              className="hidden sm:inline-block"
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}
            >
              <span style={{ color: "#8FA828" }}>Flux</span>
              <span style={{ color: "var(--foreground)" }}>ID</span>
            </span>
          </Link>
        </div>

        {/* Right: Notifications + Theme + Wallet */}
        <div className="flex items-center gap-2">
          {/* All in one border container */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
            className="flex items-center gap-1 p-1"
          >
            {/* Notification */}
            <button
              style={{ color: "var(--foreground-muted)" }}
              className="hidden sm:flex p-2 rounded-lg hover:bg-border transition-colors"
            >
              <Bell size={18} />
            </button>

            {/* Theme Toggle */}
            {mounted && (
              <button
                onClick={handleThemeToggle}
                aria-label={
                  theme === "system"
                    ? "System theme active — click to override"
                    : "Toggle theme"
                }
                title={
                  theme === "system"
                    ? "System theme — click to set light or dark"
                    : undefined
                }
                style={{ color: "var(--foreground-muted)" }}
                className="flex p-2 rounded-lg hover:bg-border transition-colors"
              >
                {theme === "system" ? (
                  <Monitor size={18} />
                ) : resolvedTheme === "dark" ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </button>
            )}

            {/* Connect Wallet or Address */}
            {isConnected && address ? (
              <div
                className="flex items-center gap-2 relative"
                ref={dropdownRef}
              >
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  style={{
                    background: isDropdownOpen
                      ? "var(--surface)"
                      : "var(--surface)",
                    borderRadius: 16,
                  }}
                  className={`flex items-center gap-2 hover:bg-surface transition-colors cursor-pointer ${isDropdownOpen ? "pressed" : "card"}`}
                >
                  <Wallet size={14} style={{ color: "var(--primary)" }} />
                  <span
                    style={{
                      color: "var(--foreground)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {truncateAddress(address)}
                  </span>
                  <ChevronDown
                    size={14}
                    style={{
                      color: "var(--foreground-muted)",
                      transform: isDropdownOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                </button>

                {/* Dropdown Panel */}
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: "absolute",
                      top: "calc(100% + 12px)",
                      right: 0,
                      width: 220,
                      padding: 16,
                      zIndex: 50,
                    }}
                    className="card rounded-none!"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                        Balances
                      </span>
                      {isFetchingBalances && (
                        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      )}
                    </div>

                    {/* Network Toggle */}
                    <div className="flex p-1 rounded-lg mb-4 pressed">
                      <button
                        onClick={() => setNetwork("testnet")}
                        className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all duration-200 ${
                          network === "testnet"
                            ? "card text-primary"
                            : "text-foreground-muted hover:text-foreground"
                        }`}
                      >
                        Testnet
                      </button>
                      <button
                        onClick={() => setNetwork("mainnet")}
                        className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all duration-200 ${
                          network === "mainnet"
                            ? "card text-primary"
                            : "text-foreground-muted hover:text-foreground"
                        }`}
                      >
                        Mainnet
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-foreground"></div>
                          XLM
                        </span>
                        <span className="text-sm font-mono">
                          {balances.xlm}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#2775CA]"></div>
                          USDC
                        </span>
                        <span className="text-sm font-mono">
                          {balances.usdc}
                        </span>
                      </div>
                    </div>

                    <div className="h-px w-full bg-(--shadow-dark) opacity-20 my-4"></div>

                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        disconnect();
                      }}
                      className="w-full flex items-center gap-2 justify-center text-sm font-bold text-(--error) hover:bg-surface py-2 rounded-lg transition-colors"
                    >
                      <LogOut size={14} />
                      Disconnect
                    </button>

                    {/* Mobile Only Actions */}
                    <div className="flex sm:hidden justify-between items-center mt-3 pt-3 border-t border-(--shadow-dark)">
                      <button
                        style={{ color: "var(--foreground-muted)" }}
                        className="p-2 rounded-lg hover:bg-surface transition-colors flex items-center gap-2"
                      >
                        <Bell size={16} />{" "}
                        <span className="text-xs font-semibold">Alerts</span>
                      </button>
                      {mounted && (
                        <button
                          onClick={handleThemeToggle}
                          style={{ color: "var(--foreground-muted)" }}
                          className="p-2 rounded-lg hover:bg-surface transition-colors flex items-center gap-2"
                        >
                          {theme === "system" ? (
                            <Monitor size={16} />
                          ) : resolvedTheme === "dark" ? (
                            <Sun size={16} />
                          ) : (
                            <Moon size={16} />
                          )}
                          <span className="text-xs font-semibold">
                            {theme === "system"
                              ? "System"
                              : resolvedTheme === "dark"
                                ? "Light"
                                : "Dark"}
                          </span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <button
                onClick={connect}
                disabled={isLoading}
                className="btn btn-outline text-sm py-1.5 flex items-center gap-2 disabled:opacity-60"
              >
                <Wallet size={14} />
                {isLoading ? "..." : "Connect"}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  );
}
