import type { ScoreResult } from '../types/scoring.types.js';
import type { NetworkType } from '../config/stellar.config.js';
import { appConfig } from '../config/app.config.js';
import { logger } from '../utils/logger.js';

export interface CacheEntry {
  data: ScoreResult;
  timestamp: number;
}

class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private ttlMs: number;

  constructor(ttlSeconds: number = appConfig.cacheTtlSeconds) {
    this.ttlMs = ttlSeconds * 1000;
  }

  private getKey(accountId: string, network: NetworkType): string {
    return `score:${network}:${accountId}`;
  }

  getEntry(accountId: string, network: NetworkType): CacheEntry | null {
    const key = this.getKey(accountId, network);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      logger.debug({ key }, 'Cache entry expired');
      return null;
    }

    logger.debug({ key }, 'Cache hit');
    return entry;
  }

  get(accountId: string, network: NetworkType): ScoreResult | null {
    return this.getEntry(accountId, network)?.data ?? null;
  }

  set(accountId: string, network: NetworkType, data: ScoreResult): void {
    const key = this.getKey(accountId, network);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    logger.debug({ key }, 'Cache set');
  }

  invalidate(accountId: string, network: NetworkType): void {
    const key = this.getKey(accountId, network);
    this.cache.delete(key);
    logger.debug({ key }, 'Cache invalidated');
  }

  clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  size(): number {
    return this.cache.size;
  }
}

export const cacheService = new CacheService();
