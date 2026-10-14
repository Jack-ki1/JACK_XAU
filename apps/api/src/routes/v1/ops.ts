import type { FastifyInstance } from 'fastify';
import { journalEntrySchema } from '@jack-trade/shared';
import { checkAnalysedSignals, checkNewsSignals, checkOpenSignals } from '../../services/resolution.js';
import { newsWindowStatus, signalTransitions } from '../../services/transitions.js';
import { processNewsSignals } from '../../services/news.js';
import { refreshCalendar } from '../../providers/calendar.js';
import { currentLevels } from '../../services/levels.js';
import { jobNames, jobStatus, runJob } from '../../jobs/scheduler.js';
import { getCalendar, getSettings, patchSettings } from '../../services/catalog.js';
import { creditSummary } from '../../lib/credits.js';
import { backfillStandardLadder, storeFreshness } from '../../services/candles.js';
import {
  getJournal, getReadState, insertAlertRule, listAlertEvents, listAlertRules,
  listAiRuns, listJournal, setAlertRuleEnabled, setReadState, upsertJournal, deleteAlertRule,
} from '../../repositories/repos.js';
import { evaluateAlerts } from '../../services/alerts.js';
import { apiError } from '../../lib/errors.js';

const ALERT_KINDS = [
  'price_cross', 'level_break', 'news_tminus', 'signal_state', 'session',
  'rule_breach', 'feed_stale', 'job_failed',
] as const;

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  // Manual job triggers (same handlers the scheduler runs).
  app.post('/v1/jobs/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!jobNames().includes(name)) {
      void reply.code(404).send(apiError('not_found', `Unknown job. Known: ${jobNames().join(', ')}`));
      return;
    }
    try {
      return { job: name, result: await runJob(name, req.log) };
    } catch (e) {
      void reply.code(500).send(apiError('job_failed', e instanceof Error ? e.message : String(e)));
    }
  });
  app.get('/v1/jobs', async () => ({ jobs: jobNames(), status: Object.fromEntries(jobStatus) }));

  // Legacy route mapping (§4.5), now versioned.
  app.get('/v1/news/window', async () => newsWindowStatus());
  app.get('/v1/calendar', async () => getCalendar());
  app.post('/v1/calendar/refresh', async () => refreshCalendar());
  app.get('/v1/levels', async () => currentLevels());
  app.post('/v1/transitions/check', async () => signalTransitions());
  app.post('/v1/resolution/check-open', async () => checkOpenSignals());
  app.post('/v1/resolution/check-analysed', async () => checkAnalysedSignals());
  app.post('/v1/resolution/check-news', async () => checkNewsSignals());
  app.post('/v1/news/process', async () => processNewsSignals());

  app.get('/v1/settings', async () => getSettings());
  app.patch('/v1/settings', async (req) => patchSettings(req.body));

  // v2 ops: credit ledger + candle-store freshness + manual backfill.
  app.get('/v1/ops/credits', async () => ({ credits: await creditSummary() }));
  app.get('/v1/ops/candles', async () => ({ freshness: await storeFreshness() }));
  app.post('/v1/ops/candles/backfill', async (req) => {
    const days = Number((req.query as { days?: string })?.days ?? 7);
    return { results: await backfillStandardLadder(Number.isFinite(days) ? Math.min(Math.max(days, 1), 30) : 7) };
  });

  // v2 C9.2: AI audit trail (prompt_version/model/latency/tokens per run).
  app.get('/v1/ops/ai-runs', async (req) => {
    const q = req.query as { signal_id?: string; limit?: string };
    const raw = Number(q.limit ?? 100);
    const limit = Math.min(Math.max(Number.isFinite(raw) ? raw : 100, 1), 500);
    return { runs: await listAiRuns(q.signal_id, limit) };
  });

  // v2 C8: signal journal (notes/tags/checklist per signal).
  app.get('/v1/journal', async () => ({ journal: await listJournal() }));
  app.get('/v1/journal/:signalId', async (req, reply) => {
    const { signalId } = req.params as { signalId: string };
    const row = await getJournal(signalId);
    if (!row) {
      void reply.code(404).send(apiError('not_found', `No journal entry for ${signalId}.`));
      return;
    }
    return { entry: row };
  });
  app.put('/v1/journal/:signalId', async (req, reply) => {
    const { signalId } = req.params as { signalId: string };
    const parsed = journalEntrySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send(apiError('invalid_body', parsed.error.issues[0]?.message ?? 'Invalid journal entry.'));
      return;
    }
    await upsertJournal(signalId, parsed.data);
    return { signal_id: signalId, ...(await getJournal(signalId)) };
  });

  // v2 C10: server-side read state (unread badges survive a refresh).
  app.get('/v1/desk/read-state/:key', async (req) => {
    const { key } = req.params as { key: string };
    return { key, last_read_at: await getReadState(key) };
  });
  app.put('/v1/desk/read-state/:key', async (req) => {
    const { key } = req.params as { key: string };
    const at = (req.body as { at?: string } | undefined)?.at ?? new Date().toISOString();
    await setReadState(key, at);
    return { key, last_read_at: at };
  });

  // v2 C10: alert rules CRUD + deduped event log + manual evaluation.
  app.get('/v1/alerts/rules', async () => ({ rules: await listAlertRules() }));
  app.post('/v1/alerts/rules', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string; kind?: string; config?: Record<string, unknown> };
    if (!body.name || typeof body.name !== 'string' || body.name.length > 80) {
      void reply.code(400).send(apiError('invalid_body', 'name (string, <=80) required.'));
      return;
    }
    if (!ALERT_KINDS.includes(body.kind as (typeof ALERT_KINDS)[number])) {
      void reply.code(400).send(apiError('invalid_body', `kind must be one of: ${ALERT_KINDS.join(', ')}.`));
      return;
    }
    const rule = await insertAlertRule({ name: body.name, kind: body.kind!, config: body.config ?? {} });
    if (!rule) {
      void reply.code(503).send(apiError('db_unavailable', 'Database not configured.'));
      return;
    }
    void reply.code(201);
    return { rule };
  });
  app.patch('/v1/alerts/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      void reply.code(400).send(apiError('invalid_body', 'enabled (boolean) required.'));
      return;
    }
    const ok = await setAlertRuleEnabled(Number(id), body.enabled);
    if (!ok) {
      void reply.code(404).send(apiError('not_found', `No alert rule ${id}.`));
      return;
    }
    return { id: Number(id), enabled: body.enabled };
  });
  app.delete('/v1/alerts/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await deleteAlertRule(Number(id));
    if (!ok) {
      void reply.code(404).send(apiError('not_found', `No alert rule ${id}.`));
      return;
    }
    return { deleted: Number(id) };
  });
  app.get('/v1/alerts/events', async () => ({ events: await listAlertEvents() }));
  app.post('/v1/alerts/evaluate', async () => evaluateAlerts());
}
