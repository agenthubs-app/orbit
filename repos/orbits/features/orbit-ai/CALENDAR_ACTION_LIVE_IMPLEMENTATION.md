# Orbit AI Calendar Action Live Implementation

## Current No-Side-Effect Default

`calendar-action-service.ts` is a local preview boundary. It reads existing Orbit AI artifact cards and creates an add-to-calendar affordance only when the card already has a concrete title, time, contact or event link, and reason. The supported flow kinds are contact recommendations, event recommendations, follow-up queues, and the dedicated `todo_summary` alias used by to-do result cards as that artifact boundary becomes explicit. The default service never writes saved records, mutates an external calendar, sends notifications or messages, or makes outside network requests.

The preview state is intentionally `staged_unconfirmed`. It shows what would be added, which artifact/source produced it, and that the action is local-only until a later live adapter receives explicit user confirmation. Calendar-grade fields are split from recommendation rationale: `date`, `startTime`, optional `endTime`, `timeZone`, optional `location`, `title`, `relatedLink`, and `reason` all remain in the DTO, but product UI shows the exact calendar fields first and keeps rationale/evidence behind the review disclosure.

Each preview also carries a `completionBoundary` with `confirmationAvailable=false`, `noExternalEventCreated=true`, and `state=awaiting_live_calendar_adapter`. Product UI must render that boundary as a disabled confirmation path, not as a hidden write action, so users can inspect and cancel the staged preview without mistaking it for a saved calendar event.

Product preview UI must keep the add-to-calendar affordance localized (`预览加入日历` in Chinese), keep the visible preview focused on title, date, start, end/timezone, location, localized source, local/unconfirmed state, and the "no calendar event created" status, and move repeated rationale/evidence ids behind a `查看依据` disclosure. Closed secondary result groups must not emit hidden calendar/action links; only visible primary preview cards should expose the view-source next action, cancellation path, and disabled confirmation boundary. User-facing provenance labels are localized (`参会者意图记录`, `活动主题记录`, `画像匹配摘要`, `已保存关系对话`), while raw artifact source ids stay in diagnostics/data attributes instead of visible copy.

## Future Live Calendar Adapter

Add the live adapter beside this file as:

- `features/orbit-ai/calendar-action-live-service.ts`
- `features/orbit-ai/calendar-action-provider.ts`
- `features/orbit-ai/calendar-action-mappers.ts`
- `features/orbit-ai/calendar-action-validators.ts`

The live adapter should implement the same preview DTOs from `calendar-action-service.ts`. UI code must keep importing the feature boundary and must not branch on provider names or raw calendar provider payloads.

## Provider Switch And Configuration

The future switch should be explicit, for example `ORBIT_CALENDAR_ACTION_MODE=mock | live`. Missing live provider configuration must fail closed with a typed service-resolution error rather than falling back to a hidden calendar write.

Expected live configuration will include provider identity, OAuth credentials, calendar scope selection, and a server-side callback secret. No OAuth flow is part of Sprint 90.

## Privacy And Provenance Constraints

Live preview and write flows must preserve:

- artifact id and item id
- source label and source artifact path
- evidence ids
- exact title, date, start time, optional end time, timezone, optional location, link, and reason shown to the user
- local-only versus live-write state
- confirmation availability and whether any event has actually been created

The adapter must not expand relationship context beyond the evidence already present in the artifact card without a separate user-visible permission boundary.

## Replacement Tests

Before enabling live mode, add tests that prove:

- preview generation still requires title, time, link, and reason
- to-do result cards using `todo_summary` can stage an unconfirmed preview when they include the same title/time/link/reason/source fields
- unconfirmed previews perform no saved record write, calendar mutation, notification, message send, or outside network request
- confirmed live writes call only the configured calendar provider after explicit confirmation
- provider failures return a recoverable staged state and keep the original Orbit AI answer visible
- cancellation records no external mutation and returns to the Orbit AI conversation
- disabled confirmation previews remain non-clickable, expose a safe source-review next action, and continue to report that no calendar event was created until live mode is explicitly enabled
- localized product previews keep evidence behind a disclosure and do not expose hidden secondary card links in the accessibility tree
