# Opportunity Action Brief Implementation Plan

> **For Codex:** Execute in order with TDD. Keep the shared contract additive and preserve all existing opportunity fields.

**Goal:** Add a deterministic, evidence-backed action brief to live opportunities and present it in an iOS bottom action panel.

**Architecture:** The live dashboard service owns scoring and brief generation. The API returns an additive, versioned `actionBrief`. The iOS view model normalizes that field and the existing contacts analysis screen renders it without changing the current visual system.

**Tech Stack:** TypeScript, Next.js service contracts, Expo Router, React Native, Node test runner.

---

### Task 1: Lock the shared contract

**Files:**
- Modify: `repos/orbits/features/dashboard/opportunity-contract.ts`
- Test: `repos/orbits/tests/capabilities/opportunity-reminder-live-store.test.ts`

1. Add a failing test that expects live opportunities to expose `actionBrief.ruleVersion`, score components, evidence, steps, and actions.
2. Add the additive action brief types and optional `HighPriorityOpportunity.actionBrief` field.
3. Run the focused service test and confirm the contract compiles.

### Task 2: Implement deterministic brief generation

**Files:**
- Create: `repos/orbits/features/dashboard/opportunity-action-brief.ts`
- Create: `repos/orbits/tests/services/opportunity-action-brief.test.ts`
- Modify: `repos/orbits/features/dashboard/live-opportunity-service.ts`

1. Add failing tests for overdue, due today, future, missing date, evidence completeness, score caps, and deterministic output.
2. Implement pure scoring helpers and the `follow_up` brief template.
3. Call the helper from `opportunityFor` and pass the fixed service clock.
4. Run focused tests and typecheck.

### Task 3: Normalize the brief for iOS

**Files:**
- Modify: `repos/orbit-app/src/view-models/contacts-analysis.ts`
- Modify: `repos/orbit-app/tests/contacts-analysis-view-model.test.ts`

1. Add failing tests for complete action briefs and legacy opportunities without the field.
2. Extend `ContactsAnalysisActionView` with an optional normalized brief.
3. Reject malformed brief fragments and preserve the current fallback action.
4. Run the focused view-model test.

### Task 4: Add the iOS action panel

**Files:**
- Modify: `repos/orbit-app/src/screens/contacts/ContactsDashboardScreen.tsx`
- Modify: `repos/orbit-app/tests/contacts-dashboard-screen-source.test.ts`

1. Add failing source/render assertions for panel state, modal close behavior, evidence, steps, and primary/secondary actions.
2. Add selected-action state and open the panel when a brief exists.
3. Build the modal from existing tokens, `Ionicons`, and established modal patterns.
4. Keep legacy cards on the existing navigation path.
5. Run focused iOS tests and typecheck.

### Task 5: Verify the full flow

**Files:** No production changes unless verification finds a defect.

1. Run all `repos/orbits` tests affected by dashboard opportunity contracts.
2. Run the complete `repos/orbit-app` test suite and both typechecks.
3. Open `orbit://contacts/dashboard` in the iPhone 17 Pro Simulator.
4. Capture the opportunity list and an opened action panel; inspect spacing, clipping, button alignment, and dismissal.
5. Run `gitnexus_detect_changes({scope: "all"})` and confirm the new blast radius matches dashboard opportunity plus iOS contacts analysis.
