import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isValidStellarPublicKey } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import {
  getFeedback,
  getUsageStats,
  recordEvent,
  recordFeedback,
  type EventType,
} from '../services/metrics.service.js';

const VALID_EVENTS: EventType[] = ['wallet_connect', 'score_run', 'contract_call', 'agent_query'];

interface EventBody {
  type?: string;
  wallet?: string;
  network?: string;
}

interface FeedbackBody {
  wallet?: string;
  rating?: number;
  message?: string;
}

// Optional read-side gate. When ADMIN_API_TOKEN is set, /admin/* endpoints
// require a matching x-admin-token header; otherwise they stay open (dev).
function adminGuard(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) return true;
  const provided = request.headers['x-admin-token'];
  if (provided === token) return true;
  reply.code(401).send({ success: false, error: 'Unauthorized' });
  return false;
}

function sanitizeWallet(wallet: unknown): string | null {
  if (typeof wallet !== 'string') return null;
  return isValidStellarPublicKey(wallet) ? wallet : null;
}

export async function registerMetricsRoutes(fastify: FastifyInstance) {
  // Log a usage event (wallet connect, score run, etc.). Best-effort — never
  // blocks the caller's UX, so validation failures just drop the event.
  fastify.post('/events', async (request: FastifyRequest<{ Body: EventBody }>, reply: FastifyReply) => {
    const { type, wallet, network } = request.body || {};
    if (!type || !VALID_EVENTS.includes(type as EventType)) {
      return reply.code(400).send({ success: false, error: 'Invalid event type' });
    }
    await recordEvent({
      type: type as EventType,
      wallet: sanitizeWallet(wallet),
      network: typeof network === 'string' ? network.slice(0, 16) : null,
      timestamp: Date.now(),
    });
    return reply.send({ success: true });
  });

  // Collect a piece of user feedback (rating + free text).
  fastify.post('/feedback', async (request: FastifyRequest<{ Body: FeedbackBody }>, reply: FastifyReply) => {
    const { wallet, rating, message } = request.body || {};
    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return reply.code(400).send({ success: false, error: 'Rating must be 1-5' });
    }
    const text = typeof message === 'string' ? message.trim().slice(0, 2000) : '';
    if (!text) {
      return reply.code(400).send({ success: false, error: 'Message is required' });
    }
    await recordFeedback({
      wallet: sanitizeWallet(wallet),
      rating: Math.round(numericRating),
      message: text,
      timestamp: Date.now(),
    });
    logger.info({ rating: Math.round(numericRating) }, 'Feedback received');
    return reply.send({ success: true });
  });

  // Admin: aggregate usage stats (unique wallets, connects, score runs).
  fastify.get('/admin/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminGuard(request, reply)) return;
    const { limit, search } = (request.query || {}) as { limit?: string; search?: string };
    const stats = await getUsageStats({
      limit: limit ? Number(limit) : undefined,
      search: search || undefined,
    });
    return reply.send({ success: true, stats });
  });

  // Admin: all collected feedback + summary.
  fastify.get('/admin/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminGuard(request, reply)) return;
    const feedback = await getFeedback();
    return reply.send({ success: true, feedback });
  });
}
