# Compose App Follow-ups Mock-to-Live Replacement

## Evaluator Evidence Summary

`/app/followups` composes the approved follow-up task, message draft, reminder queue, and local completion review capabilities through `followups-service-factory.ts`. The page does not import raw fixtures, does not send messages, does not schedule reminders, and marks its completion preview with `data-action-evidence="followups-complete-top-task-local-preview"` and `data-side-effects="none"`.

Route state checks:

- `/app/followups?scenario=empty`
- `/app/followups?scenario=pending`
- `/app/followups?scenario=failure`

Route recovery actions:

- Empty: return to `/app/followups` or preview completion.
- Pending: return to ready follow-ups.
- Failure: reload follow-ups or check source status.

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

Do not move task, draft, reminder, or completion data-shape ownership into `page.tsx` or nested UI components. The page should only compose typed service payloads.

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

Each task, draft, reminder, queue entry, and completion result must preserve source labels, evidence IDs, collected-at timestamps, and confirmation requirements. The live path must keep the visible no-side-effects guarantees until the user confirms a specific action.

The page must continue to display source evidence near relationship work and must not expose provider credentials, raw external payloads, private message bodies from unrelated conversations, or background delivery status without user permission. Completion previews must keep `data-action-evidence` and `data-side-effects` markers so tests can prove no external action was taken.

## Replacement tests: replacement tests

When live services are introduced, replace or extend the focused page tests with:

- `/app/followups` route render test for heading, one relationship datum, draft copy, reminder queue entry, and no raw fixture imports.
- Route state checks for empty, pending, and failure scenarios with route recovery actions.
- API envelope tests for `GET /api/tasks`, `GET /api/notifications`, and draft update/create endpoints.
- Completion action test proving confirmation is required before write/send/schedule behavior.
- Privacy regression proving source/evidence IDs remain attached and provider secrets or raw external payloads are not rendered.
- Replacement coverage proving `followups-service-factory.ts` resolves the `live` constructors through the switch mechanism instead of direct mock constructors.
