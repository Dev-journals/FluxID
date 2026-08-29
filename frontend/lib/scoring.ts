import { Horizon } from "@stellar/stellar-sdk";

export type StellarNetwork = "mainnet" | "testnet";

const HORIZON_URLS: Record<StellarNetwork, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
};

function horizonUrlFor(network: StellarNetwork): string {
  return HORIZON_URLS[network];
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
  error?: string;
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
  transaction_successful?: boolean;
};

export async function fetchWalletPayments(
  address: string,
  network: StellarNetwork = "mainnet",
  limit = 100
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
    // 404s are expected when a wallet exists on one network but not another —
    // return empty instead of throwing, caller handles the empty-state UX.
    console.warn("fetchWalletPayments failed for", address, network, error);
    return [];
  }
}

export async function fetchWalletPaymentsWithSwaps(
  address: string,
  network: StellarNetwork = "mainnet",
  limit = 100
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
    console.warn("fetchWalletPaymentsWithSwaps failed for", address, network, error);
    return { payments: [], swapPayments: [] };
  }
}

function parsePayments(payments: PaymentRecord[], walletAddress: string): TransactionData[] {
  const parsed: TransactionData[] = [];

  for (const p of payments) {
    if (p.transaction_successful === false) continue;
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

  return parsed.slice(0, 30);
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
  swapPayments: PaymentRecord[] = []
): WalletAnalysis {
  const metrics = calculateLiquidityMetrics(payments, address, swapPayments);
  const score = calculateLiquidityScore(metrics);
  const transactions = parsePayments(payments, address);
  const swapTransactions = buildSwapTransactions(swapPayments, address);

  return {
    score,
    metrics,
    transactions: [...transactions, ...swapTransactions].sort((a, b) => b.date.localeCompare(a.date)),
    flowSummary: calculateFlowSummary(metrics),
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
    // and FlowSummary swap row show 0.
    const { payments, swapPayments } = await fetchWalletPaymentsWithSwaps(address, network);
    const transactions = parsePayments(payments, address);
    const swapTransactions = buildSwapTransactions(swapPayments, address);
    const swapMetrics = calculateLiquidityMetrics([], address, swapPayments);

    const metrics: LiquidityMetrics = {
      totalInflow: d.metrics.inflowVolume,
      totalOutflow: d.metrics.outflowVolume,
      transactionCount: d.metrics.transactionCount,
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
      assets: d.assets,
      usd: d.usd,
      explanation: d.explanation,
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

  const { payments, swapPayments } = await fetchWalletPaymentsWithSwaps(address, network);
  return localAnalyze(address, payments, swapPayments);
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
