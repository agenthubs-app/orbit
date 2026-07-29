# Compose App Follow-ups Mock-to-Live Replacement

## Evaluator Evidence Summary

`/app/followups` is a compatibility redirect to `/app/today?view=day`.
The Today time spine composes approved follow-up tasks, message drafts, and the
reminder queue through `followups-service-factory.ts`. It does not import raw
fixtures, send messages, schedule reminders, or claim completion.

Controlled route-state checks use the loader's explicit internal
`controls.scenario` argument:

- `empty`
- `pending`
- `failure`

Route recovery actions:

- Empty: add a relationship source or return to `/app/today`.
- Pending: return to `/app/today`.
- Failure: reload `/app/today` or check source settings.

## Live files: live service/provider files

Replace the current route factory registrations with live implementations in these files:

- `features/followups/service.ts` for live follow-up task reads, completion mutations, and source-backed task provenance.
- `features/followups/message-draft-contract.ts` plus a future live draft service file for AI-assisted or user-authored draft creation and updates.
- `features/notifications/service.ts` for live reminder schedule reads and notification queue status.
- `app/api/tasks/route.ts` for task list envelopes.
- `app/api/message-drafts/route.ts` and `app/api/message-drafts/[id]/route.ts` for draft generation/update envelopes.
- `app/api/notifications/route.ts` and `app/api/notifications/reminders/generate/route.ts` for reminder queue envelopes.
- `app/(app)/app/followups/compose-app-followups-from-previously-approved-mock-first-capabilities/followups-service-factory.ts` for route-level mode resolution.

## Switch: switch mechanism

The switch should remain centralized in `followups-service-factory.ts` by registering `hybrid` or `live` constructors with `createModuleServiceFactory`. `ORBIT_MODULE_MODE` or `ORBIT_FEATURE_MODE` should select the mode, while the page continues to call `createAppFollowupsRouteServices()` and the API routes continue to return the shared `{ success, data }` or `{ success: false, error }` envelopes.

Do not move task, draft, or reminder data-shape ownership into `page.tsx` or
nested UI components. Today should only compose typed service payloads. A
future completion mutation must use an explicit authenticated action boundary,
not a page GET query.

## Env and permissions: required env vars or permissions

Live follow-ups will require separate credentials and scopes for:

- Relationship/task persistence read and write access.
- User-authenticated calendar scopes for reminder scheduling.
- Email or messaging scopes for any future send action.
- Notification delivery permissions for push, email, SMS, or in-app channels.
- AI draft provider credentials only when draft generation moves from local rules to a live provider.
- Audit log write permission for completed follow-ups and external actions.

Every sensitive action still needs explicit user confirmation before sending a message, scheduling a reminder, or writing completion state.

## Privacy and provenance: privacy/provenance constraints

Each task, draft, reminder, queue entry, and future completion result must
preserve source labels, evidence IDs, collected-at timestamps, and confirmation
requirements. The live path must keep the visible no-side-effects guarantees
until the user confirms a specific action.

The page must continue to display source evidence near relationship work and
must not expose provider credentials, raw external payloads, private message
bodies from unrelated conversations, or background delivery status without
user permission. Public query parameters must not select fixture states or
fabricate a completion result.

## Replacement tests: replacement tests

When live services are introduced, replace or extend the focused page tests with:

- `/app/followups` redirect test and `/app/today` time-spine render test for one
  relationship datum, draft copy, reminder queue entry, and no raw fixture
  imports.
- Explicit internal route-state checks for empty, pending, and failure with real
  recovery destinations; public Today query input must not activate them.
- API envelope tests for `GET /api/tasks`, `GET /api/notifications`, and draft update/create endpoints.
- Completion action test proving confirmation is required before write/send/schedule behavior.
- Privacy regression proving source/evidence IDs remain attached and provider secrets or raw external payloads are not rendered.
- Replacement coverage proving `followups-service-factory.ts` resolves the `live` constructors through the switch mechanism instead of direct mock constructors.
