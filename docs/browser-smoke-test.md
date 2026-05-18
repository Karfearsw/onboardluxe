# Browser smoke test log (career.oceanluxe.org)

Date: 2026-05-17

## Scope

- Public marketing landing page
- Agent registration page
- Admin sign-in page (unauthenticated)
- API smoke checks via in-page fetch

## Results

- Landing page loaded with no console errors.
- Register page loaded with no console errors.
- Register submit returned `403` from `POST /api/agents`:
  - `message`: "Signup is disabled on this deployment."
  - `host`: "career.oceanluxe.org"
  - `actionHint`: "Open signup on an approved Ocean Luxe domain (e.g. https://career.oceanluxe.org) or ask an admin to add this host to the signup allowlist for this deployment."
- `/api/healthz` returned `200` with `{ "ok": true, "dbOk": true }`.
- `/api/admin/auth/diagnostics` returned `200` with `dbOk: true` and `authUser: null` (expected when logged out).

## Notes / follow-ups

- To allow registration in production:
  - Set `APP_PUBLIC_SIGNUP=1` (or `true`) to allow signup everywhere, or
  - Set `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org` (or `.oceanluxe.org` / `*.oceanluxe.org`) to allow only approved domains.
