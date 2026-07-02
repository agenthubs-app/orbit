# Orbit iOS App Goal 7: Actionable Schedule Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile Schedule tab show actionable follow-up context from `/api/tasks` instead of generic placeholder card text.

**Architecture:** Keep Schedule as a list backed by the existing tasks endpoint. Expand the schedule view-model to preserve contact, organization, priority, and recommended action fields, then render them in compact cards without adding a new backend route.

**Tech Stack:** Expo Router, React Native, TypeScript, existing `useApiResource`, Node test runner with `tsx`.

## Global Constraints

- Do not import source from `repos/orbits`.
- Do not add a task detail route until a detail API exists.
- Do not display raw source, provider, fixture, audit, or generatedBy implementation fields.
- Keep card text within mobile-width containers.
- Add automated tests before production code.
- Verify with `npm test`, `npm run typecheck`, and a mobile-width screenshot.

---

### Task 1: Expand Schedule View Model

**Files:**
- Modify: `repos/orbit-app/src/view-models/schedule.ts`
- Modify: `repos/orbit-app/tests/screen-state.test.ts`

**Interfaces:**
- Consumes: `/api/tasks` list payload items.
- Produces: `ScheduleItem` with `contactName`, `organization`, `priority`, and `recommendedAction`.

- [ ] **Step 1: Write the failing test**

Update `tasksToScheduleItems maps follow-up task payloads` in `repos/orbit-app/tests/screen-state.test.ts` so the input task includes:

```ts
contactName: "Maya Chen",
organization: "Kumo Grid",
priority: "today",
recommendedAction: "Send a concise recap before suggesting a pilot call."
```

and the expected item includes:

```ts
contactName: "Maya Chen",
organization: "Kumo Grid",
priority: "today",
recommendedAction: "Send a concise recap before suggesting a pilot call."
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

Expected: fail because `tasksToScheduleItems` does not return the new fields.

- [ ] **Step 3: Implement the expanded mapper**

Update `ScheduleItem`:

```ts
export interface ScheduleItem {
  contactName: string;
  dueAt: string;
  id: string;
  organization: string;
  priority: string;
  recommendedAction: string;
  title: string;
}
```

Update `tasksToScheduleItems` map:

```ts
contactName: stringField(task, "contactName"),
organization: stringField(task, "organization"),
priority: stringField(task, "priority", "follow-up"),
recommendedAction: stringField(
  task,
  "recommendedAction",
  "Review before taking action."
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd repos/orbit-app
npm test -- tests/screen-state.test.ts
```

Expected: pass.

---

### Task 2: Render Actionable Cards

**Files:**
- Modify: `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx`

**Interfaces:**
- Consumes: expanded `ScheduleItem`.
- Produces: Schedule cards with due/contact detail, recommended action, and priority.

- [ ] **Step 1: Run impact analysis before editing**

Run GitNexus impact analysis for `ScheduleScreen`:

```text
gitnexus_impact target=ScheduleScreen direction=upstream file_path=repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx
```

If not indexed, record local mobile risk and proceed.

- [ ] **Step 2: Render richer detail text**

Replace the generic card body with:

```tsx
<DataCard detail={scheduleDetail(task)} key={task.id} title={task.title}>
  <Text style={styles.actionText}>{task.recommendedAction}</Text>
  <Text style={styles.priorityText}>{task.priority}</Text>
</DataCard>
```

Add:

```ts
function scheduleDetail(task: ScheduleItem): string {
  return [task.dueAt, task.contactName, task.organization]
    .filter(Boolean)
    .join(" | ");
}
```

- [ ] **Step 3: Add compact text styles**

Use existing colors and typography:

```ts
actionText: {
  color: colors.ink,
  fontSize: typography.small,
  lineHeight: 20
},
priorityText: {
  color: colors.accent,
  fontSize: typography.caption,
  fontWeight: "800",
  textTransform: "uppercase"
}
```

---

### Task 3: Verification And Commit

**Files:**
- Modify: `repos/orbit-app/README.md`

**Interfaces:**
- Consumes: local `/api/tasks`.
- Produces: screenshot evidence and focused commit.

- [ ] **Step 1: Update README**

Change the Schedule bullet to:

```markdown
- Schedule: reads `/api/tasks` and shows actionable follow-up context.
```

- [ ] **Step 2: Run verification**

Run:

```bash
cd repos/orbit-app
npm test
npm run typecheck
```

Expected: both pass.

- [ ] **Step 3: Screenshot Schedule**

Open the Schedule tab at iPhone width and save:

```text
/tmp/orbit-app-schedule-actionable-cards.png
```

Expected visible text includes:

- `Schedule`
- `Send Maya the event recap`
- `Maya Chen`
- `Kumo Grid`
- `Send a concise recap`
- `today`

Expected forbidden text is absent:

- `provider`
- `fixture`
- `generatedBy`
- `mock`

- [ ] **Step 4: Clean generated noise**

If Expo rewrites `.gitignore` or `expo-env.d.ts`, remove generated changes.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-7-actionable-schedule-cards.md repos/orbit-app/README.md repos/orbit-app/src/view-models/schedule.ts repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx repos/orbit-app/tests/screen-state.test.ts
gitnexus_detect_changes scope=staged repo=orbit
git commit -m "feat(mobile): show actionable schedule cards"
```

Expected: focused commit with Schedule mapper, UI, tests, docs.

## Self-Review

- Spec coverage: improves an existing tab with API-backed data, keeps business logic behind `/api/tasks`, avoids direct storage or provider internals.
- Placeholder scan: no TBD/TODO/fill-in steps remain.
- Type consistency: `ScheduleItem` fields match mapper output and Schedule screen usage.

## Execution Choice

The user asked for autonomous execution without external intervention. Execute inline in this session using the plan above.
