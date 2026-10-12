# JACK TRADE

Personal single-user XAUUSD trading desk. No login, no accounts, no multi-user
logic — the app opens directly on the dashboard. Analysis tool only: signals,
review, alerts, backtesting. No order placement, no broker execution.

## Run it

```bash
npm ci
npm run dev        # web → http://localhost:3000 → /overview
npm run dev:api    # api → http://127.0.0.1:3101 (jobs run in-process)
```

or the full desk in containers:

```bash
docker compose up --build   # web :3000, api :3101
```

With no env vars everything still boots: **demo mode** (amber ribbon, fixture
stats), **simulated chart bars** (labelled), jobs idle, repo reads empty.
Copy `.env.example` → `.env.local` (web) / fill the same file for compose —
all real keys live in the API (see `docs/RUNBOOK.md` for the secrets matrix).

```bash
npm run build && npm run start   # production
npm run typecheck                # strict, all 4 workspaces
npm run lint                     # eslint, must be clean
npm run check:contrast           # WCAG AA token gate (3 themes)
npm run test                     # engine vitest (37 tests, golden snapshot)
```

CI runs typecheck → lint → contrast → test → build with **empty credentials**,
so demo-mode boot and the no-secrets bundle are enforced on every push.

## Architecture

```text
browser ── /api/v1/* (same-origin) ──► web (Next 16) ── server-side token ──► api (Fastify :3101)
                                                                 ├─ 7 locked background jobs
                                                                 ├─ providers: TwelveData · Groq · calendar · Finnhub
                                                                 ├─ repositories ──► Supabase (service key only)
                                                                 └─ SSE /v1/stream ──► react-query invalidation
producer (main.py) ── POST /v1/signals/ingest (Bearer)
```

* **Web has zero Supabase code and zero provider keys** — verified by grep;
  the browser never sees `API_TOKEN` either (injected by the proxy handler).
* **Design system**: token themes (`midnight` / `graphite` / `daylight`),
  density, colour-blind-safe direction colours; `⌘K` command palette;
  every text/background pair gated ≥4.5:1 by `check:contrast` in CI.
* **Chart workspace**: lightweight-charts candles (live or labelled
  simulated), PD/PW price lines, timeframe switch, theme-aware.

## Structure (npm workspaces)

```text
apps/web/         Next 16 app router — shell, chart workspace, blotter,
                  analytics, backtester, settings. react-query + SSE.
apps/api/         Fastify /v1 surface, jobs scheduler, providers, repos,
                  SSE hub. Sole owner of every secret.
packages/engine/  pure logic: sessions (DST), points, levels, analysis,
                  backtest (split modules) — no Node/DOM/Supabase/fetch,
                  time passed in ⇒ deterministic (37 vitest tests).
packages/shared/  types + zod contracts shared by web and api.
packages/config/  shared tsconfig base.
docs/             AUDIT, DATA_MODEL, UX_CRITIQUE, RUNBOOK, adr/, phases.
supabase/migrations/  0001 baseline · 0002 RLS deny-all (apply-ready).
```

Legacy `/api/check-*`-style forwarders still exist so any already-scheduled
external cron keeps working; migrate to `POST /v1/jobs/:name` (RUNBOOK).

## Security model (personal app, public repo)

* No user auth by design; every `/v1/*` except `/v1/health` requires a
  machine secret (`API_TOKEN` bearer or `CRON_SECRET`), constant-time compared.
* No secrets in git (`.env*` gitignored, `.env.example` documents every key);
  Phase 0 history scan came back clean.
* `0002_rls_deny_all.sql` closes the last Critical audit finding — apply once
  (steps in `docs/RUNBOOK.md`), then anon reads nothing while the desk works.
* Recommended: deploy behind Tailscale / Cloudflare Access.

## Transformation history

Phased rebuild, one branch + green gate each: `pre-transform` tag →
P0 audit docs → P1 safety (login removed, guards, CI, demo mode) → P2
monorepo + engine extraction (golden backtest test) → P3 Fastify API +
proxy + SSE + jobs → P4 design system + shell → P5 chart workspace +
blotter → P6 analytics + async backtester → P7 every page on the API
(web Supabase-free) → P8 Docker, RUNBOOK, polish. See `docs/adr/`.

## Branding

JACK TRADE throughout. Lightweight Charts attribution (Apache-2.0):
chart rendering by TradingView Lightweight Charts.
