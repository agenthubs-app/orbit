# Orbit AI Proactive Agent Live Implementation

## Current Local Delivery Semantics

`proactive-calendar-service.ts` implements the Sprint 91 local rule for calendar-like activities. It uses a one-hour timing window: activities with `startsAt` from the current local collection time through `current time + 60 minutes` produce one in-app Orbit Agent message. The message is email-like because it has a subject, body, time, people context, source label, preparation prompt, and a link into a context conversation, but it is not an email.

Delivery is local delivery only. The current service returns DTOs for `/app/chat` and `/app/agent` composition and records safety flags showing no external email, push notification, SMS, calendar update, provider request, network request, or saved-record write has occurred. The dedupe key combines the activity id, activity start time, and timing window start so repeated evaluations of the same activity window produce the same message id and can skip already delivered local keys.

When a user opens the message link, `/app/agent?proactive=...` renders the first Orbit AI response and a visible calendar-activity context block. That block is built from the same conversation DTO fields as the response: activity title, time label, people context, relationship context, preparation prompt, and source label. It is a local preparation surface, not a notification delivery receipt.

## Future Live Service And Provider Files

Add live replacement files beside the mock/local boundary:

- `features/orbit-ai/proactive-calendar-live-service.ts`
- `features/orbit-ai/proactive-calendar-provider.ts`
- `features/orbit-ai/proactive-calendar-mappers.ts`
- `features/orbit-ai/proactive-calendar-validators.ts`
- `features/orbit-ai/proactive-calendar-delivery-store.ts`

The live service must implement the same contract shapes from `proactive-contract.ts`. Product routes should keep importing a service boundary and route-owned view-model mapper; React presenters must continue receiving UI-only inbox item props.

## Provider Switch And Configuration

Use an explicit switch such as `ORBIT_PROACTIVE_CALENDAR_MODE=mock | live`. Missing live configuration must fail closed with a typed service-resolution result rather than falling back to hidden provider behavior.

Expected live configuration will include a read-only calendar/activity provider, a workspace id, a delivery-state store for dedupe keys, and permission metadata proving the user has allowed local proactive review. Enabling live notification delivery is outside this sprint and must require a separate confirmation boundary.

## Privacy And Provenance Constraints

The live implementation must preserve:

- activity id, title, start/end time, and source label
- people context labels and why those people matter
- relationship context and preparation prompt used in the first Orbit AI response
- evidence ids and provider record ids needed for audit
- local-only delivery state versus any future confirmed notification state
- safety flags for email, SMS, push, calendar, network, provider, and storage behavior

The service must not expand relationship context beyond source-backed activity evidence. It must not expose attendee emails, private notes, or raw provider payloads in presenter components. Any future live notification boundary must show provenance before confirmation and must stay separate from the local inbox message.

## Replacement Tests

Before enabling live mode, add replacement tests that prove:

- the one-hour timing window includes activities starting now through 60 minutes and excludes later entries
- the same activity/window key is idempotent across repeated runs
- local delivery still performs no external email, push notification, SMS, calendar update, outside network request, or unconfirmed saved-record write
- the live provider reads only approved local schedule or event sources
- missing live provider configuration fails closed
- clicking a live proactive message opens an Orbit AI conversation whose first response cites the triggering activity title, time, people context, and preparation prompt
- the live `/app/agent?proactive=...` destination shows the same activity context in a route-owned view model before React presenters render it
- privacy filters remove private attendee/contact fields before route view models reach React presenters
