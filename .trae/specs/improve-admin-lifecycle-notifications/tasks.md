# Tasks

- [x] Task 1: Define lifecycle event contract
  - [x] Confirm canonical event type strings and required metadata keys per event
  - [x] Confirm payload redaction rules for Discord (no secrets, minimize PII)

- [x] Task 2: Add admin APIs for lifecycle events
  - [x] Add `GET /api/admin/events?limit=...` (admin-only) for recent global events
  - [x] Add `GET /api/admin/agents/:id/events?limit=...` (admin-only) for per-agent timeline
  - [x] Ensure pagination/limits are safe (default + max cap)

- [x] Task 3: Ensure event coverage at lifecycle transitions
  - [x] Ensure agent creation always logs `agent.created`
  - [x] Ensure onboarding task completion logs `onboarding.task_completed`
  - [x] Ensure onboarding completion logs `onboarding.completed`
  - [x] Ensure training module completion logs `training.module_completed`
  - [x] Ensure training completion logs `training.completed`
  - [x] Ensure subscription changes log `subscription.status_changed`
  - [x] Ensure pipeline stage changes log `crm.pipeline_stage_changed`
  - [x] Ensure email request status changes log `agent.email_requested` and `agent.email_created`

- [x] Task 4: Send Discord notifications for lifecycle events
  - [x] Implement a single event→Discord mapper with strict redaction rules
  - [x] Add retry-safe behavior (best-effort; never block API response on webhook failure)

- [x] Task 5: Admin UI updates
  - [x] Add an “Activity” panel (global recent events)
  - [x] Add a per-agent “Timeline” panel
  - [x] Add “Current Stage” label derived from lifecycle state

- [x] Task 6: Verification + ship
  - [x] `npm run check`
  - [x] `npm run build`
  - [x] Manual verification in browser:
    - [x] Admin loads agents and shows connectivity snapshot
    - [x] Creating an agent produces `agent.created` in Admin feed
    - [x] Completing one onboarding task produces `onboarding.task_completed`
    - [x] Completing all onboarding produces `onboarding.completed`
    - [x] Completing a training module produces `training.module_completed`
    - [x] Completing training produces `training.completed`
    - [x] Requesting email produces `agent.email_requested`
    - [x] Marking email created produces `agent.email_created`
  - [ ] Commit and push to `main`

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1 and Task 3
- Task 5 depends on Task 2
- Task 6 depends on Tasks 2–5
