## Summary

Shift Ocean Luxe onboarding to a staged identity model:

1) **Signup becomes phone-first**: collect only legal name + phone number (no personal email required up front).
2) **Agent access before company email** uses **phone + last4** for re-login (your choice; note security tradeoff).
3) After **full onboarding completion**, agent can **request an `@oceanluxe.org` email**; the app notifies Discord so ops can provision the mailbox.
4) After ops provisions, admin marks request **created**; system records an **audit event** and posts a follow-up Discord notification (hybrid path for future CRM auto-invite).

## Current State Analysis (Repo Truth)

- Signup UI currently requires `name + email + phone` and posts to `POST /api/agents` ([RegisterPage.tsx](file:///workspace/client/src/pages/RegisterPage.tsx)).
- DB requires `hr_agents.email NOT NULL UNIQUE` ([0000_init.sql](file:///workspace/migrations/0000_init.sql#L1-L18)).
- Agent login currently uses `email + phoneLast4` ([routes.ts](file:///workspace/server/routes.ts#L328-L343)).
- Email request / admin management already exists in the codebase (request + temp password + Discord event) and depends on a new migration (`hr_email_requests`) and `EMAIL_PROVISIONING_SECRET`.
- Production stability risk: if migrations aren’t applied, strict startup fails with “Missing tables … hr_email_requests” (as you saw).

## Goals & Success Criteria

### Phone-first onboarding
- `/#/register` collects only **Full Legal Name** and **Phone Number**.
- `POST /api/agents` succeeds without an email and creates the agent + onboarding data.
- Agent can re-login pre-company-email using **phone + last4**.

### Email provisioning (activation)
- Agent can request `@oceanluxe.org` email only after `onboardingComplete=true`.
- Discord receives `agent.email_requested` with requested email + agent info (no passwords).
- Admin can mark request `created`, triggering:
  - status event in DB
  - Discord `agent.email_created` (and `agent.access_granted` if we separate them).
- System is “hybrid-ready” for CRM auto-invite later (structure events + endpoints now, integration later).

## Assumptions & Decisions (Locked)

- Pre-company-email auth: **Phone + last4**.
- Personal email: **collected later (optional)** (not required at signup).
- CRM access: **Hybrid** (manual now via Discord + admin workflow; keep hooks for later API invite).

## Proposed Changes

### 0) Immediate Deployment Safety (Operations)

- Ensure migrations are applied before testing in Production:
  - Temporarily set `AUTO_APPLY_MIGRATIONS=1` on Production for one deploy (or run a migration job), then set back to `0`.
- Ensure signup gating is explicitly configured:
  - `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org` (or `.oceanluxe.org`)
  - Keep `APP_PUBLIC_SIGNUP=0` unless intentionally opening signup globally.
- Add `EMAIL_PROVISIONING_SECRET` (server-only, sensitive) to Production + Preview.

### 1) Database & Schema Evolution (Non-destructive)

Add new columns to `hr_agents` without breaking existing data:

- `personal_email` (nullable)
- `company_email` (nullable, unique)
- `phone_normalized` (nullable initially; later backfilled) or normalize phone in code

Migrate existing data safely:

- For existing agents, set `personal_email = email` (current column).
- Keep `email` column for backward compatibility during transition, but stop using it as the primary identity.

Constraints / indexes:

- Add unique index on `company_email` (when non-null).
- Add unique index on normalized phone (if we normalize to digits-only).

### 2) Signup Flow (Backend + UI)

**Backend (`POST /api/agents`)**
- Accept payload: `name`, `phone` only.
- Normalize phone to digits-only before storing.
- Store:
  - `agents.phone` (normalized)
  - `agents.personalEmail` empty/null
  - `agents.companyEmail` empty/null
- Keep existing onboarding seeding behavior.

**Frontend (`/#/register`)**
- Remove the email input field.
- Keep premium copy/UX, but update messaging to reflect company email is created later after training.

### 3) Agent Login Flow (Pre-company-email)

**Backend (`POST /api/agent/login`)**
- Replace request shape with: `{ phone, phoneLast4 }`
- Lookup agent by normalized phone.
- Verify last4 matches the stored phone digits.
- Issue `ol_agent_session` cookie as today.

**Frontend (`/#/agent`)**
- Update login form to ask for phone and last4 (instead of email + last4).
- If optional personal email exists later, it does not become a login method unless we decide to add it.

Security note:
- Phone+last4 is weak. We’ll implement exactly as requested but keep the code structured so we can swap to SMS OTP later.

### 4) Optional Personal Email Collection (Post-onboarding)

Add an optional UI step/section (Agent portal) to collect a personal email for recovery/contact:

- Field: `personal_email`
- Validation: valid email format; optional; editable later
- Discord: optional `agent.personal_email_added` (only if you want it)

### 5) Email Provisioning & Access Unlock (After Onboarding)

**Agent**
- After `onboardingComplete=true`, show the company email request UI (already implemented).
- Confirm the default suggestion uses `FirstInitialLast` and allow freeform edits (validated).
- Discord on request: `agent.email_requested` (already implemented).

**Admin**
- Add explicit “Mark Created” action that:
  - sets request status `created`
  - writes status event (audit)
  - sends Discord `agent.email_created`
  - optionally sends `agent.access_granted` when you’re ready to treat that as a separate business state.

**Hybrid CRM hook (no integration yet)**
- When status becomes `created`, include a Discord hint: “Invite this user to CRM using <company_email>”.
- Later, we can implement a CRM invite call behind an env flag + server-only API key.

### 6) Observability / Guardrails

- Keep passwords out of Discord and logs.
- Ensure the existing API response logger redacts `tempPassword` (already present) and extend as needed.
- Add/confirm safe diagnostics endpoints remain safe for production use.

## Affected Files (Expected)

- DB/schema/migrations:
  - [schema.ts](file:///workspace/shared/schema.ts)
  - `migrations/0003_agents_phone_first_identity.sql` (new)
- Backend:
  - [routes.ts](file:///workspace/server/routes.ts)
  - [storage.ts](file:///workspace/server/storage.ts)
- Frontend:
  - [RegisterPage.tsx](file:///workspace/client/src/pages/RegisterPage.tsx)
  - [AgentDashboardPage.tsx](file:///workspace/client/src/pages/AgentDashboardPage.tsx)
  - Agent login page (if separate) under `client/src/pages/`

## Risks

- **Breaking schema**: changing `hr_agents.email` directly is risky; use additive columns + safe backfill first.
- **Login changes**: existing agents currently login by email; switching to phone will require ensuring all existing phones are valid and normalized.
- **Weak auth**: phone+last4 is guessable; acceptable for early onboarding but not for long-term internal access. Plan keeps OTP as an easy upgrade path.
- **Migrations**: Production must apply migrations before the new feature can be used, otherwise `/api/*` can 500 due to strict schema checks.

## Verification Steps

- After applying migrations + env:
  - `/#/register` submits with only name + phone; agent record created.
  - `/#/agent` login works with phone + last4.
  - Completing onboarding unlocks the company email request section.
  - Request posts Discord event `agent.email_requested`.
  - Admin marks request created; Discord `agent.email_created` fires.

