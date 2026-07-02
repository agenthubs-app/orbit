# Post-event Contact Review Live Implementation

Post-event contact review now has a generated live-storage provider. The current
live path maps generated attendee roster context into post-event summaries,
tags, follow-up suggestions, and confirmation previews without calling AI,
network, calendar, email, notification, or external message providers.

## Live service and provider files

- `features/events/post-event-review/live-service.ts` will implement the same `PostEventContactReviewService` interface exported by `features/events/post-event-review/contract.ts`.
- `features/events/post-event-review/storage/generated-post-event-review-live-record-provider.ts` reads generated event attendee roster context and stages confirmation provenance to the `event_post_event_reviews` work collection.
- `features/events/service-factory.ts` selects the generated live provider when `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.
- `features/events/post-event-review/providers/event-review-provider.ts` is the reserved future provider boundary for loading event roster, encounter note, and import-review records through approved product data access.
- `features/events/post-event-review/providers/summary-provider.ts` is the reserved future provider boundary for summarization, tagging, and follow-up suggestions after privacy review.
- `features/events/post-event-review/providers/contact-persistence-provider.ts` is the reserved future provider boundary for guarded batch persistence.
- `features/events/post-event-review/mappers.ts` may be added if provider-specific live records need more mapping logic than the generated live-storage provider.

## Switch mechanism

- `ORBIT_POST_EVENT_REVIEW_PROVIDER=mock` keeps `createMockPostEventContactReviewService()` active.
- `ORBIT_POST_EVENT_REVIEW_PROVIDER=live` is the legacy provider-specific switch name kept for the replacement handoff.
- Current runtime selection is controlled by `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`, which selects `createLivePostEventContactReviewService()` with the generated live record provider.
- Product pages and route handlers must keep importing the shared contract and service factory boundary, not provider-specific modules.
- The `/dev/capabilities/post-event-review` surface should continue to render success, empty, pending, and failure states from the selected service boundary.

## Required env vars and permissions

- Current live storage requires `ORBIT_EVENT_DATABASE_URL` and `ORBIT_WORKSPACE_ID`.
- `ORBIT_POST_EVENT_REVIEW_PROVIDER` selects `mock` or `live` only for the legacy provider-specific handoff.
- `ORBIT_EVENT_DATA_PROVIDER` is reserved before reading live event rosters or encounter notes from external product data access.
- `ORBIT_SUMMARY_PROVIDER` is reserved before generating live post-event summaries, tags, and follow-up suggestions through an external summarization provider.
- `ORBIT_CONTACT_PERSISTENCE_PROVIDER` is reserved before contact confirmation can perform real guarded batch persistence into Contacts.
- Live mode requires explicit user permission for contact writes and separate confirmation before any external follow-up action is sent.

## Privacy and provenance constraints

- Every live post-event summary, tag, follow-up suggestion, and confirmed contact must retain source event ids, evidence ids, provider record ids, and generation method.
- Live summarization must not include unrelated contacts, calendar records, email bodies, or event attendees outside the selected event review.
- Confirmation must fail visibly when required evidence is missing, privacy review is pending, or batch persistence partially fails.
- External message sending, notifications, calendar writes, email access, and network retries stay outside this capability unless routed through an approved confirmation guard or external action sandbox.
- The mock fields `aiProviderRequested`, `externalNetworkRequested`, `liveDatabaseReadExecuted`, `liveDatabaseWriteExecuted`, `batchPersistenceExecuted`, `calendarProviderRequested`, `emailProviderRequested`, and `notificationDelivered` must be replaced with auditable live provenance instead of omitted.
- Current generated live storage must keep AI, external network, external message, notification, calendar, and email flags false unless those providers are explicitly wired later.

## Replacement tests

- `tests/capabilities/post-event-review-live-generated-store.test.ts` proves live mode can generate post-event contact drafts from remote attendee data and persist confirmation provenance without external side effects.
- Contract tests cover live DTO mapping for post-event summaries, tags, follow-up suggestions, provenance, and confirmation records.
- Service tests cover success, empty, pending, missing event, provider failure, privacy-blocked, and partial batch persistence paths.
- API route tests cover `GET /api/events/[id]/post-event` and `POST /api/events/[id]/post-event/confirm` envelopes in mock and live modes.
- Confirmation tests prove contact writes require explicit permission and fail with structured envelopes when persistence is unavailable.
- Debug route tests prove the dev page still renders success, empty, pending, and failure states without owning business logic.

## Live handoff evidence excerpts

- Live service files live under `features/events/post-event-review/`.
- `ORBIT_POST_EVENT_REVIEW_PROVIDER` switches mock fixtures to live providers.
- Live replacement requires event roster, encounter note, summarization, tagging, follow-up suggestion, and batch persistence providers.
- Every live post-event summary, tag, follow-up suggestion, and confirmation keeps source evidence and provenance.
- Replacement tests cover review success, empty, pending, missing event, provider failure, privacy review, and confirmation paths.
