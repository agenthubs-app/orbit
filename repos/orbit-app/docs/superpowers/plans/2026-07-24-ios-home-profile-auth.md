# iOS Home, Profile, and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the iOS home relationship workbench on one row, strengthen the personal business card, and complete email plus Google login through the Web mobile-auth bridge.

**Architecture:** Preserve the current screen/view-model split. Add explicit layout and business-card view data, keep auth protocol/storage in focused API modules, let `OrbitAuthSessionProvider` own the validated session lifecycle, and let screens render only user-facing form and state transitions.

**Tech Stack:** Expo SDK 57, Expo Router, React Native, TypeScript, `expo-web-browser`, `expo-crypto`, `expo-secure-store`, AsyncStorage migration, Node test runner.

## Global Constraints

- iOS is the primary mobile target.
- The relationship workbench remains one row at 320pt, 375pt, and wider supported iPhone widths.
- The profile page keeps its current sections; only the top personal card becomes a strong dark Orbit business card.
- Do not copy the complete Web profile editor into iOS.
- Do not block public browsing; require login only for identity-bound screens/actions.
- Google login uses the existing Web provider through `orbit://account/oauth`; do not add a native Google SDK.
- Store the session in SecureStore/Keychain, not AsyncStorage.
- A restored session is signed in only after server validation.
- Mobile code accesses Web behavior only through HTTP APIs and never imports `repos/orbits`.
- User-facing copy contains no provider, token, cookie, PKCE, mock, fixture, or implementation labels.
- Before editing an existing symbol, run GitNexus upstream impact analysis and stop for HIGH or CRITICAL risk.
- Before every commit, stage only task files and run GitNexus staged change detection.

---

## File Map

### Home and profile

- `src/view-models/home.ts` — declares the single-row workbench layout.
- `src/screens/home/HomeScreen.tsx` — renders one shared three-cell rail.
- `tests/home-view-model.test.ts` — locks the layout intent and labels.
- `src/view-models/profile.ts` — maps profile data to a compact business-card view.
- `src/screens/profile/ProfileScreen.tsx` — renders the dark Orbit card and login gate.
- `tests/profile-view-model.test.ts` — covers long/empty/many-tag card data.

### Auth protocol and persistence

- `src/api/mobile-auth.ts` — mobile credentials/provider/session/Google exchange HTTP functions and callback parsing.
- `src/api/auth-session-storage.ts` — SecureStore persistence and one-time AsyncStorage migration.
- `src/api/AuthSessionProvider.tsx` — validated session state and UI actions.
- `src/api/endpoints.ts` — mobile auth route constants.
- `src/api/auth-session.ts` — retains cookie utilities and sign-out; delegates credentials to the mobile bridge.
- `tests/mobile-auth.test.ts`
- `tests/auth-session-storage.test.ts`
- `tests/auth-session.test.ts`

### Screens and configuration

- `src/screens/profile/AccountAuthScreen.tsx`
- `src/screens/profile/AccountScreen.tsx`
- `src/view-models/account-auth.ts`
- `src/view-models/account-session.ts`
- `app.config.ts`
- `package.json`
- `package-lock.json`
- `docs/api-gaps.md`

---

### Task 1: One-Row Relationship Workbench

**Files:**
- Modify: `src/view-models/home.ts`
- Modify: `src/screens/home/HomeScreen.tsx`
- Modify: `tests/home-view-model.test.ts`

**Interfaces:**
- Produces: `HomeHubLayoutView.pipelineVariant: "single-row"`
- Preserves: the existing `HomePipelineItemView[]` values and labels.

- [ ] **Step 1: Run impact analysis**

Run GitNexus upstream impact analysis for:

- `homeToView` in `src/view-models/home.ts`
- `HomeScreen`, `HomeHubContent`, `PipelineRail`, and `PipelineCell` in `src/screens/home/HomeScreen.tsx`

Report direct callers and risk. Do not edit if any result is HIGH or CRITICAL without warning the user.

- [ ] **Step 2: Write the failing layout test**

Update the expected layout in `tests/home-view-model.test.ts`:

```ts
assert.deepEqual(view.layout, {
  aiMinHeight: 560,
  askInputMinHeight: 138,
  entryVariant: "compact",
  pipelineVariant: "single-row",
  secondaryEventLimit: 2,
});
```

Add a source-level layout guard:

```ts
test("home relationship workbench is a fixed three-cell row", () => {
  const source = readFileSync(
    new URL("../src/screens/home/HomeScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /pipelineRail:\s*\{[^}]*flexDirection:\s*"row"/su);
  assert.doesNotMatch(source, /pipelineRail:\s*\{[^}]*flexWrap:\s*"wrap"/su);
  assert.match(source, /pipelineCell:\s*\{[^}]*minWidth:\s*0/su);
});
```

- [ ] **Step 3: Run the focused test and verify the red state**

```bash
node --test --import tsx tests/home-view-model.test.ts
```

Expected: FAIL because `pipelineVariant` is missing and the rail still wraps.

- [ ] **Step 4: Implement the compact shared rail**

Add to `HomeHubLayoutView` and `homeHubLayout()`:

```ts
pipelineVariant: "single-row";
```

Replace independent colored card styling with:

```ts
pipelineRail: {
  backgroundColor: colors.surface2,
  borderColor: colors.border,
  borderRadius: radius.md,
  borderWidth: 1,
  flexDirection: "row",
  overflow: "hidden",
},
pipelineCell: {
  alignItems: "center",
  flex: 1,
  gap: spacing.xxs,
  minHeight: 82,
  minWidth: 0,
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.md,
},
pipelineDivider: {
  backgroundColor: colors.border,
  width: StyleSheet.hairlineWidth,
},
```

Render dividers between cells and remove `pipelineCellAccent`, `pipelineCellLive`, and `pipelineCellSky` backgrounds. Keep tone on the number only. Set label/detail text to centered, bounded lines.

- [ ] **Step 5: Run tests and commit**

```bash
node --test --import tsx tests/home-view-model.test.ts
npm run typecheck
```

Expected: focused tests PASS and TypeScript exits 0.

Run GitNexus staged change detection, then:

```bash
git add repos/orbit-app/src/view-models/home.ts repos/orbit-app/src/screens/home/HomeScreen.tsx repos/orbit-app/tests/home-view-model.test.ts
git commit -m "fix(ios-home): keep the relationship workbench on one row"
```

---

### Task 2: Orbit Personal Business Card

**Files:**
- Modify: `src/view-models/profile.ts`
- Modify: `src/screens/profile/ProfileScreen.tsx`
- Create: `tests/profile-view-model.test.ts`

**Interfaces:**
- Produces:
  - `ProfileBusinessCardView`
  - `profileBusinessCard(summary)`
  - `OrbitBusinessCard`

- [ ] **Step 1: Run impact analysis**

Run GitNexus upstream impact analysis for `profileToSummary`, `ProfileScreen`, and `ProfileCard`. Warn before proceeding on HIGH or CRITICAL risk.

- [ ] **Step 2: Write failing business-card tests**

```ts
test("profileBusinessCard limits visible tags and reports overflow", () => {
  const card = profileBusinessCard({
    ...profile,
    offering: ["AI 落地", "日本资源", "产品选型", "服务商引荐"],
    seeking: ["企业客户", "合作伙伴", "投资人"],
  });

  assert.deepEqual(card.offering.values, ["AI 落地", "日本资源"]);
  assert.equal(card.offering.overflow, 2);
  assert.deepEqual(card.seeking.values, ["企业客户", "合作伙伴"]);
  assert.equal(card.seeking.overflow, 1);
  assert.equal(card.initial, "小");
  assert.equal(card.metaLine, "Orbit · 创始人 · AI 企业应用");
});

test("profileBusinessCard omits empty metadata and tag groups", () => {
  const card = profileBusinessCard({
    ...profile,
    industry: "",
    offering: [],
    organization: "",
    role: "",
    seeking: [],
  });

  assert.equal(card.metaLine, "");
  assert.deepEqual(card.offering, { overflow: 0, values: [] });
  assert.deepEqual(card.seeking, { overflow: 0, values: [] });
});
```

- [ ] **Step 3: Run the test and verify the red state**

```bash
node --test --import tsx tests/profile-view-model.test.ts
```

Expected: FAIL because the mapper does not exist.

- [ ] **Step 4: Implement the pure card mapper**

Add:

```ts
export interface ProfileBusinessCardTagGroup {
  overflow: number;
  values: string[];
}

export interface ProfileBusinessCardView {
  headline: string;
  initial: string;
  metaLine: string;
  name: string;
  offering: ProfileBusinessCardTagGroup;
  seeking: ProfileBusinessCardTagGroup;
}

function previewGroup(values: string[]): ProfileBusinessCardTagGroup {
  return {
    overflow: Math.max(0, values.length - 2),
    values: values.slice(0, 2),
  };
}

export function profileBusinessCard(
  profile: ProfileSummary,
): ProfileBusinessCardView {
  return {
    headline: profile.headline,
    initial: profile.displayName.trim().slice(0, 1).toUpperCase() || "O",
    metaLine: [profile.organization, profile.role, profile.industry]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" · "),
    name: profile.displayName,
    offering: previewGroup(profile.offering),
    seeking: previewGroup(profile.seeking),
  };
}
```

- [ ] **Step 5: Render the dark card without changing lower sections**

Replace only the first `DataCard` in `ProfileCard` with `OrbitBusinessCard`. Use a fixed `#17211F` background, white name, bounded two-line headline, one-line metadata, two optional tag rows, and `+N`.

Core styles:

```ts
businessCard: {
  backgroundColor: "#17211F",
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: radius.lg,
  borderWidth: 1,
  gap: spacing.lg,
  overflow: "hidden",
  padding: spacing.xl,
},
businessCardName: {
  color: "#FFFFFF",
  fontSize: 24,
  fontWeight: "800",
  lineHeight: 29,
},
businessCardMeta: {
  color: "rgba(255,255,255,0.52)",
  fontSize: typography.caption,
  lineHeight: 17,
},
```

Use `numberOfLines` and `ellipsizeMode="tail"` for name, headline, metadata, and tags. Do not add gradients, animation, completion meters, or editing controls.

- [ ] **Step 6: Run tests and commit**

```bash
node --test --import tsx tests/profile-view-model.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

Run GitNexus staged change detection, then:

```bash
git add repos/orbit-app/src/view-models/profile.ts repos/orbit-app/src/screens/profile/ProfileScreen.tsx repos/orbit-app/tests/profile-view-model.test.ts
git commit -m "feat(ios-profile): strengthen the Orbit business card"
```

---

### Task 3: Mobile Auth Protocol and Secure Session Storage

**Files:**
- Create: `src/api/mobile-auth.ts`
- Create: `src/api/auth-session-storage.ts`
- Modify: `src/api/auth-session.ts`
- Modify: `src/api/endpoints.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.config.ts`
- Create: `tests/mobile-auth.test.ts`
- Create: `tests/auth-session-storage.test.ts`
- Modify: `tests/auth-session.test.ts`

**Interfaces:**
- Produces:
  - `MobileAuthUser`
  - `MobileAuthSession`
  - `fetchMobileAuthProviders`
  - `signInWithMobileCredentials`
  - `createGoogleOAuthAttempt`
  - `parseGoogleOAuthCallback`
  - `exchangeGoogleOAuthCode`
  - `validateAuthSession`
  - `createAuthSessionStorage`

- [ ] **Step 1: Run impact analysis**

Run GitNexus upstream impact analysis for:

- `ORBIT_API_ENDPOINTS`
- `signInWithCredentials`
- `mergeSetCookieHeaders`
- `signOutOrbitSession`

Only edit LOW/MEDIUM results.

- [ ] **Step 2: Install Expo-matched dependencies**

From `repos/orbit-app`:

```bash
npx expo install expo-crypto expo-secure-store expo-web-browser
```

Expected: package and lock files update with SDK-compatible versions.

Add `"expo-secure-store"` to `app.config.ts` plugins. Keep the existing image-picker configuration.

- [ ] **Step 3: Write failing protocol tests**

```ts
test("Google callback accepts the fixed Orbit URL and matching state", () => {
  assert.deepEqual(
    parseGoogleOAuthCallback(
      "orbit://account/oauth?code=code-1&state=state-1",
      "state-1",
    ),
    { code: "code-1", state: "state-1", success: true },
  );
});

test("Google callback rejects state mismatch and missing code", () => {
  assert.equal(
    parseGoogleOAuthCallback(
      "orbit://account/oauth?code=code-1&state=other",
      "state-1",
    ).success,
    false,
  );
  assert.equal(
    parseGoogleOAuthCallback(
      "orbit://account/oauth?state=state-1",
      "state-1",
    ).success,
    false,
  );
});

test("mobile credentials uses the bridge envelope", async () => {
  const result = await signInWithMobileCredentials({
    baseUrl: "https://orbit.example",
    email: "person@example.com",
    fetchImpl,
    password: "secret",
  });
  assert.equal(result.success, true);
  assert.equal(calls[0]?.url, "https://orbit.example/api/auth/mobile/credentials");
});
```

Test provider availability, no-store JSON parsing, OAuth cancel mapping, exchange errors, and Auth.js session validation.

- [ ] **Step 4: Write failing storage migration tests**

Inject storage interfaces:

```ts
test("session storage migrates the old AsyncStorage value once", async () => {
  legacy.set(oldKey, "authjs.session-token=old");
  const storage = createAuthSessionStorage({ legacy, secure });

  assert.equal(
    await storage.read(baseUrl),
    "authjs.session-token=old",
  );
  assert.equal(await secure.get(storage.key(baseUrl)), "authjs.session-token=old");
  assert.equal(await legacy.get(oldKey), null);
});

test("failed SecureStore writes do not erase the legacy session", async () => {
  legacy.set(oldKey, "authjs.session-token=old");
  secure.failWrites = true;
  const storage = createAuthSessionStorage({ legacy, secure });

  await assert.rejects(storage.read(baseUrl));
  assert.equal(await legacy.get(oldKey), "authjs.session-token=old");
});
```

- [ ] **Step 5: Run tests and verify the red state**

```bash
node --test --import tsx tests/mobile-auth.test.ts tests/auth-session-storage.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 6: Implement protocol helpers**

Add endpoint constants:

```ts
authMobileCredentials: "/api/auth/mobile/credentials",
authMobileGoogleExchange: "/api/auth/mobile/google/exchange",
authMobileGoogleStart: "/api/auth/mobile/google/start",
authMobileProviders: "/api/auth/mobile/providers",
authSession: "/api/auth/session",
```

`mobile-auth.ts` accepts injected `fetchImpl`, random-byte, and digest functions so Node tests do not import native modules. Build start URLs with `URL`/`URLSearchParams`; accept only `orbit://account/oauth` callbacks; map server error codes to the approved Chinese messages.

`signInWithCredentials` in `auth-session.ts` becomes a compatibility wrapper around `signInWithMobileCredentials`. Keep cookie merge and sign-out helpers used by existing tests.

- [ ] **Step 7: Implement SecureStore storage**

Use:

```ts
export interface KeyValueStorage {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
```

`createAuthSessionStorage` reads SecureStore first. If absent, it reads the old `orbit.authCookieHeader.<baseUrl>` AsyncStorage key, writes SecureStore, then deletes the old key. `clear` deletes both locations. Never log stored values.

- [ ] **Step 8: Run tests and commit**

```bash
node --test --import tsx tests/mobile-auth.test.ts tests/auth-session-storage.test.ts tests/auth-session.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

Run GitNexus staged change detection, then:

```bash
git add repos/orbit-app/package.json repos/orbit-app/package-lock.json repos/orbit-app/app.config.ts repos/orbit-app/src/api repos/orbit-app/tests/mobile-auth.test.ts repos/orbit-app/tests/auth-session-storage.test.ts repos/orbit-app/tests/auth-session.test.ts
git commit -m "feat(ios-auth): add secure mobile session protocol"
```

---

### Task 4: Validated Session Provider and Login Screens

**Files:**
- Modify: `src/api/AuthSessionProvider.tsx`
- Modify: `src/screens/profile/AccountAuthScreen.tsx`
- Modify: `src/screens/profile/AccountScreen.tsx`
- Modify: `src/screens/profile/ProfileScreen.tsx`
- Modify: `src/view-models/account-auth.ts`
- Modify: `src/view-models/account-session.ts`
- Modify: `tests/account-auth-view-model.test.ts`
- Modify: `tests/account-session-view-model.test.ts`
- Modify: `tests/authenticated-client-usage.test.ts`

**Interfaces:**
- Consumes: Task 3 protocol and storage helpers.
- Produces:
  - `auth.user`
  - `auth.providers`
  - `auth.signInWithGoogle(next?)`
  - validated `auth.signedIn`

- [ ] **Step 1: Run impact analysis**

Run GitNexus upstream impact analysis for:

- `OrbitAuthSessionProvider`
- `useOrbitAuthSession`
- `AccountAuthScreen`
- `AccountScreen`
- `ProfileScreen`
- `accountAuthToView`
- `accountSessionToView`

The stale index may not contain every untracked symbol. Record “not found” results and inspect direct imports with `rg`; do not skip found-symbol impact results.

- [ ] **Step 2: Write failing provider/view-model tests**

Extend auth view data:

```ts
assert.equal(accountAuthToView("login").showGoogle, true);
assert.equal(accountAuthToView("signup").showGoogle, true);
assert.equal(accountAuthToView("forgot").showGoogle, false);
```

Add real session identity mapping:

```ts
const view = accountSessionToView(accountPayload, {
  authenticated: true,
  authUser: {
    email: "person@example.com",
    id: "user_1",
    name: "田中美咲",
  },
});
assert.equal(view.displayName, "田中美咲");
assert.equal(view.statusLabel, "已登录");
```

Add a source test that `AuthSessionProvider` imports SecureStore-backed storage and does not call `AsyncStorage.setItem` directly.

- [ ] **Step 3: Run tests and verify the red state**

```bash
node --test --import tsx tests/account-auth-view-model.test.ts tests/account-session-view-model.test.ts tests/authenticated-client-usage.test.ts
```

Expected: FAIL because Google/session user fields do not exist.

- [ ] **Step 4: Implement validated provider lifecycle**

Provider state:

```ts
interface AuthSessionContextValue {
  cookieHeader: string;
  providers: readonly ("google")[];
  ready: boolean;
  register(input: RegisterInput): Promise<AuthActionResult>;
  signIn(input: SignInInput): Promise<AuthActionResult>;
  signInWithGoogle(next?: string): Promise<AuthActionResult>;
  signOut(): Promise<AuthActionResult>;
  signedIn: boolean;
  user: MobileAuthUser | null;
}
```

On mount:

1. read SecureStore/migrate legacy;
2. validate through `/api/auth/session`;
3. keep cookie and user only on valid response;
4. clear invalid storage;
5. fetch enabled providers independently so email login remains available.

For Google, generate state/verifier with `expo-crypto`, call `WebBrowser.openAuthSessionAsync`, parse the callback, exchange, persist, validate, then update state. Cancel returns `{ success: false, message: "已取消 Google 登录" }` without clearing a valid old session.

`signedIn` is `user !== null`, never `cookieHeader.length > 0`.

- [ ] **Step 5: Add Google UI and real account identity**

In `AccountAuthScreen`:

- keep native email form;
- add password visibility control;
- show “忘记密码” only on login;
- render a divider and Google button only for login/signup when `auth.providers` contains `"google"`;
- disable relevant buttons during one active submission;
- preserve entered email when Google is cancelled;
- use approved messages only.

In `AccountScreen`, pass `auth.user` into `accountSessionToView`. In `ProfileScreen`, show a login action instead of personal data when the validated session is absent; route to `/account/login?next=%2Fprofile`.

- [ ] **Step 6: Run tests and commit**

```bash
node --test --import tsx tests/account-auth-view-model.test.ts tests/account-session-view-model.test.ts tests/authenticated-client-usage.test.ts tests/profile-view-model.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

Run GitNexus staged change detection, then:

```bash
git add repos/orbit-app/src/api/AuthSessionProvider.tsx repos/orbit-app/src/screens/profile repos/orbit-app/src/view-models/account-auth.ts repos/orbit-app/src/view-models/account-session.ts repos/orbit-app/tests/account-auth-view-model.test.ts repos/orbit-app/tests/account-session-view-model.test.ts repos/orbit-app/tests/authenticated-client-usage.test.ts
git commit -m "feat(ios-auth): complete email and Google account flows"
```

---

### Task 5: Cross-End Verification, API-Gap Update, and Visual Review

**Files:**
- Modify: `docs/api-gaps.md`
- Modify tests only for verified defects found during integration.

**Interfaces:**
- Consumes: deployed/local Web mobile bridge and all iOS work.
- Produces: verified end-to-end behavior and accurate remaining-gap documentation.

- [ ] **Step 1: Update API-gap documentation**

Remove or revise only the resolved items for:

- mobile-safe email session issuance;
- Google OAuth/deep-link callback;
- validated session restoration.

Keep password reset and any unrelated admin/session-refresh gaps. Add exact route names and state that Google needs configured Web `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_SECRET`.

- [ ] **Step 2: Run the complete mobile test and type suite**

From `repos/orbit-app`:

```bash
npm test
npm run typecheck
npx expo config --type public
```

Expected: all tests pass, TypeScript exits 0, and Expo config includes scheme `orbit` plus SecureStore/WebBrowser dependencies.

- [ ] **Step 3: Run iOS build verification**

```bash
npx expo run:ios --no-install
```

Expected: native iOS build completes and launches. If simulator/build tooling is unavailable, report the exact command error and continue with non-native verification; do not claim the build passed.

- [ ] **Step 4: Perform visual checks**

On available simulators:

- 320pt-equivalent narrow iPhone: workbench remains one row.
- 375pt iPhone: workbench, card, and login controls have no clipping.
- Wider iPhone: content remains bounded by the current max width.
- Profile long text and many tags truncate correctly.
- Google cancel returns to the login screen with the email unchanged.

Capture screenshots outside git-tracked product directories or delete them after review. Do not commit simulator artifacts.

- [ ] **Step 5: Perform local auth integration**

Against the configured Web server:

1. create an email account;
2. sign in and verify `/api/auth/session` returns the user;
3. terminate and reopen the app, verifying Keychain restoration;
4. sign out and verify the session is removed;
5. start Google login, verify callback and exchange on an interactive account;
6. retry the same exchange code and verify rejection.

If interactive Google access is unavailable, mark only step 5 as manual outstanding. Email/session tests and mocked Google security tests must still pass.

- [ ] **Step 6: Final change detection and commit**

Run GitNexus staged change detection for the exact staged mobile files.

```bash
git add repos/orbit-app/docs/api-gaps.md
git commit -m "docs(ios-auth): record the completed mobile login boundary"
```

If integration fixes changed code, stage and commit those files with a separate `fix(ios-auth): ...` message after rerunning their focused tests.

- [ ] **Step 7: Final repository evidence**

Record:

```bash
git status --short -- repos/orbit-app
git log --oneline -8
```

Report committed hashes, commands run, passing counts, any unrelated dirty files preserved, and the exact status of real Google manual verification.
