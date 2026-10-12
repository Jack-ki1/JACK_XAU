// Shared preHandler: everything except /v1/health needs a machine secret.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { denyIfDenied, requireMachine } from '../../plugins/guard.js';

export function guardAll(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.routeOptions.url === '/v1/health' || req.url === '/v1/health') return;
    const denied = denyIfDenied(await requireMachine(req));
    if (denied) {
      void reply.code(denied.status).send(denied.body);
    }
  });
}
