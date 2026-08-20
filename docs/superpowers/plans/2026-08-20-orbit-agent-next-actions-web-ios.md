# Orbit Agent Next Actions Web and iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense Orbit AI home signal block with a concise, aligned 1-4 next-action list on Web and add the same real-data workflow to the iOS Orbit AI home.

**Architecture:** `/api/agent/signals` remains the canonical actor-scoped source. A server-side pure selector defines the home feed as up to three active signals plus one recently resolved signal; Web and iOS keep platform-specific presentation adapters while consuming the same signal semantics. Existing chat, history, drawer, colors, icons, blur, and global ask behavior remain unchanged.

**Tech Stack:** Next.js, React, TypeScript, Node test runner, Expo Router, React Native, Ionicons.

**Spec:** Approved visual companion `current-home-real-state-actions-v6.html` and the task list confirmed in this thread on 2026-08-20.

## Global Constraints

- Preserve the current Web and iOS color tokens, icon family, radii, blur, and chat composition.
- Render at most three active items and one recently resolved item.
- Each row contains a number, title, one context line, and no more than two visible actions.
- Web action columns align across rows; iOS actions maintain 44-point minimum targets and adapt to narrow widths.
- Do not change `/api/agent/actions` confirmation-queue semantics.
- Keep all signal reads actor scoped and all existing API response fields backward compatible.
- Preserve unrelated uncommitted work and stage only task-owned hunks.

---

### Task 1: Canonical Home Signal Selection

**Files:**
- Create: `repos/orbits/features/agent/signals/home-selection.ts`
- Create: `repos/orbits/tests/capabilities/agent-home-signals.test.ts`

**Interfaces:**
- Consumes: `AgentSignal` from `features/agent/signals/contract.ts`.
- Produces: `selectAgentHomeSignals(signals, options?) => readonly AgentSignal[]`.

- [ ] Write tests proving active statuses are limited to three, snoozed/dismissed signals are excluded, and at most one newest resolved signal is appended.
- [ ] Run `node --test --import tsx tests/capabilities/agent-home-signals.test.ts` and confirm it fails because the selector is missing.
- [ ] Implement the minimal deterministic selector with stable importance and timestamp ordering.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Run `node --test --import tsx tests/capabilities/agent-signals.test.ts tests/capabilities/agent-home-signals.test.ts`.

### Task 2: Home View on the Signals API

**Files:**
- Modify: `repos/orbits/app/api/agent/signals/route.ts`
- Create: `repos/orbits/tests/api/agent-signals-home-route.test.ts`

**Interfaces:**
- Consumes: `selectAgentHomeSignals`.
- Produces: `GET/POST /api/agent/signals?view=home` with the existing `data.signals` envelope.

- [ ] Write route tests proving `view=home` is opt-in and the default response remains unchanged.
- [ ] Run the route test and confirm the home behavior fails.
- [ ] Add request parsing and select the home feed after list/refresh without changing default consumers.
- [ ] Re-run route and signal tests.
- [ ] Run Web type checking for the touched route and signal modules.

### Task 3: Web Next-Action View Model

**Files:**
- Create: `repos/orbits/app/(app)/app/agent/orbit-agent-next-actions.ts`
- Create: `repos/orbits/tests/pages/orbit-agent-next-actions.test.ts`

**Interfaces:**
- Consumes: API signal fields and the existing language selection.
- Produces: compact rows with `index`, `title`, `context`, `primaryAction`, `secondaryAction`, and `completed`.

- [ ] Write tests for concise context, completed rows, two-action limits, and iOrbit prompt handling.
- [ ] Run the focused test and verify RED.
- [ ] Implement the pure adapter without UI or network behavior.
- [ ] Re-run the focused test and verify GREEN.

### Task 4: Web Next-Action Component

**Files:**
- Modify: `repos/orbits/app/(app)/app/agent/orbit-agent-today-workspace.tsx`
- Modify: `repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx`
- Modify: `repos/orbits/tests/pages/orbit-agent-visual-design.test.ts`

**Interfaces:**
- Consumes: `agentSignalsToNextActionRows` and existing `navigate/onAsk` callbacks.
- Produces: the approved numbered list inside the existing `.brief` shell.

- [ ] Add source/visual tests for numbered rows, one-line context, fixed action slots, and preserved brief/chat hooks.
- [ ] Run the focused tests and verify RED.
- [ ] Switch fetches to `?view=home`, retain refresh/snooze/dismiss behavior, and render completed rows without actions.
- [ ] Add scoped list/grid styles while preserving global tokens and existing chat styles.
- [ ] Re-run focused tests and Web type checking.

### Task 5: iOS Signal Endpoint and View Model

**Files:**
- Modify: `repos/orbit-app/src/api/endpoints.ts`
- Create: `repos/orbit-app/src/view-models/agent-signals.ts`
- Modify: `repos/orbit-app/tests/endpoints.test.ts`
- Create: `repos/orbit-app/tests/agent-signals-view-model.test.ts`

**Interfaces:**
- Produces: `agentSignalsHomePath`, `agentSignalPath`, `agentSignalsToNextActions`, and native target routes.

- [ ] Add failing endpoint tests for home-list and status-update paths.
- [ ] Add failing view-model tests for envelope parsing, row selection, completed state, and target route mapping.
- [ ] Run focused tests and verify RED.
- [ ] Add endpoint helpers and the smallest defensive parser/adapter.
- [ ] Re-run focused tests and type checking.

### Task 6: iOS Native Next-Actions Component

**Files:**
- Create: `repos/orbit-app/src/screens/ai/OrbitNextActions.tsx`
- Create: `repos/orbit-app/tests/orbit-next-actions-screen-render.test.tsx`

**Interfaces:**
- Consumes: `AgentNextActionView[]`, loading/error state, and callbacks for refresh/open/ask/status.
- Produces: a native numbered action list using existing design tokens and Ionicons.

- [ ] Write render tests for active, completed, loading, empty, error, and updating states.
- [ ] Run focused render tests and verify RED.
- [ ] Implement the component with at most two action buttons and accessible 44-point controls.
- [ ] Re-run render tests and type checking.

### Task 7: Integrate Actions into the iOS Orbit AI Home

**Files:**
- Modify: `repos/orbit-app/src/screens/ai/AiScreen.tsx`
- Modify: `repos/orbit-app/tests/ai-home-screen-copy.test.ts`

**Interfaces:**
- Consumes: Signals API, `OrbitNextActions`, Expo Router, and the existing API client.
- Produces: visible real-data next actions above the home transcript while preserving composer, history, and drawer behavior.

- [ ] Add failing source tests for endpoint loading, refresh, status patching, prompt routing, and placement before chat messages.
- [ ] Verify the tests fail for missing integration.
- [ ] Load the home feed, combine its refresh with existing pull-to-refresh, and patch statuses optimistically only after server success.
- [ ] Route open actions natively and open ask actions directly in `/ai/[id]` with `initialMessage`.
- [ ] Prevent the home transcript from auto-scrolling past the action list on initial load.
- [ ] Re-run focused iOS tests and type checking.

### Task 8: Cross-Platform Regression and Visual QA

**Files:**
- Output screenshots only under the ignored verification-artifact directory.

- [ ] Run all focused Web tests, `npm run typecheck`, and the relevant visual/source tests.
- [ ] Run iOS `npm test` and `npm run typecheck`.
- [ ] Start the Web app and inspect `/app/agent` at desktop and phone widths.
- [ ] Start the iOS app in Simulator and inspect normal and small iPhone sizes.
- [ ] Verify loading, four-row, completed, error, keyboard, navigation, ask-agent, snooze, dismiss, and refresh states.
- [ ] Confirm no overlap, truncation, auto-scroll hiding, or visual-system drift.

### Task 9: Scope Review and Functional Commits

- [ ] Run `gitnexus_detect_changes()` for `orbits` and `orbit` before committing.
- [ ] Review every diff against the approved scope and preserve unrelated work.
- [ ] Commit server contract and selector as `feat(agent): add shared home signal selection`.
- [ ] Commit Web presentation as `feat(agent): refine web next-action brief`.
- [ ] Commit iOS endpoint and view model as `feat(mobile): add agent signals client`.
- [ ] Commit iOS home integration as `feat(mobile): add next actions to Orbit AI home`.
- [ ] Commit remaining cross-platform tests as `test(agent): verify cross-platform next-action flows` when a separate test commit is warranted.
- [ ] Report exact verification commands, simulator status, screenshots, commits, and any residual risk.
