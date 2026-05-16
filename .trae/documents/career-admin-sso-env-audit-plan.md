# Plan: Fix Admin SSO (`career.oceanluxe.org`) + Harden Env/Health Diagnostics

## Summary
- Resolve the Admin SSO failure on `/#/admin` caused by `SESSION_SECRET` verification failing for `connect.sid`.
- Make session verification robust to secret rotation (multiple secrets).
- Provide an always-available, safe health endpoint for monitoring without enabling debug endpoints in production.
- Keep Preview/Production env parity and avoid insecure debug exposure.

## Current State Analysis (Grounded)

### How Admin SSO Works
- HR app runs with `AUTH_MODE=express_session` and reads a CRM session cookie (`connect.sid`) as configured by `AUTH_COOKIE_NAMES` ([README.md](file:///workspace/README.md#L84-L95)).
- For signed cookies (`s:...`), HR verifies the cookie signature using `SESSION_SECRET` in [unsignExpressSessionCookie](file:///workspace/server/auth.ts#L107-L120).
- If the signature fails, HR treats the request as unauthenticated and `/api/admin/me` returns 401, causing the Admin UI to render “Admin Sign-In Required” ([AdminPage.tsx](file:///workspace/client/src/pages/AdminPage.tsx#L371-L507)).

### Why Your Diagnostics Show `signatureValid: false`
- The diagnostics you posted indicate:
  - cookie is present (`matchedCookieName: connect.sid`)
  - cookie is signed (`signedCookie: true`)
  - secret is set (`secretSet: true`)
  - signature does not validate (`signatureValid: false`)
- With the current implementation, that happens when:
  1) `SESSION_SECRET` does not match the CRM’s `express-session` signing secret byte-for-byte, OR
  2) the CRM is using secret rotation (multiple secrets) and HR only tries one.

### Health Endpoint Behavior
- `/api/health` exists only when debug endpoints are enabled (`DEBUG_ENDPOINTS=1` or `NODE_ENV !== production`) in [routes.ts](file:///workspace/server/routes.ts#L14-L15) and [routes.ts](file:///workspace/server/routes.ts#L140-L149).
- In production, `/api/health` is intentionally unavailable unless `DEBUG_ENDPOINTS=1`.

### Notes on Your Env Inventory
- Variables like `VA_ROLE_CODE`, `AGENT_ROLE_CODE`, `TEAM_LEAD_ROLE_CODE`, `ADMIN_ROLE_CODE`, `VITE_APP_VARIANT` were not found in this codebase (repo grep returned no matches). They are likely for other apps/variants; leaving them set here has no effect.

## Proposed Changes

### 1) Fix SSO by aligning `SESSION_SECRET` with CRM (deployment change)
**Where:** Vercel environment variables for `career.oceanluxe.org` project.
- Set `SESSION_SECRET` to the exact value used by the CRM (`express-session` secret).
- Keep `AUTH_MODE=express_session`, `AUTH_COOKIE_NAMES=connect.sid`, `AUTH_ALLOWED_ROLES=admin,owner,super_admin,hr_admin,ops_manager,manager`.
- Verify by reloading `/#/admin` and checking that `/api/admin/me` returns the authenticated user.

### 2) Support secret rotation for `express-session` cookies (code change)
**Files:**
- [server/auth.ts](file:///workspace/server/auth.ts)

**What to change:**
- Allow `SESSION_SECRET` to be a comma-separated list of secrets (common pattern during rotation), trying each secret until signature validation passes.
- Continue to treat a missing/invalid signature as unauthenticated (no behavior change except improved compatibility).

**Why:**
- Prevents future outages when CRM rotates secrets.
- Keeps HR and CRM deploys decoupled (HR can accept both old+new during rotation window).

### 3) Add an always-available health endpoint for monitoring (safe, minimal)
**Files:**
- [server/routes.ts](file:///workspace/server/routes.ts)

**What to add:**
- `GET /api/healthz` (always enabled):
  - Returns `{ ok: true, dbOk: boolean }` where `dbOk` is based on a simple `select 1`.
  - Does not return cookie names, roles, or any secret-adjacent diagnostics.

**Keep as-is:**
- `/api/debug/auth` and `/api/health` remain behind `DEBUG_ENDPOINTS=1` to avoid exposing extra diagnostics in production.

### 4) SSL warning mitigation (docs-only)
**Files:**
- [.env.example](file:///workspace/.env.example)
- [docs/unified-neon-strategy.md](file:///workspace/docs/unified-neon-strategy.md)

**What to document:**
- Recommend `uselibpqcompat=true&sslmode=require` (or `sslmode=verify-full`) to remove the upcoming `pg` semantics ambiguity and reduce noisy warnings.

## Assumptions & Decisions
- Production migrations are applied via CI (“CI migrate”), not via runtime auto-migrate.
- `DEBUG_ENDPOINTS` stays off in production except for short, deliberate debugging windows.
- The intended SSO cookie name remains `connect.sid`.

## Verification Steps
1. **SSO verification**
   - Log into CRM, then open `https://career.oceanluxe.org/#/admin`.
   - Confirm Admin panel loads (not “Admin Sign-In Required”).
   - Call `/api/admin/auth/diagnostics` and verify:
     - `matchedCookieName: connect.sid`
     - `signatureValid: true`
     - `hasAuthUser: true`
2. **Secret rotation verification (if implemented)**
   - Configure `SESSION_SECRET=oldSecret,newSecret` temporarily and confirm signed cookie validates with either.
3. **Health endpoint verification**
   - `GET /api/healthz` returns 200 with `{ ok: true, dbOk: true|false }`.
4. **Build verification**
   - `npm run check`
   - `npm run build`

