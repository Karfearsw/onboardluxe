## Summary

1) Confirm and lock down that **agent signup**, **agent login**, and **admin access** are correctly configured for production (including signup allowlisting and clear operator diagnostics).

2) Add a **post-onboarding** feature: once an agent completes onboarding, they can request an `@oceanluxe.org` mailbox. The system generates a **temporary password**, shows it **once** to the agent, and sends a **Discord notification** with the requested email + request id so ops can provision the mailbox and then invite the agent to CRM.

## Current State Analysis (Repo Truth)

### Roles & access today
- **Agent signup**: `/#/register` → `POST /api/agents` ([RegisterPage.tsx](file:///workspace/client/src/pages/RegisterPage.tsx), [routes.ts](file:///workspace/server/routes.ts#L284-L329)).
  - Production gate: allowed only if `APP_PUBLIC_SIGNUP=1` OR host matches `SIGNUP_ALLOWED_HOSTS` ([routes.ts](file:///workspace/server/routes.ts#L30-L41)).
- **Agent login**: `/#/agent` uses `POST /api/agent/login` with `{ email, phoneLast4 }` and sets HttpOnly `ol_agent_session` ([routes.ts](file:///workspace/server/routes.ts#L233-L252), [agent-auth.ts](file:///workspace/server/agent-auth.ts)).
- **Admin access**: `/#/admin` uses shared auth (`AUTH_MODE=express_session` + CRM cookie) and fallback HR access code cookie (`ol_hr_admin`) ([auth.ts](file:///workspace/server/auth.ts), [routes.ts](file:///workspace/server/routes.ts#L212-L231)).

### Training / completion triggers
- Training module completion is recorded via `POST /api/agents/:id/training/:moduleKey/complete`, and full onboarding completion is marked when **all tasks** are complete ([routes.ts](file:///workspace/server/routes.ts#L695-L729)).

### Discord notifications
- Discord webhook sending exists via `sendDiscordWebhook(event, payload)` and is optional via `DISCORD_WEBHOOK_URL` ([discord.ts](file:///workspace/server/discord.ts)).

## Goal & Success Criteria

### Signup / access readiness
- `POST /api/agents` succeeds on `career.oceanluxe.org` when production should allow signup (host allowlist is correctly matched).
- `/#/agent` login works (email + last4) and session persists via `ol_agent_session`.
- `/#/admin` works via CRM cookie SSO or HR access-code fallback.

### New email provisioning request feature
- After `onboardingComplete=true`, agent sees a “Create your OceanLuxe email” section in the portal and can submit a request.
- Default email handle suggestion uses **FirstInitialLast** (e.g., `bjelleh@oceanluxe.org`), while allowing optional freeform edits (validated).
- On submission:
  - The system generates a **temporary password**, displays it **once** to the agent, and never sends it to Discord.
  - The system stores an encrypted form of the temp password server-side and allows **admin one-time reveal**.
  - A Discord notification is sent containing `requestedEmail`, `agentId`, and `requestId`.
- Admin can view pending requests, reveal the temp password once (for mailbox provisioning), mark request “created”, and optionally add notes.

## Assumptions & Decisions

- Trigger: **After full onboarding** (your selection).
- Password handling: **Temporary password** is generated and must not be sent to Discord; admins can retrieve it via a protected admin endpoint (your selection).
- Handle format: **FirstInitialLast** default; freeform optional with validation (your selection).
- Actual mailbox creation remains **manual** by ops (via Google Workspace / M365 / etc.); this feature only collects + notifies + audits.

## Proposed Changes

### 1) Environment Variables / Deployment Readiness (No code changes unless missing)

**Production (career.oceanluxe.org):**
- Ensure signup is enabled only where intended:
  - Set `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org` (or `.oceanluxe.org` if you want any subdomain)
  - Keep `APP_PUBLIC_SIGNUP=0` unless you explicitly want public signup from anywhere

**New server-only secret (Production + Preview):**
- Add `EMAIL_PROVISIONING_SECRET` (sensitive) used to encrypt the temporary password at rest.

### 2) Database: email request table + migration

**Add new table** `hr_email_requests` (Drizzle schema + SQL migration).

Suggested columns:
- `id` (serial pk)
- `agent_id` (int, indexed)
- `requested_email` (text, unique or unique per agent depending on desired behavior)
- `status` (text: `requested` | `created` | `rejected`)
- `temp_password_ciphertext` (text)
- `temp_password_created_at` (text)
- `temp_password_revealed_at` (text, default empty)
- `created_at` (text)
- `updated_at` (text)
- `notes` (text)

### 3) Server: request + admin management endpoints

**Agent endpoint (requires agent session or admin):**
- `POST /api/agents/:id/ocean-email-request`
  - Preconditions:
    - agent exists
    - `onboardingComplete=true`
    - request not already “created” (idempotency rules)
  - Body:
    - `localPart` (string) OR optional `requestedEmail` (string)
  - Server does:
    - Normalize to lowercase, validate allowed characters
    - Compose `requestedEmail = <localPart>@oceanluxe.org`
    - Generate temp password
    - Encrypt temp password with `EMAIL_PROVISIONING_SECRET`
    - Insert row in `hr_email_requests`
    - Discord: `agent.email_requested` with `{ agentId, requestedEmail, requestId }`
  - Response:
    - `requestedEmail`
    - `tempPassword` (returned once to agent; not logged; not stored in plaintext)

**Admin endpoints (requireSharedAdmin):**
- `GET /api/admin/email-requests` list pending/recent
- `POST /api/admin/email-requests/:id/reveal-temp-password`
  - Returns decrypted temp password **only if** not already revealed and not expired (e.g., 24h)
  - Sets `temp_password_revealed_at`
- `PATCH /api/admin/email-requests/:id` to set status `created|rejected` + notes

### 4) Client: portal UI after onboarding complete

**Agent dashboard**
- Show “OceanLuxe Email” section when onboarding complete:
  - Prefill suggestion from agent’s name (first initial + last)
  - Allow edit (freeform optional) but validate
  - Submit button → calls request endpoint and then shows:
    - Requested email
    - Temp password (copy-to-clipboard UI)
    - “Save this password now; it will not be shown again.”

**Admin page**
- Add a simple “Email Requests” panel:
  - List pending requests
  - “Reveal temp password” (one-time)
  - “Mark created” / “Reject”
  - Notes

### 5) Security & logging constraints

- Never send passwords to Discord.
- Never log temp passwords in request logs (`app.ts` currently logs JSON bodies for `/api` responses; we must ensure the email request response does not get logged with temp password).
  - Change needed: for `POST /api/agents/:id/ocean-email-request`, avoid returning temp password in a way that hits the global JSON response logger, or adjust the logger to redact it for this route.

## Risks

- **Sensitive data exposure via JSON response logging**: current API logger captures full JSON response bodies; returning a temp password without redaction is unsafe.
- **Replay / repeated reveals**: admin reveal endpoint must enforce one-time reveal + expiration.
- **Naming collisions**: two agents may request the same local-part; need deterministic conflict handling and clear UI error.

## Implementation Steps (Executor)

1) Add DB schema + migration for `hr_email_requests`.
2) Add server crypto helpers for password generation + encryption/decryption with `EMAIL_PROVISIONING_SECRET`.
3) Add agent request endpoint + Discord notification.
4) Add admin list/reveal/update endpoints (all behind `requireSharedAdmin`).
5) Update the API logger in [app.ts](file:///workspace/server/app.ts) to redact `tempPassword` (or disable body capture for this route).
6) Update Agent dashboard UI to show the new feature post-onboarding.
7) Update Admin UI to manage requests (list + one-time reveal + status changes).

## Verification Steps

- `npm run check`
- `npm run build`
- Manual happy paths:
  - Complete onboarding, request email, verify Discord message includes request id + requested email
  - Confirm temp password shown once to agent
  - Confirm admin can reveal temp password once and then it cannot be revealed again
  - Confirm `POST /api/agents/:id/ocean-email-request` is blocked when onboarding not complete
- Security checks:
  - Confirm temp password never appears in server logs and is not sent to Discord

