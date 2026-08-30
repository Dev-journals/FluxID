"use client";

import {
  ACCOUNT_ACTIVATION_GUIDE_URL,
  ACCOUNT_NOT_FOUND_GUIDANCE,
} from "../../lib/scoring";

interface AccountNotFoundHelpProps {
  network?: string;
  /** Scroll target for the Mainnet/Testnet control on this page. */
  switcherHref?: string;
  onSwitchNetwork?: () => void;
}

export default function AccountNotFoundHelp({
  network,
  switcherHref = "#network-switcher",
  onSwitchNetwork,
}: AccountNotFoundHelpProps) {
  return (
    <div className="mt-2" style={{ color: "#ef4444", fontSize: 12 }}>
      <p className="font-semibold">
        Account not found{network ? ` on ${network}` : " on this network"}.
      </p>
      <ul className="mt-1 list-disc pl-5 space-y-0.5" style={{ color: "var(--foreground-muted)" }}>
        {ACCOUNT_NOT_FOUND_GUIDANCE.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {onSwitchNetwork ? (
          <button
            type="button"
            onClick={onSwitchNetwork}
            className="underline font-semibold"
            style={{ color: "var(--primary)", fontSize: 12 }}
          >
            Switch network
          </button>
        ) : (
          <a
            href={switcherHref}
            className="underline font-semibold"
            style={{ color: "var(--primary)", fontSize: 12 }}
          >
            Switch network
          </a>
        )}
        <a
          href={ACCOUNT_ACTIVATION_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold"
          style={{ color: "var(--primary)", fontSize: 12 }}
        >
          Account activation guide
        </a>
      </div>
    </div>
  );
}
