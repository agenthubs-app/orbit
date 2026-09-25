# Native compatibility routes (2026-09-26)

This note records the two narrow native entries added for existing Web deep
links. They reuse established App screens and do not add new product workflows.

## `/agent/actions`

The route is actor-private and renders the existing `AllActionsAgentLedgerScreen`
against its normal actor-scoped ledger read. An optional `entry` query value is
matched only against records already present in that response; a match moves to
the top of the All Actions list and is marked as opened from the link. A missing
or foreign-account ID is not fetched by ID and does not reveal a record. Ledger
transitions remain the existing screen's transitions and server authorization.

## `/profile/continue`

The route is actor-private and is only a redirect adapter. It accepts a
supported internal native destination, rejects unknown/external targets, login
entry points, profile destinations, and nested `next` chains containing an
unsafe target, then redirects to the existing `/profile?complete=1&next=...`
flow. It does not read or mutate profile data. `ProfileScreen` remains the owner
of server onboarding status, actor scope, the completion editor, and the
matching-save-receipt rule before returning to the destination. The private
route boundary preserves the continuation URL as the login return target.

## Still missing native product coverage

These Web routes have no equivalent native UI and are intentionally not given
empty redirects or placeholder screens:

- `/agent/plan` — a plan workspace composed of planning and confirmation state.
- `/agent/strategy` — strategy surfaces with distinct modes and workflows.
- `/events/[id]/live` — the live event workspace with multiple operational
  tabs; the public event detail and existing attendee/operations pages are not
  equivalent.

They remain product-coverage work. The route-parity assertion is not expected
to pass until those user-facing surfaces are designed and implemented.

## Verification and release boundary

The root integration ran all seven affected route, ledger-render, private-access,
initial-route and Profile interaction test files: **203 passed, zero failed or
skipped**. The full App typecheck also passed. Profile tests include a delayed
old-account completion response after an account switch; it must not navigate
or display that account's private data. These checks do not constitute a native
device install or a production release. The existing five-route parity failure
is reduced to the three genuine missing surfaces above, not waived.

Pre-edit graph analysis marked the shared initial-route resolver **HIGH** (21
affected nodes, including login/signup return destinations); that risk was
reported before editing. Ledger screen/content were LOW. Framework route
dispatch was checked in source where the graph returned UNKNOWN. The two new
routes require this App version; they change no HTTP contract or backend data.
