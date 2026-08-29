# Orbit iOS Event Discovery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the iOS event discovery home so a growing, diverse event catalogue remains searchable, scannable, personalized, and consistent with Orbit's existing mobile visual system.

**Architecture:** Keep the public events, shared event view model and recommendation API contracts unchanged. Add deterministic location, fallback-topic and public-label helpers inside the discovery screen, then replace the full-height poster feed with a compact search/filter shell, a horizontally scrolling recommendation collection, and a dense vertical event list.

**Tech Stack:** Expo Router, React Native, TypeScript, Node test runner, existing Orbit API hooks and design tokens.

**Spec:** `docs/superpowers/specs/2026-08-25-ios-event-discovery-redesign.md`

## Global Constraints

- iOS only; do not change Web event pages.
- Preserve the current Orbit colors, typography, icon family and route behavior.
- Do not add a new backend endpoint or a fake save/registration state.
- Search, status, location and topic filters must compose by intersection.
- Recommendation failures must never block the public event list.
- Do not expose `imported`, `Organizer #...`, provider names or actor IDs.
- Every selectable filter needs `accessibilityState={{ selected }}` and a 44pt touch target.

---

### Task 1: Scalable Discovery Derivations

**Files:**
- Modify: `repos/orbit-app/src/screens/events/EventsScreen.tsx`
- Test: `repos/orbit-app/tests/events-screen-source.test.ts`

**Interfaces:**
- Produces: screen-local `eventDiscoveryLocations`, `discoveryTopicsForEvent`, `publicEventStatus`, and `publicEventSubtitle`
- Preserves: shared `EventSummary`, `eventsToSummaries`, `eventDiscoveryTopics`, `filterEventSummaries`, activity detail and home behavior

- [ ] **Step 1: Write failing tests**

Add source assertions that events without explicit topics derive stable categories from titles, locations are unique, location composes after shared status/topic/query filtering, `imported` displays as `可报名`, and placeholder organizer IDs are removed from discovery subtitles.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --import tsx tests/events-screen-source.test.ts`

- [ ] **Step 3: Implement deterministic fallbacks**

Add screen-local title-based fallback classification with a small fixed vocabulary: `AI 科技`, `创投融资`, `跨境商务`, `人脉社群`, `工作坊`, `餐饮增长`. Use explicit API topics first. Compose location filtering after the shared filter helper and normalize labels only at render time.

- [ ] **Step 4: Run the focused test**

Run: `node --test --import tsx tests/events-screen-source.test.ts`

---

### Task 2: Compact Discovery Shell And Event List

**Files:**
- Modify: `repos/orbit-app/src/screens/events/EventsScreen.tsx`
- Test: `repos/orbit-app/tests/events-screen-source.test.ts`

**Interfaces:**
- Consumes: screen-local discovery derivations, `filterEventSummaries`, existing `EventSummary`
- Produces: `EventDiscoveryToolbar`, `EventFilterRail`, `CompactEventList`, `CompactEventRow`, `SectionHeader`

- [ ] **Step 1: Replace old source assertions with failing hierarchy tests**

Assert that the default status is `upcoming`, recommendation rendering precedes the normal list, search is compact, filters scroll horizontally, list rows use a fixed thumbnail and two-line title, the page size is 8, and the old `height: 300` poster card is absent.

- [ ] **Step 2: Run the source test and confirm failure**

Run: `node --test --import tsx tests/events-screen-source.test.ts`

- [ ] **Step 3: Implement the discovery hierarchy**

Move the operations-center action into a compact secondary control. Build an inline search field, status scope, horizontal location/topic rails and result section heading. Hide recommendations while query or non-default filters are active.

- [ ] **Step 4: Implement compact event rows**

Render a fixed `112 x 84` image, date line, two-line title, location/subtitle and readable status. Keep row navigation to `/events/[id]` and incrementally reveal eight records at a time.

- [ ] **Step 5: Run the focused source test and typecheck**

Run: `node --test --import tsx tests/events-screen-source.test.ts`

Run: `npm run typecheck`

---

### Task 3: Recommendation Collection

**Files:**
- Modify: `repos/orbit-app/src/screens/events/EventsScreen.tsx`
- Test: `repos/orbit-app/tests/events-screen-source.test.ts`

**Interfaces:**
- Consumes: existing `EventValueRecommendationCardView`, recommendation accept endpoint and event cover map
- Produces: `EventRecommendationRail`, `EventRecommendationCard`

- [ ] **Step 1: Add failing recommendation-layout assertions**

Assert that recommendation cards live in a horizontal `ScrollView`, expose the next card, show score/reason/time and keep both open and accept actions.

- [ ] **Step 2: Run the source test and confirm failure**

Run: `node --test --import tsx tests/events-screen-source.test.ts`

- [ ] **Step 3: Implement the recommendation rail**

Replace the nested `DataCard` recommendation rows with a section heading and stable-width image cards. Keep loading invisible, failure compact, acceptance feedback explicit and existing POST behavior unchanged.

- [ ] **Step 4: Run focused tests**

Run: `node --test --import tsx tests/events-screen-source.test.ts tests/event-value-recommendations-view-model.test.ts`

---

### Task 4: Runtime And Visual Verification

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] **Step 1: Run complete iOS verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `git diff --check`

- [ ] **Step 2: Verify in iOS Simulator**

Capture the default upcoming state, a location/topic-filtered state, search results, an empty result and the expanded eight-item list. Confirm 375pt and 393pt layouts have no overlap or clipping.

- [ ] **Step 3: Compare source and result together**

Create a combined image containing the baseline Orbit screen, the accepted redesign, and the reference research board. Inspect hierarchy, density, touch targets, image crop and text wrapping from that combined artifact.

- [ ] **Step 4: Run GitNexus change detection**

Run `gitnexus_detect_changes(scope: "unstaged")` and separate this feature's low-risk symbols from unrelated dirty-worktree changes.
