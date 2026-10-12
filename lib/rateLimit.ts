// lib/rateLimit.ts (Phase 1) — tiny in-memory per-IP rate limiter for the
// browser-called write/spend routes until Phase 3's API rate limiting lands.
// Note: in serverless/restarted processes the counters reset — acceptable
// for a personal app; the limit is abuse-friction, not a security boundary.

const buckets = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Sliding-window check. Returns null when allowed, or seconds until retry. */
export function checkRateLimit(req: Request, key: string, max: number, windowSec: number): number | null {
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const hits = (buckets.get(bucketKey) ?? []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= max) {
    const retryAfter = Math.ceil((hits[0] + windowSec * 1000 - now) / 1000);
    return Math.max(retryAfter, 1);
  }
  hits.push(now);
  buckets.set(bucketKey, hits);
  return null;
}

export function rateLimited(retryAfterSec: number) {
  return Response.json(
    { error: { code: 'rate_limited', message: `Too many requests — retry in ${retryAfterSec}s.` } },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}
