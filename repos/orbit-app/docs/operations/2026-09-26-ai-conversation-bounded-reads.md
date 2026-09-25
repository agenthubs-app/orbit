# AI conversation reads: remove unrelated collections

Local App change on `chat-agent`, based on `04cbd31c`. Not deployed or installed on a phone.

## Behavior

- Opening or refreshing a conversation no longer requests `/api/contacts`, `/api/events`, `/api/tasks`, or `/api/profile`.
- Deleted the keyword-driven panels and their local contact/event ranking helpers. They downloaded whole collections, picked the first few rows, and could present generic records as if they were the answer. There is no fallback to this path.
- Actual reply artifacts still render the existing entity cards and open their record details. History text, sending, retry/result recovery, task confirmation, entity drafts, and explicit navigation remain.
- The `@` picker mounts only when requested, searches `/api/contacts/page?limit=8&query=…`, and follows the server cursor. Changing the query or signed-in scope resets the cursor. It never downloads the entire contact collection to filter locally.
- Names already selected from the picker require no extra request. A prefilled contact reference resolves only its exact contact detail, using the existing owner-authorized endpoint, without an all-contacts fallback.
- These private reads are network-only. The existing read inventory now names the real consumers; obsolete entries were removed without weakening its audit.

## Verification

Actual private route, hooks, HTTP client, rendering, and user interactions run in a local browser; authentication/device/network boundaries are fixtures. No cloud database or AI service is called.

```sh
env -i PATH="$PATH" node --test --test-concurrency=1 --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-ai-conversation.test.ts tests/ai-conversation-screen-source.test.ts tests/ai-contact-mentions-interactions.test.tsx tests/ai-entity-artifact-recovery.test.ts tests/ai-entity-card-view-model.test.ts
env -i PATH="$PATH" node --test --test-concurrency=1 --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/conversation-view-model.test.ts tests/offline-read-inventory.test.ts
env -i PATH="$PATH" npm run typecheck
```

Results: first group **132/132**, second group **46/46**, zero skips; App typecheck exit 0. The first full run had one invalid event-artifact fixture (missing required producer/query/timestamps). Correcting that fixture made the real event-card navigation test pass; production validation was not weakened. The picker tests cover same-name IDs, server search, cursor continuation/reset, delayed old responses, account changes, unavailable reads, and prefilled exact-name lookup.

This proves elimination of four collection requests from this screen, not a percentage reduction in total Neon usage. Backend AI execution, other screens, release coordination, phone QA, and production egress measurement remain separate work. Server contact-page and detail ownership changes must be present in the deployed backend before validating the updated App.

## Change impact

GitNexus bound to root `orbit` at `04cbd31c`: old panel/ranking helpers LOW, with callers confined to the removed chat path; graph-unresolved test/callback references were checked against the actual source and executed tests. The `conversations.ts` exports retained for other live consumers were not removed. No shared contract copies were edited manually.
