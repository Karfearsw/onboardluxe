# Tasks

- [x] Task 1: Implement robust host allowlist matching for signup
  - [x] Update `server/routes.ts` to parse `SIGNUP_ALLOWED_HOSTS` entries as either hostnames or URLs (ignore scheme/path/ports)
  - [x] Add support for `.root-domain` and `*.root-domain` wildcard patterns
  - [x] Add unit-level helper functions (pure functions) to normalize hosts and match patterns

- [x] Task 2: Add actionable 403 payload for blocked signup
  - [x] Update `POST /api/agents` 403 response to include `actionHint` (non-sensitive)
  - [x] Ensure response does not include secrets, raw cookies, or session IDs

- [x] Task 3: Improve Register page error UX
  - [x] Update `client/src/pages/RegisterPage.tsx` to display `actionHint` when present in the API error payload
  - [x] Keep wording premium and operator/action oriented

- [x] Task 4: Verification
  - [x] `npm run check`
  - [x] `npm run build`
  - [x] Manual: With production-like env (`NODE_ENV=production`, `APP_PUBLIC_SIGNUP=0`) validate:
    - `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org` allows signup
    - `SIGNUP_ALLOWED_HOSTS=https://career.oceanluxe.org` allows signup
    - `SIGNUP_ALLOWED_HOSTS=.oceanluxe.org` allows signup
    - No allowlist returns 403 with `actionHint`

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Tasks 1–3
