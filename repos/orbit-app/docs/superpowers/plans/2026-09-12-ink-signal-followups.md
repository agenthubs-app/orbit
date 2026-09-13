# Ink Signal 联系跟进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the approved 联系跟进 screen while retaining saved-task status changes, candidate generation, drafting, review and reminders.

**Architecture:** Keep the existing tools workspace and its request builders. Add a page-only adapter and a flat saved-followups list above it; reuse canonical task/contact view models without changing shared AI candidate mapping. Only saved tasks may be completed or restored.

**Tech Stack:** Expo / React Native, existing tokens and Ionicons, Node tests with RNW / Playwright.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; exact source `design_handoff_orbit_ink_signal/screenshots/2a-联系跟进.png` and HTML lines 332–343.

## Global Constraints

- Edit only `repos/orbit-app`; preserve user-owned work. Approved in-place workflow, selected ZIP and native/browser verification boundary remain unchanged.
- “我们的功能为主。如果有缺口的地方，你就仿照它的设计去补足就可以了。”
- No backend edits, contract-copy edits, database access, commit, deployment or dependency installation.
- 390×844 source: white surface, 48px header, 14px underline tabs, 15px group/name, 22px count, 40px real/initial avatar, 12px metadata, 14px nested task, 20px checkbox; enlarge actual touch areas to at least 44px and allow text to wrap.
- Use real related IDs/names/photos; do not invent identities or imply candidates are saved/sent. Other task categories remain reachable through all-tasks navigation.
- Targeted verification per batch; full test suite is consolidated after remaining pages.

### Task 1: Saved-followup list and safe canonical mapping

**Files:** Create `src/view-models/followups-page.ts`, `src/screens/followups/SavedFollowupsList.tsx`, `tests/ink-signal-followups.test.ts`; modify `src/screens/followups/FollowupsScreen.tsx`.

**Interfaces:** `followupsPageToView(tasksPayload: unknown, contactsPayload: unknown, now?: Date)` returns open/completed saved rows, other-task count and a separate legacy candidate payload. `SavedFollowupsList` receives this view (or null while loading), a mutation callback, busy ID and error. Reuse `taskDetailToView`, `tasksToListView` and `contactsToSummaries` for canonical data.

- [x] Write and run RED rendered tests: fixture with four open relationship tasks, one completed, one cancelled, one unrelated personal task and a legacy suggestion. Assert `待跟进 4`, `今天 3`, `之后 1`; source typography/underline and ≥44px separate contact/task/check targets; only real tasks appear as checkboxes; tabs never write.

```ts
await page.getByRole('tab', { name: '待跟进 4', exact: true }).waitFor();
assert.equal(await page.getByRole('checkbox').count(), 4);
await page.getByRole('tab', { name: '已完成 1', exact: true }).click();
assert.equal(await page.getByRole('checkbox').getAttribute('aria-checked'), 'true');
```

- [x] Implement the adapter, grouped rows and screen wiring. Fetch contacts read-only, keep tasks visible if contact metadata fails; show a visible metadata warning. Map pending groups with Tokyo dates (overdue/today/later/undated), omit cancelled tasks. Keep current PATCH protocol and guard same-turn double activation with a ref and `try/finally`.

```ts
const action = row.status === 'completed' ? 'reopen' : 'complete';
await client.patch(taskPath(row.id), {
  body: { action, idempotencyKey: `ios:${action}:${row.id}:${Date.now()}` },
});
```

- [x] Verify canonical URI encoding, successful refresh, failure retention and unlock, no fake zero counts during load errors, unknown contacts without fabricated names, and other-category navigation. Run `node --import tsx --test tests/ink-signal-followups.test.ts` and `npm run typecheck`.

### Task 2: Preserve review-only tools and visually verify

**Files:** Modify the same screen/test; write `docs/designs/2026-09-12-ink-signal/2026-09-12-followups-qa.md`; update design README and append `design-qa.md`.

**Interfaces:** Existing task/reminder generation, chat assist, message-draft and review callbacks remain unchanged. Candidate workspace receives only candidates; saved task draft context uses its actual contact, action and notes, never a made-up recipient. Retain reminder errors and refreshes.

- [x] Extend RED tests for retained `生成候选`, `生成提醒候选`, `AI 起草`, `起草联系消息` and `标记可确认` request bodies and review-only results; ensure no automatic external sending. Place tools after the primary list and label candidate-only content explicitly.

```ts
await page.getByRole('button', { name: '生成候选', exact: true }).click();
assert.equal((await requests(page))[0].path, '/api/tasks/generate');
assert.deepEqual((await requests(page))[0].body, { limit: 5 });
```

- [x] Run targeted new/legacy followup tests plus `tests/app-wide-workspaces.test.ts`, `npm run typecheck`, `git diff --check`. Capture normal, completed, 320px at 1.6×/2× text, 820px dark and error state. Open reference and latest normal screenshot together; inspect every variant, fix P0–P2, retain native-boundary caveat.
- [x] Request independent read-only review using the existing reviewer after verification; resolve findings and re-run affected checks. Record exact evidence and scoped local QA outcome. No integration action was requested.

Self-review: all source sections covered; tools retained below the source list; no shared candidate semantics changed; malformed canonical records must not acquire candidate completion actions. Missing contact metadata does not block task processing.
