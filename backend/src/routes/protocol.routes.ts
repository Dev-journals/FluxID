import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appConfig } from '../config/app.config.js';
import { validateNetwork } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import {
  addWalletsToProtocol,
  getAlerts,
  getCohorts,
  getHealthMetrics,
  getRiskHeatmap,
  getSegments,
  resetProtocolHistory,
  type SegmentActivity,
  type SegmentQuery,
} from '../services/protocol.service.js';

const DEFAULT_NETWORK = appConfig.stellarNetwork;

interface ProtocolQuery {
  network?: string;
  windowHours?: string;
  lookbackHours?: string;
}

interface SegmentsQuery extends ProtocolQuery {
  minScore?: string;
  maxScore?: string;
  risk?: string;
  activity?: string;
  consistent?: string;
  limit?: string;
}

function parseScoreBound(input: string | undefined): number | undefined {
  if (input === undefined) return undefined;
  const n = parseInt(input, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

function parseRisk(input: string | undefined): SegmentQuery['risk'] | undefined {
  if (input === 'Low' || input === 'Medium' || input === 'High') return input;
  return undefined;
}

function parseActivity(input: string | undefined): SegmentActivity | undefined {
  if (input === 'low' || input === 'medium' || input === 'high') return input;
  return undefined;
}

function parseBool(input: string | undefined): boolean | undefined {
  if (input === 'true') return true;
  if (input === 'false') return false;
  return undefined;
}

function parsePositiveInt(input: string | undefined, fallback: number, max = 24 * 365): number {
  if (!input) return fallback;
  const n = parseInt(input, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export async function registerProtocolRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/protocol/health',
    async (request: FastifyRequest<{ Querystring: ProtocolQuery }>, reply: FastifyReply) => {
      try {
        const network = validateNetwork(request.query.network ?? DEFAULT_NETWORK);
        const windowHours = parsePositiveInt(request.query.windowHours, 24 * 30);
        const data = await getHealthMetrics(network, windowHours);
        return reply.send({ success: true, data });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol health route failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.get(
    '/protocol/cohorts',
    async (request: FastifyRequest<{ Querystring: ProtocolQuery }>, reply: FastifyReply) => {
      try {
        const network = validateNetwork(request.query.network ?? DEFAULT_NETWORK);
        const data = await getCohorts(network);
        return reply.send({ success: true, data });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol cohorts route failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.get(
    '/protocol/risk-heatmap',
    async (request: FastifyRequest<{ Querystring: ProtocolQuery }>, reply: FastifyReply) => {
      try {
        const network = validateNetwork(request.query.network ?? DEFAULT_NETWORK);
        const data = await getRiskHeatmap(network);
        return reply.send({ success: true, data });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol risk-heatmap route failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.get(
    '/protocol/segments',
    async (request: FastifyRequest<{ Querystring: SegmentsQuery }>, reply: FastifyReply) => {
      try {
        const network = validateNetwork(request.query.network ?? DEFAULT_NETWORK);
        const criteria: SegmentQuery = {
          minScore: parseScoreBound(request.query.minScore),
          maxScore: parseScoreBound(request.query.maxScore),
          risk: parseRisk(request.query.risk),
          activity: parseActivity(request.query.activity),
          consistent: parseBool(request.query.consistent),
          limit: parsePositiveInt(request.query.limit, 100, 500),
        };
        const data = await getSegments(network, criteria);
        return reply.send({ success: true, data });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol segments route failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.post<{ Body: { wallets?: string[]; network?: string; refresh?: boolean } }>(
    '/protocol/wallets',
    async (request, reply) => {
      try {
        const body = request.body || {};
        if (!Array.isArray(body.wallets)) {
          return reply
            .code(400)
            .send({ success: false, error: 'Body must include a `wallets` string array.' });
        }
        const network = validateNetwork(body.network ?? DEFAULT_NETWORK);
        const refresh = body.refresh !== false;
        const data = await addWalletsToProtocol(body.wallets, network, { refresh });
        return reply.send({ success: true, data });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol wallets upload failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.delete<{ Querystring: ProtocolQuery }>(
    '/protocol/wallets',
    async (request, reply) => {
      try {
        const network = request.query.network
          ? validateNetwork(request.query.network)
          : undefined;
        const removed = await resetProtocolHistory(network);
        return reply.send({ success: true, data: { removed, network: network ?? 'all' } });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol wallets reset failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );

  fastify.get(
    '/protocol/alerts',
    async (request: FastifyRequest<{ Querystring: ProtocolQuery }>, reply: FastifyReply) => {
      try {
        const network = validateNetwork(request.query.network ?? DEFAULT_NETWORK);
        const lookbackHours = parsePositiveInt(request.query.lookbackHours, 24);
        const data = await getAlerts(network, lookbackHours);
        return reply.send({ success: true, data });
      } catch (error) {
        const err = error as Error;
        logger.error({ error: err }, 'Protocol alerts route failed');
        return reply.code(400).send({ success: false, error: err.message });
      }
    }
  );
}
