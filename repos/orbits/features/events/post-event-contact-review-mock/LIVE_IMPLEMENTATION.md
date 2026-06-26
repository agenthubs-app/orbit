# Post-event Contact Review Mock Live Implementation

This sprint keeps post-event new-contact review mock-first. The mock boundary owns deterministic event review payloads for new contacts, post-event summaries, tags, follow-up suggestions, confirmation previews, and controlled empty, pending, and failure states.

## Live service and provider files

- `features/events/post-event-contact-review-mock/live-service.ts` will implement the same `PostEventContactReviewService` interface exported by `features/events/post-event-contract.ts`.
- `features/events/post-event-contact-review-mock/providers/event-review-provider.ts` will load event roster, encounter note, and import-review records through approved product data access.
- `features/events/post-event-contact-review-mock/providers/summary-provider.ts` will create post-event summaries, tags, and follow-up suggestions only after privacy review.
- `features/events/post-event-contact-review-mock/providers/contact-persistence-provider.ts` will replace the mock confirmation preview with guarded batch persistence.
- `features/events/post-event-contact-review-mock/mappers.ts` will map live records into the contract DTOs without dropping source evidence or provenance.

## Switch mechanism

- `ORBIT_POST_EVENT_REVIEW_PROVIDER=mock` keeps `createMockPostEventContactReviewService()` active.
- `ORBIT_POST_EVENT_REVIEW_PROVIDER=live` may select `createLivePostEventContactReviewService()` only after the live service files and replacement tests exist.
- Product pages and route handlers must keep importing the shared contract and service factory boundary, not provider-specific modules.
- The `/dev/capabilities/post-event-contact-review-mock` surface should continue to render success, empty, pending, and failure states from the selected service boundary.

## Required env vars and permissions

- `ORBIT_POST_EVENT_REVIEW_PROVIDER` selects `mock` or `live`.
- `ORBIT_EVENT_DATA_PROVIDER` is required before reading live event rosters or encounter notes.
- `ORBIT_SUMMARY_PROVIDER` is required before generating live post-event summaries, tags, and follow-up suggestions.
- `ORBIT_CONTACT_PERSISTENCE_PROVIDER` is required before contact confirmation can perform batch persistence.
- Live mode requires explicit user permission for contact writes and separate confirmation before any external follow-up action is sent.

## Privacy and provenance constraints

- Every live post-event summary, tag, follow-up suggestion, and confirmed contact must retain source event ids, evidence ids, provider record ids, and generation method.
- Live summarization must not include unrelated contacts, calendar records, email bodies, or event attendees outside the selected event review.
- Confirmation must fail visibly when required evidence is missing, privacy review is pending, or batch persistence partially fails.
- External message sending, notifications, calendar writes, email access, and network retries stay outside this capability unless routed through an approved confirmation guard or external action sandbox.
- The mock fields `aiProviderRequested`, `externalNetworkRequested`, `liveDatabaseReadExecuted`, `liveDatabaseWriteExecuted`, `batchPersistenceExecuted`, `calendarProviderRequested`, `emailProviderRequested`, and `notificationDelivered` must be replaced with auditable live provenance instead of omitted.

## Replacement tests

- Contract tests cover live DTO mapping for post-event summaries, tags, follow-up suggestions, provenance, and confirmation records.
- Service tests cover success, empty, pending, missing event, provider failure, privacy-blocked, and partial batch persistence paths.
- API route tests cover `GET /api/events/[id]/post-event` and `POST /api/events/[id]/post-event/confirm` envelopes in mock and live modes.
- Confirmation tests prove contact writes require explicit permission and fail with structured envelopes when persistence is unavailable.
- Debug route tests prove the dev page still renders success, empty, pending, and failure states without owning business logic.

## Live handoff evidence excerpts

- Live service files live under `features/events/post-event-contact-review-mock/`.
- `ORBIT_POST_EVENT_REVIEW_PROVIDER` switches mock fixtures to live providers.
- Live replacement requires event roster, encounter note, summarization, tagging, follow-up suggestion, and batch persistence providers.
- Every live post-event summary, tag, follow-up suggestion, and confirmation keeps source evidence and provenance.
- Replacement tests cover review success, empty, pending, missing event, provider failure, privacy review, and confirmation paths.
