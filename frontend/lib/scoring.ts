import { Horizon } from "@stellar/stellar-sdk";

export type StellarNetwork = "mainnet" | "testnet";

const HORIZON_URLS: Record<StellarNetwork, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
};

function horizonUrlFor(network: StellarNetwork): string {
  return HORIZON_URLS[network];
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(addr: string): boolean {
  return STELLAR_ADDRESS_RE.test(addr.trim());
}

/** Prefer a typed address; fall back to the connected Freighter key. */
export function resolveAnalyzeAddress(
  input: string,
  connectedAddress: string | null | undefined
): string | null {
  const trimmed = input.trim();
  if (isValidStellarAddress(trimmed)) return trimmed;
  if (connectedAddress && isValidStellarAddress(connectedAddress)) {
    return connectedAddress.trim();
  }
  return null;
}

export const ACCOUNT_NOT_FOUND_GUIDANCE = [
  "This wallet may be on a different network. Try switching between Mainnet/Testnet.",
  "Make sure the account is activated (has at least 1 XLM).",
  "Check the address for typos.",
] as const;

export const ACCOUNT_ACTIVATION_GUIDE_URL =
  "https://developers.stellar.org/docs/learn/fundamentals/lumens#minimum-balance";

export function isHorizonNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    name?: string;
    status?: number;
    response?: { status?: number; statusCode?: number };
  };
  const status = e.response?.status ?? e.response?.statusCode ?? e.status;
  return e.name === "NotFoundError" || status === 404;
}

export function isAccountNotFoundMessage(message: string): boolean {
  return /account not found/i.test(message);
}

export function horizonAnalyzeError(error: unknown, network: StellarNetwork): string {
  if (isHorizonNotFound(error)) {
    return `Account not found on ${network}. ${ACCOUNT_NOT_FOUND_GUIDANCE.join(" ")}`;
  }
  const detail =
    error instanceof Error && error.message ? error.message : "Please try again.";
  return `Wallet analysis failed on ${network}. ${detail}`;
}

export function formatTransactionCount(count: number): string {
  return count === 0 ? "No transactions found" : String(count);
}

export function computeAssetsBreakdown(
  payments: PaymentRecord[],
  walletAddress: string
): AssetsBreakdown {
  const empty = (): AssetDirection => ({ XLM: 0, USDC: 0, other: [] });
  const assets: AssetsBreakdown = { inflow: empty(), outflow: empty() };

  const add = (dir: AssetDirection, p: PaymentRecord) => {
    if (!p.asset_type || p.asset_type === "native") {
      dir.XLM += parseFloat(p.amount) || 0;
      return;
    }
    const code = p.asset_code ?? "";
    if (code === "USDC") {
      dir.USDC += parseFloat(p.amount) || 0;
      return;
    }
    const existing = dir.other.find(
      (o) => o.code === code && o.issuer === p.asset_issuer
    );
    if (existing) {
      existing.amount += parseFloat(p.amount) || 0;
      existing.count += 1;
    } else {
      dir.other.push({
        code,
        issuer: p.asset_issuer,
        label: code,
        amount: parseFloat(p.amount) || 0,
        count: 1,
      });
    }
  };

  for (const p of payments) {
    if (p.transaction_successful === false) continue;
    if (p.type === "create_account") {
      const dir = p.account === walletAddress ? assets.inflow : assets.outflow;
      dir.XLM += parseFloat(p.starting_balance || p.amount || "0") || 0;
      continue;
    }
    if (p.asset_type !== "native" && !p.asset_type?.startsWith("credit_")) continue;
    if (p.from === walletAddress) add(assets.outflow, p);
    else if (p.to === walletAddress) add(assets.inflow, p);
  }
  return assets;
}

export function holdingsFromBalances(
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>
): WalletHolding[] {
  const holdings: WalletHolding[] = [];
  for (const b of balances) {
    const balance = parseFloat(b.balance) || 0;
    if (balance <= 0) continue;
    if (b.asset_type === "native") {
      holdings.push({ code: "XLM", balance });
    } else if (b.asset_code) {
      holdings.push({
        code: b.asset_code,
        issuer: b.asset_issuer,
        balance,
      });
    }
  }
  return holdings;
}

export function assetKindsLabel(
  assets?: AssetsBreakdown,
  holdings?: WalletHolding[]
): string {
  const kinds = new Set<string>();
  if (holdings && holdings.length > 0) {
    for (const h of holdings) kinds.add(h.code);
  } else if (assets) {
    for (const dir of [assets.inflow, assets.outflow]) {
      if (dir.XLM > 0) kinds.add("XLM");
      if (dir.USDC > 0) kinds.add("USDC");
      for (const o of dir.other) kinds.add(o.code);
    }
  }
  if (kinds.size === 0) return "None";
  if (kinds.size <= 3) return Array.from(kinds).join(", ");
  return `${kinds.size} assets`;
}

const AI_BACKEND_URL = process.env.NEXT_PUBLIC_AI_BACKEND_URL || "";

export interface LiquidityMetrics {
  totalInflow: number;
  totalOutflow: number;
  transactionCount: number;
  inflowCount: number;
  outflowCount: number;
  swaps: SwapInfo[];
  totalSwapValue: number;
}

export interface LiquidityScore {
  score: number;
  riskLevel: "Low" | "Medium" | "High";
  factors: {
    inflowConsistency: number;
    outflowStability: number;
    transactionFrequency: number;
  };
}

export interface TransactionData {
  id: string;
  date: string;
  amount: number;
  type: "inflow" | "outflow" | "swap";
  address: string;
  asset: string;
  isNonTransfer?: boolean;
  swapDetails?: {
    fromAsset: string;
    toAsset: string;
    fromAmount: number;
    toAmount: number;
  };
}

export interface SwapInfo {
  fromAsset: string;
  toAsset: string;
  fromAmount: number;
  toAmount: number;
  count: number;
}

export interface FlowSummary {
  totalInflow: number;
  totalOutflow: number;
  transactionCount: number;
  averageTransaction: number;
  swaps: SwapInfo[];
  totalSwapValue: number;
}

export interface AssetDirection {
  XLM: number;
  USDC: number;
  other: Array<{ code: string; issuer?: string; label: string; amount: number; count: number }>;
}

export interface AssetsBreakdown {
  inflow: AssetDirection;
  outflow: AssetDirection;
}

export interface UsdValuation {
  inflow: number | null;
  outflow: number | null;
  xlmPriceUsd: number | null;
  priceSource: string | null;
  priceFetchedAt: string | null;
  unsupportedInflowCount: number;
  unsupportedOutflowCount: number;
  note: string;
}

export type ExplanationSource = "llm" | "rule-based";

export interface Explanation {
  insight: string;
  suggestions: string[];
  source: ExplanationSource;
  model?: string;
  generatedAt: string;
}

export interface WalletAnalysis {
  score: LiquidityScore;
  metrics: LiquidityMetrics;
  transactions: TransactionData[];
  flowSummary: FlowSummary;
  assets?: AssetsBreakdown;
  usd?: UsdValuation;
  explanation?: Explanation;
  holdings?: WalletHolding[];
  error?: string;
}

export interface WalletHolding {
  code: string;
  issuer?: string;
  balance: number;
}

type PaymentRecord = {
  id: string;
  type?: string;
  from: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  source_amount?: string;
  source_asset_type?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  created_at: string;
  transaction_successful?: string | boolean;
  starting_balance?: string;
  account?: string;
  funder?: string;
};

export async function fetchWalletPayments(
  address: string,
  network: StellarNetwork = "mainnet",
  limit = 200
): Promise<PaymentRecord[]> {
  const server = new Horizon.Server(horizonUrlFor(network));

  try {
    const response = await server
      .payments()
      .forAccount(address)
      .limit(limit)
      .order("desc")
      .call();

    // Exclude self-swaps: path_payment_strict_* ops where the wallet is both source
    // and destination are internal asset conversions (XLM → USDC etc.), not real
    // inflows or outflows. Keeping them would inflate counts and skew every sub-score.
    const records = response.records as unknown as PaymentRecord[];
    return records.filter((p) => !(p.from === address && p.to === address));
  } catch (error) {
    if (isHorizonNotFound(error)) {
      throw new Error(horizonAnalyzeError(error, network));
    }
    return [];
  }
}

export async function fetchWalletPaymentsWithSwaps(
  address: string,
  network: StellarNetwork = "mainnet",
  limit = 200
): Promise<{ payments: PaymentRecord[]; swapPayments: PaymentRecord[] }> {
  const server = new Horizon.Server(horizonUrlFor(network));

  try {
    const response = await server
      .payments()
      .forAccount(address)
      .limit(limit)
      .order("desc")
      .call();

    const records = response.records as unknown as PaymentRecord[];
    const payments = records.filter((p) => !(p.from === address && p.to === address));
    const swapPayments = records.filter((p) => p.from === address && p.to === address);

    return { payments, swapPayments };
  } catch (error) {
    if (isHorizonNotFound(error)) {
      throw new Error(horizonAnalyzeError(error, network));
    }
    return { payments: [], swapPayments: [] };
  }
}

export async function fetchHorizonTransactionCount(
  address: string,
  network: StellarNetwork = "mainnet"
): Promise<number> {
  const server = new Horizon.Server(horizonUrlFor(network));
  try {
    const response = await server
      .transactions()
      .forAccount(address)
      .limit(200)
      .order("desc")
      .call();
    return response.records.length;
  } catch (error) {
    throw new Error(horizonAnalyzeError(error, network));
  }
}

async function fetchAccountHoldings(
  address: string,
  network: StellarNetwork
): Promise<WalletHolding[]> {
  const server = new Horizon.Server(horizonUrlFor(network));
  try {
    const account = await server.loadAccount(address);
    return holdingsFromBalances(
      account.balances as Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }>
    );
  } catch {
    return [];
  }
}

function parsePayments(payments: PaymentRecord[], walletAddress: string): TransactionData[] {
  const parsed: TransactionData[] = [];

  for (const p of payments) {
    if (p.transaction_successful === false) continue;

    if (p.type === "create_account") {
      const amount = parseFloat(p.starting_balance || p.amount || "0") || 0;
      const isInflow = p.account === walletAddress;
      parsed.push({
        id: p.id,
        date: new Date(p.created_at).toISOString().split("T")[0],
        amount,
        type: isInflow ? "inflow" : "outflow",
        address: isInflow ? p.funder || p.from : p.account || p.to,
        asset: "XLM",
      });
      continue;
    }

    if (p.asset_type !== "native" && !p.asset_type?.startsWith("credit_")) continue;

    const amount = parseFloat(p.amount) || 0;
    const isOutflow = p.from === walletAddress;
    const asset =
      p.asset_type === "native" ? "XLM" : `${p.asset_code ?? ""}:${p.asset_issuer ?? ""}`;

    parsed.push({
      id: p.id,
      date: new Date(p.created_at).toISOString().split("T")[0],
      amount,
      type: isOutflow ? "outflow" : "inflow",
      address: isOutflow ? p.to : p.from,
      asset,
      isNonTransfer: amount === 0,
    });
  }

  return parsed;
}

export function calculateLiquidityMetrics(
  payments: PaymentRecord[],
  walletAddress: string,
  swapPayments: PaymentRecord[] = []
): LiquidityMetrics {
  let totalInflow = 0;
  let totalOutflow = 0;
  let inflowCount = 0;
  let outflowCount = 0;

  for (const p of payments) {
    if (p.transaction_successful === false) continue;
    if (p.asset_type !== "native" && !p.asset_type?.startsWith("credit_")) continue;

    const amount = parseFloat(p.amount) || 0;
    if (amount <= 0) continue;

    if (p.from === walletAddress) {
      totalOutflow += amount;
      outflowCount++;
    } else if (p.to === walletAddress) {
      totalInflow += amount;
      inflowCount++;
    }
  }

  // Track swaps/conversions using the actual source & destination assets from
  // the path-payment record so pairs like USDC→XLM don't collapse into XLM→XLM.
  const swapMap = new Map<string, SwapInfo>();
  let totalSwapValue = 0;

  for (const p of swapPayments) {
    if (p.transaction_successful === false) continue;
    if (p.asset_type !== "native" && !p.asset_type?.startsWith("credit_")) continue;

    const toAmount = parseFloat(p.amount) || 0;
    const fromAmount = parseFloat(p.source_amount ?? p.amount) || 0;
    // Aggregate by asset symbol only (not issuer) so the Conversions caption
    // shows "USDC → XLM" rather than "USDC:GA5Z…GFAW → XLM". The issuer is
    // metadata that doesn't belong in display labels.
    const toAsset = assetCodeOf(p.asset_type, p.asset_code);
    const fromAsset = assetCodeOf(p.source_asset_type, p.source_asset_code);
    const key = `${fromAsset}→${toAsset}`;

    const existing = swapMap.get(key);
    if (existing) {
      existing.fromAmount += fromAmount;
      existing.toAmount += toAmount;
      existing.count++;
    } else {
      swapMap.set(key, {
        fromAsset,
        toAsset,
        fromAmount,
        toAmount,
        count: 1,
      });
    }
    totalSwapValue += toAmount;
  }

  return {
    totalInflow,
    totalOutflow,
    transactionCount: inflowCount + outflowCount,
    inflowCount,
    outflowCount,
    swaps: Array.from(swapMap.values()),
    totalSwapValue,
  };
}

export function calculateFlowSummary(metrics: LiquidityMetrics): FlowSummary {
  return {
    totalInflow: metrics.totalInflow,
    totalOutflow: metrics.totalOutflow,
    transactionCount: metrics.transactionCount,
    averageTransaction:
      metrics.transactionCount > 0
        ? (metrics.totalInflow + metrics.totalOutflow) / metrics.transactionCount
        : 0,
    swaps: metrics.swaps || [],
    totalSwapValue: metrics.totalSwapValue || 0,
  };
}

export function calculateLiquidityScore(metrics: LiquidityMetrics): LiquidityScore {
  const { totalInflow, totalOutflow, transactionCount, inflowCount, outflowCount } = metrics;

  if (transactionCount === 0) {
    return {
      score: 0,
      riskLevel: "High",
      factors: { inflowConsistency: 0, outflowStability: 0, transactionFrequency: 0 },
    };
  }

  const avgInflow = inflowCount > 0 ? totalInflow / inflowCount : 0;
  const inflowConsistency = Math.min(40, Math.floor(avgInflow / 100));

  const avgOutflow = outflowCount > 0 ? totalOutflow / outflowCount : 0;
  const outflowStability = Math.max(0, 30 - Math.floor(avgOutflow / 200));

  const frequencyScore = Math.min(30, Math.floor(transactionCount / 5) * 3);

  const score = inflowConsistency + outflowStability + frequencyScore;

  let riskLevel: "Low" | "Medium" | "High" = "Low";
  if (score < 40) riskLevel = "High";
  else if (score < 70) riskLevel = "Medium";

  return {
    score: Math.min(100, Math.max(0, score)),
    riskLevel,
    factors: {
      inflowConsistency,
      outflowStability,
      transactionFrequency: frequencyScore,
    },
  };
}

function assetCodeOf(
  assetType: string | undefined,
  code: string | undefined
): string {
  if (!assetType || assetType === "native") return "XLM";
  return code ?? "";
}

function buildSwapTransactions(
  swapPayments: PaymentRecord[],
  walletAddress: string
): TransactionData[] {
  return swapPayments.map((p) => {
    const toAsset = assetCodeOf(p.asset_type, p.asset_code);
    const fromAsset = assetCodeOf(p.source_asset_type, p.source_asset_code);
    const toAmount = parseFloat(p.amount) || 0;
    const fromAmount = parseFloat(p.source_amount ?? p.amount) || 0;
    const assetLabel =
      p.asset_type === "native" ? "XLM" : `${p.asset_code ?? ""}:${p.asset_issuer ?? ""}`;
    return {
      id: p.id,
      date: new Date(p.created_at).toISOString().split("T")[0],
      amount: toAmount,
      type: "swap" as const,
      address: p.from === walletAddress ? p.to : p.from,
      asset: assetLabel,
      swapDetails: {
        fromAsset,
        toAsset,
        fromAmount,
        toAmount,
      },
    };
  });
}

function localAnalyze(
  address: string,
  payments: PaymentRecord[],
  swapPayments: PaymentRecord[] = [],
  horizonTxCount?: number,
  holdings: WalletHolding[] = []
): WalletAnalysis {
  const metrics = calculateLiquidityMetrics(payments, address, swapPayments);
  const txCount = horizonTxCount ?? metrics.transactionCount;
  const scored = { ...metrics, transactionCount: txCount };
  const score = calculateLiquidityScore(scored);
  const transactions = parsePayments(payments, address);
  const swapTransactions = buildSwapTransactions(swapPayments, address);

  return {
    score,
    metrics: scored,
    transactions: [...transactions, ...swapTransactions].sort((a, b) => b.date.localeCompare(a.date)),
    flowSummary: calculateFlowSummary(scored),
    assets: computeAssetsBreakdown(payments, address),
    holdings,
  };
}

type BackendScoreResponse = {
  success: boolean;
  data?: {
    score: number;
    risk: "Low" | "Medium" | "High";
    explanation?: Explanation;
    assets?: AssetsBreakdown;
    usd?: UsdValuation;
    metrics: {
      totalVolumeXLM: number;
      transactionCount: number;
      uniqueCounterparties: number;
      avgTransactionSize: number;
      inflowVolume: number;
      outflowVolume: number;
      inflowCount: number;
      outflowCount: number;
      inflowScore: number;
      outflowScore: number;
      frequencyScore: number;
      diversityScore: number;
      flowStabilityScore: number;
      volumeScore: number;
    };
  };
  error?: string;
};

async function fetchFromBackend(
  address: string,
  network: StellarNetwork = "mainnet"
): Promise<WalletAnalysis | null> {
  if (!AI_BACKEND_URL) return null;

  try {
    const response = await fetch(`${AI_BACKEND_URL}/wallet/${address}?network=${network}`);
    const json = (await response.json()) as BackendScoreResponse;
    if (!json.success || !json.data) return null;

    const d = json.data;
    // Backend /score strips self-swaps from its metrics, so fetch both here and
    // layer swap data onto the backend numbers — otherwise the transactions tab
    // and FlowSummary swap row show 0. Don't let a Horizon miss wipe the score.
    let payments: PaymentRecord[] = [];
    let swapPayments: PaymentRecord[] = [];
    try {
      const fetched = await fetchWalletPaymentsWithSwaps(address, network);
      payments = fetched.payments;
      swapPayments = fetched.swapPayments;
    } catch {
      // Keep the backend result; local analyzeWallet will still surface Horizon errors.
    }
    const transactions = parsePayments(payments, address);
    const swapTransactions = buildSwapTransactions(swapPayments, address);
    const swapMetrics = calculateLiquidityMetrics([], address, swapPayments);

    const txCount = await fetchHorizonTransactionCount(address, network).catch(
      () => d.metrics.transactionCount
    );
    const holdings = await fetchAccountHoldings(address, network);
    const localAssets = computeAssetsBreakdown(payments, address);

    const metrics: LiquidityMetrics = {
      totalInflow: d.metrics.inflowVolume,
      totalOutflow: d.metrics.outflowVolume,
      transactionCount: txCount,
      inflowCount: d.metrics.inflowCount,
      outflowCount: d.metrics.outflowCount,
      swaps: swapMetrics.swaps,
      totalSwapValue: swapMetrics.totalSwapValue,
    };

    return {
      score: {
        score: d.score,
        riskLevel: d.risk,
        factors: {
          inflowConsistency: d.metrics.inflowScore,
          outflowStability: d.metrics.outflowScore,
          transactionFrequency: d.metrics.frequencyScore,
        },
      },
      metrics,
      transactions: [...transactions, ...swapTransactions].sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
      flowSummary: calculateFlowSummary(metrics),
      assets: d.assets && assetKindsLabel(d.assets) !== "None" ? d.assets : localAssets,
      usd: d.usd,
      explanation: d.explanation,
      holdings,
    };
  } catch (error) {
    console.error("Backend fetch failed:", error);
    return null;
  }
}

export async function analyzeWallet(
  address: string,
  network: StellarNetwork = "mainnet"
): Promise<WalletAnalysis> {
  const fromBackend = await fetchFromBackend(address, network);
  if (fromBackend) return fromBackend;

  try {
    const { payments, swapPayments } = await fetchWalletPaymentsWithSwaps(address, network);
    const [horizonTxCount, holdings] = await Promise.all([
      fetchHorizonTransactionCount(address, network).catch(
        () => payments.length + swapPayments.length
      ),
      fetchAccountHoldings(address, network),
    ]);
    return localAnalyze(address, payments, swapPayments, horizonTxCount, holdings);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : horizonAnalyzeError(error, network)
    );
  }
}

export function getSuggestions(score: LiquidityScore, metrics: LiquidityMetrics): string[] {
  const suggestions: string[] = [];

  if (metrics.inflowCount === 0) {
    suggestions.push("No incoming transactions detected. Consider receiving regular funds to build your score.");
  }

  if (metrics.outflowCount > metrics.inflowCount * 0.8) {
    suggestions.push("Your outflows are consistently high — consider building a reserve before making large transactions.");
  }

  if (score.riskLevel === "High") {
    suggestions.push("Your risk level is high. Focus on consistent, smaller transactions to improve reliability.");
  }

  if (metrics.transactionCount < 10) {
    suggestions.push("Increase transaction frequency to demonstrate financial activity and build your liquidity history.");
  }

  if (score.riskLevel === "Low" && suggestions.length === 0) {
    suggestions.push("Great job! Your wallet shows strong financial behavior.");
  }

  return suggestions.slice(0, 2);
}
