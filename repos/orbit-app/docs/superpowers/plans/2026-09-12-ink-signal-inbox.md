# Ink Signal Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the selected 3a inbox hierarchy without replacing Orbit's actual message, reminder, signal and draft behavior.

**Architecture:** Keep the existing single screen module and view-model/API boundaries. Give InboxLayout a compact fixed header, restyle its list-specific classes, and keep actual threads/reminders separated. Surface reminder resource loading/failure instead of treating unavailable data as an empty inbox.

**Tech Stack:** Expo/React Native, current theme/Ionicons, Node/RNW/Playwright.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; exact `3a-收件箱.png` and source HTML lines 93–102.

## Global Constraints

- Reuse approved source, in-place execution and browser QA boundaries. Write only App; preserve dirty work. No dependencies, commit, publishing, generated contracts or real business-data mutations.
- Source: 48pt header, 16pt inset, 14pt ink/800 underlined tabs with 22pt gaps; 14pt vertical row padding, 8pt unread indicator + 12pt gap, 15/21 headline and 12/18 secondary/date. Use existing system font and real Ionicons; no raster assets in source app-owned content.
- Keep existing 消息/提醒 tabs and 写消息. No fabricated 全部已读 API, category tabs, recent-30-day limit or fake records. Search remains an extra working capability below tabs.
- Actual message name/subject/preview/date/unread state remain visible and searchable. Preserve full content at large text; use a dedicated list layout rather than changing shared message-body styles. Native and long timestamps may wrap; never fabricate shorter times.
- Existing draft preview, reply, privacy, deep-link delivery, signal confirmation, seed routing and local-only reminder dismissal remain. No automatic marking read or sending. Notification read failure must be visible and retryable without pretending there are no reminders.
- Impact: local functions LOW; private useStyles HIGH with 15 direct callers/17 affected symbols, two entry screens with six indexed process memberships each. User warned before edits. Read all consumers; run both list/detail regressions.
- Local acceptance is only RNW. Final whole-package delivery MUST pass Simulator validation per user's explicit requirement; current native red-screen status remains unresolved.

### Task 1: Inbox header, tabs, rows and resource states

**Files:** Modify `src/screens/inbox/RelationshipInboxScreen.tsx`; create `tests/ink-signal-inbox.test.ts`.

**Interfaces:** Keep exports and HTTP callbacks. Extend private InboxContent with `notificationsError: string`, `notificationsLoading: boolean`, `onRefreshNotifications: () => void`; read these from the existing resource. InboxLayout keeps its public-to-file props, uses the real back stack and `/home` fallback (the selected parent). Composer cancel/preview onBack keep their existing semantics.

- [x] Add real-screen rendered tests for fixed compact header, ink tabs, 14pt row padding and 20pt unread gutter shared by read/unread items, full metadata, absent unsupported controls and no writes. Add partial reminder failure/loading tests and enabled retry against the existing refresh callback.

```ts
assert.equal(await page.getByRole('heading', { name: '收件箱', exact: true }).evaluate(el => getComputedStyle(el).fontSize), '16px');
assert.equal(await page.getByRole('tab', { name: '消息', exact: true }).evaluate(el => getComputedStyle(el).borderBottomColor), 'rgb(11, 18, 32)');
await page.getByRole('tab', { name: '提醒', exact: true }).click();
await page.getByText('提醒读取失败，请重试。', { exact: true }).waitFor();
assert.equal(await page.getByText('暂无提醒', { exact: true }).count(), 0);
```

- [x] Run `node --import tsx --test tests/ink-signal-inbox.test.ts` RED; verify missing presentation/state assertions, not broken test setup.
- [x] Implement header outside ScrollView, responsive title/action arrangement, tabs above retained search; read/unread aligned compact message rows with real fields, wrapping alert/signal fields. Keep existing request callbacks and full message body/reply styling unchanged.

```tsx
{notificationsLoading ? <Text>正在读取提醒。</Text> : notificationsError ? (
  <View><Text accessibilityRole="alert">{notificationsError}</Text>
    <ActionButton icon="refresh-outline" label="重试读取提醒" onPress={onRefreshNotifications} variant="secondary" />
  </View>
) : <AlertsCard onDismissAlert={id => setDismissedAlertIds(current => {
  const next = new Set(current); next.add(id); return next;
})} view={visibleAlertsView} />}
```

Keep the existing inline dismissedAlertIds Set updater; do not introduce a new business action or request.

- [x] Run new tests plus `tests/relationship-inbox-{interactions,mail-content,screen-source,view-model}.test.ts`; typecheck and diff check. Keep all protocol/preview/privacy tests intact; update only obsolete presentation expectations if necessary.

### Task 2: Responsive and visual acceptance

**Files:** Same test/screen; create `docs/designs/2026-09-12-ink-signal/2026-09-12-inbox-qa.md`; update design README and `design-qa.md`.

**Interfaces:** No new production exports. Fixture controls resource state/long data/font scale; real screen, VM, theme, RNW event handlers and production callbacks execute. Native, auth and HTTP remain controlled boundaries.

- [x] Add 320pt 1.6×/2× and 820pt dark tests for full text, header/list bounds and reachable ≥44pt controls; long participant/subject/date, reminders and signal evidence cannot clip. Exercise compose/cancel, thread preview/privacy, partial failure retry and local dismiss/no writes.

```ts
for (const control of await page.getByRole('button').all()) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
}
```

- [x] Capture normal list and alerts, empty/error, scaled/dark list+alerts+composer+detail states. Open exact source and latest normal screenshot together at 390×844/2×. Run design-qa; fix P0/P1/P2 test-first and re-inspect, record deliberate functional/P3 differences.
- [x] Run combined targeted tests/typecheck/diff; request independent read-only review, address supported findings, update local QA evidence. Do not claim whole-package/native completion or perform integration.

Self-review: source visuals map to current capabilities, no invented read/status semantics, one production file/no refactor, all shared style consumers covered by retained regression plus added scaled screenshots. Existing approval covers inline execution. No new design decision or integration gate is inferred.
