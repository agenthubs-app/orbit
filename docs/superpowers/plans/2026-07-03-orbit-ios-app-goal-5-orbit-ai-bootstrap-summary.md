# Orbit iOS App Goal 5: Orbit AI Bootstrap Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an API-backed startup summary to the Orbit AI tab so the mobile app opens with relationship context before the user sends a message.

**Architecture:** Keep Orbit AI as the initial tab and do not add a standalone home route without bottom navigation. The mobile app reads `/api/app/bootstrap` through the existing envelope client, maps the payload in `src/view-models/bootstrap.ts`, and renders compact summary cards inside `AiScreen`.

**Tech Stack:** Expo Router, React Native, TypeScript, Node test runner with `tsx`, existing Orbit API client and `useApiResource`.

## Global Constraints

- Keep `repos/orbit-app` independent from `repos/orbits` source imports.
- Consume `/api/app/bootstrap` over HTTP only.
- Do not add a sixth tab or remove the current bottom navigation.
- Do not expose implementation labels such as mock, hybrid, provider, or command-center in user-facing copy.
- Keep the UI compact and mobile-first; avoid marketing hero layouts.
- Add automated tests before production code.
- Verify with `npm test`, `npm run typecheck`, and a mobile-width screenshot.

---

### Task 1: Bootstrap Summary View Model

**Files:**
- Modify: `repos/orbit-app/tests/bootstrap-view-model.test.ts`
- Modify: `repos/orbit-app/src/view-models/bootstrap.ts`

**Interfaces:**
- Consumes: `AppBootstrapSummary`.
- Produces: `BootstrapMetric` and `bootstrapMetrics(summary: AppBootstrapSummary): BootstrapMetric[]`.

- [ ] **Step 1: Write the failing test**

Add this test to `repos/orbit-app/tests/bootstrap-view-model.test.ts`:

```ts
test("bootstrapMetrics creates compact home metrics", () => {
  const metrics = bootstrapMetrics({
    assistantActionCount: 2,
    highValueRelationships: 5,
    nextAction: "Review today's follow-ups.",
    pendingFollowupCount: 4,
    profileName: "Xinyi Zhao",
    relationshipAssetCount: 42,
    summary: "You have 4 follow-ups and 2 upcoming events.",
    upcomingEventCount: 2,
    workspaceName: "Orbit Dev"
  });

  assert.deepEqual(metrics, [
    { label: "Events", value: 2 },
    { label: "Follow-ups", value: 4 },
    { label: "Relationships", value: 42 },
    { label: "Assistant actions", value: 2 }
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd repos/orbit-app
npm test -- tests/bootstrap-view-model.test.ts
```

Expected: fail because `bootstrapMetrics` is not exported.

- [ ] **Step 3: Implement the metric helper**

Add the exported type and helper to `repos/orbit-app/src/view-models/bootstrap.ts`:

```ts
export interface BootstrapMetric {
  label: string;
  value: number;
}

export function bootstrapMetrics(
  summary: AppBootstrapSummary
): BootstrapMetric[] {
  return [
    { label: "Events", value: summary.upcomingEventCount },
    { label: "Follow-ups", value: summary.pendingFollowupCount },
    { label: "Relationships", value: summary.relationshipAssetCount },
    { label: "Assistant actions", value: summary.assistantActionCount }
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd repos/orbit-app
npm test -- tests/bootstrap-view-model.test.ts
```

Expected: pass.

---

### Task 2: Orbit AI Startup Summary UI

**Files:**
- Modify: `repos/orbit-app/src/screens/ai/AiScreen.tsx`

**Interfaces:**
- Consumes: `ORBIT_API_ENDPOINTS.bootstrap`, `bootstrapToSummary`, `bootstrapMetrics`, `MetricPill`, `DataCard`, and `useApiResource`.
- Produces: a compact startup summary inside the existing Orbit AI tab.

- [ ] **Step 1: Run impact analysis before editing**

Run GitNexus impact analysis for `AiScreen`:

```text
gitnexus_impact target=AiScreen direction=upstream file_path=repos/orbit-app/src/screens/ai/AiScreen.tsx
```

If the symbol is not indexed, record that risk is local to the mobile app and proceed.

- [ ] **Step 2: Add bootstrap resource reading**

In `AiScreen`, add a second `useApiResource<unknown>` call for `ORBIT_API_ENDPOINTS.bootstrap`:

```ts
const bootstrapState = useApiResource<unknown>(
  ORBIT_API_ENDPOINTS.bootstrap,
  () => false
);
```

- [ ] **Step 3: Render the summary before the composer**

Render the startup summary above the "Ask Orbit AI" composer:

```tsx
<OrbitSummaryCard state={bootstrapState} />
```

Create `OrbitSummaryCard` in the same file. It should:

- Show nothing while loading.
- Show a controlled `ErrorState` for offline/failure states.
- Map success data with `bootstrapToSummary`.
- Render a `DataCard` titled with the workspace name.
- Render the profile name and summary in plain text.
- Render four `MetricPill` components in a wrapping row.
- Render the next action as a short note.

- [ ] **Step 4: Keep refresh behavior simple**

Keep the screen pull-to-refresh bound to conversation refresh only for this goal. The bootstrap summary refreshes on screen load and when the API base URL changes; combined refresh can be a later polish goal.

- [ ] **Step 5: Run verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

Expected: both pass.

---

### Task 3: Visual Verification And Docs

**Files:**
- Modify: `repos/orbit-app/README.md`

**Interfaces:**
- Consumes: local `repos/orbits` API server and Expo web server.
- Produces: screenshot evidence and short README update.

- [ ] **Step 1: Update README**

Add one sentence under "First Screens":

```markdown
Orbit AI also reads `/api/app/bootstrap` to show the startup relationship summary above the composer.
```

- [ ] **Step 2: Start verification servers**

Use the already running `repos/orbits` dev server when available. Start Expo web for screenshot verification:

```bash
cd repos/orbit-app
CI=1 EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npx expo start --web --port 19006 --clear
```

- [ ] **Step 3: Capture screenshot**

Use Playwright at iPhone width and route-proxy `http://localhost:3000/api/**` to avoid browser CORS. Save:

```text
/tmp/orbit-app-ai-bootstrap-summary.png
```

Expected visible text includes:

- `Orbit AI`
- `Orbit Demo`
- `Mina Tanaka`
- `Follow-ups`
- `Ask Orbit AI`

- [ ] **Step 4: Clean generated noise**

If Expo rewrites `.gitignore` or `expo-env.d.ts`, remove the generated Expo ignore block/comment before committing.

- [ ] **Step 5: Commit**

Stage only the goal files and run GitNexus staged change detection:

```bash
git add src/view-models/bootstrap.ts tests/bootstrap-view-model.test.ts src/screens/ai/AiScreen.tsx README.md
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): show Orbit AI startup summary"
```

Expected: focused commit with mobile app files only.

## Self-Review

- Spec coverage: keeps Orbit AI as the startup steward surface, consumes `/api/app/bootstrap`, preserves tab navigation, and avoids direct storage imports.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: `BootstrapMetric`, `bootstrapMetrics`, and `AppBootstrapSummary` names match the existing `bootstrap.ts` module.

## Execution Choice

The user asked for autonomous execution without external intervention. Execute inline in this session using the plan above.
