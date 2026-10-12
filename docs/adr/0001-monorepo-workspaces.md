# ADR 0001 — npm workspaces monorepo (no Turborepo)

Date: 2026-10-12 (Phase 2). Status: accepted.

## Context

Phase 0/1 left a single Next.js app with logic, I/O and UI interleaved.
The target (§4.1) is `apps/web` + `apps/api` + `packages/engine|shared|config`.

## Decision

npm workspaces (`apps/*`, `packages/*`), no Turborepo: build times are
small (web ~2s compile, engine tests <1s), so a build orchestrator adds
more config than value. Revisit if `build:all` exceeds ~3 min in CI.

Next.js resolves workspace TS sources via `transpilePackages`
(per the bundled Next docs, `01-app/02-guides/package-bundling.md` area +
`transpilePackages` config reference). Web imports packages by name
(`@jack-trade/engine`, `@jack-trade/shared`), never by relative path.

## Consequences

* Root `package.json` holds only workspace wiring + shared scripts.
* `apps/web` owns Next.js, React, Supabase client, Tailwind.
* `git mv` preserved file history across the move.
