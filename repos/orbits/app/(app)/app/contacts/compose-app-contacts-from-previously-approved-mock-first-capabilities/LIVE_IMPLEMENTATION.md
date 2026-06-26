# Compose /app/contacts From Approved Capabilities

## Evaluator Evidence Summary

Live files: contacts list, search, filter, source-label, value-tag, and review
preview behavior must move from `features/contacts/contract.ts`,
`features/contacts/service.ts`, `features/contacts/service-factory.ts`,
`app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory.ts`,
and `app/api/contacts/route.ts` to live contact-store and search-index
providers behind the same typed service interface and API envelope.

Switch: keep `/app/contacts` consuming
`createAppContactsListSearchAndFilterService()` from the route adapter, which
resolves the approved mock provider through `shared/services/module-mode.ts`.
Live mode should register a live constructor behind the same module-mode service
factory and shared API envelopes instead of raw source records or page-local
data.

Env and permissions: live mode requires explicit CRM/contact-store access,
search-index credentials, source-system import permission, email/calendar
evidence scopes, and user confirmation before any persistent contact write,
merge, task, message, notification, or outside account read runs.

Privacy and provenance: every contact row keeps source type, source label,
evidence ids, relationship context, relationship value rationale, and execution
flags. The local review preview keeps `data-action-evidence` and
`data-side-effects="none"` until a confirmation guard records explicit approval.

Replacement tests: preserve the route test for the page heading, a domain datum,
the local action result, product-facing success/empty/loading/failure state
checks, fixture-free adapter imports, and `GET /api/contacts` envelope evidence;
add live-mode service contract tests, mock/live API parity tests, and privacy
regressions that fail when live search, persistence, email/calendar reads,
messages, tasks, notifications, AI calls, or external network access run without
permission and confirmation.

Browser state checks: capture `/app/contacts`, `/app/contacts?scenario=empty`,
`/app/contacts?scenario=pending`, and `/app/contacts?scenario=failure`. The
scenario pages should expose the shared state boundary titles `No contacts match
this view`, `Checking contact sources`, and `Contacts could not load`. Route
recovery actions should remain local GET links back to `/app/contacts` or a
source-check scenario and must continue to expose `data-side-effects="none"`.

## Live Service/Provider Files

- Contact list/search contract: keep `features/contacts/contract.ts` as the DTO and error boundary.
- Contacts service interface and error mapping: keep `features/contacts/service.ts` as the app-facing service API.
- Mock provider to replace: `features/contacts/service-factory.ts`.
- Route service switch: keep `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory.ts` as the local module-mode adapter for `/app/contacts`.
- Live provider to add later: `features/contacts/live-service.ts` behind the same `ContactsListSearchAndFilterService` interface and the route service factory.
- API envelope boundary: keep `app/api/contacts/route.ts` and `app/api/contacts/search/route.ts` returning `{ success: true, data }` and `{ success: false, error }` envelopes.
- Route adapter: keep `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-command-center.tsx` consuming the typed service and not raw data files.

## Switch Mechanism

The Milestone C route resolves the current mock service through
`contacts-service-factory.ts`, which uses `createModuleServiceFactory` from
`shared/services/module-mode.ts` and keeps the page/command-center off direct
fixture imports. Live migration should add a `live` constructor to that factory
and, if cross-capability health metadata is needed, mirror the registration in
`shared/services/capability-registry.ts`. The page should continue to ask for
list/search results through the service interface and should not import fixture
files, provider SDKs, or database clients.

## Required Env Vars Or Permissions

- Live contact list reads require contact-store or CRM credentials scoped to the authenticated workspace.
- Live search requires search-index credentials and a workspace-scoped index name.
- Source labels require permission to read only approved source metadata from imports, email/calendar evidence, referrals, QR scans, business cards, or manual notes.
- Email and calendar evidence require user-approved Gmail, Google Calendar, or Microsoft Graph scopes before any message or event metadata is read.
- Persistent contact writes, merges, follow-up task creation, messages, notifications, and external actions require explicit user confirmation before execution.

## Privacy/Provenance Constraints

Every live contact row must retain source type, source label, evidence ids,
relationship context, value score, value tags, and value rationale. Live services
must not ingest message bodies, calendars, device contacts, customer lists,
search indexes, or external accounts unless the matching permission and
confirmation state is present. Local preview actions must remain side-effect
free and continue to expose `data-action-evidence` and
`data-side-effects="none"` for route tests and browser checks.

## Replacement Tests

- Keep `tests/pages/app-contacts-page.test.tsx` asserting the route heading, one contact datum with its row-local source labels, value tags, source tags, evidence id, local action result, product-facing route state checks, route recovery actions, adapter imports, live handoff, and `GET /api/contacts` success envelope.
- Add live-mode service contract tests proving live list/search/filter output matches `ContactsListSearchAndFilterService`.
- Add API parity tests for `GET /api/contacts` and `POST /api/contacts/search` in mock and live modes.
- Add route state checks for success, empty, pending/loading, unsupported-filter failure, and provider failure after service factory switching.
- Add privacy regressions that fail if live search, contact-store reads/writes, email/calendar reads, task writes, messages, notifications, AI calls, or external network requests run without permission and confirmation.
