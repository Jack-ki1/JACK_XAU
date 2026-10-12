// Phase 3: thin forwarder — logic lives in apps/api (services/news).
import { forwardJson } from '@/lib/apiProxy';

export async function GET() {
  const { status, body } = await forwardJson('/v1/news/process', { method: 'POST' });
  if (body === null) return Response.json({ error: 'API unreachable — start it with `npm run dev:api`.' }, { status: 503 });
  return Response.json(body, { status });
}
