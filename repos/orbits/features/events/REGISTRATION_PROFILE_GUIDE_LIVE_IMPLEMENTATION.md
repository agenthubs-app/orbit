# Registration Profile Guide Live Implementation

Sprint 94 uses deterministic demonstration questions because registration is not allowed to write profile updates or call a generation provider yet. The fixture in `features/events/registration-profile-guide.ts` combines three local inputs: the event record, the current test user profile, and profile completeness fields. This keeps every registerable demo event reproducible and proves no event falls back to empty generic questions.

The current test-user loader resolves the deterministic registerable demonstration events (`demo-event-1`, `demo-event-2`, and `event_001`) before it asks runtime event services. That keeps canonical product routes stable in mock or hybrid runtimes where other event-detail capabilities may not have the recommended event in their live store yet. Unknown event ids still go through the configured event service and return its controlled failure shape.

Each deterministic question now carries a short profile-field explanation beside the technical field name. The UI intentionally keeps terms such as `preferredIntroChannels` visible, but pairs them with Chinese or English context so users understand what relationship data they are staging.

## Mock Boundary

- Deterministic source: `features/events/registration-profile-guide.ts`
- Current profile source: `features/profile/fixtures.ts`
- Event source: `features/events/event-crud-and-import/*`
- Safety contract: `profileWriteExecuted=false`, `liveDatabaseWriteExecuted=false`, `externalNetworkRequested=false`, and `aiProviderRequested=false`
- Canonical demo route behavior: known registerable demonstration ids use deterministic event fixtures without requiring a `mode=mock` query parameter.
- Degraded event-detail behavior: if the broader event workspace fails but a known registerable guide exists, `/app/events/[id]` leads with the stable event summary and registration-guide path before showing the workspace failure envelope.

Answers shown on `/app/events/[id]/register` are staged local form values until the user explicitly confirms them. The primary action is review/confirmation copy only; this sprint does not persist profile changes.

## Live Replacement Path

A future provider should add these files beside the event feature boundary:

- `features/events/registration-profile-guide/live-service.ts`
- `features/events/registration-profile-guide/provider.ts`
- `features/events/registration-profile-guide/mappers.ts`
- `features/events/registration-profile-guide/validators.ts`

The service should keep the same DTO shape exported by `registration-profile-guide.ts`. `ORBIT_MODULE_MODE=live` can then route through a feature factory once the provider exists. Required runtime inputs should include a live event store, a live profile store, and an explicit generation provider key such as `ORBIT_REGISTRATION_GUIDE_PROVIDER`. Missing providers must fail closed with a controlled service-resolution error, not fall back to deterministic demo questions.

## Privacy And Provenance

The live provider may read only event context, the current user's profile fields, and declared completeness gaps. It must return source evidence ids for each question, mark whether generation was used, and keep answers staged until the user confirms a profile update. It must not send messages, write calendars, notify attendees, or update profile fields during question generation.

The provider must also return field-level explanation copy for each technical profile field so product pages do not invent relationship-data definitions locally.

## Replacement Tests

- Keep `tests/capabilities/event-registration-profile-guide.test.ts` for deterministic mock coverage.
- Add live-store tests proving the provider returns event-specific questions for at least three event types.
- Add failure tests for missing provider configuration and missing profile permission.
- Keep page tests proving `/app/events/[id]` and `/app/events/[id]/register` label answers as staged until confirmation.
- Keep degraded-route tests proving a known registerable event still shows the stable event summary and registration-guide CTA before any event-workspace failure copy.
