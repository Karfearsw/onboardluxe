# Tasks

- [ ] Task 1: Define lifecycle event contract
  - [ ] Confirm canonical event type strings and required metadata keys per event
  - [ ] Confirm payload redaction rules for Discord (no secrets, minimize PII)

- [ ] Task 2: Add admin APIs for lifecycle events
  - [ ] Add `GET /api/admin/events?limit=...` (admin-only) for recent global events
  - [ ] Add `GET /api/admin/agents/:id/events?limit=...` (admin-only) for per-agent timeline
  - [ ] Ensure pagination/limits are safe (default + max cap)

- [ ] Task 3: Ensure event coverage at lifecycle transitions
  - [ ] Ensure agent creation always logs `agent.created`
  - [ ] Ensure onboarding task completion logs `onboarding.task_completed`
  - [ ] Ensure onboarding completion logs `onboarding.completed`
  - [ ] Ensure training module completion logs `training.module_completed`
  - [ ] Ensure training completion logs `training.completed`
  - [ ] Ensure subscription changes log `subscription.status_changed`
  - [ ] Ensure pipeline stage changes log `crm.pipeline_stage_changed`
  - [ ] Ensure email request status changes log `agent.email_requested` and `agent.email_created`

- [ ] Task 4: Send Discord notifications for lifecycle events
  - [ ] Implement a single event→Discord mapper with strict redaction rules
  - [ ] Add retry-safe behavior (best-effort; never block API response on webhook failure)

- [ ] Task 5: Admin UI updates
  - [ ] Add an “Activity” panel (global recent events)
  - [ ] Add a per-agent “Timeline” panel
  - [ ] Add “Current Stage” label derived from lifecycle state

- [ ] Task 6: Verification + ship
  - [ ] `npm run check`
  - [ ] `npm run build`
  - [ ] Manual verification in browser:
    - [ ] Admin loads agents and shows connectivity snapshot
    - [ ] Creating an agent produces `agent.created` in Admin feed
    - [ ] Completing one onboarding task produces `onboarding.task_completed`
    - [ ] Completing all onboarding produces `onboarding.completed`
    - [ ] Completing a training module produces `training.module_completed`
    - [ ] Completing training produces `training.completed`
    - [ ] Requesting email produces `agent.email_requested`
    - [ ] Marking email created produces `agent.email_created`
  - [ ] Commit and push to `main`

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1 and Task 3
- Task 5 depends on Task 2
- Task 6 depends on Tasks 2–5

