# Admin Lifecycle Monitoring & Notifications Spec

## Why
Ops needs a reliable, single place to confirm the Admin side is connected and to see every agent’s lifecycle stage and key events (signup → onboarding → training → email provisioning → activation).

## What Changes
- Add an Admin “System & Lifecycle” view that surfaces:
  - system connectivity signals (DB ok, auth mode/session presence)
  - a global activity feed of agent lifecycle events
  - per-agent lifecycle timeline (latest events + current stage)
- Ensure key lifecycle transitions reliably create status events in the database.
- Send Discord webhooks for lifecycle events with safe, minimal payloads (no secrets; minimize PII).

## Impact
- Affected specs: admin UX, ops monitoring, agent lifecycle tracking, Discord notifications
- Affected code:
  - Server: `server/routes.ts`, `server/status-events.ts`, `server/storage.ts`, `server/discord.ts`, `shared/status.ts`
  - Client: `client/src/pages/AdminPage.tsx` (and/or a dedicated Admin lifecycle page)
  - DB: uses existing `hr_status_events` (no destructive schema changes)

## ADDED Requirements

### Requirement: Admin Connectivity Snapshot
The system SHALL provide an admin-accessible endpoint that returns a summarized connectivity snapshot for:
- DB reachability
- auth mode
- whether an admin session cookie is present
- whether an authenticated admin user is present

#### Scenario: Logged out admin checks connectivity
- **WHEN** an unauthenticated user visits Admin and requests connectivity snapshot
- **THEN** the UI shows “connected” vs “not connected” states without leaking secrets or cookies

### Requirement: Global Lifecycle Activity Feed (Admin)
The system SHALL provide an admin-only API to list recent lifecycle status events across all agents, ordered newest-first.

#### Scenario: Admin reviews latest agent activity
- **WHEN** an authenticated admin opens the Admin lifecycle activity feed
- **THEN** the UI shows the latest events with timestamp, agent reference, event type, and a short human-readable summary

### Requirement: Per-Agent Timeline (Admin)
The system SHALL provide an admin-only view of a single agent’s recent lifecycle events.

#### Scenario: Admin audits a single agent
- **WHEN** an authenticated admin selects an agent in Admin
- **THEN** the UI shows a timeline of that agent’s most recent lifecycle events

### Requirement: Lifecycle Event Coverage
The system SHALL log lifecycle events for the following transitions (minimum set):
- `agent.created`
- `onboarding.task_completed` (include `taskKey`)
- `onboarding.completed`
- `training.module_completed` (include `moduleKey`)
- `training.completed`
- `agent.email_requested`
- `agent.email_created`
- `subscription.status_changed`
- `crm.pipeline_stage_changed`

#### Scenario: Agent completes onboarding
- **WHEN** onboarding moves into a completed state
- **THEN** an `onboarding.completed` event is stored and appears in the Admin feed and timeline

### Requirement: Discord Webhook Notifications (Ops)
The system SHALL send a Discord webhook for each lifecycle event type listed above.

#### Payload constraints
- MUST NOT include secrets, passwords, session tokens, raw cookies, or encrypted secrets
- SHOULD minimize PII:
  - allow agent id and name
  - allow phone as last4 only (or omit entirely)
  - allow email only when it is the Ocean Luxe company email (or omit)

#### Scenario: Agent email is created
- **WHEN** an admin marks an email request as created (or the system transitions an email request to `created`)
- **THEN** a `agent.email_created` webhook is sent with a safe payload and the event appears in Admin

## MODIFIED Requirements

### Requirement: Admin Agent Status View
The Admin view SHALL display a single “Current Stage” label derived from existing fields (`crmPipelineStage`, onboarding percent/complete, training completion, email provisioning status) and SHALL keep it consistent with the event feed.

## REMOVED Requirements
None.

