# Sprint 0030 Inbox Ink & Signal Unified Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faithfully implement the approved `3a-收件箱` design as a truthful unified App inbox while preserving existing conversations, reminders, signals, drafts, privacy controls and verified deep links.

**Architecture:** Add a screen-private feed adapter and read-batch coordinator rather than altering the HIGH-risk shared alert projection. `RelationshipInboxScreen` will compose the three existing authenticated resources into one filtered time stream; current detail/composer components stay intact. Existing per-item read endpoints remain the write authority, and the UI updates only after exact receipts and a fresh server read.

**Tech Stack:** Expo Router, React Native, TypeScript, existing Orbit locale/theme/API clients, Node test runner, esbuild, React Native Web, Playwright, iOS Simulator, existing Next.js Web/API runtime.

**Spec:** `repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/DESIGN.md`; source archive `/Users/xzhao/Downloads/软件UI设计现代化 (5).zip`, member `design_handoff_orbit_ink_signal/screenshots/3a-收件箱.png`.

## Global Constraints

- User-approved scope: new Sprint assigned to E line; use exact `3a-收件箱` visual, not the earlier card-based inbox or discarded design directions.
- Preserve E worktree's existing `AGENTS.md`, `CLAUDE.md` and `repos/orbit-app/docs/designs/2026-09-15-notes-contact-picker/`; never reset, delete or stage them as Sprint 0030 work.
- Start from `chat-agent` commit `01bcceeb5c11113c8677ca9e89be39d9678fb0bc` or a newer explicitly recorded integration SHA. Do not import uncommitted C-line files from the local checkout.
- Default production scope is App-only. Do not modify Web/API unless a failing acceptance test proves an existing endpoint cannot express the required confirmed behavior.
- `relationshipAlertsToView` is HIGH risk. Keep it unchanged unless the risk is reported first and its four direct consumers plus the `AiScreen` flow are included in regression evidence.
- Use TDD for every behavior change and retain RED→GREEN logs. Run GitNexus upstream impact before editing each existing function/class/method and `gitnexus_detect_changes` before every commit.
- Do not fabricate records, unread counts, relative times, read receipts, 30-day coverage or navigation targets. Business text remains literal; only UI chrome is localized.
- No provider calls, external messages, automatic signal confirmation, production deployment, production database mutation or unrelated refactor.
- Web/API must actually run throughout App validation. If Web code changes, rebuild production output, stop the old process and restart the new build before Simulator acceptance.

---

### Task 1: Establish the E-line baseline and durable design source

**Files:**
- Create: `repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/assets/3a-inbox.png`
- Modify: `repos/orbit-app/docs/sprints/README.md`
- Create later: `repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/REPORT.md`

**Interfaces:**
- Consumes: `chat-agent` pinned/newer integration SHA and the exact archive member named in the Spec.
- Produces: `codex/e-line-sprint-0030` branch, recorded baseline SHA, source image SHA-256 and run-01 evidence directory.

- [ ] **Step 1: Inventory and preserve the current worktree**

Run:

```bash
git status --short
git diff -- AGENTS.md CLAUDE.md
git log -5 --oneline --decorate
```

Expected: only previously owned changes are listed before Sprint files. Record them in the run log and do not stage them.

- [ ] **Step 2: Create the Sprint branch and integrate the recorded baseline**

Run non-destructively:

```bash
git switch -c codex/e-line-sprint-0030
git merge --no-edit 01bcceeb5c11113c8677ca9e89be39d9678fb0bc
```

If the branch already exists, switch only after confirming it belongs to this task. If the merge is blocked by owned dirty files, report the exact paths, continue the independent design/test inventory, and do not stash or discard them without ownership proof.

- [ ] **Step 3: Extract and pin the approved image**

Extract to a `mktemp -d` directory with `ditto -x -k`, copy only `3a-收件箱.png` to the asset path above, and record:

```bash
shasum -a 256 repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/assets/3a-inbox.png
sips -g pixelWidth -g pixelHeight repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/assets/3a-inbox.png
```

Expected dimensions: `780 × 1688` pixels.

- [ ] **Step 4: Register run-01 without claiming completion**

Add Sprint 0030 to `docs/sprints/README.md` as planned/in-progress with E ownership, the branch/baseline and the exact design asset. Do not create a success `REPORT.md` before product evidence exists.

- [ ] **Step 5: Commit the planning baseline**

Stage only the Sprint 0030 directory and its single registry row, run `gitnexus_detect_changes(scope="staged")`, inspect `git diff --cached`, then commit:

```bash
git commit -m "docs(sprint-0030): plan unified inbox redesign"
```

---

### Task 2: Build the unified feed projection test-first

**Files:**
- Create: `repos/orbit-app/src/view-models/inbox-feed.ts`
- Create: `repos/orbit-app/tests/inbox-unified-feed.test.ts`
- Read only by default: `repos/orbit-app/src/view-models/relationship-inbox.ts`
- Read only by default: `repos/orbit-app/src/api/message-state.ts`

**Interfaces:**
- Consumes: raw relationship conversation list, `/api/notifications` payload, relationship signals payload, `OrbitLanguage`, and an injected ISO `now`.
- Produces: `InboxFeedCategory`, `InboxFeedReadAction`, `InboxFeedItem`, `InboxFeedView`, `inboxFeedFromSources(input)` and `filterInboxFeed(view, filter)`.

Use these public shapes:

```ts
export type InboxFeedCategory = "activity" | "task" | "contact" | "assistant";
export type InboxFeedFilter = "all" | Exclude<InboxFeedCategory, "assistant">;

export interface InboxFeedView {
  coverageConfirmed: boolean;
  items: readonly InboxFeedItem[];
  unreadCount: number;
}

export function inboxFeedFromSources(input: {
  actorId: string;
  conversationsData: unknown;
  language: OrbitLanguage;
  notificationsData: unknown;
  now: string;
  signalsData: unknown;
}): InboxFeedView;
```

- [ ] **Step 1: Write failing decoder/classification tests**

Cover exact actor ownership, unique stable IDs, ISO timestamp validation, descending sort, stable tie-break, read state, `activity/task/contact/assistant` classification, encoded IDs, safe target hrefs, conversation read actions, notification read actions and unpersistable notification behavior.

```ts
const view = inboxFeedFromSources({ actorId: "actor:a", conversationsData, notificationsData, signalsData, language: "zh", now: "2026-09-15T12:00:00.000Z" });
assert.deepEqual(view.items.map(item => item.category), ["activity", "task", "contact", "assistant"]);
assert.equal(view.unreadCount, view.items.filter(item => !item.read).length);
assert.equal(view.items.find(item => item.category === "task")?.targetHref, "/tasks/task%3Aone");
```

- [ ] **Step 2: Run the focused test and preserve RED**

Run:

```bash
node --import tsx --test tests/inbox-unified-feed.test.ts
```

Expected: FAIL because `inbox-feed.ts` and exports do not exist. A fixture/parser failure is not an acceptable RED.

- [ ] **Step 3: Implement the smallest independent adapter**

Reuse existing safe href/read-state decoders where exported. Join raw records to localized projections by validated ID; do not loosen `notificationHrefFromDeepLink`, duplicate Web domain services or mutate source objects. Treat unknown categories as `assistant` only when the record is a valid system/proactive notification; otherwise omit it visibly through a counted decode error in test diagnostics.

- [ ] **Step 4: Add 30-day truth and filter tests**

Test the exact boundary `[now - 30 days, now]`, invalid/missing timestamps, future due times, assistant visibility only in `all`, and each Tab preserving global sort. `coverageConfirmed` is true only when every visible source record supplies a trusted occurrence/update timestamp and the adapter applied the window.

- [ ] **Step 5: Run GREEN and direct regressions**

Run:

```bash
node --import tsx --test tests/inbox-unified-feed.test.ts tests/inbox-notification-state.test.ts tests/relationship-inbox-view-model.test.ts tests/relationship-inbox-badge-lifecycle.test.ts
```

Expected: all pass; existing badge semantics remain unchanged.

- [ ] **Step 6: Review and commit the adapter**

Run GitNexus impact for every existing symbol actually edited, then `gitnexus_detect_changes(scope="staged")`. Commit only the new adapter/test and required narrow exports:

```bash
git commit -m "feat(app): project unified inbox feed"
```

---

### Task 3: Implement confirmed batch read behavior

**Files:**
- Create: `repos/orbit-app/src/view-models/inbox-read-batch.ts`
- Create: `repos/orbit-app/tests/inbox-read-batch.test.ts`
- Modify: `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`

**Interfaces:**
- Consumes: `readonly InboxFeedItem[]`, existing `clientPost`, scope-current predicate and response validators.
- Produces: `runInboxReadBatch(input): Promise<InboxReadBatchResult>` with fixed concurrency 4 and exact per-item receipt results.

```ts
export interface InboxReadBatchResult {
  confirmedIds: readonly string[];
  failedIds: readonly string[];
  stale: boolean;
}

export async function runInboxReadBatch(input: {
  execute: (action: InboxFeedReadAction) => Promise<ApiResult<unknown>>;
  isCurrent: () => boolean;
  items: readonly InboxFeedItem[];
}): Promise<InboxReadBatchResult>;
```

- [ ] **Step 1: Write failing batch tests**

Cover zero unread items, duplicate actions, exact notification receipt, exact conversation receipt, concurrency never exceeding 4, partial failure, thrown request, stale scope, account switch and no optimistic success.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --test tests/inbox-read-batch.test.ts
```

Expected: FAIL on the missing coordinator.

- [ ] **Step 3: Implement bounded execution and receipt validation**

Deduplicate by `endpoint + JSON.stringify(body)`, process at most four actions concurrently, append an ID only after its action-specific expected fields and timestamp match, and return `stale: true` without UI callbacks when `isCurrent()` becomes false.

- [ ] **Step 4: Wire “全部已读” without optimistic state**

In `RelationshipInboxScreen`, disable the control when no confirmable unread item exists or a batch is pending. After a non-stale run, emit invalidation and refresh conversation, notification and signal resources. If `failedIds.length > 0`, render the localized line-level error and leave the action available.

- [ ] **Step 5: Run batch and lifecycle regressions**

```bash
node --import tsx --test tests/inbox-read-batch.test.ts tests/inbox-notification-state.test.ts tests/relationship-inbox-lifecycle.test.ts tests/relationship-inbox-interactions.test.ts
```

Expected: all pass, including foreground cancellation and actor scoping.

- [ ] **Step 6: Commit the confirmed behavior**

After impact/detect-changes and staged diff review:

```bash
git commit -m "feat(app): mark unified inbox items read"
```

---

### Task 4: Replace the default inbox presentation with the approved screen

**Files:**
- Modify: `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`
- Modify: `repos/orbit-app/src/i18n/messages.ts`
- Modify: `repos/orbit-app/src/i18n/zh.ts`
- Modify: `repos/orbit-app/src/i18n/ja.ts`
- Modify: `repos/orbit-app/src/i18n/en.ts`
- Modify: `repos/orbit-app/tests/ink-signal-inbox.test.ts`
- Modify only if obsolete assertions require it: `repos/orbit-app/tests/relationship-inbox-screen-source.test.ts`

**Interfaces:**
- Consumes: `InboxFeedView`, `filterInboxFeed`, `runInboxReadBatch`, existing theme/locale/router/API resource state.
- Produces: exact four-Tab default list; existing seeded composer and thread-detail exports remain callable and unchanged.

- [ ] **Step 1: Rewrite the visual test to the approved target and run RED**

At 390×844 CSS pixels assert the compact header, exact control order/text, four tabs, unread count, 8pt dots, reserved read gutter, 15/12pt typography, hairlines, no cards/shadow/default compose, and conditional footer.

```ts
await page.getByRole("heading", { name: "收件箱", exact: true }).waitFor();
assert.equal(await page.getByRole("button", { name: "全部已读", exact: true }).count(), 1);
assert.deepEqual(await page.getByRole("tab").allTextContents(), ["全部 2", "活动", "待办", "人脉"]);
assert.equal(await page.getByRole("button", { name: "写消息", exact: true }).count(), 0);
```

Expected RED: old two-tab/card/search-first layout fails the target assertions.

- [ ] **Step 2: Implement the default hierarchy**

Keep `InboxLayout` for detail/composer states. For the default list, render the 48pt toolbar and four-tab feed with 16pt inset and separator rows. Use existing theme colors corresponding to `#0B1220`, `#0A5CFF`, `#6B7280`, `#8B93A5`, `#E6E8EE` and `#EEF0F4`; do not add custom SVG, gradients, card shadows or a bottom tab bar.

- [ ] **Step 3: Preserve all existing non-default flows**

Tests must prove seed compose still opens from contact parameters, conversation rows open encoded thread routes, replies/draft preview/privacy remain functional, delivery deep links remain visible, unsafe/unsupported hrefs do not navigate, and signal confirmation remains explicit.

- [ ] **Step 4: Add localized chrome**

Add exact keys for `all`, `activity`, `tasks`, `contacts`, `markAllRead`, `markAllReadFailed`, `recentThirtyDays`, `unreadState`, `readState`, and source labels in all four locale files. Keep provider/user titles literal. Make i18n changes in a separate commit after checking C/D/B integration status because those lines are shared.

- [ ] **Step 5: Add responsive and accessibility coverage**

At 320pt width and font scales 1.0/1.6/2.0, ensure every label remains visible, row/action targets are at least 44pt, tabs remain reachable, timestamps wrap rather than clip, and no horizontal overflow occurs. Add VoiceOver labels for unread/read, category, source and timestamp.

- [ ] **Step 6: Run the App inbox matrix**

```bash
node --import tsx --test tests/inbox-unified-feed.test.ts tests/inbox-read-batch.test.ts tests/ink-signal-inbox.test.ts tests/inbox-notification-state.test.ts tests/relationship-inbox-badge-lifecycle.test.ts tests/relationship-inbox-interactions.test.ts tests/relationship-inbox-lifecycle.test.ts tests/relationship-inbox-mail-content.test.ts tests/relationship-inbox-screen-source.test.ts tests/relationship-inbox-view-model.test.ts
npm run typecheck
```

Expected: all pass with zero skip/cancel; unrelated failures are recorded, not relabeled as Sprint success.

- [ ] **Step 7: Commit presentation and locale changes**

After impact/detect-changes and staged diff review:

```bash
git commit -m "feat(app): match Ink Signal inbox design"
```

---

### Task 5: Visual QA and real Web/App runtime acceptance

**Files:**
- Create: `repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/design-qa.md`
- Create under ignored evidence root: `repos/orbit-app/build/harness-state/evidence/sprint-0030/run-01/`
- Modify at closeout: `repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/REPORT.md`
- Modify at closeout: `bridge/status.md`, `bridge/handoffs.md`, and one dated Sprint 0030 bridge handoff

**Interfaces:**
- Consumes: exact source asset, final RNW screenshot, running Web/API health, authenticated Simulator and the same account/database.
- Produces: passed/blocked design QA, RED→GREEN logs, runtime evidence, product commit SHA and separate closeout documentation commit.

- [ ] **Step 1: Perform same-viewport design comparison**

Capture the default list at 390×844 pt / 2× with the exact reference state: two unread rows, five mixed categories and Chinese locale. Open the source and implementation together. Record typography, spacing, color, row geometry, tab underline, safe area and footer differences in `design-qa.md`.

- [ ] **Step 2: Iterate until P0/P1/P2 are closed**

For each visible mismatch, add or tighten a failing test, preserve RED, make the minimal change, rerun GREEN, recapture and compare again. `design-qa.md` must end with `final result: passed`; if the source or implementation cannot be captured, it must say `final result: blocked`.

- [ ] **Step 3: Validate all important states**

Capture `all/activity/task/contact`, all-read pending/success/partial-failure, empty, one-source failure, all-source failure, dark mode, 320pt large text, seeded compose and conversation detail. Do not claim pixel fidelity for states absent from the source; verify consistency and usability instead.

- [ ] **Step 4: Run the actual Web/API**

Read `bridge/status.md` and `bridge/handoffs.md`, identify the authoritative current Web command/port, start or reuse the service, and verify `/api/health`. If any Web source changed, run its production build, stop the old process, start the new output and record PID/commit/health before App validation.

- [ ] **Step 5: Validate on iOS Simulator**

Build/refresh the App from the Sprint 0030 branch, point it to the running API, sign into the same test account and verify: Home inbox badge → inbox, each filter, one activity/task/contact/IORBIT target, one conversation, mark-all-read, pull-to-refresh persistence, partial failure recovery and background/foreground refresh. Record exact unavailable categories as blocked with API payload evidence; never seed fake rows into a production account.

- [ ] **Step 6: Run final verification**

Run App typecheck and the complete App suite once after the last product edit. Run Web typecheck/tests/build only if Web files changed. Run `gitnexus_detect_changes(scope="compare", base_ref="chat-agent")`, `git diff --check`, and inspect every staged file.

- [ ] **Step 7: Commit product and closeout separately**

Product changes must already be committed before writing final claims. Then create `REPORT.md` and Bridge records with product SHA, RED→GREEN commands/counts, reference and final screenshots, affected tests, Web build/restart status, Simulator/account/API evidence, limitations and merge order. Commit only those closeout files:

```bash
git commit -m "docs(sprint-0030): close unified inbox redesign"
```

## Self-review

- Spec coverage: exact `3a` layout, four filters, real unread count, confirmed all-read, mixed source projection, existing conversation/detail capabilities, 30-day truth, errors, large type, dark mode, Web runtime and Simulator acceptance each map to a task.
- Placeholder scan: no implementation or acceptance step is deferred; every conditional Web edit is gated by a concrete failing test and carries its own rebuild/restart requirement.
- Type consistency: `InboxFeedItem.readAction` is the only batch input; `InboxReadBatchResult` is the only batch output; default UI uses `InboxFeedView` and leaves existing detail/composer contracts intact.
- Risk control: the HIGH-risk `relationshipAlertsToView` path remains read-only by default; any exception requires explicit warning and expanded regression evidence.
