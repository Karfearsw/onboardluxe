# Tasks

- [x] Task 1: Add stale-cookie hint fields to diagnostics
  - [x] Update `server/auth.ts` to compute `staleCookieLikely` + `actionHint` for express-session mode when `signatureValid` is false but `secretSet` is true
  - [x] Ensure no secrets or raw cookie values are added to the response

- [x] Task 2: Surface hint in safe diagnostics endpoint
  - [x] Update `server/routes.ts` `GET /api/admin/auth/diagnostics` to include the new fields (either top-level or within `diagnostics`)

- [x] Task 3: Improve Admin unauthenticated UX
  - [x] Update `client/src/pages/AdminPage.tsx` unauthenticated state to show the stale-cookie message when diagnostics indicates `staleCookieLikely: true`
  - [x] Add a “Open CRM Login” link/button (non-sensitive, no embedded credentials)

- [x] Task 4: Verification
  - [x] `npm run check`
  - [x] `npm run build`
  - [x] Manual: verify `GET /api/admin/auth/diagnostics` shows stale-cookie hint when signature is invalid

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Tasks 1–3
