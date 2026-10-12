// lib/routeGuard.ts (Phase 1) — interim API protection.
// Phase 3 replaces this with the API_TOKEN proxy + machine secrets (§4.2).
// Until then: cron/machine routes require CRON_SECRET (query or header);
// browser-called routes get per-IP rate limits (see lib/rateLimit.ts).

import { getEnv } from './env';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** True when the caller presents the shared machine secret. */
export function hasMachineSecret(req: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret') ?? '';
    const h = req.headers.get('authorization') ?? '';
    const bearer = h.toLowerCase().startsWith('bearer ') ? h.slice(7) : h;
    return timingSafeEqual(q, secret) || timingSafeEqual(bearer, secret);
  } catch {
    return false;
  }
}

export function unauthorized() {
  return Response.json({ error: { code: 'unauthorized', message: 'Missing or invalid secret.' } }, { status: 401 });
}

/** Standard error envelope (§7): { error: { code, message, details? } }. */
export function apiError(code: string, message: string, status = 400, details?: unknown) {
  return Response.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status });
}
