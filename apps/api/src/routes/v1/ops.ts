import type { FastifyInstance } from 'fastify';
import { checkAnalysedSignals, checkNewsSignals, checkOpenSignals } from '../../services/resolution.js';
import { newsWindowStatus, signalTransitions } from '../../services/transitions.js';
import { processNewsSignals } from '../../services/news.js';
import { refreshCalendar } from '../../providers/calendar.js';
import { currentLevels } from '../../services/levels.js';
import { jobNames, jobStatus, runJob } from '../../jobs/scheduler.js';
import { getCalendar, getSettings, patchSettings } from '../../services/catalog.js';
import { apiError } from '../../lib/errors.js';

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
}
