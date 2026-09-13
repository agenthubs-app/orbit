# Ink & Signal IORBIT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Continue the approved in-place workflow; no commit, push, deployment, or backend edits.

**Goal:** Implement the approved IORBIT home, conversation and failure designs while retaining Orbit's real conversation, history, task, reference and execution-record behavior.

**Architecture:** Keep the two existing native screens and HTTP client. Opt their private routes into the established account/server/cookie/focus scope, validate the fields each screen consumes, and keep request ownership and draft revisions local. The new presentation uses real data; unsupported reference controls do not become invented capabilities.

**Tech Stack:** Expo Router, React Native, existing Ionicons and source navigation assets, Zod, Node tests, esbuild/RNW/Playwright boundary fixtures.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`, selected source `2a-IORBIT首页.png`, `1c-IORBIT会话.png`, `3a-失败态-IORBIT.png`; user clarification: “我们的功能为主。如果有缺口的地方，你就仿照它的设计去补足就可以了。”

## Global Constraints

- Edit only `repos/orbit-app`; preserve all unrelated work and generated contract copies. Existing design approval and in-place execution remain valid.
- White / ink / signal-blue tokens; 16pt inset; 30/36 hero, 15pt rows; system font scaling, real native safe areas and minimum 44pt actions. No bottom tabbar on IORBIT.
- User text, multilingual titles, markdown and references remain business content, not generic implementation-label filtering.
- No fake conversation, cover, error code, attachment, mention, note creation, feedback, or automatic-write promise. Root conversation POST can execute an explicit task request; it is not universally read-only.
- No real HTTP writes in validation. Native keyboard/VoiceOver and live Web ↔ App verification are separate evidence, not implied by RNW tests.

### Task 1: Home, recent history and safe navigation

**Files:** Modify `app/(app)/ai.tsx`, `src/screens/ai/AiScreen.tsx`; create `src/api/ai-history-contract.ts`, `tests/helpers/ai-fixtures.ts`, `tests/ink-signal-ai-home.test.ts`; adapt the existing AI home render tests only where the approved presentation changes.

**Interfaces:** Consume existing conversation list/session list/Today GETs, session DELETE, `useApiResource(path, isEmpty, { scopeKey })`, `useOrbitApiClient({ scopeKey })`. Produce typed local `aiConversationListSchema`, `aiSessionListSchema`, `aiHistoryRows` for real recent rows; source discriminator preserves `/ai/[id]?source=session` vs ordinary conversation routes. `AiScreen` accepts optional `scopeKey` and `isScopeCurrent` for compatibility with direct render callers.

- [x] Write actual-route tests. A missing hero/three editable questions/recent route, duplicate navigation, dropped draft, invalid list becoming empty, unsafe session deletion acknowledgement, or stale callback must fail independently.

```ts
await page.getByRole('button', { name: '填入问题：今天先处理哪些事？', exact: true }).click();
assert.equal(await page.getByRole('textbox', { name: '消息', exact: true }).inputValue(), '今天先处理哪些事？');
assert.deepEqual(await writes(page), []);
assert.deepEqual(await navigation(page), []);
```

- [x] Run RED: `node --import tsx --test --test-timeout=120000 tests/ink-signal-ai-home.test.ts`; fix harness errors before treating failures as RED.
- [x] Run per-symbol impact and report risk. Implement the route scope, source hierarchy, 3 questions (two existing context-aware prompts plus a distinct general contact-discussion prompt), recent rows, two-row composer, working home/history/drawer/menu, source-specific loading/empty/failure/retry. Keep Next Actions and genuine previous-message content below the source sections. Deletion requires current selection/explicit confirmation, synchronous lock and a real `deleted: true`, configured/persisted receipt; refresh only that history source.

```ts
const scope = useMemo(() => ({ key: String(++sequence.current), enabled }),
  [enabled, auth.user?.id, auth.cookieHeader, server.baseUrl]);
const latest = useRef(scope); latest.current = scope;
const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
return enabled ? <AiScreen key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
```

- [x] Run new + existing home/history/Next Actions tests and typecheck; retain existing functional expectations with complete HTTP fixtures. Capture 390px source state, 320px/1.6-font and 820px/dark; inspect sizing, scroll reachability and composer positioning.
- [x] Independent review of this deliverable; address important findings with RED/GREEN before marking complete. Task 1: 136/136 targeted + compatibility, typecheck5 exit 0, diff check clean, final independent APPROVE. See `/tmp/orbit-ink-signal-ai-home-all2.log`; this is not the entire AI batch or a native/live acceptance.

### Task 2: Conversation, failures and preserved writing boundaries

**Files:** Modify `app/ai/[id].tsx`, `src/screens/ai/AiConversationScreen.tsx`; extend `src/api/ai-history-contract.ts`, `tests/helpers/ai-fixtures.ts`; create `tests/ink-signal-ai-conversation.test.ts`; update affected existing reading-canvas tests without removing business assertions.

**Interfaces:** Existing conversation root/detail POST, session read/upsert, task suggestion accept/dismiss, AI run detail request and the existing contact/event/task/profile GETs. Reuse Task 1's local session schema and route isolation; keep shared view-models unless a separately analyzed and tested narrow repair is necessary.

- [x] Write real route/HTTP tests for user/assistant hierarchy, markdown and raw business text, real cards and links, initial-prompt ownership, new/continued/session sends, retry vs edit, synchronous lock, in-flight newer draft, refresh/account/route stale response, task suggestion confirmations and malformed receipts, session-save failure and recovery without repeating model/task creation.

```ts
await page.getByRole('textbox', { name: '消息', exact: true }).fill('第一条请求');
await pressTwice(page, '发送');
assert.equal((await writes(page)).length, 1);
await page.getByRole('textbox', { name: '消息', exact: true }).fill('下一条尚未发送');
await replyWrite(page, successfulConversationPayload);
assert.equal(await page.getByRole('textbox', { name: '消息', exact: true }).inputValue(), '下一条尚未发送');
```

- [x] Run RED with bounded Node test timeout; complete actual API receipt fixtures from read-only Web contract/handler inspection.
- [x] Run impacts before modifications. Implement source header/flat transcript/numbered Markdown/reference rows/two-row composer. Preserve all existing inline panels, actions, execution details and raw record links. Send retries retain the submitted request; save retries repeat only the pending session snapshot. Never show success or canonicalize a session before matching persisted acknowledgement.

```ts
if (operation.current || !isScopeCurrent()) return;
const request = { message: draftMessage.trim(), history: conversationHistoryForRequest() };
const revision = draftRevision.current;
// After a valid owned response only:
if (draftRevision.current === revision) setDraftMessage('');
```

- [x] Run targeted conversation + history/task/reference tests and typecheck. Capture same-state 390px conversation/failure plus narrow, large-font, wide and dark cases; test real retry/edit/navigation interactions.
- [x] Independent review; repair important findings with focused RED/GREEN. Final APPROVE after journal/refresh/protocol limits and normalized-ID repairs; final focused 67/67, typecheck13 exit 0.

### Task 3: Batch acceptance and handoff record

**Files:** Create `docs/designs/2026-09-12-ink-signal/2026-09-12-ai-qa.md`; update the design README and this plan.

- [x] Compare each exact source screenshot with the latest matching state in one visual inspection, record five-surface fidelity and functional differences. Fix P0/P1/P2 and recapture; document remaining P3 only.
- [x] Run the combined AI targeted/compatibility suite, `npm run typecheck`, `git diff --check` and inspect final summaries. Combined suite 241/241, then the final normalized-ID change plus its new test revalidated in focused 67/67; these counts overlap and are not added. In response to the user's request to accelerate, whole-app `npm test` is consolidated into final all-page acceptance, not silently counted as passed for this batch.
- [x] Record actual evidence, read/write compatibility and unverified native/live boundaries. Continue the approved remaining screen batches; do not mark the overall 26-screen goal complete here.

Whole-goal acceptance still requires final `npm test`, full route regression and the previously recorded native/live checks. This completed local AI batch does not close those requirements.
