# Ink Signal 登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the approved login reference while preserving working login, signup, Google and password recovery.

**Architecture:** Change only AccountAuthScreen's presentation and its private field/brand styles. Use a safe-area shell with a fixed close header and growing scroll content; leave shared AppScreen, auth provider, view-model normalization and existing submit callbacks unchanged.

**Tech Stack:** Expo / React Native, existing theme and Ionicons, RNW / Playwright / Node tests.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; exact `2a-登录.png` and source HTML lines 344–355.

## Global Constraints

- Existing approval covers this visual source, in-place execution and browser/native boundaries. Edit only `repos/orbit-app`; preserve all unrelated work.
- “我们的功能为主。如果有缺口的地方，你就仿照它的设计去补足就可以了。”
- No new dependencies, backend/auth protocol changes, generated contract edits, real account writes, commits or deployment.
- Source content: 48pt close header, 24pt body inset, 40pt hero top gap, 26pt Orbit wordmark, 34/40 welcome heading, 14pt description, 36pt form gap, 22pt field gap, 46pt underlined inputs, 50pt primary/OAuth controls, 12pt radius, bottom signup link. Safe area/device chrome are system-owned.
- Retain password helper/visibility, Google availability and busy states, form values on failure, created notice, safe next and recovery scope/lock. Touch targets ≥44pt and text can wrap/scroll at 320pt with 1.6×/2× text.
- Full suite is consolidated after remaining pages; this batch runs targeted tests, typecheck, visual comparison and independent review.

### Task 1: Open authentication layout and retained actions

**Files:** Modify `src/screens/profile/AccountAuthScreen.tsx`; create `tests/ink-signal-auth.test.ts`; update only obsolete form-boundary assertion in `tests/app-wide-account.test.ts`.

**Interfaces:** `AccountAuthScreen({ mode: 'login' | 'signup' | 'forgot' })` remains unchanged. Close calls `router.back()` when history exists, otherwise `router.replace('/account')`; it never follows a private next route. Existing field names, auth actions and request bodies stay unchanged.

- [x] Write RED real-screen tests for open full-width fields, source hero/CTA geometry, password-adjacent recovery, bottom registration and safe close. Also exercise successful and failed login/signup, provider-off, OAuth cancellation, busy controls and no implicit request.

```ts
const email = page.getByRole('textbox', { name: '邮箱', exact: true });
assert.equal((await email.boundingBox())!.x, 24);
const forgot = page.getByRole('link', { name: '忘记密码', exact: true });
assert.ok((await forgot.boundingBox())!.y < (await page.getByRole('button', { name: '登录', exact: true }).boundingBox())!.y);
await page.getByRole('button', { name: '关闭', exact: true }).click();
assert.deepEqual(await page.evaluate(() => window.fixture.navigation), ['/account']);
```

- [x] Run `node --import tsx --test tests/ink-signal-auth.test.ts` and confirm failures are missing production layout/close behavior. Implement the minimal shell/field/style changes, preserving existing submit callback bodies and real Google library icon. The source's Orbit. is editable wordmark text, not a fabricated raster asset.

```tsx
<SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
  <View style={styles.header}>{/* close: real back or public account */}</View>
  <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
    {/* hero, existing fields, existing helper routes and submit actions */}
  </ScrollView>
</SafeAreaView>
```

- [x] Run new tests plus `account-auth-view-model`, `account-auth-screen-source`, `password-reset-interactions`, `app-wide-account`; run typecheck and diff check. Update the obsolete boxed-form expectation to assert underlined open fields without removing credential/action/error assertions.

### Task 2: Visual QA and handoff evidence

**Files:** Same test and screen as needed; create `docs/designs/2026-09-12-ink-signal/2026-09-12-auth-qa.md`; update design README and append root `design-qa.md`.

**Interfaces:** Screenshot fixture keeps real screen, VM, theme, RNW and icon glyphs; only native, navigation and external auth/client boundaries are replaced. Real recovery HTTP behavior remains covered by existing tests.

- [x] Capture filled 390×844 login at 2× pixel density, compare reference and implementation together. Inspect signup/forgot, error, narrow 1.6×/2× text and 820pt dark. Assert text containment and reachable controls, fix P0/P1/P2 with test-first regression.
- [x] Use requesting-code-review for independent read-only review after verification. Resolve findings, rerun affected tests, record precise counts and boundaries. Do not claim native authentication or whole-package completion.

Self-review: all source sections mapped; unsupported features are not invented; signup/recovery retain their distinct forms; close remains public-safe; no shared shell or security implementation is edited.
