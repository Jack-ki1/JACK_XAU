// Phase 3: thin forwarder — logic lives in apps/api (services/catalog).
import { forwardJson } from '@/lib/apiProxy';

export async function GET() {
  const { status, body } = await forwardJson('/v1/analysis/closed');
  if (body === null) return Response.json({ error: 'API unreachable — start it with `npm run dev:api`.' });
  return Response.json(body, { status });
}
