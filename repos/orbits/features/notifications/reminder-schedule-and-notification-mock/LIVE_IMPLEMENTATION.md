# Reminder Schedule And Notification Mock Live Implementation

## Live Service Files

- Keep the mock boundary in `features/notifications/mock-service.ts` and add live adapters under `features/notifications/reminder-schedule-and-notification-mock/providers/`.
- Add `features/notifications/reminder-schedule-and-notification-mock/live-service.ts` for provider orchestration only after the mock API and dev route continue passing.
- Route handlers in `app/api/notifications/route.ts` and `app/api/notifications/reminders/generate/route.ts` must keep returning the shared API envelope and must not import provider SDKs directly.

## Switch Mechanism

- `ORBIT_REMINDER_NOTIFICATION_PROVIDER=mock` keeps using deterministic fixtures.
- `ORBIT_REMINDER_NOTIFICATION_PROVIDER=live` may switch the service factory to the live service after replacement tests exist.
- Hybrid mode may read live reminder configuration, but push notification provider work, email delivery provider work, SMS delivery provider work, cron scheduler work, and live persistence remain disabled until explicit confirmation and provenance checks pass.

## Required Env Vars And Permissions

- Push provider credentials, such as `ORBIT_PUSH_PROVIDER_KEY`, must be scoped to notification delivery and must not expose relationship records beyond the selected reminder copy.
- Email delivery provider credentials, such as `ORBIT_EMAIL_DELIVERY_API_KEY`, require user-approved sender identity and unsubscribe handling before use.
- SMS delivery provider credentials, such as `ORBIT_SMS_DELIVERY_API_KEY`, require country-specific consent and opt-out handling before use.
- Cron scheduler configuration, such as `ORBIT_REMINDER_CRON_SECRET`, must be server-only and must not be usable from a browser route.
- Device notification permissions must be requested only after a product confirmation flow explains the reminder purpose.

## Privacy And Provenance Constraints

- Every live reminder must preserve source evidence, provenance, follow-up due dates, reminder frequency, grouped low-priority reminders, and notification queue entry identifiers.
- Live delivery must never include hidden relationship notes or unrelated evidence in push, email, or SMS payloads.
- Grouped low-priority reminders should remain grouped unless the user explicitly promotes a reminder to a higher priority.
- Failures must return controlled API envelopes and must not retry provider calls without a visible audit state.

## Replacement Tests

- Add contract tests proving live payloads preserve source evidence, provenance, due dates, reminder frequency, grouped low-priority reminders, and notification queue entries.
- Add provider-switch tests for `ORBIT_REMINDER_NOTIFICATION_PROVIDER=mock` and `ORBIT_REMINDER_NOTIFICATION_PROVIDER=live`.
- Add failure tests for push notification provider errors, email delivery provider errors, SMS delivery provider errors, cron scheduler failures, permission denial, and persistence failures.
- Keep mock-only tests proving the mock path never calls external networks, device APIs, databases, AI providers, calendars, email, notification providers, SMS services, or cron jobs.
