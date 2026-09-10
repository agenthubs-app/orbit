# Mail-like inbox implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Preserve the user's existing in-place `chat-agent` work and do not commit or publish.

**Goal:** Turn the existing native inbox into a clear, mail-like reading and composing experience, titled 收件箱.

**Architecture:** Keep the current API endpoints and view-model boundary. Add inbox-owned native navigation chrome, open list rows and an exclusive compose state; retain the existing thread route, privacy controls, reminders and no-external-send boundary.

**Tech Stack:** Expo, React Native, TypeScript, node:test, RN Web / Chromium interaction tests, iOS Simulator visual QA.

**Spec:** User approved the after designs and explicitly authorized direct design/implementation of the mail revision. Visual reference: `docs/designs/2026-09-08-redesigned-screens/04-inbox-mail-revision.png`.

## Global constraints

- Edit only `repos/orbit-app`; preserve unrelated edits.
- Title 收件箱; no duplicated metrics, no workflow-instruction previews, no invented received mail.
- Native SF/PingFang, existing theme tokens, warm-white canvas, blue navigation, 44 pt controls.
- Back / 写消息 toolbar; search; 消息 / 提醒 tabs; name, time, subject and preview in separator rows.
- Compose, draft preview and list are exclusive views. Never label non-persistent previews saved or sent.
- No sending, new archive/delete/read APIs, contract-copy edits, commits or publishing.
- Before symbol edits, retain GitNexus impact results; high-risk shared localization paths require regression tests.

### Task 1: Honest mail content

**Files:** `src/view-models/relationship-inbox.ts`, `tests/relationship-inbox-view-model.test.ts`.

**Interfaces:** Existing `relationshipInboxToView(unknown)` and `createdRelationshipThreadToView(unknown)` outputs remain compatible.

- [x] Add tests for generic legacy subjects, empty/technical previews and bodies, empty drafts, and preservation of actual multilingual correspondence.
- [x] Run the focused tests and verify the new behavioral assertions fail.
- [x] Normalize only known internal placeholders; return `暂无消息正文` for missing readable content and an empty string for missing draft text. Keep real correspondence verbatim.
- [x] Re-run view-model tests; retain known demo translations and source/safety boundaries.

```ts
assert.equal(view.conversations[0]?.subject, "后续沟通");
assert.equal(view.conversations[0]?.preview, "暂无消息正文");
assert.equal(view.selected?.draftReply, "");
```

### Task 2: Mail list, reading and composing

**Files:** `src/screens/inbox/RelationshipInboxScreen.tsx`, `tests/relationship-inbox-interactions.test.ts`, existing source-boundary tests.

**Interfaces:** Keep `RelationshipInboxScreen`, `RelationshipInboxThreadScreen`, `/inbox/[id]`, existing GET/POST request builders.

- [x] Add browser-backed tests exercising real screen handlers: search by sender/subject/content, no-match state, tab switching, route selection, exclusive composer, cancellation, draft preview and local-only reply preview.
- [x] Verify expected failures before implementation.
- [x] Replace inbox dashboard chrome with native mail header and separator list. Put all reminders behind 提醒, without silently truncating them. Collapse privacy controls behind a labeled disclosure in reading view.
- [x] Keep draft preview clearly local and unsent; make pending/error states visible and prevent exiting while a draft request is pending.
- [x] Run interaction, source-boundary, full test suite and TypeScript checks.

```ts
await page.getByRole("button", { name: "写消息", exact: true }).click();
assert.equal(await page.getByText("曾伟", { exact: true }).count(), 0);
await page.getByRole("button", { name: "取消", exact: true }).click();
assert.equal(await page.getByText("曾伟", { exact: true }).count(), 1);
assert.deepEqual(await page.evaluate(() => window.fixture.requests), []);
```

### Task 3: Verification and handoff

**Files:** `design-qa.md`, design evidence README; simulator output remains uncommitted.

- [x] Inspect the iOS list, search, reminders, composer and thread at 402 × 874 pt, plus dark appearance.
- [x] Compare normalized reference and rendered app together; fix P0/P1/P2 findings and recapture.
- [x] Obtain a bounded independent code review and resolve substantive findings.
- [x] Record passing checks and any limitations, deliver verified local changes without a commit or deployment.

Final verification: 817 tests passed, 0 failed, 0 skipped; TypeScript and diff whitespace checks passed. Native evidence and scoped limitations are recorded in `design-qa.md`. No backend writes, commit, push or publishing.
