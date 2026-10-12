# JACK TRADE

Personal single-user XAUUSD trading desk. No login, no accounts, no multi-user
logic — the app opens directly on the dashboard. Analysis tool only: signals,
review, alerts, journal, backtesting. No order placement, no broker execution.

## Run it

```bash
npm ci
npm run dev        # web → http://localhost:3000 → /overview
npm run dev:api    # api → http://127.0.0.1:3101 (jobs run in-process)
```

Web without the API still boots: `/api/*` forwarders return documented
degraded payloads (news inactive, demo ribbon, fail-open defaults).
For the full desk, run both (docker-compose lands in Phase 8).
```

With no env vars the app boots in **demo mode** (amber ribbon, fixture data).
Copy `.env.example` to `.env.local` and fill keys for live data.

```bash
npm run build && npm run start   # production
npx tsc --noEmit                 # typecheck (strict)
npm run lint                     # eslint, must be clean
```

CI (`.github/workflows/ci.yml`) runs install → typecheck → lint → build with
empty credentials, so demo-mode boot is enforced on every push.

## Structure (monorepo, Phase 2+)

```text
apps/web/src/
  app/(app)/   overview, signals, analysed-signals, news-signals,
               performance, analysis, backtest, settings (direct-access pages)
  app/api/     13 routes (Phase 3 moves these into apps/api per §4.5)
  components/  Sidebar, Topbar, DemoRibbon (shell; replaced by workspace in P4)
  lib/         priceLevels, env, routeGuard, rateLimit, demo, supabaseClient,
               analysis/analyseSignal (I/O-bound; API-owned from Phase 3)
packages/engine/src/
  sessions.ts  DST-aware sessions (pure) · points.ts · levels.ts (pure breaks)
  analysis.ts  verdict/RR rules (pure) · backtest/{types,boxChain,swings,
               simulate,generate,stats}.ts (split from one 918-line file)
  test/        vitest: DST edges, points, levels, analysis, golden backtest
packages/shared/src/  types.ts + schemas.ts (zod contracts for web and api)
packages/config/      shared tsconfig base
docs/          AUDIT.md, DATA_MODEL.md, UX_CRITIQUE.md, adr/
supabase/      migrations (from Phase 1 on)
```

Root scripts: `dev` / `build` / `start` (web), `test` (engine), `lint`
(web), `typecheck` (all three). `dev:api` / `build:all` activate in Phase 3.
Golden rule: `packages/engine` imports nothing from Node, DOM, Supabase or
fetch — time is passed in, so tests are deterministic.
```

## Data flow

TradingView → external ingest (`main.py`, outside this repo) → Supabase
`signals` → immediate `POST /api/analyse-signal-now` + cron safety nets.
Background jobs (`check-open-signals` 10m, `check-transitions` 5m,
`process-news-signals` 5m, `fetch-calendar` daily) are triggered by an
external cron (e.g. cron-job.org) with `?secret=CRON_SECRET` or an
`Authorization` header. See `docs/DATA_MODEL.md` for tables and keys.

## Security model (personal app, public repo)

* No user auth by design. Machine routes require `CRON_SECRET`.
* `POST /api/backtest` and the settings toggle are browser-called: interim
  per-IP rate limits + `BACKTEST_ENABLED` kill switch (Phase 1). Phase 3 moves
  all secrets and writes behind a token-guarded API service.
* No secrets in git: `.env*` is gitignored, `.env.example` documents every key.
  History scanned clean in Phase 0 — no rotation needed.
* Recommended: put the deployment behind Tailscale / Cloudflare Access
  (runbook lands in Phase 8).

## Branding

JACK TRADE throughout (metadata, sidebar, README, package name `jack-trade`).
Lightweight Charts attribution (Apache-2.0) will appear in the UI footer and
here once the chart workspace lands (Phase 5).
