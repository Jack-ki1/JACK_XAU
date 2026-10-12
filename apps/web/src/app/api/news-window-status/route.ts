// Phase 3: thin forwarder — logic lives in apps/api (services/transitions).
// Degraded shape matches the old contract so Topbar/Sidebar keep rendering
// (unreachable API, denied secret, or error body all map to inactive).
import { forwardJson } from '@/lib/apiProxy';

const DEGRADED = { active: false, event: null };

export async function GET() {
  const { status, body } = await forwardJson('/v1/news/window');
  if (body === null || status !== 200) return Response.json(DEGRADED);
  const b = body as { active?: boolean; error?: unknown };
  if (b.error || typeof b.active !== 'boolean') return Response.json(DEGRADED);
  return Response.json(body, { status });
}
