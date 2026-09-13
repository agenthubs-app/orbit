# Ink Signal Settings and Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the selected 3a settings/account visual language to existing working capabilities.

**Architecture:** Retain AppScreen and the existing notification/auth/resource boundaries. Settings becomes open grouped rows; AccountContent becomes open identity/workspace/goal sections with compact access rows. No shared tokens, API, auth or notification service is rewritten.

**Tech Stack:** Expo, React Native, existing theme/Ionicons, Node/RNW/Playwright.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; exact `3a-设置.png`, `3a-账号与工作区.png`, source HTML lines 31–58.

## Global Constraints

- Approved source, browser/native boundary and in-place execution are reused. Edit only App, preserve unrelated work; no installs, commit, publish, backend or real-account writes.
- Function priority: keep explicit push opt-in, both revocation paths and failure retry, authenticated permissions, API settings, validated identity, real workspace/role/plan/timezone/goal, guest boundary and sign-out failure.
- Do not invent workspace members/switching, invitations, data export, privacy scope, language settings or a version number. Sign-out stays in its existing account location; profile edit uses the working `/profile` entry.
- Source geometry: 16pt inset, 15/800 section heading, 6pt divider gap, 50pt rows, 22–24pt section gaps; account identity 56pt avatar, 14pt gap, 18pt name and 13pt email; workspace 36pt icon, 12pt gap, 15pt name and blue current badge. Source/system chrome excluded. Scaled text and all controls must remain readable/reachable at 320pt 1.6×/2×; dark retains existing theme.
- Impact preflight: SettingsScreen/AccountScreen LOW, 0 indexed direct callers; AccountContent LOW one AccountScreen caller; InfoCell LOW one AccountContent caller/two affected; private styles LOW one/two callers. No affected execution flows reported; route use remains part of verification despite incomplete indexing.
- Full suite runs after remaining pages. Each task runs targeted checks, typecheck, screenshot comparison and independent review.

### Task 1: Settings grouped capability rows

**Files:** Modify `src/screens/settings/SettingsScreen.tsx`; create `tests/ink-signal-settings-account.test.ts`; adapt only tree-location selectors in `tests/notifications/{merged-notification-lifecycle,notification-registration-races}.test.ts` if necessary.

**Interfaces:** `SettingsScreen()` unchanged. Existing notification callbacks and destination paths unchanged. Keep stable action labels `打开账号`, `打开权限中心`, `打开服务器`; visible account row may use full title. Notification action exposes existing enable/disable/retry label and disabled state.

- [x] RED rendered checks for 通用/账号/服务器 section hierarchy, 50pt row and non-card notification control; test guest filtering and all three routes, notification idle/no write, explicit on/off, held revocation and failed retry with both real revocation-queue callbacks.

```ts
const account = page.getByRole('button', { name: '打开账号', exact: true });
assert.equal((await account.boundingBox())!.height, 50);
await page.getByRole('heading', { name: '通用', exact: true }).waitFor();
await page.getByRole('button', { name: '关闭关键提醒', exact: true }).click();
assert.deepEqual(await calls(page), ['opt-in:false', 'revoke-local', 'revoke-durable']);
```

- [x] Run `node --import tsx --test tests/ink-signal-settings-account.test.ts` before production changes; confirm genuine missing presentation failures. Replace DataCard wrapper with an open section, notification row + retained helper/visible retry, then group destination rows by actual capability. No unsupported placeholder actions.

```tsx
<View style={styles.section}>
  <Text accessibilityRole="header" style={styles.sectionTitle}>通用</Text>
  <View style={styles.sectionRows}>{/* real notification and permission rows */}</View>
</View>
```

- [x] Run new tests, `tests/app-wide-account.test.ts`, all three notification consumer suites. If old child-index selectors fail, traverse the shallow JSX tree by Pressable role/label instead; retain real lifecycle, storage and dual-revocation assertions.

### Task 2: Account identity and workspace

**Files:** Modify `src/screens/profile/AccountScreen.tsx`; same new test; create `docs/designs/2026-09-12-ink-signal/2026-09-12-settings-account-qa.md`; update design README and `design-qa.md`.

**Interfaces:** `AccountScreen()` and private `AccountContent({onRefresh, signedIn, view})` unchanged. Keep `accountSessionToView` data semantics; display verified session email only while signed in, derive avatar from real displayed name. Profile action goes to `/profile`, not a fake editing endpoint. Sign-out keeps provider result/refresh behavior.

- [x] RED checks for open identity, exact name/email, 56pt avatar and real workspace/role/plan/timezone/goal; absence of fake members/invite/new/switch; real access routes; sign-out failure and success refresh; loading/failure/guest never expose stale private identity. Exercise long names and 320pt scaled / 820pt dark.

```ts
assert.equal(await page.getByText('cheng.chuan@example.test', { exact: true }).count(), 1);
await page.getByRole('button', { name: '修改个人资料', exact: true }).click();
assert.deepEqual(await navigation(page), ['/profile']);
assert.equal(await page.getByRole('button', { name: '邀请成员', exact: true }).count(), 0);
```

- [x] Implement open identity row, workspace divider/initial/current chip with real existing metadata, connection goal, compact server/permissions rows and existing guest/sign-out actions. Remove redundant account eyebrow only; leave resource/auth callback bodies unchanged.
- [x] Run combined new/notification/account-session/app-wide-account tests and typecheck/diff check; capture both normal sources and implementation together, failures/guest and all scaled/dark top/bottom images. Fix P0/P1/P2 test-first, record functional differences and exact verification scope.
- [x] Request independent read-only review, address supported findings and record final local QA without claiming native or overall completion.

Self-review: both source layouts map to working existing data/actions. Missing capabilities are explicit differences, not fake rows. Notification/provider services, shared shell and VM stay unchanged. User approval already covers inline execution; no new integration action is requested.
