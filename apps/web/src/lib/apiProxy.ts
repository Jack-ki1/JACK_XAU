// web/lib/apiProxy — server-side forwarder to jack-trade-api (§4.2).
// The machine secret is injected HERE (server only) and never reaches the
// browser. All pages keep calling same-origin /api/* paths; those handlers
// forward to the API. When the API is down/unconfigured, each handler
// returns its documented degraded payload instead of a 500.

import { getEnv } from './env';

export function apiBase(): string {
  const raw = getEnv().API_BASE_URL ?? 'http://127.0.0.1:3101';
  return raw.replace(/\/$/, '');
}

function machineSecret(): string {
  const e = getEnv();
  return e.API_TOKEN ?? e.CRON_SECRET ?? '';
}

/** Forward to the API. Returns null when the API is unreachable. */
export async function forwardApi(path: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${machineSecret()}`,
      },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardJson(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await forwardApi(path, init);
  if (!res) return { status: 503, body: null };
  let body: unknown = null;
  try {
    body = (await res.json()) as unknown;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}
