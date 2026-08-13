import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

// Hardcoded to testnet Horizon: the demo signs with Networks.TESTNET so the
// Horizon URL must match. Reading NEXT_PUBLIC_HORIZON_URL here let a mainnet
// override route the demo to the wrong network and 404 on account load.
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const AI_BACKEND_URL = process.env.NEXT_PUBLIC_AI_BACKEND_URL || "";
const NETWORK_PASSPHRASE = Networks.TESTNET;

export interface PaymentChallenge {
  status: "payment_required";
  requestId: string;
  payTo: string;
  amount: string;
  asset: "XLM";
  memo: string;
  network: "testnet" | "mainnet";
  expiresAt: string;
  retryUrl: string;
  instructions: string;
  reason?: string;
}

export interface PaidScoreResult {
  score: number;
  risk: "Low" | "Medium" | "High";
  explanation?: {
    insight: string;
    suggestions: string[];
    source: "llm" | "rule-based";
    model?: string;
    generatedAt: string;
  };
  metrics: Record<string, number>;
  lastUpdated: string;
  payment?: { status: "paid"; txHash?: string; requestId: string };
}

export type AgentStepStatus = "pending" | "active" | "done" | "error";

export interface AgentStep {
  id: string;
  label: string;
  status: AgentStepStatus;
  detail?: string;
  timestamp?: number;
}

export const INITIAL_AGENT_STEPS: AgentStep[] = [
  { id: "request", label: "Requesting score...", status: "pending" },
  { id: "challenge", label: "Payment required", status: "pending" },
  { id: "sign", label: "Signing payment with Freighter", status: "pending" },
  { id: "submit", label: "Submitting payment to Stellar", status: "pending" },
  { id: "verify", label: "Retrying request after payment", status: "pending" },
  { id: "received", label: "Score received", status: "pending" },
];

export function backendBase(): string {
  if (!AI_BACKEND_URL) throw new Error("NEXT_PUBLIC_AI_BACKEND_URL is not set");
  return AI_BACKEND_URL.replace(/\/$/, "");
}

export async function requestPaidScore(
  wallet: string,
  network: "testnet" | "mainnet" = "testnet",
  requestId?: string
): Promise<
  | { kind: "challenge"; challenge: PaymentChallenge }
  | { kind: "score"; result: PaidScoreResult }
  | { kind: "error"; status: number; error: string }
> {
  const base = backendBase();
  const qs = new URLSearchParams({ network });
  if (requestId) qs.set("requestId", requestId);
  const res = await fetch(`${base}/paid/wallet/${wallet}?${qs.toString()}`);
  const body = await res.json().catch(() => ({}));

  if (res.status === 402) {
    return { kind: "challenge", challenge: body.data as PaymentChallenge };
  }
  if (res.ok && body.success && body.data) {
    return { kind: "score", result: body.data as PaidScoreResult };
  }
  return {
    kind: "error",
    status: res.status,
    error: body.error || `Request failed with status ${res.status}`,
  };
}

export async function signAndSubmitChallenge(
  kit: { signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string; path?: string }) => Promise<{ signedTxXdr: string }> },
  sourcePublicKey: string,
  challenge: PaymentChallenge
): Promise<{ txHash: string }> {
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(sourcePublicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
    memo: Memo.text(challenge.memo),
  })
    .addOperation(
      Operation.payment({
        destination: challenge.payTo,
        asset: Asset.native(),
        amount: challenge.amount,
      })
    )
    .setTimeout(180)
    .build();

  // Use the StellarWalletsKit to sign
  const signed = await kit.signTransaction(tx.toXDR(), {
    address: sourcePublicKey,
    networkPassphrase: NETWORK_PASSPHRASE
  });
  
  if (!signed || !signed.signedTxXdr) {
    throw new Error("Transaction signing was rejected or failed.");
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
  const result = await server.submitTransaction(signedTx);
  return { txHash: (result as { hash: string }).hash };
}

export async function pollForScore(
  wallet: string,
  requestId: string,
  network: "testnet" | "mainnet" = "testnet",
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<PaidScoreResult> {
  const intervalMs = opts.intervalMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const outcome = await requestPaidScore(wallet, network, requestId);
    if (outcome.kind === "score") return outcome.result;
    if (outcome.kind === "error") throw new Error(outcome.error);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for payment confirmation.");
}
