# Reminder Schedule And Notification Live Implementation

## Live Service Files

- `features/notifications/live-service.ts` maps generated `notifications`, `tasks`, `contacts`, `connections`, and `evidence` records into reminder schedules and in-app notification queue entries.
- `features/notifications/storage/reminder-notification-live-record-provider.ts` reads those collections from the shared live record store or Postgres-backed `orbit_records`.
- `features/notifications/service-factory.ts` registers the live implementation behind `ORBIT_MODULE_MODE=live`.
- `app/api/notifications/route.ts` and `app/api/notifications/reminders/generate/route.ts` await the service result and keep provider SDKs out of route handlers.

## Required Env Vars And Runtime Configuration

- Set `ORBIT_MODULE_MODE=live` and `ORBIT_FEATURE_MODE=live` for live API responses.
- Provide one of `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`.
- Set `ORBIT_WORKSPACE_ID` to the workspace seeded in `orbit_records`, such as `workspace:orbit-dev`.
- If the database URL is missing, live mode returns `REMINDER_SCHEDULE_NOTIFICATION_LIVE_STORE_UNCONFIGURED` and does not call external notification systems.

## Current Live Boundary

- The live implementation only reads reminder source data and returns reviewable Orbit queue entries.
- It does not call a push notification provider, email delivery provider, SMS delivery provider, cron scheduler, device API, AI provider, or external network.
- It does not write live reminder state, production audit logs, calendars, email, SMS, push jobs, or device permissions.
- `generateReminders` is a read-only derivation over the same live records. It does not persist generated reminders.

## Data Mapping

- `NotificationDTO` records become `ScheduledReminder` and `NotificationQueueEntry` records.
- Notification source evidence can link back to generated `TaskDTO` records, which then enrich reminders with contact and connection context.
- `in_app` and `email` channels map directly to the queue channel contract. `calendar` and `system` records stay as in-app review queue entries until a delivery-specific contract exists.
- Priority and frequency are derived from the scheduled time window, so filters can be exercised against generated fixture records.

## Provenance And Privacy

- Live provenance uses `live-reminder-schedule-notification-preview` privacy and marks live database reads as executed.
- Source evidence ids are preserved on reminders, queue entries, grouped low-priority reminders, and failure envelopes.

## Replacement Tests

- `tests/capabilities/reminder-schedule-notification-live-store.test.ts` seeds generated fixtures into a memory live store and verifies live reads, filters, provenance, and no delivery side effects.
- The mock test continues to prove the mock path never calls external networks, device APIs, databases, AI providers, calendars, email, notification providers, SMS services, or cron jobs.
