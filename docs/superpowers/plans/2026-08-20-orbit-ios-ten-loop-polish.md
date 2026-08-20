# Orbit iOS Ten-Loop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete ten measurable iOS improvement loops while preserving Orbit's existing product design.

**Architecture:** Keep Expo Router, the existing screen components, API envelope, snapshot store, and design tokens. Each loop changes one bounded behavior, adds a regression test, verifies it in isolation, and records simulator evidence when visible.

**Tech Stack:** Expo 57, React Native 19, Expo Router, TypeScript, Node test runner, iOS Simulator, IDB, GitNexus.

**Spec:** `docs/superpowers/specs/2026-08-20-orbit-ios-ten-loop-polish-design.md`

## Global Constraints

- Modify only the iOS app and iOS-facing behavior required for the app.
- Preserve existing color, icon, radius, blur, typography, drawer, and route patterns.
- Run GitNexus impact analysis before editing every symbol.
- Run GitNexus staged change detection before every commit.
- Do not stage unrelated existing work.
- Every visible loop requires simulator before/after evidence.

---

### Task 1: Coalesce Concurrent GET Requests

**Files:**
- Modify: `repos/orbit-app/src/api/client.ts`
- Test: `repos/orbit-app/tests/api-client.test.ts`

**Interfaces:**
- Consumes: `createOrbitApiClient(options)` and `OrbitApiClient.get(path, options)`.
- Produces: identical concurrent GET calls share one `Promise<ApiResult<T>>`; later GET calls issue a fresh request.

- [ ] Add a failing test with a deferred `fetchImpl` and two simultaneous `client.get("/api/profile")` calls.
- [ ] Verify the fetch count is `2` before implementation.
- [ ] Add a module-level in-flight GET map keyed by normalized base URL, auth cookie, path, and headers.
- [ ] Delete the map entry in `finally` and keep POST/PATCH/PUT/DELETE behavior unchanged.
- [ ] Run `node --test --import tsx tests/api-client.test.ts` and commit the loop.

### Task 2: Improve Shared Screen Keyboard Behavior

**Files:**
- Modify: `repos/orbit-app/src/components/AppScreen.tsx`
- Test: `repos/orbit-app/tests/app-screen-keyboard-source.test.ts`

**Interfaces:**
- Consumes: existing `AppScreen` props.
- Produces: the same component API with iOS keyboard inset adjustment and interactive dismissal.

- [ ] Add a source test requiring `automaticallyAdjustKeyboardInsets`, `keyboardDismissMode="interactive"`, and `keyboardShouldPersistTaps="handled"`.
- [ ] Verify the test fails.
- [ ] Add those ScrollView properties without changing layout tokens.
- [ ] Run the focused test and capture one long-form screen with the keyboard open and closed.
- [ ] Commit the loop.

### Task 3: Raise Orbit AI Composer Targets

**Files:**
- Modify: `repos/orbit-app/src/screens/ai/AiScreen.tsx`
- Test: `repos/orbit-app/tests/ai-screen-source.test.ts`

**Interfaces:**
- Consumes: the current bottom composer.
- Produces: 44-point add/send controls with unchanged composer silhouette.

- [ ] Add a failing source assertion for 44-point composer icon controls.
- [ ] Verify the current 34-point styles fail.
- [ ] Set stable 44-point dimensions and keep the input flexible.
- [ ] Add explicit control labels so decorative icon glyphs are not spoken.
- [ ] Run focused tests, inspect IDB accessibility frames, capture the AI home, and commit.

### Task 4: Put Activity Discovery Before Results

**Files:**
- Modify: `repos/orbit-app/src/screens/events/EventsScreen.tsx`
- Test: `repos/orbit-app/tests/events-screen-source.test.ts`
- Test: `repos/orbit-app/tests/events-screen-render.test.tsx`

**Interfaces:**
- Consumes: all event summaries and existing filters.
- Produces: controls before cards plus bounded initial rendering and a show-more control.

- [ ] Replace the existing ordering test with a failing requirement that controls precede the list.
- [ ] Add a render test that limits the initial cards and reveals all cards after “查看更多活动”.
- [ ] Implement `visibleEventLimit` state, reset it when filters change, and preserve all existing card styles.
- [ ] Verify the operations-center entry remains above discovery controls.
- [ ] Capture the first viewport and filtered state, run focused tests, and commit only the new hunks.

### Task 5: Make Contact Cards Explicit and Stable

**Files:**
- Modify: `repos/orbit-app/src/screens/contacts/ContactsScreen.tsx`
- Test: `repos/orbit-app/tests/contacts-screen-source.test.ts`

**Interfaces:**
- Consumes: existing contact summary cards and avatar paths.
- Produces: explicit card labels, fixed avatar dimensions, and preserved deeper-library navigation.

- [ ] Add failing assertions for an explicit contact-card accessibility label and stable avatar dimensions.
- [ ] Implement the label from contact name, role, and company without reading decorative icons.
- [ ] Preserve the graph/dashboard-first overview and the deeper contact library.
- [ ] Verify with IDB on the library route and capture the result.
- [ ] Run focused tests and commit.

### Task 6: Open Inbox Threads on the Detail Route

**Files:**
- Modify: `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`
- Test: `repos/orbit-app/tests/relationship-inbox-screen-source.test.ts`

**Interfaces:**
- Consumes: conversation summary id.
- Produces: `router.push({ pathname: "/chat/[id]", params: { id } })` when a thread is selected.

- [ ] Add a failing source test for dedicated thread navigation and absence of inline thread expansion.
- [ ] Verify the existing below-list detail behavior fails the test.
- [ ] Route thread taps to `/chat/[id]` and remove only the redundant inline detail section.
- [ ] Keep pending-work tabs, search, compose, and privacy controls in the inbox.
- [ ] Verify list-to-thread-to-back in the simulator and commit.

### Task 7: Connect Schedule to Discoverable Events

**Files:**
- Modify: `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx`
- Test: `repos/orbit-app/tests/schedule-screen-source.test.ts`

**Interfaces:**
- Consumes: `ORBIT_API_ENDPOINTS.publicEvents` and authenticated tasks.
- Produces: upcoming public events in `scheduleToTimelineView`.

- [ ] Add a failing assertion that Schedule uses the public event endpoint.
- [ ] Replace only the event resource path.
- [ ] Verify upcoming event highlights appear before timeline sections.
- [ ] Capture the populated schedule and run focused tests.
- [ ] Commit the loop.

### Task 8: Put the Public Profile First

**Files:**
- Modify: `repos/orbit-app/src/screens/profile/ProfileScreen.tsx`
- Modify: `repos/orbit-app/src/view-models/profile.ts`
- Test: `repos/orbit-app/tests/profile-screen-source.test.ts`
- Test: `repos/orbit-app/tests/profile-view-model.test.ts`

**Interfaces:**
- Consumes: validated auth session identity and stored profile payload.
- Produces: session-owner display name and public editor before optional extraction tools.

- [ ] Add failing tests for identity preference and public-editor ordering.
- [ ] Seed only the display name from the validated session when the stored profile is a generated operator identity.
- [ ] Move the public editor before extraction without changing field styles or save behavior.
- [ ] Add explicit labels to public profile inputs touched by the move.
- [ ] Capture the first viewport, run focused tests, and commit.

### Task 9: Remove Decorative Glyphs From Spoken Labels

**Files:**
- Modify: `repos/orbit-app/src/screens/events/EventsScreen.tsx`
- Modify: `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx`
- Modify: `repos/orbit-app/src/screens/profile/ProfileScreen.tsx`
- Test: `repos/orbit-app/tests/ios-accessibility-source.test.ts`

**Interfaces:**
- Consumes: visible card and input content.
- Produces: concise explicit accessibility labels and selected filter states.

- [ ] Add a failing test for explicit event, timeline, search, and profile field labels.
- [ ] Add `accessibilityLabel` and `accessibilityState` only where the current composed label includes private-use glyphs or lacks context.
- [ ] Verify IDB output contains user-facing labels and no icon-font characters for the touched controls.
- [ ] Run focused tests and commit only this loop's hunks.

### Task 10: Final Simulator and Product Pass

**Files:**
- Modify only files implicated by reproduced final-pass regressions.
- Test: the nearest existing test file for each reproduced regression.

**Interfaces:**
- Consumes: the completed nine loops.
- Produces: verified primary-route behavior with no new visual system.

- [ ] Capture AI home, drawer, events, contacts overview/library, inbox, schedule, profile, and settings on iPhone 17 Pro.
- [ ] Compare each capture with its baseline and inspect IDB names/frames.
- [ ] Fix only reproduced overlap, clipping, stale loading, or internal-first content issues with a failing test first.
- [ ] Run `npm run typecheck` and `npm test`.
- [ ] Run staged GitNexus change detection, commit the final pass, and write the ten-loop outcome report.
