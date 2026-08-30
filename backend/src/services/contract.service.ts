import {
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { createHash } from 'crypto';
import type { NetworkType } from '../config/stellar.config.js';
import { getStellarConfig } from '../config/stellar.config.js';
import type { ContractSyncResult, OnChainWalletInfo } from '../types/contract.types.js';
import { logger } from '../utils/logger.js';

const RISK_VARIANT: Record<'Low' | 'Medium' | 'High', string> = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
};

function riskToScVal(risk: 'Low' | 'Medium' | 'High'): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(RISK_VARIANT[risk])]);
}

function decodeRiskLevel(value: unknown): 'Low' | 'Medium' | 'High' | null {
  // Soroban unit-variant enums decode via scValToNative as a one-element tuple: ['Low']
  if (Array.isArray(value) && value.length === 1) {
    const tag = value[0];
    if (tag === 'Low' || tag === 'Medium' || tag === 'High') return tag;
  }
  if (value && typeof value === 'object' && 'tag' in (value as Record<string, unknown>)) {
    const tag = (value as { tag: unknown }).tag;
    if (tag === 'Low' || tag === 'Medium' || tag === 'High') return tag;
  }
  if (typeof value === 'string' && (value === 'Low' || value === 'Medium' || value === 'High')) {
    return value;
  }
  return null;
}

function normaliseWalletScoreStruct(decoded: unknown, wallet: string): OnChainWalletInfo | null {
  if (!decoded || typeof decoded !== 'object') return null;
  const obj = decoded as Record<string, unknown>;
  const score = typeof obj.score === 'bigint' ? Number(obj.score) : (obj.score as number | undefined);
  const lastUpdatedRaw = obj.last_updated ?? obj.lastUpdated;
  const lastUpdated =
    typeof lastUpdatedRaw === 'bigint' ? Number(lastUpdatedRaw) : (lastUpdatedRaw as number | undefined);
  const risk = decodeRiskLevel(obj.risk);

  if (typeof score !== 'number' || typeof lastUpdated !== 'number' || !risk) return null;

  return {
    wallet,
    score,
    risk,
    lastUpdated,
    onChain: true,
  };
}

export class ContractService {
  private network: NetworkType;
  private networkPassphrase: string;
  private rpcUrl: string;
  private contractId?: string;
  private adminSecret?: string;

  constructor(network: NetworkType = 'testnet') {
    const config = getStellarConfig(network);
    this.network = network;
    this.networkPassphrase = config.networkPassphrase;
    this.rpcUrl = config.rpcUrl;
    this.contractId = config.contractId;
    // The key that signs set_score. Named for its role (the oracle signer),
    // not the wallet you use for it — ADMIN_SECRET_KEY is kept as a fallback so
    // existing deployments that set the old name keep working.
    const secretRaw =
      process.env.ORACLE_SECRET_KEY ||
      process.env.ADMIN_SECRET_KEY ||
      process.env.FLUXID_ADMIN_SECRET_KEY;
    this.adminSecret = secretRaw ? secretRaw.trim().replace(/['"]/g, '') : undefined;
  }

  private isConfigured(): boolean {
    return Boolean(this.contractId && this.adminSecret);
  }

  private canRead(): boolean {
    return Boolean(this.contractId);
  }

  private static readonly RPC_TIMEOUT_MS = 30_000;

  private getServer(): rpc.Server {
    return new rpc.Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith('http://'),
      timeout: ContractService.RPC_TIMEOUT_MS,
    });
  }

  private describeRpcError(error: unknown): string {
    const err = error as { code?: string; message?: string; response?: { status?: number } };
    const status = err.response?.status;
    const message = err.message ?? String(error);

    if (err.code === 'ECONNABORTED' || /timeout/i.test(message)) {
      return `RPC request to ${this.rpcUrl} timed out`;
    }
    if (status === 429) {
      return `RPC provider ${this.rpcUrl} rate-limited the request (429)`;
    }
    if (status && status >= 500) {
      return `RPC provider ${this.rpcUrl} returned a server error (${status})`;
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return `RPC host ${this.rpcUrl} could not be resolved (DNS failure)`;
    }
    return message;
  }

  private async getSimulationSource(server: rpc.Server, fallbackPublicKey?: string) {
    const pk = this.adminSecret ? Keypair.fromSecret(this.adminSecret).publicKey() : fallbackPublicKey;
    if (!pk) {
      throw new Error('No source public key available for simulation');
    }
    return server.getAccount(pk);
  }

  private async simulateRead(fnName: string, args: xdr.ScVal[], sourceFallback?: string): Promise<xdr.ScVal | null> {
    if (!this.canRead()) return null;
    const server = this.getServer();
    const account = await this.getSimulationSource(server, sourceFallback);
    const contract = new Contract(this.contractId as string);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(fnName, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      logger.warn({ fn: fnName, error: sim.error }, 'Contract simulation errored');
      return null;
    }

    if (!('result' in sim) || !sim.result || !sim.result.retval) {
      return null;
    }

    return sim.result.retval;
  }

  async getWalletInfo(wallet: string): Promise<OnChainWalletInfo | null> {
    try {
      const retval = await this.simulateRead(
        'get_wallet_info',
        [new Address(wallet).toScVal()],
        wallet
      );
      if (!retval) return null;

      const decoded = scValToNative(retval);
      if (decoded === null || decoded === undefined) return null;

      return normaliseWalletScoreStruct(decoded, wallet);
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message, wallet }, 'getWalletInfo failed');
      return null;
    }
  }

  async getBatchWalletScores(
    wallets: string[]
  ): Promise<Array<{ wallet: string; info: OnChainWalletInfo | null }>> {
    if (wallets.length === 0) return [];
    const results = await Promise.all(
      wallets.map(async (wallet) => ({
        wallet,
        info: await this.getWalletInfo(wallet),
      }))
    );
    return results;
  }

  // Single-RPC call to the contract's `get_all_wallets_with_scores` view function.
  // Returns the array of WalletScore structs the contract produced — note the contract
  // filters out wallets with no data, and the returned structs don't carry the wallet
  // address, so callers lose per-wallet mapping.
  async getAllWalletsWithScoresRaw(
    wallets: string[]
  ): Promise<Array<{ score: number; risk: 'Low' | 'Medium' | 'High'; lastUpdated: number }>> {
    if (wallets.length === 0) return [];
    try {
      const vecArg = xdr.ScVal.scvVec(wallets.map((w) => new Address(w).toScVal()));
      const retval = await this.simulateRead(
        'get_all_wallets_with_scores',
        [vecArg],
        wallets[0]
      );
      if (!retval) return [];

      const decoded = scValToNative(retval);
      if (!Array.isArray(decoded)) return [];

      const normalised: Array<{ score: number; risk: 'Low' | 'Medium' | 'High'; lastUpdated: number }> = [];
      for (const entry of decoded) {
        const info = normaliseWalletScoreStruct(entry, '');
        if (info) {
          normalised.push({ score: info.score, risk: info.risk, lastUpdated: info.lastUpdated });
        }
      }
      return normalised;
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message, count: wallets.length }, 'getAllWalletsWithScoresRaw failed');
      return [];
    }
  }

  async getLastUpdated(wallet: string): Promise<number | null> {
    try {
      const retval = await this.simulateRead(
        'get_last_updated',
        [new Address(wallet).toScVal()],
        wallet
      );
      if (!retval) return null;
      const decoded = scValToNative(retval);
      if (decoded === null || decoded === undefined) return null;
      return typeof decoded === 'bigint' ? Number(decoded) : (decoded as number);
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message, wallet }, 'getLastUpdated failed');
      return null;
    }
  }

  /**
   * Fix 1: Read the full verifiable record (score + risk + timestamp + input hash).
   * The returned score_input_hash can be compared against a locally-computed
   * SHA-256(wallet:txCount:inflowVolume:outflowVolume:xlmPrice) to verify
   * that the stored score has not been tampered with.
   */
  async getVerifiableInfo(wallet: string): Promise<{
    score: number;
    risk: 'Low' | 'Medium' | 'High';
    lastUpdated: number;
    scoreInputHash: string; // 64-char hex
  } | null> {
    try {
      const retval = await this.simulateRead(
        'get_verifiable_info',
        [new Address(wallet).toScVal()],
        wallet
      );
      if (!retval) return null;
      const decoded = scValToNative(retval) as Record<string, unknown> | null;
      if (!decoded || typeof decoded !== 'object') return null;

      const score = typeof decoded.score === 'bigint' ? Number(decoded.score) : (decoded.score as number);
      const risk = decodeRiskLevel(decoded.risk);
      const lastUpdatedRaw = decoded.last_updated ?? decoded.lastUpdated;
      const lastUpdated = typeof lastUpdatedRaw === 'bigint' ? Number(lastUpdatedRaw) : (lastUpdatedRaw as number);
      const hashRaw = decoded.score_input_hash;
      // BytesN<32> decodes as a Uint8Array or Buffer; convert to hex.
      const hashHex = hashRaw instanceof Uint8Array
        ? Buffer.from(hashRaw).toString('hex')
        : typeof hashRaw === 'string' ? hashRaw : null;

      if (typeof score !== 'number' || !risk || typeof lastUpdated !== 'number' || !hashHex) return null;
      return { score, risk, lastUpdated, scoreInputHash: hashHex };
    } catch (error) {
      const err = error as Error;
      logger.error({ error: err.message, wallet }, 'getVerifiableInfo failed');
      return null;
    }
  }

  async syncScore(
    wallet: string,
    score: number,
    risk: 'Low' | 'Medium' | 'High',
    scoringInputs?: {
      txCount: number;
      inflowVolume: number;
      outflowVolume: number;
      xlmPriceUsd: number;
    }
  ): Promise<ContractSyncResult> {
    if (!this.isConfigured()) {
      logger.info(
        { wallet, score, risk, network: this.network },
        'Contract sync skipped (contractId or ORACLE_SECRET_KEY not configured)'
      );
      return { success: false, error: 'Contract not configured' };
    }

    // Fix 1: compute a SHA-256 hash of the canonical scoring inputs.
    // Format: "wallet:txCount:inflowVolume:outflowVolume:xlmPriceUsd"
    // Stored on-chain so anyone can independently verify the score.
    const inputStr = scoringInputs
      ? `${wallet}:${scoringInputs.txCount}:${scoringInputs.inflowVolume.toFixed(6)}:${scoringInputs.outflowVolume.toFixed(6)}:${scoringInputs.xlmPriceUsd.toFixed(6)}`
      : `${wallet}:${score}:${risk}`;

    const hashBuffer = createHash('sha256').update(inputStr).digest();
    const hashScVal = xdr.ScVal.scvBytes(hashBuffer);

    try {
      const server = this.getServer();
      const admin = Keypair.fromSecret(this.adminSecret as string);
      const contract = new Contract(this.contractId as string);

      const account = await server.getAccount(admin.publicKey());

      const args: xdr.ScVal[] = [
        new Address(admin.publicKey()).toScVal(),
        new Address(wallet).toScVal(),
        nativeToScVal(score, { type: 'u32' }),
        riskToScVal(risk),
        // Fix 1: pass the SHA-256 input hash as BytesN<32> to set_score.
        hashScVal,
      ];

      const baseTx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call('set_score', ...args))
        .setTimeout(60)
        .build();

      const prepared = await server.prepareTransaction(baseTx);
      prepared.sign(admin);

      const sendResult = await server.sendTransaction(prepared);

      if (sendResult.status === 'ERROR') {
        const errMsg = JSON.stringify(sendResult.errorResult ?? sendResult);
        logger.error({ wallet, errMsg }, 'Contract sync send failed');
        return { success: false, error: `Send failed: ${errMsg}` };
      }

      let status = sendResult.status as string;
      let attempts = 0;
      let getResult: Awaited<ReturnType<typeof server.getTransaction>> | null = null;
      while (status === 'PENDING' && attempts < 20) {
        await new Promise((r) => setTimeout(r, 1500));
        getResult = await server.getTransaction(sendResult.hash);
        status = getResult.status;
        attempts += 1;
      }

      if (status === 'SUCCESS') {
        logger.info({ wallet, score, risk, txHash: sendResult.hash }, 'Contract score synced');
        return { success: true, txHash: sendResult.hash };
      }

      logger.warn({ wallet, status, txHash: sendResult.hash }, 'Contract sync did not confirm');
      return { success: false, txHash: sendResult.hash, error: `Final status: ${status}` };
    } catch (error) {
      const message = this.describeRpcError(error);
      logger.error({ error: message, wallet }, 'Contract sync threw');
      return { success: false, error: message };
    }
  }
}

export function createContractService(network: NetworkType = 'testnet'): ContractService {
  return new ContractService(network);
}
