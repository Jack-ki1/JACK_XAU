# JACK TRADE

Personal single-user XAUUSD trading desk. No login, no accounts, no multi-user
logic — the app opens directly on the dashboard. Analysis tool only: signals,
review, alerts, journal, backtesting. No order placement, no broker execution.

## Run it

```bash
npm ci
npm run dev        # http://localhost:3000 → redirects to /overview
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

## Structure

```text
app/(app)/   overview, signals, analysed-signals, news-signals,
             performance, analysis, backtest, settings (direct-access pages)
app/api/     13 routes: resolvers, analysers, calendar, backtest, transitions
components/  Sidebar, Topbar, DemoRibbon (shell; replaced by workspace in P4)
lib/         sessions (DST-aware), priceLevels, points, types (shared shapes),
             env (zod-validated config), routeGuard, rateLimit, demo fixtures,
             analysis/analyseSignal, backtest/engine
docs/        AUDIT.md, DATA_MODEL.md, UX_CRITIQUE.md (+ ARCHITECTURE, RUNBOOK later)
supabase/    migrations (from Phase 1 on)
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
