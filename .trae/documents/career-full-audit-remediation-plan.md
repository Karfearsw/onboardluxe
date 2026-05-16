## Summary

Fix Admin SSO for `career.oceanluxe.org` by aligning `SESSION_SECRET` with the CRM’s `express-session` secret, validate via existing diagnostics endpoints/UI, and keep production-safe observability (`/api/healthz`) while minimizing debug surface area.

## Current State Analysis (Repo Truth)

- Admin auth is cookie + session-store based when `AUTH_MODE=express_session` ([auth.ts](file:///workspace/server/auth.ts#L84-L456)).
- The system already supports verifying signed `connect.sid` cookies and will reject cookies when the signature does not match the configured secret ([auth.ts](file:///workspace/server/auth.ts#L107-L127), [auth.ts](file:///workspace/server/auth.ts#L442-L454)).
- `SESSION_SECRET` supports comma-separated values (secret rotation), but per your decision we will use a single secret that matches CRM exactly ([auth.ts](file:///workspace/server/auth.ts#L107-L112)).
- Safe diagnostics are always available at `GET /api/admin/auth/diagnostics` and return whether cookie is present and whether signature is valid (no secrets returned) ([routes.ts](file:///workspace/server/routes.ts#L191-L210)).
- Deeper debug endpoints (`GET /api/debug/auth`, `GET /api/health`, `POST /api/debug/discord`) are gated by `DEBUG_ENDPOINTS` and/or non-production ([routes.ts](file:///workspace/server/routes.ts#L149-L189)).
- Uptime/DB liveness endpoint `GET /api/healthz` is always on and returns `{ ok: true, dbOk: boolean }` ([routes.ts](file:///workspace/server/routes.ts#L140-L147)).
- In strict runtimes (Vercel Preview/Production), the server ensures DB schema readiness before auth middleware runs, preventing early 500s from missing tables ([app.ts](file:///workspace/server/app.ts#L28-L46)).

## Goal & Success Criteria

- Admin SSO works: visiting `https://career.oceanluxe.org/#/admin` shows an authenticated admin experience (no “Admin Sign-In Required” loop).
- `GET /api/admin/auth/diagnostics` returns:
  - `hasSessionCookie: true`
  - `authMode: "express_session"`
  - `expressSession.signatureValid: true`
  - `expressSession.effectiveSidPresent: true`
  - `hasAuthUser: true` (or at minimum, session row/userId found and allowed role)
- Health check works: `GET /api/healthz` returns `{ ok: true, dbOk: true }` in the target deployment.

## Proposed Changes

### 1) Vercel Environment Variables (Production + Preview)

**Set / verify:**
- `AUTH_MODE=express_session`
- `AUTH_COOKIE_NAMES=connect.sid` (can be comma-separated if needed; defaults include `connect.sid`)
- `AUTH_ALLOWED_ROLES=admin,owner,super_admin,hr_admin,ops_manager,manager`
- `SESSION_SECRET=<EXACT_CRM_SESSION_SECRET>` (byte-for-byte match; single value per your decision)
- `SESSION_TABLE=session` (default for connect-pg-simple unless CRM uses a different table)
- `DATABASE_URL=<Neon Postgres URL>` (or `POSTGRES_URL` / `NEON_DATABASE_URL`, but only one is needed)

**Temporarily enable for validation window:**
- `DEBUG_ENDPOINTS=1` (Production)  
  After validation, revert to unset or `0` to reduce surface area.

**Keep Preview safe:**
- `AUTO_APPLY_MIGRATIONS=1` (Preview)
- Do not set cookie domains in Preview:
  - leave `HR_ADMIN_COOKIE_DOMAIN` unset
  - leave `AGENT_SESSION_COOKIE_DOMAIN` unset

### 2) No-Code Operational Fix (Primary Root Cause)

- Align `SESSION_SECRET` in the HR app with the CRM’s `express-session` secret value.
- Trigger a redeploy so serverless functions pick up the new env var.

### 3) Optional Fallback (If Cookie Not Present)

If the CRM cookie is not present on `career.oceanluxe.org` (cross-site/cookie flags/domain issues), enable HR fallback admin login:
- Set both:
  - `HR_ADMIN_ACCESS_CODE`
  - `HR_ADMIN_TOKEN_SECRET`
- Confirm `GET /api/admin/auth/diagnostics` shows `hrAdmin.enabled: true`.

## Risks & Mitigations

- **Risk: DEBUG endpoints in Production.** Debug endpoints can reveal operational details (though not secrets).  
  **Mitigation:** enable only during validation; keep `/api/admin/auth/diagnostics` as the long-term safe tool and disable `DEBUG_ENDPOINTS` afterward.
- **Risk: Session table/schema mismatch.** If CRM’s session store table/columns differ from defaults, auth will fail even with the correct secret.  
  **Mitigation:** verify CRM session store configuration (table + sid/sess/expire columns) and set `SESSION_TABLE`, `SESSION_SID_COLUMN`, `SESSION_JSON_COLUMN`, `SESSION_EXPIRES_COLUMN` accordingly.
- **Risk: Cookie domain / SameSite / Secure flags prevent the cookie from reaching HR.**  
  **Mitigation:** confirm CRM cookie domain is `.oceanluxe.org` (or otherwise shared), and that it’s not scoped to `deals.oceanluxe.org` only. Use diagnostics to confirm cookie presence.

## Verification Steps (Executor Checklist)

1. Deploy env updates on Vercel (Production and/or Preview as planned).
2. Confirm from a logged-in CRM browser session:
   - Visit `https://career.oceanluxe.org/#/admin`.
   - Open `https://career.oceanluxe.org/api/admin/auth/diagnostics` and confirm:
     - `matchedCookieName` is `connect.sid`
     - `expressSession.signatureValid: true`
     - `hasAuthUser: true` and role is allowed
3. Check health:
   - `https://career.oceanluxe.org/api/healthz` returns `{ ok: true, dbOk: true }`
4. If (and only if) diagnostics still fail:
   - Use `https://career.oceanluxe.org/api/debug/auth` (because `DEBUG_ENDPOINTS=1`) and confirm:
     - `sessionRowFound: true`
     - `userIdFound` exists
   - If `sessionRowFound: false`, update `SESSION_TABLE`/columns to match CRM session store.
5. Disable debug:
   - Set `DEBUG_ENDPOINTS=0` (or unset) and redeploy.

## Implementation Notes (Already in Code)

- Secret rotation support exists (comma-separated `SESSION_SECRET`), but we will not use it for this remediation unless you later decide to rotate ([auth.ts](file:///workspace/server/auth.ts#L107-L112)).
- `GET /api/healthz` is already implemented and should be used for uptime monitoring ([routes.ts](file:///workspace/server/routes.ts#L140-L147)).

