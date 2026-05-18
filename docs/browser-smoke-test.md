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

## Re-test (after deploy)

- After pushing `APP_PUBLIC_SIGNUP` boolean parsing, `POST /api/agents` still returned `403` on `career.oceanluxe.org`.
- Next step is to ensure the Vercel project has either `APP_PUBLIC_SIGNUP=true` (or `1`) set and redeployed, or `SIGNUP_ALLOWED_HOSTS` set to include `career.oceanluxe.org`.

## Notes / follow-ups

- To allow registration in production:
  - Set `APP_PUBLIC_SIGNUP=1` (or `true`) to allow signup everywhere, or
  - Set `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org` (or `.oceanluxe.org` / `*.oceanluxe.org`) to allow only approved domains.
