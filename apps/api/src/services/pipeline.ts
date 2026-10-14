// api/services/pipeline — hardened signal ingest (v2 C2).
// Zod-validated body, idempotent on signal_id, explicit state machine,
// immutable event log. Illegal payloads are rejected + logged (never
// silently coerced). Out-of-order re-delivery is acknowledged without
// mutation. TradingView webhooks cannot set headers → the route accepts
// the secret in the body (`secret` field) or query, constant-time compared.
import { ingestSignalSchema, type IngestSignalT } from '@jack-trade/shared';
import { applyTransition, projectToRow, type SignalState } from '@jack-trade/engine';
import { getDb } from '../repositories/client.js';
import { appendSignalEvent, getSignalBySignalId, insertSignal, logIngestRejection } from '../repositories/repos.js';
import { publish } from '../plugins/sse.js';

export type IngestOutcome =
  | { ok: true; outcome: 'ingested' | 'already_exists'; signal_id: string; id: number | null }
  | { ok: false; outcome: 'rejected'; reason: string; issues?: unknown }

function normaliseDirection(d: IngestSignalT['direction']): 'buy' | 'sell' {
  return d === 'buy' || d === 'long' ? 'buy' : 'sell'
}

export async function ingest(body: unknown, source = 'http'): Promise<IngestOutcome> {
  const parsed = ingestSignalSchema.safeParse(body);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') || 'schema_invalid';
    await logIngestRejection(reason, body);
    await appendSignalEvent(String((body as { signal_id?: string })?.signal_id ?? 'unknown'), 'rejected', { reason });
    return { ok: false, outcome: 'rejected', reason, issues: parsed.error.issues };
  }
  const b = parsed.data;
  const db = getDb();
  if (!db) return { ok: false, outcome: 'rejected', reason: 'Database not configured.' };

  // Idempotency: re-delivery never duplicates; recorded as an event so the
  // log shows the redelivery happened.
  const existing = await getSignalBySignalId(b.signal_id);
  if (existing) {
    await appendSignalEvent(b.signal_id, 'redelivered', { source, note: 'already_exists' });
    return { ok: true, outcome: 'already_exists', signal_id: b.signal_id, id: existing.id };
  }

  const row: Record<string, unknown> = {
    signal_id: b.signal_id,
    symbol: b.symbol,
    direction: normaliseDirection(b.direction),
    signal_type: b.signal_type ?? null,
    path: b.path ?? null,
    entry: b.entry ?? null,
    exits: b.exits ?? {},
    risk: b.risk ?? {},
    grade: b.grade ?? {},
    htf_confluence: b.htf_confluence ?? [],
    htf_rung: b.htf_rung ?? null,
    execution_tf: b.execution_tf ?? null,
    manual_entry_filter: b.manual_entry_filter ?? null,
    window_info: b.window_info ?? null,
    signal_version: b.signal_version ?? null,
    strategy_version: b.strategy_version ?? null,
    param_hash: b.param_hash ?? null,
    entry_spread: b.entry_spread ?? null,
    status: 'open',
    state: 'open',
    ladder: 'none',
  }
  if (b.created_at) row.created_at = b.created_at

  const created = await insertSignal(row);
  if (!created) return { ok: false, outcome: 'rejected', reason: 'Insert failed.' };

  // State machine: created → open is the only legal first step; we model
  // webhook receipt as both (row exists = open) and log the pair.
  const t1 = applyTransition('created', 'open');
  if (!t1.ok) return { ok: false, outcome: 'rejected', reason: t1.reason };
  await appendSignalEvent(b.signal_id, 'created', { source, strategy_version: b.strategy_version ?? null });
  await appendSignalEvent(b.signal_id, 'opened', { entry: b.entry ?? null, direction: row.direction });

  publish({ kind: 'signal_ingested', signal_id: b.signal_id });
  return { ok: true, outcome: 'ingested', signal_id: b.signal_id, id: created.id };
}

/** Record a legal terminal/ladder transition against the event log + row projection. */
export async function transitionSignal(
  signalId: string,
  currentState: SignalState,
  nextState: SignalState,
  payload: Record<string, unknown> = {},
): Promise<{ ok: boolean; reason?: string }> {
  const t = applyTransition(currentState, nextState);
  if (!t.ok) {
    await appendSignalEvent(signalId, 'rejected', { attempt: `${currentState}→${nextState}`, reason: t.reason });
    return { ok: false, reason: t.reason };
  }
  const projection = projectToRow(nextState);
  await appendSignalEvent(signalId, nextState, payload);
  publish({ kind: 'signal_transition', signal_id: signalId, from: currentState, to: nextState });
  return { ok: true };
}
