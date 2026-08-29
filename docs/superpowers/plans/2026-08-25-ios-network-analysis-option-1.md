# iOS Network Analysis Option 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement selected option 1 as a truthful, interactive iOS relationship analysis experience.

**Architecture:** Extend the dedicated `contacts-analysis` view model with presentation-ready industry, dimension, diagnosis, and activity data. Keep API parsing in existing dashboard/contact adapters and render three local analysis views from `ContactsDashboardScreen` without adding routes or backend contracts.

**Tech Stack:** React Native, Expo Router, TypeScript, Node test runner, Ionicons.

**Spec:** `docs/superpowers/specs/2026-08-25-ios-network-analysis-option-1-design.md`

## Global Constraints

- iOS only.
- Preserve existing Orbit colors, typography, icons, and surface language.
- Use only real dashboard and contact data; represent unavailable data explicitly.
- All visible copy must be Simplified Chinese.
- Existing goal editing, recompute, drill-down, recommendation, and health interactions must continue to work.

---

### Task 1: Analysis View Model

**Files:**
- Modify: `repos/orbit-app/src/view-models/contacts-analysis.ts`
- Test: `repos/orbit-app/tests/contacts-analysis-view-model.test.ts`

**Interfaces:**
- Consumes: `DashboardViewInput`, `ContactSummary[]`, relationship goal string.
- Produces: `ContactsAnalysisView` with `diagnosis`, `industries`, `dimensions`, and `activity` in addition to existing coverage, actions, and health.

- [ ] Write tests for industry ordering, role coverage, deterministic diagnosis, activity metrics, and sparse states.
- [ ] Run `npm test -- tests/contacts-analysis-view-model.test.ts` and verify the new assertions fail because the new fields are absent.
- [ ] Implement the minimum view-model additions using existing dashboard/contact adapters.
- [ ] Run the focused test and verify it passes.

### Task 2: Interactive Analysis Screen

**Files:**
- Modify: `repos/orbit-app/src/screens/contacts/ContactsDashboardScreen.tsx`
- Test: `repos/orbit-app/tests/contacts-dashboard-screen-source.test.ts`

**Interfaces:**
- Consumes: the expanded `ContactsAnalysisView`.
- Produces: functional `概览`, `结构`, and `机会` segments with accessible controls and preserved navigation.

- [ ] Write source assertions for the diagnosis card, segmented control, industry distribution, dimension summary, structure view, and opportunity view.
- [ ] Run the focused source test and verify it fails because those components are absent.
- [ ] Implement the selected visual with existing design tokens and Ionicons.
- [ ] Run the focused source test and view-model tests until both pass.

### Task 3: Verification And Visual QA

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: selected visual and simulator captures.
- Produces: a passing design-QA record with source, implementation, normalization, findings, interactions, and final result.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test -- --runInBand`.
- [ ] Open `orbit://contacts/dashboard` in the iOS Simulator and test all three segments, goal editing, opportunity navigation, and health expansion.
- [ ] Capture top and lower states at `402 x 874` points.
- [ ] Create and inspect a normalized side-by-side comparison with the selected visual.
- [ ] Fix every P0/P1/P2 issue and repeat capture if necessary.
- [ ] Update `design-qa.md` so the final line is exactly `final result: passed`.
