# AI session history pagination: App handoff

App-side consumer change for the shared AI session-summary page contract. This is a breaking-release pairing with the Web/API implementation; it is local source work only and has not been installed on a device or deployed.

## App behavior

- `AiScreen` reads one network-only page from `/api/ai/conversations/sessions` on entry. It does not follow cursors automatically; the history panel exposes an explicit load-more action.
- The list uses the summary-page schema synced from shared contracts. Session items contain bounded summary fields and organization metadata, never `messages`. Opening a row still uses the existing full-detail `/sessions/{id}` read.
- Search is immediate in the input and debounced by 250 ms before sending trimmed `q`; group selection is sent as `groupId`. A new filter starts without a cursor. App preserves the server's page order and only deduplicates repeated IDs when appending.
- Pin, move, rename, and delete mutations invalidate the page identity and reread page one under the active query and group. A failed continuation leaves already loaded rows and the retry cursor intact.
- The request identity is bound to the current API/auth scope. In-flight continuation requests are aborted and late responses ignored when that scope or filter changes.
- `/api/ai/conversations` remains a separate source of normal conversation summaries; its rows are not represented by the persisted-session cursor. No client-side full-session fallback or pinned-only filter was added.

## Contract sync and verification

After the Web shared schema changed its text bounds to Unicode code points, generated App copies were refreshed only through the supported command:

```sh
npm run sync:contract
```

Verified locally:

```sh
node --test --test-reporter=dot --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-ai-home.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ai-home-screen-copy.test.ts
```

Results: `ink-signal-ai-home.test.ts` passed **80/80**; `ai-home-screen-copy.test.ts` passed **21/21**; App `npm run typecheck` passed. Render tests use a local browser with fixture-backed auth, network, and device boundaries; they make no cloud, AI-provider, or production calls. Coverage includes first-page-only loading, explicit continuation, server query/group filters, debounce, mutation refresh, continuation retry, stale-response rejection across actor, cookie, and base-URL changes, and the synced schema's Unicode code-point bounds.

The API must ship with this App change: older clients expecting a complete session array are not supported by the new page endpoint. Phone QA, release coordination, and any production-read cost measurement remain outstanding.
