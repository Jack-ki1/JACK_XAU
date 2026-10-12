// api/plugins/guard — protection without user accounts (§4.2).
// Two credential families, both via Authorization header (query ?secret=
// accepted for legacy cron-job.org callers):
//   1. API_TOKEN — injected server-side by the web proxy, never in browser.
//   2. CRON_SECRET — per-machine secret for cron / webhook deliverers.
import type { FastifyRequest } from 'fastify';
import { getEnv } from '../config/env.js';
import { apiError } from '../lib/errors.js';
import { timingSafeEqual } from '../lib/errors.js';

export function presentedSecrets(req: FastifyRequest): string[] {
  const out: string[] = [];
  const h = req.headers.authorization ?? '';
  if (h) out.push(h.toLowerCase().startsWith('bearer ') ? h.slice(7) : h);
  const q = (req.query as Record<string, unknown> | undefined)?.secret;
  if (typeof q === 'string' && q) out.push(q);
  return out;
}

function matchesAny(presented: string[], secrets: (string | undefined)[]): boolean {
  return presented.some((p) => secrets.some((s) => s != null && timingSafeEqual(p, s)));
}

/** Guard for machine/cron/job endpoints (API_TOKEN or CRON_SECRET). */
export async function requireMachine(req: FastifyRequest) {
  const e = getEnv();
  if (!e.API_TOKEN && !e.CRON_SECRET) {
    return { denied: true as const, response: { status: 503, body: apiError('auth_disabled', 'API_TOKEN/CRON_SECRET not set — machine endpoints disabled.') } };
  }
  if (!matchesAny(presentedSecrets(req), [e.API_TOKEN, e.CRON_SECRET])) {
    return { denied: true as const, response: { status: 401, body: apiError('unauthorized', 'Missing or invalid secret.') } };
  }
  return { denied: false as const };
}

export function denyIfDenied(check: Awaited<ReturnType<typeof requireMachine>>) {
  return check.denied ? check.response : null;
}
