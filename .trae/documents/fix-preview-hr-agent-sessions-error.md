# Plan: Fix Preview 500 (Missing hr_agent_sessions) + SSL Warning Guidance

## Summary
- Stop Vercel Preview/Production from returning 500 due to `relation "hr_agent_sessions" does not exist` by ensuring database migrations are applied (or schema readiness is asserted) **before** request middleware queries session tables.
- Keep local development behavior flexible (server can still boot without a DB when not in strict runtime).
- Document the Neon SSL warning mitigation (`uselibpqcompat=true&sslmode=require` or `sslmode=verify-full`) without rewriting connection strings at runtime.

## Current State Analysis (Grounded)

### Error Root Cause
- The 500 comes from `attachAgentUser()` querying `hr_agent_sessions` immediately via `pool.query(...)` in [agent-auth.ts](file:///workspace/server/agent-auth.ts#L108-L129), which calls [findAgentSession](file:///workspace/server/agent-auth.ts#L92-L106).
- Database migrations are only applied (or schema readiness is asserted) when `ensureDatabase()` is called, and `ensureDatabase()` is currently invoked by storage operations (Drizzle layer), not before middleware runs.
  - DB initialization/migration logic: [db.ts](file:///workspace/server/db.ts#L75-L115)
  - `ensureDatabase()` is not called in the Express boot path: [app.ts](file:///workspace/server/app.ts#L27-L70)
- Therefore, on a fresh DB/branch (or when migrations were not applied during deploy), `attachAgentUser()` hits a missing table and throws `42P01`, producing the observed 500 before routes/auth diagnostics can help.

### Migration Mode (Current)
- Migrations exist in [migrations/](file:///workspace/migrations) and are applied by Drizzle migrator when `ensureDatabase()` runs and `AUTO_APPLY_MIGRATIONS=1` (or non-strict runtime): [db.ts](file:///workspace/server/db.ts#L75-L82).
- In strict runtimes (Vercel Preview/Production), `AUTO_APPLY_MIGRATIONS` controls behavior:
  - `AUTO_APPLY_MIGRATIONS=1` → apply migrations
  - otherwise → assert required tables exist and throw a clear error
- Vercel bundling includes migrations for the serverless function: [vercel.json](file:///workspace/vercel.json#L4-L11).

### SSL Warning (Current)
- The warning about `sslmode=require` semantics change is emitted by the pg stack; it is not the cause of the 500.
- Repo currently decides whether to pass `ssl` to `pg.Pool` based on `sslmode` query param: [shouldUseSsl](file:///workspace/server/db.ts#L21-L35).

## Proposed Changes

### 1) Ensure DB readiness before auth middleware (strict runtimes only)
**File:** [server/app.ts](file:///workspace/server/app.ts)
- Import `ensureDatabase` from [server/db.ts](file:///workspace/server/db.ts) and `runtimeIsStrict` from [server/env.ts](file:///workspace/server/env.ts#L17-L23).
- In `createApp()`:
  1. call `validateEnvOrThrow()` (already present)
  2. if `runtimeIsStrict(process.env)` is true, `await ensureDatabase()` **before** `app.use(attachSharedAuthUser)` and `app.use(attachAgentUser)`
- Why:
  - Prevents `attachAgentUser()` and any early auth code paths from querying missing tables.
  - In Preview with `AUTO_APPLY_MIGRATIONS=1`, migrations auto-apply on cold start.
  - In Production with `AUTO_APPLY_MIGRATIONS=0`, the app fails fast on cold start with a clear “schema not initialized” error, rather than 500s on requests.
- Constraint honored:
  - Local dev remains non-strict, so it can still boot without DB if desired.

### 2) Update docs for SSL warning mitigation (docs-only)
**Files:**
- [.env.example](file:///workspace/.env.example)
- [unified-neon-strategy.md](file:///workspace/docs/unified-neon-strategy.md)
- Add guidance:
  - Prefer `sslmode=verify-full` (strongest) when possible, OR
  - Use `uselibpqcompat=true&sslmode=require` to keep libpq-compatible semantics and remove ambiguity.
- No runtime rewriting of connection strings (per decision).

### 3) (Optional defense-in-depth) Make agent auth resilient to missing table
**File:** [server/agent-auth.ts](file:///workspace/server/agent-auth.ts)
- If we want to be extra defensive, catch Postgres error code `42P01` inside `attachAgentUser()`:
  - Set `req.agentUser = null` and `next()` instead of throwing 500
- This is optional because step (1) should eliminate the error in strict runtimes, but it reduces blast radius if someone disables migrations and hits endpoints unexpectedly.

## Assumptions & Decisions
- Production migration strategy: **CI migrate** (run migrations before deploy), and keep `AUTO_APPLY_MIGRATIONS=0` in Production.
- SSL warning handling: **docs-only** (no runtime URL rewriting).
- Preview expectation: `AUTO_APPLY_MIGRATIONS=1` so preview DB branches self-initialize.

## Verification Steps
- **Build + typecheck**
  - `npm run check`
  - `npm run build`
- **Strict runtime boot checks (simulated)**
  - With `NODE_ENV=production` and missing `DATABASE_URL`, `createApp()` fails immediately with a clear env error.
  - With `VERCEL_ENV=preview`, valid `DATABASE_URL`, and `AUTO_APPLY_MIGRATIONS=1`, `createApp()` completes without throwing, and requests no longer 500 due to missing `hr_agent_sessions`.
- **Preview deploy checklist (real Vercel)**
  - Set Preview env vars:
    - `DATABASE_URL` → Neon preview branch
    - `AUTO_APPLY_MIGRATIONS=1`
    - do **not** set cookie domain env vars in preview (`*_COOKIE_DOMAIN`)
  - Hit `/#/agent` and `/#/admin` and confirm no “relation does not exist” errors in logs.

