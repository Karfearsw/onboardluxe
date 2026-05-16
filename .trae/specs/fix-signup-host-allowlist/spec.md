# Signup Host Allowlist Fix Spec

## Why
Production signup (`POST /api/agents`) is returning 403 “Signup is disabled on this deployment” on `career.oceanluxe.org`, most likely due to host allowlist parsing/matching issues in `SIGNUP_ALLOWED_HOSTS`.

## What Changes
- Make `SIGNUP_ALLOWED_HOSTS` parsing more forgiving and operator-proof (accept hostnames or full URLs, ignore scheme/path/ports).
- Support subdomain patterns in `SIGNUP_ALLOWED_HOSTS` (e.g. `.oceanluxe.org` or `*.oceanluxe.org`).
- Return an actionable, non-sensitive `actionHint` in the 403 response for `/api/agents` when signup is blocked.
- Improve the Register page error handling to display the server-provided `actionHint` when present.

## Impact
- Affected specs: Public signup gating, onboarding entry flow
- Affected code:
  - `server/routes.ts`
  - `client/src/pages/RegisterPage.tsx`
  - `client/src/lib/queryClient.ts` (only if required to surface structured error payload safely)

## ADDED Requirements

### Requirement: Robust Allowlist Parsing
The system SHALL interpret `SIGNUP_ALLOWED_HOSTS` entries as host allowlist patterns.

#### Scenario: Hostname entry
- **GIVEN** `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org`
- **WHEN** a production request arrives with host `career.oceanluxe.org`
- **THEN** signup SHALL be allowed.

#### Scenario: URL entry
- **GIVEN** `SIGNUP_ALLOWED_HOSTS=https://career.oceanluxe.org`
- **WHEN** a production request arrives with host `career.oceanluxe.org`
- **THEN** signup SHALL be allowed.

#### Scenario: Subdomain wildcard entry
- **GIVEN** `SIGNUP_ALLOWED_HOSTS=.oceanluxe.org` OR `SIGNUP_ALLOWED_HOSTS=*.oceanluxe.org`
- **WHEN** a production request arrives with host `career.oceanluxe.org`
- **THEN** signup SHALL be allowed.

### Requirement: Actionable 403 Response
When signup is blocked, the system SHALL return a 403 response that includes an actionable hint without exposing secrets or cookie values.

#### Scenario: Signup blocked
- **WHEN** `POST /api/agents` is called and signup is not allowed
- **THEN** respond with HTTP 403 and JSON including:
  - `message: "Signup is disabled on this deployment."`
  - `host: <normalized request host>`
  - `actionHint: <non-sensitive string>` that instructs operators to set `SIGNUP_ALLOWED_HOSTS` (or `APP_PUBLIC_SIGNUP=1`) appropriately.

## MODIFIED Requirements

### Requirement: Production Signup Gate
The existing production gate SHALL remain:
- Allow if `NODE_ENV !== "production"`
- Allow if `APP_PUBLIC_SIGNUP=1`
- Otherwise, allow only if request host matches `SIGNUP_ALLOWED_HOSTS` patterns.

## REMOVED Requirements

None.

