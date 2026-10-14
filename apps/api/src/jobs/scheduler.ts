// api/jobs — in-process scheduler with locks + idempotent handlers.
// Every job is safe to run twice (cursors, dedup checks, attempt guards).
// If the API ever goes serverless, these stay callable as token-guarded
// POST /v1/jobs/:name endpoints for an external cron (RUNBOOK).
import type { FastifyBaseLogger } from 'fastify';
import { getEnv } from '../config/env.js';
import { analysePending } from '../services/analysis.js';
import { refreshCalendar } from '../providers/calendar.js';
import { processNewsSignals } from '../services/news.js';
import { checkAnalysedSignals, checkNewsSignals, checkOpenSignals } from '../services/resolution.js';
import { signalTransitions } from '../services/transitions.js';
import { backfillStandardLadder } from '../services/candles.js';
import { evaluateAlerts } from '../services/alerts.js';
import { publish } from '../plugins/sse.js';

interface JobDef {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const JOBS: JobDef[] = [
  { name: 'signalTransitions', everyMs: 5 * 60000, run: () => signalTransitions() },
  { name: 'checkOpenSignals', everyMs: 10 * 60000, run: checkOpenSignals },
  { name: 'checkAnalysedSignals', everyMs: 10 * 60000, run: checkAnalysedSignals },
  { name: 'checkNewsSignals', everyMs: 10 * 60000, run: checkNewsSignals },
  { name: 'analysePending', everyMs: 10 * 60000, run: () => analysePending() },
  { name: 'newsSignals', everyMs: 5 * 60000, run: processNewsSignals },
  { name: 'refreshCalendar', everyMs: 24 * 3600000, run: refreshCalendar },
  // v2: keep our candle store fresh so backtests never depend on live calls.
  { name: 'backfillCandles', everyMs: 6 * 3600000, run: () => backfillStandardLadder(7) },
  // v2 C10: evaluate system + config alerts (deduped via alert_events).
  { name: 'evaluateAlerts', everyMs: 5 * 60000, run: () => evaluateAlerts() },
];

const locks = new Set<string>();
export const jobStatus = new Map<string, { lastRun: string | null; lastResult: string; lastMs: number | null }>();

for (const j of JOBS) jobStatus.set(j.name, { lastRun: null, lastResult: 'never', lastMs: null });

export async function runJob(name: string, log?: FastifyBaseLogger): Promise<unknown> {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw Object.assign(new Error(`Unknown job: ${name}`), { code: 'bad_request', status: 404 });
  if (locks.has(name)) return { skipped: true, reason: 'already_running' };
  locks.add(name);
  const started = Date.now();
  try {
    const result = await job.run();
    jobStatus.set(name, { lastRun: new Date().toISOString(), lastResult: 'ok', lastMs: Date.now() - started });
    publish({ kind: 'job', job: name, result: 'ok', ms: Date.now() - started });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    jobStatus.set(name, { lastRun: new Date().toISOString(), lastResult: message, lastMs: Date.now() - started });
    log?.error({ job: name, err: message }, 'job failed');
    publish({ kind: 'job', job: name, result: 'error', message });
    throw e;
  } finally {
    locks.delete(name);
  }
}

export function jobNames(): string[] {
  return JOBS.map((j) => j.name);
}

export function startScheduler(log: FastifyBaseLogger): void {
  if (getEnv().JOBS_ENABLED === 'false') {
    log.info('jobs disabled (JOBS_ENABLED=false)');
    return;
  }
  for (const job of JOBS) {
    setInterval(() => {
      void runJob(job.name, log).catch(() => undefined);
    }, job.everyMs).unref?.();
    log.info({ job: job.name, everyMs: job.everyMs }, 'job scheduled');
  }
}
