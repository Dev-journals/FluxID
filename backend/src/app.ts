import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appConfig } from './config/app.config.js';
import { healthRoute } from './routes/health.routes.js';
import { registerWalletRoutes } from './routes/wallet.routes.js';
import { registerPaymentRoutes } from './routes/contract.routes.js';
import { registerPaidRoutes } from './routes/paid.routes.js';
import { registerMcpRoutes } from './routes/mcp.routes.js';
import { registerOnChainRoutes } from './routes/onchain.routes.js';
import { registerProtocolRoutes } from './routes/protocol.routes.js';
import { registerMetricsRoutes } from './routes/metrics.routes.js';
import { logger } from './utils/logger.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: false,
  });

  await fastify.register(cors, {
    origin: true,
  });

  fastify.get('/', async () => ({
    name: 'FluxID Backend',
    description: 'Liquidity Identity scoring service — turn any Stellar wallet into a trust score.',
    status: 'ok',
    network: appConfig.stellarNetwork,
    endpoints: {
      health: 'GET /health',
      walletScore: 'GET /wallet/:accountId?network=&refresh=&sync=',
      walletSync: 'POST /wallet/:accountId/sync',
      walletHistory: 'GET /wallet/:accountId/history?limit=&since=',
      onChainWalletScore: 'GET /onchain/wallet/:wallet',
      onChainBatch: 'POST /onchain/batch  body: { wallets: string[], mode?: "per-wallet" | "contract" }',
      paidWalletScore: 'GET /paid/wallet/:accountId?requestId=',
      mcpTools: 'GET /mcp/tools',
      mcpInvoke: 'POST /mcp/tools/call  body: { name, arguments }',
      protocolHealth: 'GET /protocol/health?network=&windowHours=',
      protocolCohorts: 'GET /protocol/cohorts?network=',
      protocolSegments:
        'GET /protocol/segments?network=&minScore=&maxScore=&risk=Low|Medium|High&activity=low|medium|high&consistent=true|false&limit=',
      protocolRiskHeatmap: 'GET /protocol/risk-heatmap?network=',
      protocolAlerts: 'GET /protocol/alerts?network=&lookbackHours=',
      protocolWalletsAdd: 'POST /protocol/wallets  body: { wallets: string[], network?: "mainnet" | "testnet" }',
      protocolWalletsReset: 'DELETE /protocol/wallets?network=',
      logEvent: 'POST /events  body: { type, wallet?, network? }',
      submitFeedback: 'POST /feedback  body: { rating: 1-5, message, wallet? }',
      adminStats: 'GET /admin/stats',
      adminFeedback: 'GET /admin/feedback',
    },
    docs: 'See README.md and docs/ in the repo for full usage.',
  }));

  fastify.get('/health', healthRoute);
  await registerWalletRoutes(fastify);
  await registerPaymentRoutes(fastify);
  await registerPaidRoutes(fastify);
  await registerMcpRoutes(fastify);
  await registerOnChainRoutes(fastify);
  await registerProtocolRoutes(fastify);
  await registerMetricsRoutes(fastify);

  fastify.setErrorHandler((error, _request, reply) => {
    logger.error({ error }, 'Unhandled error');

    const statusCode = error.statusCode || 500;
    reply.code(statusCode).send({
      success: false,
      error: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  return fastify;
}

export async function startServer() {
  const fastify = await buildServer();

  try {
    await fastify.listen({ port: appConfig.port, host: '0.0.0.0' });
    // Render (and most reverse proxies) idle-timeout around 60s. Node's default
    // keepAliveTimeout is 5s, so the proxy reuses a socket Node already closed
    // and the client sees ERR_CONNECTION_CLOSED — especially on the first
    // request after a free-tier wake. Keep the HTTP server above the proxy.
    const httpServer = fastify.server;
    httpServer.keepAliveTimeout = 65_000;
    httpServer.headersTimeout = 66_000;
    logger.info(`FluxID Backend running on http://0.0.0.0:${appConfig.port}`);
    logger.info(`Network: ${appConfig.stellarNetwork}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  return fastify;
}

startServer().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
