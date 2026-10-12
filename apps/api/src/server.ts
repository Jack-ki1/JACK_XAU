// jack-trade-api — Fastify service. Owns every secret, job and DB call.
// Boots with no env vars (features disable with reasons, never crash).
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getEnv } from './config/env.js';
import { apiError } from './lib/errors.js';
import { guardAll } from './routes/v1/guarded.js';
import { healthRoutes } from './routes/v1/health.js';
import { signalRoutes } from './routes/v1/signals.js';
import { opsRoutes } from './routes/v1/ops.js';
import { reportRoutes } from './routes/v1/reports.js';
import { deskRoutes } from './routes/v1/desk.js';
import { startScheduler } from './jobs/scheduler.js';

const env = getEnv();
const app = Fastify({ logger: true });

await app.register(cors, { origin: env.CORS_ORIGIN ?? true });
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

app.setErrorHandler((err: Error & { statusCode?: unknown; code?: unknown }, _req, reply) => {
  const status = typeof (err as { statusCode?: unknown }).statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : 500;
  void reply.code(status).send(apiError((err as { code?: string }).code ?? 'internal', err.message));
});

await app.register(healthRoutes);
guardAll(app);
await app.register(signalRoutes);
await app.register(opsRoutes);
await app.register(reportRoutes);
await app.register(deskRoutes);

app.get('/', async () => ({ service: 'jack-trade-api', health: '/v1/health' }));

startScheduler(app.log);

const port = env.PORT;
const host = env.HOST;
try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
