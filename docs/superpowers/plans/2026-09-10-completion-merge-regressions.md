# Completion Merge Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve the approved integrated behavior while absorbing committed main-branch work through `a7f42c78a`.

**Architecture:** Retain the existing themed native components and shared Web presenters. Repair narrowly scoped merge omissions and stale browser/test assumptions without weakening authentication, notifications, task concurrency, or navigation coverage.

**Tech Stack:** TypeScript, React, React Native, Expo, Next.js, node:test, react-test-renderer.

**Spec:** The user approved the current completion design on 2026-09-09, with execution starting after four hours. This phase implements only merge-regression repair. The remaining approved phases are Web fixture/audit repair, native password recovery/batch review/event experience, cross-client runtime verification, deployment prerequisites, and final integration.

## Global Constraints

- Work only in `/Users/xzhao/Projects/orbit/.worktrees/remote-sync-20260907`; preserve the main worktree's uncommitted changes.
- Preserve actor isolation, fail-closed authentication, notification revocation, and explicit user confirmation for external actions.
- Run GitNexus upstream impact before editing every existing symbol; report HIGH/CRITICAL risk before editing. Use the refreshed `orbit-remote-sync` index.
- Use apply_patch for manual edits and TDD for behavior repairs. No production credentials, database writes, email, model calls, or deployment.
- Mobile source cannot import Web source. Keep each implementation task inside its assigned child repository.
- The controller owns the in-progress merge and all git staging/commits. Implementers must not commit, merge, reset, stash, or modify the index.
- Review each task against its requirements and code quality. Known unrelated baseline failures remain visible, not declared passed.

### Task 1: Restore Notification Delivery Theme Binding

**Status:** Complete; independent review passed after one fix round. Fifty covering tests and App typecheck passed. Changes staged for the merge checkpoint.

**Files:** Modify `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`; test `repos/orbit-app/tests/relationship-inbox-screen-source.test.ts`, `repos/orbit-app/tests/notifications/merged-notification-lifecycle.test.ts`, and `repos/orbit-app/tests/notifications/notification-registration-races.test.ts`.

**Interfaces:** `NotificationDeliveryCard` consumes the existing `ClientPatch` and `DeliveryView`; retain those signatures and signal status requests. The existing `useStyles` returns themed colors and styles.

- [x] Reproduce `npm run typecheck` from the mobile repository. The merge initially failed on five unresolved `styles` references inside `NotificationDeliveryCard`.
- [x] Add a focused wiring regression to the existing screen-source test. This screen imports native/router providers, so explain why a source wiring guard complements the typecheck and shared rendered theme tests. Isolate the function body by its existing adjacent component boundaries and assert the theme binding:

```ts
const start = screenSource.indexOf("function NotificationDeliveryCard(");
const end = screenSource.indexOf("function InboxContent(", start);
assert.ok(start >= 0 && end > start);
assert.match(screenSource.slice(start, end), /const \{ styles \} = useStyles\(\)/u);
```

- [x] Run that test and record its expected failure before editing implementation.
- [x] Run upstream impact for `NotificationDeliveryCard`, then add the existing local hook pattern at the start of the component:

```ts
const { styles } = useStyles();
```

- [x] Run `npm run typecheck` and `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/relationship-inbox-screen-source.test.ts tests/theme-render.test.tsx tests/theme-wiring.test.ts tests/notifications/merged-notification-lifecycle.test.ts tests/notifications/push-notification-settings.test.ts`.
- [x] The first combined run exposed another merge fixture omission: the notification lifecycle VM loader cannot resolve SettingsScreen's new theme import. Run impact on `harness` and `nativeRequire`, then extend the existing loader to execute real `src/design/theme.ts` and `src/design/tokens.ts`, with only the native `useColorScheme` boundary replaced. Do not replace the theme factory or remove notification assertions. The existing failed settings lifecycle case is the red regression; rerun the combined command to green.

```ts
if (id.endsWith("/design/theme")) return load("src/design/theme.ts");
if (id.endsWith("/design/tokens") || id === "./tokens") return load("src/design/tokens.ts");
// In the existing react-native boundary object:
useColorScheme: () => "light",
```

- [x] Full-suite review exposed the same missing native `useColorScheme` boundary in `notification-registration-races.test.ts`. After impact, add that hook to its existing native stub and retain its existing real relative-module loader. Run that file plus the combined Task 1 suite; all notification races, revocation, retry, and failed logout recovery cases must pass. The known route-parity gap belongs to the later native feature phase and is not waived as completed.
- [x] Self-review for unchanged delivery actions and report exact commands/results. Leave changes unstaged for controller review.

### Task 2: Align Web Integration Fixtures With Preserved Behavior

**Status:** Complete; independent spec and quality review passed. Fifty-six focused tests and both Web typechecks passed.

**Files:** Modify `repos/orbits/tests/pages/app-agent-task-interaction.test.tsx`, `repos/orbits/tests/pages/app-contacts-analysis-content.test.tsx`, `repos/orbits/tests/pages/core-product-ux-optimizations.test.ts`, `repos/orbits/tests/pages/app-contacts-dashboard-account-scope.test.ts`, and `repos/orbits/tests/pages/web-tasks-today.test.tsx` only.

**Interfaces:** `CrmSidebar` keeps list/progress/current section visible while secondary views use a reversible disclosure. Legacy `active="graph"` maps to the single dashboard analysis entry. `fetchAgentConversation` uses browser timeout functions; `mountPage` must provide them.

- [x] Run the three listed tests using `node --test --import tsx` from the Web repository. Current baseline has six failures: four task interaction tests, one list navigation test, and one stale source assertion.
- [x] Run impact on `mountPage` and file-level impact for changed anonymous test callbacks. Add the missing timer APIs to the window fixture; keep real timer behavior:

```ts
setInterval, clearInterval, setTimeout, clearTimeout,
```

- [x] Keep all task acceptance, session mutation, duplicate-click, and delayed-save assertions intact. Do not modify production request or consent behavior.
- [x] Update the navigation test to mount the actual `OrbitRealCardsList` with react-test-renderer. Assert one narrow-screen analysis destination initially, no separate graph destination, two analysis destinations after clicking the unique `data-crm-sidebar-more` button, and one again after collapsing. Assert `aria-expanded` toggles false/true/false and labels remain the single analysis terminology. Keep the separate legacy-active test for both empty/nonempty counts.

```ts
const links = () => root.root.findAll((node) => node.type === "a" && node.props.href === "/app/contacts/dashboard");
const toggle = () => root.root.findByProps({ "data-crm-sidebar-more": true });
assert.equal(links().length, 1);
act(() => toggle().props.onClick());
assert.equal(links().length, 2);
act(() => toggle().props.onClick());
assert.equal(links().length, 1);
```

- [x] Replace the stale source assertion for `item.key === active` with assertions covering the actual `currentActive` alias and its `graph` to `dashboard` mapping. The runtime test above is the behavioral authority.
- [x] The full baseline identified two more stale integration assertions. In the dashboard account test, verify the page calls `loadContactsAnalysis(actor.id, language)`, never with the raw auth user ID, retaining authentication/membership/redirect assertions. Replace the obsolete adapter name with the current analysis workspace handoff. Add a runtime loader test that sends two distinct account IDs through an injected dashboard service and verifies exact actor forwarding and visible failure state; an empty actor must not call the service.

```ts
const seen: string[] = [];
const service = { getDashboard: async ({ actorId }: { actorId: string }) => {
  seen.push(actorId);
  return { success: false as const, error: { code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED" as const, section: "aggregate" as const } };
} };
for (const actorId of ["account:one", "account:two"]) {
  assert.equal((await loadContactsAnalysis(actorId, "zh", service)).state, "error");
}
assert.equal((await loadContactsAnalysis(" ", "zh", service)).state, "error");
assert.deepEqual(seen, ["account:one", "account:two"]);
```

- [x] In the Today test, replace the retired arrangements-column marker with the current collapsed-column marker and also assert `id="arrangements"` remains on the actual spine column. Retain the canonical all-tasks link and both schedule/decision section assertions. Do not add empty production markers to satisfy tests.
- [x] Run all five changed tests plus `tests/pages/app-contacts-progress-terminology.test.tsx`, `tests/services/postgres-live-record-storage.test.ts`, `npm run typecheck:app`, and full `npm run typecheck` (including tests). Expect all 55 existing focused tests to pass, plus the new actor-forwarding case.
- [x] Self-review and report exact results, without staging or committing.

### Task 3: Preserve Task Status Under the Recommendation Evidence Guard

**Status:** Complete; independent spec and quality review passed. Forty-nine scoped tests and both Web typechecks passed; controller combined merge set passed 78/78. Minor English-copy rendered coverage gap goes to final review. RED documentation wording corrected.

**Files:** Modify `repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx`, `repos/orbits/tests/pages/app-agent-task-interaction.test.tsx`, and append a dated continuation note to `repos/orbits/docs/superpowers/plans/2026-09-06-remote-sync.md`.

**Interfaces:** Task 2 leaves the actual page test harness working. The existing `parseAgentTaskInteraction` validates created/suggested/failed states and required IDs. The API's `applyTaskInteraction` can return a real task result with no recommendation artifacts. Do not change either contract or task mutation behavior.

- [x] Extend the page fixture with an optional reply override while retaining all existing default cases. Add rendered regressions for created, suggested, and failed task interactions with empty artifacts; none may show the recommendation-empty/import-first message. The created case must retain its encoded task link, suggested must require the existing explicit accept action, and failed must expose neither a success link nor accept action. Add malformed created-without-ID and absent-interaction cases that retain the evidence guard and do not display an arbitrary raw server message.

```ts
assert.doesNotMatch(JSON.stringify(root.toJSON()), /No verifiable result|本次没有从你已授权/u);
assert.match(JSON.stringify(root.toJSON()), /已创建待办：准备会面/u);
assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 2);
```

- [x] Run the new cases to verify red before implementation. Run GitNexus upstream impact for `ask` and `OrbitRealAgent`, disambiguating this file, and for changed test helpers.
- [x] Parse task interaction once before selecting assistant text. For a reply with no recommendation items or evidence, select a deterministic task-status sentence only for validated created/suggested/failed states. A malformed/unavailable/absent interaction must keep the existing guard. Preserve grounded recommendation replies and all task persistence/concurrency logic.

```ts
const taskInteraction = parseAgentTaskInteraction(payload.data.taskInteraction);
const taskOnlyMessage = taskInteraction?.state === "created"
  ? locale === "zh" ? `已创建待办：${taskInteraction.title}` : `Task created: ${taskInteraction.title}`
  : taskInteraction?.state === "suggested"
    ? locale === "zh" ? `要把“${taskInteraction.title}”加入待办吗？` : `Add "${taskInteraction.title}" to your tasks?`
    : taskInteraction?.state === "failed"
      ? locale === "zh" ? `待办“${taskInteraction.title}”暂时没有写入成功，请稍后重试。` : `The task "${taskInteraction.title}" was not saved. Please try again.`
      : null;
```

- [x] Use `taskOnlyMessage ?? existingEmptyEvidenceMessage` only in the existing no-items/no-evidence branch. Store the already parsed `taskInteraction` on the assistant message rather than decoding twice. Do not accept raw assistant prose as new grounding evidence and do not introduce a new service/helper abstraction for this narrow branch.
- [x] Run the task interaction suite, `app-agent-general-conversation.test.tsx`, `app-agent-contact-recommendations.test.tsx`, `app-agent-event-recommendations.test.tsx`, `core-product-ux-optimizations.test.ts`, and both Web typechecks. Review the changed user-facing sentences against the no-ai-tone skill without changing the factual status meaning.
- [x] Append a concise 2026-09-10 continuation note to the existing Web integration document recording the validated task-status/no-recommendation distinction and this task's exact verification scope. Preserve previous dated checkpoint evidence and remaining native/deployment limitations.
- [x] Self-review and provide red/green evidence; controller performs independent review and staging.

### Task 4: Review and Record the Integrated Snapshot

**Status:** Complete for this local merge checkpoint. Independent two-parent review found no new Critical or Important issues. App full suite 830/831 (known five-route parity gap), App typecheck passed, Web merge checks 78/78. The accompanying merge commit records this snapshot; larger completion work remains open.

**Files:** Controller-owned merge resolutions and root bridge handoff records. No additional feature implementation in this task.

**Interfaces:** Tasks 1, 2, and 3 provide verified merge repairs. The integrated tree must retain both parent commits' intended behavior.

- [x] Obtain independent spec and code-quality reviews of each task diff; fix required findings and rerun covering checks.
- [x] Review the six original conflict resolutions plus automatic merges in native notification/theme and Web agent task state. Check task suggestions with no recommendation artifacts do not produce contradictory completion claims.
- [x] Run both typechecks and focused App/Web tests again if the reviewed artifact changed. Run `git diff --check` and ensure no unmerged index entries remain.
- [x] Run `gitnexus_detect_changes()` and inspect affected scope against the committed-main merge plus approved repairs.
- [x] Commit the merged snapshot with a message that identifies the main cutoff and known remaining baseline work. Do not mark the larger completion effort finished.

## Verification Baseline

On 2026-09-10, Web `typecheck:app` passed. App typecheck had five unresolved `styles` references. The focused Web set ran 51 tests: 45 passed, six failed as described above. The prior completion baseline still has eight Web fixture/assertion failures and seven audit/UI/evidence failures; those are separate follow-up phases, not waived checks.
