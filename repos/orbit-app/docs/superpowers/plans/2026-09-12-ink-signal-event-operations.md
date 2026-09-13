# Ink Signal Event Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Apply the selected operations and permission-denied screens to Orbit's existing operations workflow without inventing administration capabilities.

**Architecture:** Retain AppScreen's existing fixed secondary header and refresh boundary. Keep the operations API/VM and confirmation callbacks. Restyle EventOperationsContent's metrics, navigation, matching, tables and gates. Map an actual failure status 403 to a permission view with an existing event-detail destination.

**Tech Stack:** Existing Expo/RNW, theme/Ionicons, Node/esbuild/Playwright.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; selected `3a-活动运营台.png`, `3a-无权限-运营台.png`; HTML lines 103–125 and 161–173.

## Global Constraints

- Reuse approved visual source, in-place and inline execution/browser QA. App-only edits; no dependency, backend, generated-contract, real data, commit or integration changes.
- 48pt existing secondary header titled 活动运营, 16pt inset, white/ink/signal-blue and current dark palette. Operations metrics: 24/800 figures and 11pt labels in a four-column bordered strip, reflowing at larger font scales. Navigation uses 14pt text and open separators, not pill cards. No raster assets needed: actual icon library and data only.
- Keep actual 已报名／已签到／名片申请／已同意 metrics, existing four navigation destinations and AI generation/publish/retry confirmations, table results and time gates. Do not fabricate event title/date/capacity absent from the current response, notification sending, bulk approval or edit operations. Do not recast matching tasks as registration rows.
- Permission source: 64pt outlined lock, 22/900 title, 14/22 centered explanation, action inset 40pt and ≥46pt height. Use only actual 403; loading, offline, 401, 500, unconfigured and malformed data remain distinct. No permission-request API or invented administrator/workspace/person role. Return to encoded event detail; optionally retry the current read through existing refresh.
- All controls ≥44pt and text full-scale; no line truncation. 320pt 1.6×/2× plus 820pt dark. Large status labels and time gates move below their text, metric grid wraps rather than overflowing.
- GitNexus: Screen and Content LOW; GenerationRow/Shortcut LOW with one direct Content caller each. Content useStyles LOW with three direct components and four total affected symbols. No indexed process memberships. No shared AppScreen/VM/API edits.
- Final complete-package delivery requires Simulator acceptance. This batch's RNW validation does not satisfy that gate.

### Task 1: Real operations hierarchy and permission state

**Files:** Modify `src/screens/events/EventOperationsScreen.tsx`, `src/screens/events/EventOperationsContent.tsx`; create `tests/ink-signal-event-operations.test.ts`.

**Interfaces:** Keep HTTP callbacks/VM exports unchanged. Extend `EventOperationsContentState` with `{ kind: "forbidden"; message: string }`; add optional `onOpenEvent?: () => void` and `onRefresh?: () => void`, supplied by the real screen. Keep existing callers valid. Local useWindowDimensions controls responsive styles only.

- [x] Write rendered tests for the real screen with actual Content/VM/theme and controlled resource/router/Alert/client boundaries. Assert compact header, actual four metrics in one row, strip borders/type scale, metrics before navigation, no fake controls or initial writes; capture operations baseline.

```ts
assert.equal(await page.getByRole('heading', { name: '活动运营', exact: true }).evaluate(el => getComputedStyle(el).fontSize), '16px');
assert.deepEqual(await page.evaluate(() => window.fixture.posts), []);
assert.equal(await page.getByRole('button', { name: /通过全部|发送通知|申请权限/ }).count(), 0);
```

- [x] Add denied-state tests (403 only), no protected metrics/actions, encoded return/retry, and loading/unconfigured/offline/500/invalid distinctions. Run RED and confirm expected behavior/style failures.

```ts
const page = await open(t, { kind: 'failure', status: 403 });
await page.getByRole('heading', { name: '需要运营权限' }).waitFor();
await page.getByRole('button', { name: '返回活动详情', exact: true }).click();
assert.deepEqual(await navigation(page), ['/events/event%3Aops']);
```

- [x] Implement minimal state mapping ahead of unconfigured fallback, source header/title without duplicate eyebrow, open metric/navigation/content layout and lock screen. Keep confirmation functions and endpoints unchanged. Generation progress displays the real validated percentage including 0 and exposes an accessible value.

```tsx
state.kind === 'failure' && state.status === 403
  ? { kind: 'forbidden', message: state.error.message }
  : /* existing unconfigured and failure mapping */;
// Content forbidden branch:
<Text accessibilityRole="header">需要运营权限</Text>
<Text>{state.message}</Text>
<Pressable accessibilityRole="button" onPress={onOpenEvent}><Text>返回活动详情</Text></Pressable>
```

- [x] Add real callback tests: each encoded navigation destination; no POST before Alert confirmation; start/publish/retry paths, cancellation, failure notice, pending lock and refresh; actual progress 0/100 with disabled active-generation gate. Run new suite plus all existing event-operations tests, typecheck and diff check.

### Task 2: Responsive, source fidelity and review

**Files:** Same screen/test; create `docs/designs/2026-09-12-ink-signal/2026-09-12-event-operations-qa.md`; update README and `design-qa.md`.

**Interfaces:** No additional production exports; test fixture controls viewport/font scale/dark/error/long data, uses real callback bodies, and aborts external requests.

- [x] Test 320pt 1.6×/2× and 820pt dark operations/denied states: full text and large count/gate/status bounds, ≥44pt reachable controls, no horizontal overflow; scroll top/bottom with header fixed.

```ts
for (const control of await page.getByRole('button').all()) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
}
```

- [x] Capture both source-aligned states at 390×844/2×, every error/progress variant and responsive top/bottom. Open exact source/current pairs. Run design-qa across typography/layout/colors/icons/copy, fix actionable P0/P1/P2 test-first, record functional differences and P3 without unbounded polish.
- [x] Run final combined targeted tests/typecheck/diff, obtain independent read-only review and resolve supported findings. Record current App version and no Web/native/live-write verification; retain mandatory Simulator gate.

Self-review: source screens are mapped to actual capabilities; permission is an explicit response state, not an auth policy change; no fake event metadata or source-only actions; unchanged shared API/VM/route boundary, only two production files. Existing inline/in-place approvals reused; no unrequested integration.
