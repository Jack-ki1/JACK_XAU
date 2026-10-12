# opencode.md — What we did here (session record for future chats)

Repo: `Jack-ki1/JACK_XAU` (local `/home/jackson11/projects/trading/GOLD_TRADING_TOOL`)
Product: **JACK TRADE** — personal, single-user XAUUSD trading desk (no login, ever).
Work: executed the full phased Transformation Prompt (Phases 0–8) back-to-back,
then a Phase 9 premium UI refresh. All merged to `main`.

## Git state

- Tag `pre-transform` @ `7b60fdf` (original first commit) — preserved.
- Branch chain (each phase = branch + green gate, merged ff-linearly into `main`):
  - `transform/phase-0-audit` (`fc29c62`) — audit docs
  - `transform/phase-1-safety` (`2714f09`) — safety pass
  - `transform/phase-2-monorepo` (`0d17155`, `2ed1f1f`) — workspaces
  - `transform/phase-3-backend` (`04e3ecc`, `e4397cb`) — Fastify API
  - `transform/phase-4-design-shell` (`d6d53a9`) — design system
  - `transform/phase-5-chart-blotter` (`8a80205`) — chart + blotter
  - `transform/phase-6-analytics-tester` (`d3c28eb`) — analytics + async backtester
  - `transform/phase-7-full-api` (`06098a9`) — every page on API
  - `transform/phase-8-polish` (`1dca6ce`) — Docker, RUNBOOK, README
  - `transform/phase-9-premium` (`49fd49f`) — premium UI refresh
- HEAD = `main` @ `49fd49f`, working tree clean.
- **Push must be done manually by user** (no GitHub credentials in this env):
  `git push origin main --tags`

## Architecture after the transformation

```
browser ── same-origin /api/v1/* ──► web (Next 16.3, apps/web)
                                        │ injects API_TOKEN server-side (proxy)
                                        ▼
                                   api (Fastify 5, apps/api, :3101)
                                        ├─ 7 locked in-process jobs (scheduler)
                                        ├─ providers: TwelveData, Groq, calendar, Finnhub
                                        ├─ repositories ──► Supabase (service key)
                                        └─ SSE /v1/stream ──► react-query invalidation

producer (main.py, external) ── POST /v1/signals/ingest (Bearer API_TOKEN | ?secret=CRON_SECRET)
```

- npm workspaces: `apps/web`, `apps/api`, `packages/engine` (pure, 37 vitest
  tests incl. golden backtest snapshot), `packages/shared` (zod contracts),
  `packages/config`.
- Web has **zero** supabase-js, zero provider keys, zero secrets (verified by grep).
- Secrets live only in the API (plus `API_TOKEN`/`API_BASE_URL` on web side,
  injected by `apps/web/src/app/api/v1/[...path]/route.ts`).
- Legacy `/api/check-*` cron forwarders intentionally KEPT (external crons may
  still hit them); migration path documented in `docs/RUNBOOK.md`.
- RLS: `supabase/migrations/0002_rls_deny_all.sql` is apply-ready but NOT yet
  applied (user must run it in Supabase — nothing in web talks to Supabase now).

## Phase-by-phase deliverables

- **P0** `docs/AUDIT.md`, `docs/DATA_MODEL.md`, `docs/UX_CRITIQUE.md`.
- **P1** removed login entirely, shared types, zod env validation
  (`lib/env.ts`), route guards, rate limits, CI workflow, demo mode +
  `DemoRibbon`, lint 71 → 0, `.env.example`.
- **P2** monorepo move to `apps/web`, backtest split into modules, engine
  tests (golden snapshot), ADR 0001.
- **P3** Fastify API (`apps/api/src`) owns jobs/secrets/DB: `/v1/{health,
  signals, desk, reports, ops, guarded}`, SSE hub, `POST /v1/signals/ingest`,
  token+rate-limit guards; web routes → thin forwarders + proxy; migrations
  0001/0002; ADR 0002; dead web files deleted.
- **P4** design tokens (`apps/web/src/styles/tokens.css`, 3 themes + color-blind
  + density), UI primitives (`components/ui/Button|Panel`), shell rewrite
  (Sidebar, Topbar, ⌘K CommandPalette, ThemeApplier), all 8 pages codemoded
  onto tokens, `scripts/contrast-check.mjs` (WCAG AA gate) wired into CI.
- **P5** `components/chart/ChartWorkspace.tsx` (lightweight-charts v5 candles,
  PD/PW price lines, tf switch, SIMULATED fallback), react-query + SSE bridge
  (`components/shell/Providers.tsx`), desk/candles/notifications API,
  shell+blotter off Supabase.
- **P6** `/v1/verdicts/:table`, signals cap → 1000, async backtester
  (POST 202 → poll `GET /v1/backtests/:id` + run history), sync `/api/backtest`
  bridge deleted, performance page on API.
- **P7** `/v1/signals/resolved`, `/v1/usage/analysed`, `/v1/signals?ids=…`,
  analysis/analysed/news pages rewired to API, `supabaseClient.ts` +
  `@supabase/supabase-js` removed from web, RLS 0002 marked apply-ready.
- **P8** `Dockerfile.web`, `Dockerfile.api`, `docker-compose.yml`,
  `.dockerignore`, `docs/RUNBOOK.md`, README rewritten, last legacy callers
  migrated to v1 client, chart attribution.
- **P9 (premium refresh)**
  - Self-hosted **Geist Sans + Geist Mono** (variable woff2 in
    `apps/web/src/fonts/`, loaded via `next/font/local`; no Google Fonts at
    build). `--font-inter`/`--font-jbmono` aliased in `globals.css` so old
    classes keep working.
  - Brighter, higher-chroma palettes in all 3 themes (aurora-navy midnight,
    punchier graphite/daylight); bull/bear/gold/blue all intensified.
    All 42 contrast pairs still pass AA (margins improved).
  - Glass topbar (`backdrop-blur-md`, gold→blue hairline), ambient aurora
    radial wash behind app (`AppShell`), gradient brand wordmark + gold logo
    glow, `:focus-visible` rings, `::selection`, scrollbar hover,
    panel shadows + `--radius: 10px`, button hover-lift, unified page h1s
    (26px semibold tracking -0.02em), `viewport.themeColor`.

## Verification state (all green at HEAD)

- `npm run typecheck` 0 errors (web+api+engine+shared)
- `npm run lint` 0 issues
- `npm run check:contrast` 42/42 pairs AA (3 themes)
- `npm run test` 37/37 (engine vitest, golden snapshot)
- `npm run build` passes with NO env (demo-mode boot enforced)
- Smoke: all 8 pages 200; `/api/v1/{desk/status, market/candles, verdicts,
  signals/resolved, usage/analysed, calendar, stream}` 200 via proxy; SSE
  streams through proxy.

## Environment quirks (important for future sessions)

- **`pkill -f "next start"`/`"next-server"` self-matches its own bash cmdline
  and kills its own shell → tool "timeout" with no output.** Always use
  bracket patterns: `pkill -f "next [s]tart"; pkill -f "next-[s]erver"`.
- Background servers: `API_TOKEN=… setsid nohup npm run … > /tmp/x.log 2>&1 < /dev/null &`
  then `sleep` + `curl --max-time`. Long compound commands with pkill tend to
  hang the bash tool.
- Web prod: `npm run start -w apps/web -- -p 3102` (needs `.next` build);
  API: `API_TOKEN=smoke-token-12345678 npm run dev:api` (port 3101).
- **Screenshots impossible**: Chromium (playwright, browser-automation skill)
  missing `libnspr4.so`; no passwordless sudo → cannot install. Verify via
  rendered HTML/CSS greps instead.
- **Docker not available** in this WSL distro (files written, `docker compose
  build` untested — user must run it locally).
- No GitHub credentials → pushes fail; user pushes manually.

## Open items / possible next steps

1. User: `git push origin main --tags`.
2. User: apply `supabase/migrations/0002_rls_deny_all.sql` (steps in RUNBOOK).
3. Migrate external crons from `/api/check-*` forwarders → `POST /v1/jobs/:name`.
4. `docker compose up --build` untested (no Docker here).
5. Visual screenshot QA blocked on system libs (see quirks).
6. Deferred polish: table-row density restyle, settings cards' inline styles
   (already close to new radius).
