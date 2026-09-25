# Schedule reminder inbox cutover prerequisites

This change removes the actor-wide `reminderPlans` scan from inbox business refresh. Inbox GET and typed-delivery materialization no longer enumerate reminder plans or act as migration/horizon-maintenance paths; the request refresh still handles its separate business-card, appointment, and integration sources. Canonical reminder inbox rows come from the explicit backfill and durable projection worker. No automatic full-scan fallback remains.

## Required before deploying the read-path removal

1. Deploy the transactional writer and maintenance-worker version with `ORBIT_CANONICAL_INBOX_PROJECTION=1` in every web and worker environment. Keep it enabled after cutover. The flag currently controls:
   - schedule mutation enqueue/window writes in `features/personal-schedule/service-factory.ts`;
   - reminder-plan producer wiring in `features/notifications/reminder-plan-service-factory.ts`;
   - inbox snooze/reschedule enqueue wiring in `features/notifications/inbox-record-service-factory.ts`;
   - canonical reminder wake enqueue wiring in `features/notifications/canonical-reminder-wake.ts`;
   - both due schedule-window maintenance and inbox projection in `features/notifications/configured-canonical-reminder-maintenance.ts`.

   `canonical_reminder_dispatch` is registered by `features/operations/maintenance/configured-tasks.ts`. If the flag is off, new schedule changes do not maintain the canonical work/window path and the window worker is disabled; the read-path removal is not safe to deploy independently of that configuration.

2. For every owner in the workspace, choose and record one cutoff. Run the existing `runScheduleReminderWindowBootstrapPass` (`scheduleWindowBackfill`) and `runCanonicalInboxBackfillPass` (`notificationProjectionBackfill`) with writers ready, resuming each durable checkpoint until `progress.done === true`. Keep the cutoff and batch IDs fixed while resuming. These passes are explicit migrations and must not be run from a request.

   The schedule bootstrap registers old recurring series but deliberately does not claim their future horizon is generated. The canonical reminder backfill covers reminder-plan rows that existed at its cutoff and records the historical Push fence while enqueueing projection work.

3. Run the registered `canonical_reminder_dispatch` maintenance task with the projection flag enabled so registered due windows generate their current future horizon and due canonical inbox work is projected. Resolve failed/dead-lettered window or projection work before treating the actor as migrated. Future projection work whose `available_at` is its reminder time is expected to remain pending until due.

4. Only then deploy the version without the GET/materialize schedule scan. Keep the same writer and maintenance flag enabled continuously; subsequent schedule mutations and due-window refreshes rely on them.

No cloud database migration, production backfill, Push send, or deployment was run as part of the local change.

## Local regression evidence

The localhost-only PostgreSQL regression creates legacy recurring schedule facts and scheduled-due, scheduled-future, failed, delivered, and cancelled reminder plans with the projection flag off; it records pre-existing `read`/`ignored` interactions. It then runs both existing resumable backfills, enables the real configured schedule and reminder-plan writers, and executes the registered maintenance task. It verifies that due valid legacy states project, future plans wait until `available_at`, cancelled plans do not project, interaction state maps to read/dismissed, and a real reschedule revision reprojects without clearing a user's read/dismissed state. The same worker also creates a reminder beyond the original 90-day horizon and projects it when due. Finally, HTTP inbox GET and typed materialization assert no actor-wide `reminderPlans` read; exact source-authority reads and their existing schedule scope checks remain.

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_cutover_test_20260917 \
  node --import tsx --test --test-concurrency=1 tests/services/schedule-reminder-refresh-cutover-postgres.test.ts
```
