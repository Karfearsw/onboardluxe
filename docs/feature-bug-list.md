# Ocean Luxe HR Suite — Build/Run, Feature List, Bug List

## Build & Run

### Prereqs
- Node.js: this repo declares Node `20.x` in [package.json](file:///workspace/package.json#L6-L8). Running on newer Node works in some environments but is not guaranteed.
- Postgres database: required for most API flows via `DATABASE_URL` ([.env.example](file:///workspace/.env.example#L1-L19)).

### Local dev
```bash
npm ci
npx tsx server/migrate.ts
npm run dev
```

- App listens on port 5000 by default ([server/index.ts](file:///workspace/server/index.ts#L6-L15)).
- The server will start even if `DATABASE_URL` is missing, but DB-backed endpoints will return 500.

### Production build
```bash
npm run build
npm run start
```

### Production: Admin SSO + “user not showing”
- Use `GET /api/admin/auth/diagnostics` first (the Admin UI shows this automatically on the sign-in screen).
- Common root causes:
  - HR is deployed on `*.vercel.app` (shared cookies won’t be present); deploy on `career.oceanluxe.org`.
  - Cookie name mismatch (some deployments use `__Host-connect.sid` / `__Secure-connect.sid`).
  - `AUTH_MODE=express_session` but `SESSION_SECRET` does not match the CRM server’s `express-session` secret, so signed cookies can’t be verified.
  - HR is pointing at a database that does not contain the CRM `session` table (or columns/table name differs; use the `SESSION_*` env vars).

### Cross-suite admin (HR + CRM + Travel)
- This HR app authorizes access using either:
  - the shared CRM session cookie (SSO), or
  - the HR fallback admin cookie (`ol_hr_admin`) via access code.
- To ensure “HR admins are also CRM admins”, enforce it at the identity/source-of-truth layer:
  - In the CRM system, ensure the HR admin users have an `admin` (or other allowed) role stored in the session and/or membership role.
  - Keep the allowed roles aligned across apps (in this repo: `AUTH_ALLOWED_ROLES` defaults include `admin` and `hr_admin`).

## Feature List

### Frontend (Routes)
- `/` Landing page (recruiting / marketing): [LandingPage.tsx](file:///workspace/client/src/pages/LandingPage.tsx)
- `/#/register` Agent registration:
  - Fields: name, email, phone
  - Creates agent via `POST /api/agents`: [RegisterPage.tsx](file:///workspace/client/src/pages/RegisterPage.tsx#L27-L54)
- `/#/agent` Agent dashboard + session login:
  - If no session cookie, shows login UI (email + phone last 4) and calls `POST /api/agent/login`: [AgentDashboardPage.tsx](file:///workspace/client/src/pages/AgentDashboardPage.tsx#L87-L220)
  - Shows progress summary and recent events (from `GET /api/agent/status`)
- `/#/onboarding/:id` 6-step onboarding wizard: [OnboardingPage.tsx](file:///workspace/client/src/pages/OnboardingPage.tsx#L539-L791)
  - Step 1 Profile confirm (`PATCH /api/agents/:id/onboarding/profile`)
  - Step 2 ICA signature capture (canvas) (`POST /api/agents/:id/ica`)
  - Step 3 W-9 “upload” (`POST /api/agents/:id/documents`)
  - Step 4 ID “upload” (`POST /api/agents/:id/documents`)
  - Step 5 Payout setup (`POST /api/agents/:id/payout`) + optional SoFi tracking (`POST /api/agents/:id/sofi/opened`)
  - Step 6 Training (opens `/training/training-bundle.html`) + marks modules complete (`POST /api/agents/:id/training/:moduleKey/complete`)
- `/#/admin` Admin dashboard:
  - Uses shared admin session cookie (SSO) or fallback access-code login: [AdminPage.tsx](file:///workspace/client/src/pages/AdminPage.tsx#L195-L507)
  - Agent list + stats + doc review + pipeline stage updates

### Backend (Route Groups)
- Agent creation + onboarding seeding: `POST /api/agents` ([routes.ts](file:///workspace/server/routes.ts#L257-L310))
- Agent portal sessions (HttpOnly cookie `ol_agent_session`):
  - cookie set/cleared in [agent-auth.ts](file:///workspace/server/agent-auth.ts#L51-L70)
  - session rows stored in `hr_agent_sessions` table ([server/db.ts](file:///workspace/server/db.ts#L119-L126))
- Onboarding progress tracking:
  - `hr_onboarding_tasks` records step status and timestamps ([shared/schema.ts](file:///workspace/shared/schema.ts#L29-L41))
  - auto-advance and completion events in `PATCH /api/agents/:id/onboarding/:taskKey` ([routes.ts](file:///workspace/server/routes.ts#L439-L475))
- Status/event timeline:
  - `hr_status_events` table + event logging helpers ([server/db.ts](file:///workspace/server/db.ts#L127-L137))
  - surfaced in agent/admin summary responses (`/api/agent/status`, `/api/admin/agents/:id/status`)
- Training:
  - `hr_training_progress` seeded per agent ([storage.ts](file:///workspace/server/storage.ts#L147-L165))
  - completion endpoint updates module progress and can complete onboarding ([routes.ts](file:///workspace/server/routes.ts#L613-L648))
- Admin flows:
  - agent listing/details/stats/doc approval/pipeline stage updates ([routes.ts](file:///workspace/server/routes.ts#L245-L676))

## Bug List

### Confirmed via smoke test (local)
- High: Dev environment mismatch risk
  - Repro: run `npm ci` on Node versions other than 20.x
  - Actual: install succeeded but reported `EBADENGINE` because repo expects Node 20.x
  - Expected: either enforce Node 20 or document supported versions clearly
  - Evidence: `engines.node` in [package.json](file:///workspace/package.json#L6-L8)
- Medium: DB-less startup yields 500s for DB endpoints (no graceful “setup required” UX)
  - Repro: start dev server without `DATABASE_URL`, call `GET /api/health`
  - Actual: 500 with “Missing DATABASE_URL …”
  - Expected: for local dev, clearer boot-time warning + consistent “setup required” response shape
  - Root cause: `getConnectionString()` throws when pool is first used ([server/db.ts](file:///workspace/server/db.ts#L12-L18))

### Found by code review (needs validation in a DB-backed run)
- High: Admin SSO “user not showing” commonly caused by cookie name/domain or session secret mismatch
  - Symptom: `/api/admin/me` returns 401 in production, so Admin UI shows “Admin Sign-In Required” and no agents/stats load.
  - Checks:
    - Open `/#/admin` and review the auto-loaded diagnostics output (or click “Check Auth Diagnostics”).
    - Confirm the HR site is on the same root domain as CRM (`career.oceanluxe.org`, not `*.vercel.app`) so cookies can be shared ([README.md](file:///workspace/README.md#L84-L88)).
    - Confirm `AUTH_MODE=express_session`, `AUTH_COOKIE_NAMES`, and `SESSION_SECRET` match the CRM setup ([README.md](file:///workspace/README.md#L89-L95)).
  - Code notes:
    - The server now checks additional cookie name variants: [auth.ts](file:///workspace/server/auth.ts#L6-L15)
    - Auth diagnostics endpoint: `GET /api/admin/auth/diagnostics` ([routes.ts](file:///workspace/server/routes.ts#L155-L174))
- High: Local Postgres without SSL is not supported by current DB client config
  - Why: `pg.Pool` is created with `ssl: { rejectUnauthorized: false }` unconditionally ([server/db.ts](file:///workspace/server/db.ts#L20-L27))
  - Impact: connecting to a typical local Postgres (no TLS) will fail unless TLS is enabled server-side
  - Suggested fix: make SSL conditional (e.g., driven by env or connection string)
- Medium: “Document upload” is metadata-only; UI implies file upload but no binary is sent/stored
  - Repro: onboarding step uploads W-9/ID
  - Actual: frontend sends `{fileName, fileUrl}` JSON only ([OnboardingPage.tsx](file:///workspace/client/src/pages/OnboardingPage.tsx#L211-L218))
  - Backend stores `fileUrl` but does not handle multipart uploads ([routes.ts](file:///workspace/server/routes.ts#L514-L544))
  - Impact: “Open file” in Admin may 404 unless `fileUrl` points to an external storage URL
- Medium: API response logging may leak sensitive data to logs
  - Why: middleware logs `JSON.stringify(capturedJsonResponse)` for all `/api/*` responses ([app.ts](file:///workspace/server/app.ts#L42-L63))
  - Impact: agent PII, documents metadata, and admin details can end up in logs
  - Suggested fix: log only metadata (status, duration, request id), or redact sensitive fields
- Low: README local dev instructions mention SQLite, but code is Postgres-first
  - README claims “SQLite/Drizzle” ([README.md](file:///workspace/README.md#L3-L4))
  - Actual: schema is `pgTable` + `dialect: postgresql` ([shared/schema.ts](file:///workspace/shared/schema.ts#L1-L22), [drizzle.config.ts](file:///workspace/drizzle.config.ts#L3-L10))
  - Impact: onboarding devs may set up the wrong database expectation

## DB Organization Recommendations (Report Only)

### What’s already good
- Domain prefixing is consistent for HR tables (`hr_*`).
- Status/event history is centralized (`hr_status_events`), which supports audits and “human readable” timelines.
- A summary view exists (`hr_agent_summary`) for quick reporting ([server/db.ts](file:///workspace/server/db.ts#L148-L178)).

### Recommended organization for CRM + travel + HR in one Postgres
- Prefer a domain-per-schema approach:
  - `crm.*`, `travel.*`, `hr.*` schemas
  - Keep a shared schema for cross-domain utilities if needed (e.g., `core.*`)
- If schema separation is not feasible, keep strict prefixing:
  - `crm_*`, `travel_*`, `hr_*`
  - Add consistent naming for join tables and audit tables (e.g., `*_events`, `*_attachments`)
- Add “human-friendly” discovery surfaces:
  - Views per domain (e.g., `hr.agent_summary`, `travel.booking_summary`) with clear columns and denormalized display fields
  - A single cross-domain “activity” view if the product needs unified timelines
- Use constraints + indexes intentionally:
  - Foreign keys for `agent_id` relations
  - Unique constraints for natural keys (email already unique in `hr_agents`)
  - Composite indexes for common filters (e.g., `(agent_id, status)`, `(created_at)` for events)
