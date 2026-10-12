# ADR 0002 — Fastify API service, tsx runtime

Date: 2026-10-12 (Phase 3). Status: accepted.

## Context

Scheduled checks, provider polling, LLM calls and the service-role key do
not belong in UI route handlers (§4.1). Candidates: Fastify, Hono, Express.

## Decision

* **Fastify 5**: built-in pino logging, `@fastify/rate-limit` + `@fastify/cors`
  plugins, schema-adjacent validation, no decision fatigue. Hono is excellent
  but buys us edge-runtime portability we don't need (always-on host per the
  recommended deployment); Express needs more assembly for the same result.
* **tsx for dev AND prod** (`tsx watch` / `tsx src/server.ts`): the API is a
  single long-lived process; a tsc emit step adds build complexity for no
  runtime gain at this scale (workspace TS sources compile in-process).
  CI enforces `tsc --noEmit` so type safety doesn't depend on the runner.
  Revisit if cold-start or packaging ever matters.
* **In-process scheduler** (setInterval + locks) over node-cron/croner: zero
  new deps; every handler is idempotent (cursors, dedup, attempt guards), so
  double-runs are safe. External-cron fallback preserved via token-guarded
  POST /v1/jobs/:name (RUNBOOK documents both).
* **Same-origin Next proxy** (`/api/v1/[...path]`): the browser never sees
  API_TOKEN; legacy `/api/*` paths become thin forwarders with documented
  degraded payloads so existing pages keep working until Phase 5 rewires them.

## Consequences

* Web bundle contains zero service-key references (verified by grep).
* `supabase/migrations/0002_rls_deny_all.sql` ships but is GATED: apply only
  after Phase 5 moves the last direct anon reads through the API.
* New producer contract: POST /v1/signals/ingest (idempotent on signal_id)
  replaces "main.py writes Supabase directly".
