// Phase 3: thin forwarder — state lives in apps/api (services/catalog).
// Shapes are bridged to the legacy contract ({enabled}).
import { forwardJson } from '@/lib/apiProxy';

export async function GET() {
  const { body } = await forwardJson('/v1/settings');
  if (body === null) return Response.json({ enabled: true });
  const s = body as { analysed_signals_enabled?: boolean };
  return Response.json({ enabled: s.analysed_signals_enabled !== false });
}

export async function POST(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof raw.enabled !== 'boolean') {
    return Response.json({ error: 'Request body must include a boolean "enabled" field.' }, { status: 400 });
  }
  const { status, body } = await forwardJson('/v1/settings', {
    method: 'PATCH',
    body: JSON.stringify({ analysed_signals_enabled: raw.enabled }),
  });
  if (body === null) return Response.json({ error: 'API unreachable — start it with `npm run dev:api`.' }, { status: 503 });
  const s = body as { analysed_signals_enabled?: boolean; error?: string };
  if (s.error) return Response.json(body, { status });
  return Response.json({ enabled: s.analysed_signals_enabled });
}
