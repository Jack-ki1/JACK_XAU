// Phase 3: thin forwarder — logic lives in apps/api (services/analysis).
import { forwardJson } from '@/lib/apiProxy';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { signal_id?: string };
  if (!body.signal_id) return Response.json({ error: 'signal_id required in request body.' });
  const { status, body: out } = await forwardJson(`/v1/signals/${encodeURIComponent(body.signal_id)}/analyse`, { method: 'POST' });
  if (out === null) {
    return Response.json({ signal_id: body.signal_id, outcome: 'not_found_yet', note: 'API unreachable — cron safety net will pick this up.' });
  }
  return Response.json(out, { status });
}
