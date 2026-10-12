// web/app/api/v1/[...path] — same-origin proxy to jack-trade-api.
// Browser fetches /api/v1/... (no secrets); this handler injects the
// machine secret server-side and streams the API response back.
// Degraded (503 + reason) when the API is unreachable — never a 500.
import { forwardApi } from '@/lib/apiProxy';

async function proxy(req: Request, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/v1/${path.map(encodeURIComponent).join('/')}${url.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  const upstream = await forwardApi(target, { method: req.method, body });
  if (!upstream) {
    return Response.json(
      { error: { code: 'api_unreachable', message: 'API service is not reachable (API_BASE_URL). Start it with `npm run dev:api`.' } },
      { status: 503 },
    );
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params);
}
