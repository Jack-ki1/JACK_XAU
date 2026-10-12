// Phase 3: sync-compatibility bridge. The API runs backtests async
// (POST /v1/backtests → 202 + poll); this handler preserves the old
// synchronous {results, meta} contract for the current backtest page.
// Phase 6 makes the UI async-native and this bridge goes away.
import { forwardJson } from '@/lib/apiProxy';

const POLL_MS = 2000;
const POLL_TRIES = 100;

export async function POST(req: Request) {
  const raw = (await req.json().catch(() => null)) as unknown;
  const started = await forwardJson('/v1/backtests', { method: 'POST', body: JSON.stringify(raw) });
  if (started.body === null) {
    return Response.json({ error: 'API unreachable — start it with `npm run dev:api`.' });
  }
  const run = started.body as { id?: string; error?: unknown };
  if (!run.id) return Response.json(started.body, { status: started.status });
  for (let i = 0; i < POLL_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const polled = await forwardJson(`/v1/backtests/${encodeURIComponent(run.id)}`);
    const state = polled.body as { status?: string; results?: unknown; meta?: unknown; error?: string } | null;
    if (state === null) return Response.json({ error: 'API unreachable while polling the backtest run.' });
    if (state.status === 'done') return Response.json({ results: state.results, meta: state.meta });
    if (state.status === 'error') return Response.json({ error: state.error ?? 'Backtest run failed.' });
  }
  return Response.json({ error: 'Backtest is still running — check run history (Phase 6 makes this async-native).' });
}
