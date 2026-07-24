# Orbit AI New-Chat and Product Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a plain `/app/agent` open a fresh conversation and make non-authentication product pages use the approved pure-white palette in light mode.

**Architecture:** Keep conversation history persistence unchanged, but make the URL `session` parameter the only initial-session selector. Update the shared light-theme semantic tokens once, then restore the previous light token set inside the existing authentication-page scope so login, sign-up, and forgot-password retain their current presentation.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript 5.7, CSS-in-TS style emission, Node test runner with `tsx`.

## Global Constraints

- Preserve the existing dark theme and theme toggle.
- Preserve the current authentication UI for login, sign-up, and forgot-password.
- Do not change page layouts, data services, or conversation-history operations.
- Keep Agent-only composition rules scoped to `[data-orbit-real-page="agent"]`.
- Preserve unrelated working-tree changes and stage only the hunks/files belonging to each task.
- Run GitNexus upstream impact analysis before modifying each code symbol and `gitnexus_detect_changes` before every commit.

---

## File Structure

- `app/(app)/app/agent/orbit-real-agent.tsx`: owns client-side conversation initialization and history hydration.
- `app/(app)/app/orbit-theme.tsx`: owns shared light-theme tokens, authentication light-theme compatibility tokens, theme initialization, and toggle behavior.
- `tests/pages/app-agent-chat-history.test.ts`: locks the URL-only initial-session selection contract.
- `tests/ui/theme.test.ts`: locks the product light palette, authentication exception, and dark-theme/toggle preservation.

### Task 1: Make the Agent Home Route Start a Fresh Conversation

**Files:**
- Modify: `tests/pages/app-agent-chat-history.test.ts`
- Modify: `app/(app)/app/agent/orbit-real-agent.tsx:1499-1553`

**Interfaces:**
- Consumes: `currentAgentSessionId(): string`, `loadStoredAgentChatSessions(): Promise<AgentStoredChatSession[]>`, and `restoreSession(session)`.
- Produces: an initialization effect where only `?session=<id>` selects a saved session; plain `/app/agent` still hydrates history but leaves `messages`, `panel`, and `activeSessionId` empty.

- [ ] **Step 1: Run GitNexus impact analysis**

Run:

```text
gitnexus_impact({
  repo: "orbits",
  target: "OrbitRealAgent",
  file_path: "app/(app)/app/agent/orbit-real-agent.tsx",
  direction: "upstream"
})
```

Expected: review direct callers (`AppAgentPage` and `AppChatPage`) and warn before editing only if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write the failing initialization contract test**

Append to `tests/pages/app-agent-chat-history.test.ts`:

```ts
test("agent home starts fresh unless the URL explicitly selects a session", () => {
  const source = readProjectFile("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(source, /const sessionId = currentAgentSessionId\(\);/);
  assert.doesNotMatch(
    source,
    /currentAgentSessionId\(\)\s*\|\|[\s\S]{0,240}AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY/,
  );
  assert.match(source, /if \(session\) \{\s*restoreSession\(session\);/);
  assert.match(source, /const query = currentAgentQuery\(\);/);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --import tsx --test tests/pages/app-agent-chat-history.test.ts
```

Expected: the new test fails because the initialization effect still falls back to `localStorage`.

- [ ] **Step 4: Remove the active-session fallback from initial hydration**

Replace:

```ts
const sessionId =
  currentAgentSessionId() ||
  (typeof window !== "undefined"
    ? window.localStorage.getItem(AGENT_CHAT_ACTIVE_SESSION_STORAGE_KEY) ?? ""
    : "");
```

with:

```ts
const sessionId = currentAgentSessionId();
```

Do not change session persistence, explicit history selection, `?q=` handling, or the saved history list.

- [ ] **Step 5: Run the focused Agent history tests and verify GREEN**

Run:

```bash
node --import tsx --test tests/pages/app-agent-chat-history.test.ts
```

Expected: all tests in the file pass with zero failures.

- [ ] **Step 6: Inspect the exact behavior diff**

Run:

```bash
git diff --check -- \
  'app/(app)/app/agent/orbit-real-agent.tsx' \
  'tests/pages/app-agent-chat-history.test.ts'
```

Expected: no whitespace errors. Confirm the only new Agent behavior hunk is the URL-only `sessionId` assignment; pre-existing visual hunks remain identifiable and are not staged as part of this task.

- [ ] **Step 7: Run GitNexus change detection and commit only Task 1**

Stage the test file and only the initialization hunk from `orbit-real-agent.tsx`, then run:

```text
gitnexus_detect_changes({ repo: "orbits", scope: "staged" })
```

Expected: only Agent conversation initialization and its test are reported.

Commit:

```bash
git commit -m "fix(agent): start the home route with a new conversation"
```

### Task 2: Apply the Agent White Palette to Product Light Mode

**Files:**
- Modify: `tests/ui/theme.test.ts`
- Modify: `app/(app)/app/orbit-theme.tsx:21-179`

**Interfaces:**
- Consumes: `ORBIT_THEME_INIT_SCRIPT`, `LIGHT_THEME_CSS`, `OrbitThemeStyles`, and `.orbit-account-auth-page`.
- Produces: shared pure-white product tokens under `html[data-theme="light"] [data-orbit-real-page]` plus a later `.orbit-account-auth-page` override containing the previous authentication light palette.

- [ ] **Step 1: Run GitNexus impact analysis**

Run:

```text
gitnexus_impact({
  repo: "orbits",
  target: "OrbitThemeStyles",
  file_path: "app/(app)/app/orbit-theme.tsx",
  direction: "upstream"
})
```

Expected: review the shared layout caller and affected product routes; warn before editing if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write the failing product light-theme contract test**

Append to `tests/ui/theme.test.ts`:

```ts
test("product light mode uses the Agent white palette without restyling authentication", () => {
  const source = readProjectFile("app/(app)/app/orbit-theme.tsx");

  assert.match(
    source,
    /html\[data-theme="light"\] \[data-orbit-real-page\]\s*\{[\s\S]*--bg:\s*#ffffff;[\s\S]*--surface:\s*#ffffff;[\s\S]*--accent:\s*#176a73;/i,
  );
  assert.match(
    source,
    /html\[data-theme="light"\] \[data-orbit-real-page\]\.orbit-account-auth-page\s*\{[\s\S]*--bg:\s*#f4f7f5;[\s\S]*--surface:\s*#ffffff;/i,
  );
  assert.match(source, /type OrbitTheme = "light" \| "dark"/);
  assert.match(source, /localStorage\.setItem\("orbit-theme", next\)/);
});
```

- [ ] **Step 3: Run the theme test and verify RED**

Run:

```bash
node --import tsx --test tests/ui/theme.test.ts
```

Expected: the new test fails because the shared light palette still uses tinted `--bg` values and no authentication compatibility scope exists.

- [ ] **Step 4: Replace only the shared light product tokens**

Set the shared light-theme semantic roles to:

```css
--accent: #176a73;
--accent-hover: #125b63;
--accent-press: #0e4b52;
--accent-soft: #eef7f6;
--accent-softer: #f4f8f7;
--accent-ring: rgba(23, 106, 115, 0.28);
--ink: #171a1c;
--text: #2b3034;
--text-2: #687078;
--text-3: #7b838a;
--text-4: #969da3;
--bg: #ffffff;
--bg-soft: #ffffff;
--bg-sunken: #fafbfb;
--surface: #ffffff;
--surface-2: #f7f8f8;
--surface-3: #f1f3f3;
--border: #e6e9eb;
--border-2: #d9dee1;
--border-strong: #c7cdd1;
--hairline: #e6e9eb;
```

Use restrained or absent shared shadows so light-mode hierarchy comes from borders and spacing. Change the general light body background to solid `#ffffff`.

- [ ] **Step 5: Add the authentication compatibility scope**

After the general product token rule, add:

```css
html[data-theme="light"] [data-orbit-real-page].orbit-account-auth-page {
  --accent: #155e75;
  --accent-hover: #0e7490;
  --accent-press: #0f4758;
  --accent-soft: rgba(21, 94, 117, 0.12);
  --accent-softer: rgba(21, 94, 117, 0.06);
  --accent-ring: rgba(14, 116, 144, 0.40);
  --ink: #17211f;
  --text: #17211f;
  --text-2: #52615d;
  --text-3: #6d7a75;
  --text-4: #8a938f;
  --bg: #f4f7f5;
  --bg-soft: #eef2f0;
  --bg-sunken: #e8efec;
  --surface: #ffffff;
  --surface-2: #f9fbfa;
  --surface-3: #f1f5f3;
  --border: rgba(23, 33, 31, 0.10);
  --border-2: rgba(23, 33, 31, 0.16);
  --border-strong: rgba(23, 33, 31, 0.24);
  --hairline: rgba(23, 33, 31, 0.07);
}
```

Keep every selector without `html[data-theme="light"]` unchanged so dark mode remains byte-for-byte stable.

- [ ] **Step 6: Run focused theme and authentication tests and verify GREEN**

Run:

```bash
node --import tsx --test \
  tests/ui/theme.test.ts \
  tests/pages/app-account-auth-live-route-services.test.ts
```

Expected: both files pass with zero failures.

- [ ] **Step 7: Run GitNexus change detection and commit Task 2**

Run:

```bash
git add -- 'app/(app)/app/orbit-theme.tsx' 'tests/ui/theme.test.ts'
```

Then:

```text
gitnexus_detect_changes({ repo: "orbits", scope: "staged" })
```

Expected: the shared theme surface and theme tests are reported; no authentication component source file is changed.

Commit:

```bash
git commit -m "feat(ui): unify product light mode on a white palette"
```

### Task 3: Verify Behavior, Visual Scope, and Production Build

**Files:**
- Verify: `app/(app)/app/agent/orbit-real-agent.tsx`
- Verify: `app/(app)/app/orbit-theme.tsx`
- Verify: `app/(app)/app/account/orbit-real-account-auth.tsx`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 behavior.
- Produces: fresh automated and visual evidence that requirements are met without changing source.

- [ ] **Step 1: Run the complete focused regression set**

Run:

```bash
node --import tsx --test \
  tests/pages/app-agent-chat-history.test.ts \
  tests/pages/app-agent-live-route-services.test.ts \
  tests/pages/app-account-auth-live-route-services.test.ts \
  tests/pages/orbit-reference-styles.test.tsx \
  tests/ui/theme.test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: webpack compilation, TypeScript validation, route collection, and static generation finish successfully.

- [ ] **Step 3: Verify representative light-mode routes in a browser**

Start the development server and inspect:

```text
/app/agent
/app/contacts
/app/events
/app/account/login
```

Expected:

- `/app/agent` opens the welcome state with history still visible.
- Contacts and events use a white canvas with the approved neutral and teal token system.
- The login page retains its previous colors and composition.
- Switching to dark mode preserves the previous dark appearance.

- [ ] **Step 4: Review final repository scope**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: the two implementation commits are present. Unrelated authentication-system and pre-existing visual work remains uncommitted unless it was independently verified and deliberately committed under its own feature commit.
