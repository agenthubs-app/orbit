# Event Registration Live Implementation

Orbit event registration now has two separate boundaries:

- `features/events/registration/question-generator.ts` builds up to four optional, event-specific participant-profile questions.
- `features/events/registration/service.ts` owns the idempotent registration, cancellation, and reactivation lifecycle.

The older deterministic guide in `features/events/registration-profile-guide.ts` remains available for degraded event-detail routes. It is no longer the write path for `/app/events/[id]/register`.

## Shared Orbit AI Model

Question customization calls `runOrbitAgentModelText` from `features/orbit-ai/gemini-provider.ts`. This is the same provider boundary used by Orbit AI, so it inherits:

- `ORBIT_AGENT_PROVIDER`
- `ORBIT_GEMINI_MODEL`, `ORBIT_DEEPSEEK_MODEL`, or `ORBIT_OPENAI_MODEL`
- the matching provider credential and endpoint
- the shared request timeout policy

There is no separate registration model setting.

Code first selects the allowed intents and participant-profile fields. The model may only customize wording and options for those candidates. Output is accepted only when it:

- contains zero to four unique questions;
- preserves the candidate `id`, intent, and field mapping;
- includes the exact event title;
- uses two to five concise options;
- contains no credential, identity-document, financial, or similarly sensitive prompt.

Missing credentials, provider failures, malformed JSON, and schema violations fall back to deterministic questions containing the same event title. Registration is never blocked by model failure.

## Registration State

One record exists for each `(eventId, userId)` pair:

```ts
type EventRegistration = {
  id: string;
  eventId: string;
  userId: string;
  status: "rsvped" | "cancelled";
  participantProfileId: string;
  registeredAt: string;
  cancelledAt: string | null;
  reactivatedAt: string | null;
  updatedAt: string;
};
```

The participant profile is event-specific. Its answers never update the global user profile.

- Repeating the same registration request returns the unchanged record.
- Cancelling an already cancelled registration returns the unchanged record.
- Re-registering changes the same record back to `rsvped`, preserves `registeredAt`, and sets `reactivatedAt`.
- Cancellation does not send organizer messages, request refunds, add or remove calendar events, or deliver notifications.

The provider stores records in `event_registrations` through the configured Postgres live-record store. Local runtimes without a database use the process-level memory live-record store so the UI remains testable.

## API And UI

- `GET /api/events/[id]/registration` returns the current registration and, unless disabled, generated questions.
- `POST /api/events/[id]/registration` creates, updates, or reactivates the current user’s registration.
- `POST /api/events/[id]/registration/cancel` cancels it.

`/app/events/[id]/register` renders the participant-profile workspace. The activity detail client reads `GET ...?questions=false` and uses that registration record—not fixture RSVP flags—to control its registration CTA and attendee-list gate.

## Verification

- `tests/capabilities/event-registration-live.test.ts`
- `tests/api/event-registration-routes.test.ts`
- `tests/pages/app-event-registration-guide.test.tsx`
- `tests/pages/app-event-detail-live-route-services.test.ts`
