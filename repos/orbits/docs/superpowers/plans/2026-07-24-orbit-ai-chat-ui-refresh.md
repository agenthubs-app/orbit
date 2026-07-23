# Orbit AI Chat UI Refresh Implementation Plan

> **For Codex:** Execute this plan task by task in an isolated worktree. Preserve all chat behavior and data contracts; this is a presentation-only change.

**Goal:** Turn the existing Orbit AI three-column chat surface into a clean, pure-white, production-quality chat UI without changing layout, routes, state, APIs, or interactions.

**Architecture:** Keep `OrbitRealAgent` and its current child components as the behavioral source of truth. Add stable page-local class hooks in the JSX, then define an agent-only light presentation layer at the end of the shared reference stylesheet so other Orbit pages keep their current theme. Lock the presentation boundary with source-level contract tests and run the existing behavior tests unchanged.

**Tech Stack:** Next.js, React, TypeScript, CSS-in-JS stylesheet string, Node test runner.

**Approved design:** `docs/superpowers/specs/2026-07-24-orbit-ai-chat-ui-refresh-design.md`

## Guardrails

- Preserve the current desktop columns: resizable history, transcript, conditional 444 px result panel.
- Preserve mobile history drawer and inline result cards.
- Keep all existing event handlers, API requests, storage keys, routes, navigation targets, and view-model fields unchanged.
- Do not add agent timelines, plans, evidence rows, tool traces, or new product states.
- Keep the existing global `AccountTopNav`; do not render another Orbit wordmark inside the chat page.
- Light agent workspace uses pure white, neutral ink, hairlines, and a restrained blue-green signal.
- Normal text is 14–16 px; metadata is never below 12 px.
- No gradients, ambient glows, glass backgrounds, or decorative shadows in the light agent workspace.
- Preserve dark-theme token behavior outside the agent-specific light presentation layer.

### Task 1: Establish the baseline and lock the visual contract

**Files:**

- Create: `tests/pages/orbit-agent-visual-design.test.ts`
- Read: `app/(app)/app/agent/orbit-real-agent.tsx`
- Read: `app/(app)/app/orbit-reference-styles.tsx`

**Step 1: Run the existing Orbit Agent page tests**

Run:

```bash
npm test -- \
  tests/pages/orbit-agent-api-ui.test.ts \
  tests/pages/app-agent-chat-history.test.ts \
  tests/pages/app-agent-message-copy.test.ts
```

Record any pre-existing failures before implementation. Do not expand this UI task into unrelated behavior repair.

**Step 2: Add a failing visual contract test**

Create a source-level test that requires:

```ts
assert.match(agentSource, /className="orbit-agent-workspace"/);
assert.match(agentSource, /className="orbit-agent-composer"/);
assert.match(agentSource, /className="orbit-agent-assistant-turn"/);
assert.match(agentSource, /className="orbit-agent-result-card"/);
assert.doesNotMatch(agentSource, /orbit-agent-page-wordmark/);

assert.match(styles, /\[data-orbit-real-page="agent"\]\s*\{/);
assert.match(styles, /--agent-canvas:\s*#FFFFFF/i);
assert.match(styles, /--agent-body-size:\s*15px/);
assert.match(styles, /--agent-meta-size:\s*12px/);
assert.match(styles, /body:has\(\[data-orbit-real-page="agent"\]\)/);
```

Also require explicit assistant-turn and composer rules so the test cannot pass from token declarations alone:

```ts
assert.match(styles, /\.orbit-agent-assistant-turn/);
assert.match(styles, /\.orbit-agent-composer/);
assert.match(styles, /\.orbit-agent-result-card/);
```

**Step 3: Verify the new test fails for the intended missing hooks/tokens**

Run:

```bash
npm test -- tests/pages/orbit-agent-visual-design.test.ts
```

Expected: FAIL because the page-local class hooks and pure-white token layer do not exist yet.

**Step 4: Commit the test**

After `gitnexus_detect_changes()` confirms only the new test is in scope:

```bash
git add tests/pages/orbit-agent-visual-design.test.ts
git commit -m "test(orbit-ai): lock chat visual contract"
```

### Task 2: Add semantic presentation hooks without changing behavior

**Files:**

- Modify: `app/(app)/app/agent/orbit-real-agent.tsx`
- Test: `tests/pages/orbit-agent-visual-design.test.ts`
- Test: existing Orbit Agent page tests

**Step 1: Run GitNexus impact analysis**

Before editing, inspect upstream impact for each touched symbol:

- `AgentMarkdown`
- `AgentMessageCopyButton`
- `AgentHistoryList`
- `AgentWelcome`
- `AgentPeopleCard`
- `AgentEventCard`
- `AgentTodoCard`
- `PanelCards`
- `ChatBox`
- `ThinkingIndicator`
- `OrbitRealAgent`

If any result is HIGH or CRITICAL, stop and warn before editing.

**Step 2: Add page-local class hooks**

Add classes only; do not change props, state, handler bodies, conditions, or element semantics.

Required hooks:

```tsx
className="orbit-agent-workspace"
className="orbit-agent-history"
className="orbit-agent-transcript"
className="orbit-agent-welcome"
className="orbit-agent-suggestion"
className="orbit-agent-assistant-turn"
className="orbit-agent-user-turn"
className="orbit-agent-message-copy"
className="orbit-agent-composer"
className="orbit-agent-composer-input"
className="orbit-agent-send"
className="orbit-agent-results"
className="orbit-agent-result-card"
```

Use modifier classes for card kinds only when already available from component boundaries, for example:

```tsx
className="orbit-agent-result-card is-people"
className="orbit-agent-result-card is-event"
className="orbit-agent-result-card is-todo"
```

Do not add an `orbit-agent-page-wordmark` element.

**Step 3: Run behavior and visual tests**

Run:

```bash
npm test -- \
  tests/pages/orbit-agent-visual-design.test.ts \
  tests/pages/orbit-agent-api-ui.test.ts \
  tests/pages/app-agent-chat-history.test.ts \
  tests/pages/app-agent-message-copy.test.ts
```

Expected: the visual test may still fail only on missing CSS tokens/rules; all previously passing behavior tests remain unchanged.

### Task 3: Implement the pure-white agent presentation layer

**Files:**

- Modify: `app/(app)/app/orbit-reference-styles.tsx`
- Test: `tests/pages/orbit-agent-visual-design.test.ts`
- Test: existing Orbit Agent page tests

**Step 1: Run GitNexus impact analysis**

Inspect upstream impact for `reactReferenceIsolationStyles` before editing the shared stylesheet string. Warn and stop if risk is HIGH or CRITICAL.

**Step 2: Add an agent-scoped light token layer at the end of the stylesheet**

The layer must be more specific than the global starfield theme and must not alter other pages:

```css
[data-orbit-real-page="agent"] {
  color-scheme: light;
  --agent-canvas: #FFFFFF;
  --agent-ink: #171A1C;
  --agent-muted: #687078;
  --agent-hairline: #E6E9EB;
  --agent-signal: #176A73;
  --agent-signal-soft: #EEF7F6;
  --agent-body-size: 15px;
  --agent-meta-size: 12px;
}

body:has([data-orbit-real-page="agent"]) {
  background: var(--agent-canvas);
}
```

Remap existing shared tokens inside the agent page to white/neutral values so inline styles remain compatible:

```css
[data-orbit-real-page="agent"] {
  --bg: #FFFFFF;
  --bg-soft: #FFFFFF;
  --bg-sunken: #FAFBFB;
  --surface: #FFFFFF;
  --surface-2: #F7F8F8;
  --surface-3: #F1F3F3;
  --ink: var(--agent-ink);
  --text: #2B3034;
  --text-2: var(--agent-muted);
  --text-3: #7B838A;
  --border: var(--agent-hairline);
  --border-2: #D9DEE1;
  --accent: var(--agent-signal);
  --accent-soft: var(--agent-signal-soft);
  --accent-grad: var(--agent-signal);
  --accent-grad-bar: var(--agent-signal);
  --sh-xs: none;
  --sh-sm: none;
  --sh-md: none;
  --sh-lg: none;
}
```

**Step 3: Style the existing composition**

Apply only presentation changes:

- top nav and all three work areas are white;
- columns use neutral 1 px separators;
- history rows use 13–14 px type and a quiet active state;
- welcome copy is 15 px and suggestions are flat bordered buttons;
- assistant turns have no bubble border/background/shadow;
- user bubbles remain compact and use neutral ink;
- result cards are flat with 8–10 px radius and 12 px minimum metadata;
- composer has a neutral border, 15 px input, visible focus ring, no shadow;
- primary send target remains at least 40 px;
- mobile uses the same tokens and preserves drawer/inline layout.

Where legacy inline styles are too specific, use the smallest agent-scoped override necessary. Avoid broad global `!important` rules; if an inline property must be replaced, constrain `!important` to the semantic agent class.

**Step 4: Run the focused tests**

Run:

```bash
npm test -- \
  tests/pages/orbit-agent-visual-design.test.ts \
  tests/pages/orbit-agent-api-ui.test.ts \
  tests/pages/app-agent-chat-history.test.ts \
  tests/pages/app-agent-message-copy.test.ts
```

Expected: PASS.

**Step 5: Commit the implementation**

After `gitnexus_detect_changes()` confirms only the agent page, stylesheet, and intended test are affected:

```bash
git add \
  'app/(app)/app/agent/orbit-real-agent.tsx' \
  'app/(app)/app/orbit-reference-styles.tsx'
git commit -m "feat(orbit-ai): polish chat workspace UI"
```

### Task 4: Regression verification and safe integration

**Files:**

- Verify: all files changed in Tasks 1–3

**Step 1: Run the complete Orbit Agent page test group**

Discover the exact page tests first:

```bash
rg --files tests/pages | rg 'agent|orbit-agent'
```

Then run every matching Orbit Agent page test through `npm test -- ...`.

**Step 2: Run TypeScript verification**

Run:

```bash
npx tsc --noEmit --incremental false
```

If repository-wide TypeScript failures are pre-existing and outside this change, report them explicitly and run the narrowest available check that covers both edited TypeScript files.

**Step 3: Run production build when the worktree has the required environment**

Run:

```bash
npm run build
```

If the build requires unavailable external configuration, report the exact blocker; do not hide or reinterpret it as success.

**Step 4: Inspect final scope**

Run:

```bash
git diff --check
git status --short
```

Run `gitnexus_detect_changes()` and confirm the affected execution flows are expected for a presentation-only change.

**Step 5: Review against acceptance criteria**

Confirm from code and tests:

- no duplicate Orbit wordmark was introduced;
- no contract, route, API, or storage changes;
- no event handler or responsive behavior changes;
- white/neutral styling is scoped to `data-orbit-real-page="agent"`;
- text sizes meet the approved minimums;
- assistant messages, composer, history, cards, and mobile states all have stable styling hooks.

**Step 6: Integrate**

Fast-forward the verified feature branch into `chat-agent` only if the target files remain clean in the user's primary worktree. Preserve all unrelated dirty files and do not stage them.

