# Plan: Build/Run + Feature & Bug List Report

## Summary
- Build and run the Ocean Luxe Agent Onboarding Platform locally.
- Produce a single Markdown report that includes:
  - Build/run instructions (dev + prod)
  - Feature inventory (frontend pages + key API flows)
  - Bug list (confirmed via smoke tests + issues found by code review)
  - Database organization recommendations (report-only; no DB/schema/code changes)

## Current State Analysis (Grounded)

### Stack & Entry Points
- Full stack TypeScript app: React (Vite) + Express 5 + Drizzle ORM + Postgres.
- Local dev entrypoint: [package.json](file:///workspace/package.json#L9-L16) → `npm run dev` runs `tsx server/index.ts`.
- Server startup: [server/index.ts](file:///workspace/server/index.ts#L1-L19) listens on `PORT` (default 5000).
- Vite config roots the frontend at `client/` and builds to `dist/public`: [vite.config.ts](file:///workspace/vite.config.ts#L1-L26).
- Vercel serverless entry: [api/[...path].ts](file:///workspace/api/%5B...path%5D.ts#L1-L26) boots the Express app and forwards requests.

### UI Routes / Pages
- Router: [App.tsx](file:///workspace/client/src/App.tsx#L1-L30)
  - `/` → Landing
  - `/#/register` → Agent registration
  - `/#/agent` → Agent dashboard / login
  - `/#/onboarding/:id` → 6-step onboarding wizard
  - `/#/admin` → Admin hiring dashboard
- Onboarding UX is implemented primarily in [OnboardingPage.tsx](file:///workspace/client/src/pages/OnboardingPage.tsx).

### API Surface (High-Level)
- Primary API routes are implemented in [routes.ts](file:///workspace/server/routes.ts).
- Key flows:
  - Agent registration: `POST /api/agents`
  - Agent session login/logout: `POST /api/agent/login`, `POST /api/agent/logout`
  - Onboarding tasks: `GET/PATCH /api/agents/:id/onboarding/...`
  - Documents: `POST /api/agents/:id/documents`, `PATCH /api/admin/documents/:id`
  - ICA signature: `POST /api/agents/:id/ica`
  - Training progress: `POST /api/agents/:id/training/:moduleKey/complete`
  - Admin listing/details: `GET /api/agents`, `GET /api/admin/agents/:id`, `GET /api/stats`

### Data Model & DB Bootstrapping
- App expects `DATABASE_URL` for Postgres: [.env.example](file:///workspace/.env.example#L1-L19), [server/db.ts](file:///workspace/server/db.ts#L4-L18).
- Schema definitions use Drizzle Postgres tables (`pgTable`) with `hr_`-prefixed table names: [shared/schema.ts](file:///workspace/shared/schema.ts#L1-L89).
- Database initialization is done via SQL `CREATE TABLE IF NOT EXISTS ...` on startup-on-demand: [ensureDatabase](file:///workspace/server/db.ts#L56-L187) and `npx tsx server/migrate.ts` per [README.md](file:///workspace/README.md#L25-L32).

## Proposed Changes (Docs Only)

### 1) Add a single report file
- **Add** `docs/feature-bug-list.md`
- Contents:
  - **Build & Run**
    - Prereqs (Node 20)
    - Dev commands: `npm install`, `npx tsx server/migrate.ts`, `npm run dev`
    - Prod commands: `npm run build`, `npm run start`
    - Environment setup guidance: copy `.env.example` to `.env` (not committed) and set `DATABASE_URL` (do not print secrets in logs/output).
  - **Feature List**
    - UI features by page (Landing, Register, Agent Dashboard, Onboarding steps, Admin)
    - Back-end features by route grouping (Agents, Onboarding, Docs, ICA, Payout, Training, Admin, Stats)
  - **Bug List**
    - Findings from static review (code-level inconsistencies, risk areas)
    - Findings from smoke tests (confirmed behaviors), each with:
      - Severity (blocker/high/medium/low)
      - Repro steps
      - Expected vs actual
      - Suspected root cause (with file references)
  - **DB Organization Recommendations (Report Only)**
    - Recommend how to keep CRM + travel + HR data discoverable:
      - Naming conventions and consistent prefixes (e.g., `hr_*` already used)
      - Prefer Postgres schemas per domain (e.g., `hr`, `crm`, `travel`) or consistent prefixing if schema separation is not feasible
      - Relationship modeling: foreign keys, indexes, and audit/event tables (status events already exist)
      - Views for “human-friendly” reporting (already includes `hr_agent_summary` view)
    - Explicitly note: no DB migrations or code changes are applied in this task.

## Assumptions & Decisions
- Deliverable is **documentation only** (no product changes, no DB migrations, no refactors).
- Smoke tests will run against a Postgres DB provided via `DATABASE_URL` stored locally in `.env` (already gitignored by [.gitignore](file:///workspace/.gitignore#L1-L5)).
- Secrets (like DB credentials) will not be echoed into logs or checked into the repo.

## Implementation Steps (Executor Checklist)
1. Install dependencies in repo root (`npm install`).
2. Create a local `.env` from `.env.example` and set `DATABASE_URL` (local only; do not commit).
3. Initialize tables: `npx tsx server/migrate.ts`.
4. Start dev server: `npm run dev` and confirm the app serves on port 5000.
5. Smoke test (UI + API):
   - UI navigation: `/`, `/#/register`, `/#/agent`, `/#/admin`, `/#/onboarding/:id`.
   - Core flows:
     - Register agent → verify session cookie set and dashboard accessible
     - Resume onboarding and complete each step (profile, ICA, W9, ID, payout, training)
     - Admin access/login behaviors and agent list/stat endpoints
   - Capture confirmed issues with clear repro steps.
6. Produce `docs/feature-bug-list.md` with the sections above, including file/route references for each feature and bug.

## Verification
- `npm run check` passes (TypeScript compile/typecheck).
- `npm run build` succeeds.
- Dev server runs and is reachable at port 5000.
- Smoke test notes in the report clearly distinguish:
  - Confirmed runtime bugs
  - “Code review only” risks that need validation

