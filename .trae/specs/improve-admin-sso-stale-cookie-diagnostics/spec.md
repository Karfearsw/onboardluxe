# Admin SSO Stale Cookie Diagnostics Spec

## Why
After rotating/synchronizing `SESSION_SECRET` between CRM and Onboardluxe, existing `connect.sid` cookies become stale and SSO appears “broken” until the user re-authenticates in CRM. This should be explicit and self-serve inside the HR Admin UI and diagnostics.

## What Changes
- Add a first-class “stale cookie / re-login required” signal to the safe diagnostics endpoint used by the Admin UI.
- Improve the Admin page’s unauthenticated state to guide the operator to refresh their CRM session cookie.
- Ensure the system never requests or handles user passwords; login must be performed by the user.
- Keep debug endpoints gated; do not increase production debug surface.

## Impact
- Affected specs: Admin authentication, operator diagnostics, incident recovery UX
- Affected code:
  - `server/auth.ts`
  - `server/routes.ts`
  - `client/src/pages/AdminPage.tsx`

## ADDED Requirements

### Requirement: Stale Cookie Hint
The system SHALL detect the “stale CRM cookie after secret rotation” condition and provide an explicit hint in safe diagnostics responses.

#### Scenario: Stale cookie detected
- **GIVEN** `AUTH_MODE=express_session`
- **AND** a session cookie is present (`hasSessionCookie: true`)
- **AND** `SESSION_SECRET` is configured (`secretSet: true`)
- **WHEN** cookie signature validation fails (`signatureValid: false`)
- **THEN** diagnostics SHALL include a boolean `staleCookieLikely: true`
- **AND** diagnostics SHALL include a non-sensitive `actionHint` string instructing the user to log out/in to CRM (or clear cookies) to mint a new `connect.sid`.

#### Scenario: Not stale (missing cookie)
- **GIVEN** `AUTH_MODE=express_session`
- **WHEN** no session cookie is present
- **THEN** diagnostics SHALL include `staleCookieLikely: false` and `actionHint` describing that the CRM cookie is not present on this domain.

### Requirement: Admin UI Recovery UX
The Admin page SHALL display a clear recovery CTA when it detects stale cookie conditions via diagnostics.

#### Scenario: Signature invalid
- **WHEN** Admin UI loads and user is unauthenticated
- **AND** diagnostics indicate `staleCookieLikely: true`
- **THEN** the UI SHALL show a concise message: “Your CRM session cookie was signed with an older secret. Re-login to CRM to refresh it.”
- **AND** provide a button/link to open CRM login in a new tab (URL is configurable via env or defaults to the known CRM domain).

### Requirement: No Password Handling
The system SHALL NOT ask for, store, log, or transmit user passwords.

#### Scenario: Operator assistance
- **WHEN** the operator requests that the system “log in for them”
- **THEN** the system SHALL instruct the operator to complete login themselves (or use browser automation that requires user interaction), without requesting credentials.

## MODIFIED Requirements

### Requirement: Safe Diagnostics Payload
The existing `GET /api/admin/auth/diagnostics` response SHALL remain safe for production use (no secrets, no raw cookie values), while including the new stale-cookie hint fields.

## REMOVED Requirements

None.

