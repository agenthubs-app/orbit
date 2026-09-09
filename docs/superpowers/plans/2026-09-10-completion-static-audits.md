# Completion Static Audit Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make static interaction classification and retained evidence accurate without shrinking the product denominator or inventing runtime coverage.

**Architecture:** Extend the existing TypeScript-AST scanner for concrete delegated event bindings, correct noninteractive status markup, and bind unchanged historical interaction evidence to the existing stable handler identity mechanism. Keep runtime coverage failures explicit until fresh runtime checks exist.

**Tech Stack:** TypeScript compiler API, React/React Native, node:test, existing audit generators and component interaction harnesses.

**Spec:** Approved completion design in the 2026-09-09 conversation: repair audits without weakening checks, implement real native flows, and verify actual runtime behavior. This plan is only the static/evidence-integrity subset; missing runtime evidence is not satisfied here.

## Global Constraints

- Work in the existing isolated integration worktree. Web tasks edit only `repos/orbits`; the explicitly scoped native accessibility task edits only `repos/orbit-app`. Do not edit the dirty main worktree or cross a task's write boundary.
- Use apply_patch, TDD, GitNexus upstream impact before existing-symbol edits, and report HIGH/CRITICAL risk before editing. Controller owns staging/commits.
- Never remove production routes, skip required assertions, lower thresholds, count disabled controls as implemented behavior, or assign route-wide evidence to untested sibling occurrences.
- Existing evidence may survive a line shift only when source file, owner/handler identity, visible name, route, and behavior still match. Changed handlers or changed route behavior require new runtime evidence.
- Runtime evidence means executed behavior with a traceable case/artifact, not source inspection, typechecks, snapshots of JSX, or fabricated case IDs. Never change a conclusion to verified just to make a test pass.
- Preserve actual contact-request actions, revisions, actor boundaries, reversible controls, and waiting/locked/declined labels. This plan does not implement new business actions.
- No production credentials, remote writes, real email/model/provider calls, deployment, or native simulator changes. No handwritten generated audit snapshots.

### Task 1: Correct Interaction Markup and Scanner Classification

**Files:** Modify `repos/orbits/scripts/generate-product-surface-manifest.mjs`, `repos/orbits/tests/audits/product-surface-manifest.test.ts`, `repos/orbits/app/(app)/app/events/[id]/orbit-event-matchmaking.tsx`, `repos/orbits/app/(app)/app/dashboard/orbit-real-party.tsx`, `repos/orbits/tests/pages/app-event-matchmaking.test.ts`, and `repos/orbits/tests/pages/app-party-participant-ui.test.tsx`. Add `repos/orbits/tests/audits/product-surface-scanner-fixtures.test.ts` only if isolated AST fixtures cannot fit the current test file cleanly. Append a dated scope note to `repos/orbits/docs/superpowers/plans/2026-09-06-remote-sync.md`.

**Interfaces:** Existing scanner functions include collectImperativeBindings, interactionKind, staticExpressionText, and collectInteractions. The concrete delegated handler is `app/(app)/app/orbit-starfield-agent-prompt.ts`: host click listener calls onHostClick, which tests event.target.closest('.sk-chip') and closest('#skEnter') guarded by host.contains. Do not guess another path or execute source text.

- [x] Reproduce current manifest failures. Add RED rendered assertions that waiting-consent, declined, and locked-persona states are noninteractive status elements with the same visible labels. Retain the real withdrawal, accepted-contact link, retry/request, and editable-persona link assertions. A temporarily busy real action stays a button.

```ts
assert.equal(root.findAll((node) => node.type === "button" && node.props["data-contact-request-state"] === "awaiting_target_consent").length, 0);
assert.equal(root.findAll((node) => node.props["data-contact-request-action"] === "withdraw").length, 1);
```

- [x] Add focused RED AST fixtures for direct listeners (existing support), delegated static closest selectors in the actually registered callback, unregistered callbacks, another host's callback, dynamic closest selectors, and an unrelated decoy selector. Only provable registered dispatch paths may acquire imperative behavior evidence. Keep exact source and event in that evidence.
- [x] Add RED classification fixtures: a PascalCase Form wrapper with no direct action must not duplicate the actual intrinsic form; explicit role and actual handler-bearing controls remain counted; an anchor whose child is entryTitle(entry.title) has dynamic accessible-name evidence, not a fabricated static title. A missing label/handler negative control must still fail classification.
- [x] Correct the stale starfield ownership assertion: language and menu controls now belong to the shared React OrbitTopNav, so assert their current source owner and actual React handler evidence separately. Keep the prompt submit and four suggestion labels under orbit-starfield-agent-prompt, with exactly four occurrences for each label (two routes by two layouts) and concrete imperative evidence. Do not merely remove the language/menu assertions or count them as imperative prompt controls.
- [x] Run impact for changed helpers/components/tests. Convert only the three permanently disabled status buttons to span/status markup, preserving data attributes and aria-live/description relationships. Do not add empty handlers.

```tsx
<span aria-live="polite" className="chip" data-contact-request-state="awaiting_target_consent">
  {t({ en: "Waiting for their consent", zh: "等待对方同意" })}
</span>
```

- [x] Use TypeScript AST to resolve named/inline listener callbacks and their statically guarded target selectors. Scope variable/callback resolution to the listener's owning lexical scope and host; never grant every closest() occurrence in the source to every control. Reuse the existing binding structure and deduplication. A small exported scanner test entry is acceptable if needed for fixture inputs; do not introduce a new parser framework.
- [x] Make intrinsic tag classification case-sensitive where required so the custom Form invocation does not masquerade as a DOM form. Preserve explicit role and handler classification. Extend the existing dynamic-name helper suffix recognition to Title alongside label/name/text, without treating arbitrary calls as a verified label.
- [x] Ownership refinement from Task 1 review: a callback prop proven to forward to an intrinsic form is ownership/container evidence, not a separate click control requiring a label. Preserve its traceable callback provenance on the owning form or an explicit non-leaf record. Unknown or non-forwarded callbacks, explicit roles and actual custom controls retain conservative classification. Add positive and negative AST fixtures before changing classification; do not modify ProposalForm production UI, blanket-exclude custom forms, invent a name or waive zero-P1.
- [x] Run scanner fixture tests, full manifest tests, and both changed UI suites. Require no P0 missing-handler or P1 accessible-name findings caused by these known cases. Preserve negative controls. Both Web typechecks must pass. Report any newly surfaced genuine finding rather than excluding it.
- [x] Independent review, covering verification, controller change detection and scoped commit. Do not mark the full functional runtime audit complete.

### Task 2: Repair Functional Inventory and Obsolete Evidence

**Files:** Modify `repos/orbits/scripts/generate-full-product-functional-audit.mjs` and `repos/orbits/tests/audits/full-product-functional-audit.test.ts`. Append the verification scope to the same dated Web integration note.

**Interfaces:** The full inventory is built fresh from both route trees. Existing LIVE_WEB_ADDITIONAL_INTERACTION_EVIDENCE supports keys containing surface, source, handler, and visible name. The old Settings sign-out evidence uses a line number that moved from 178 to 205; its exact callback still closes the menu and calls signOut with preserveHref('/app'). `/app/home` is now a redirect, not the previously verified actor-owned event home screen.

- [x] Run full audit tests to capture the current failures and denominator. Add RED assertions that the exact Settings sign-out keeps its historical evidence through unrelated line shifts, but a different handler/route occurrence does not inherit it. Preserve the existing 27 credited shared-navigation replay occurrences unless a changed handler is genuinely no longer eligible; do not grant evidence to all current shared-shell siblings.
- [x] Analyze impact for changed inventory functions/test helpers or file-level records. Move only the unchanged Settings sign-out evidence from the brittle line key into the existing stable handler-bound mechanism, using the actual normalized key from the inventory. Preserve its original verification case, actualResult, idempotency, and testData. Do not update the record to claim a new runtime test happened.
- [x] Remove only mobile:/contacts/pipeline from the expected DataCard Pressable set because the actual route now uses its own pressable rows. Retain coverage of those rows and every other DataCard route. No App markup change is authorized for this stale assertion.
- [x] Correct the obsolete mobile access description claiming no route guard exists. The current analytics and task route files, among others, default-export withOrbitPrivateRoute(Screen) imported from the actual OrbitRouteAccessBoundary module. Inspect the route entry AST and recognize only that correctly resolved wrapper invocation; an unused/decoy import or a same-named local function must not acquire auth evidence. Label recognized routes as statically wired to the native auth boundary with authenticated-user role, explicitly retaining runtime authorization verification. Unrecognized entries remain unknown, not inferred public or protected from a prefix. Add focused positive/negative tests; do not change App guard code or count this as runtime coverage.
- [x] Repair the vacuous accessible-name test: it currently filters a conclusion value the generator never emits. Assert the actual missing-static accessibleNameEvidence records, with a genuine unlabeled visible-control negative fixture. Keep the summary and test consistent even when behavior evidence is present. Statically `hidden` Web file inputs retain handler/provenance records but do not require an accessible name; dynamic/false hidden values do not get that exemption. For native decorative pointer targets, recognize explicit cross-platform accessibility hiding only when the actual static accessibility props prove it; `disabled` never means hidden. Retain the accessible external file-picker triggers. The two real App candidates remain failing until Task 3 fixes them, not silently excluded.
- [x] Change `/app/home` expected query parameters to the actual empty set. Remove its obsolete old-home runtime claim from current-route evidence. Update corresponding assertions to require an explicitly unverified redirect entry until a fresh redirect runtime case exists; preserve historical evidence records for still-existing `/app/home/events` and unchanged component interactions where applicable.

```ts
assert.deepEqual(routeParameters("web:/app/home"), []);
assert.equal(homeSurface.runtimeEvidence.some((value) => value.includes("rendered the authenticated actor's one private event")), false);
```

- [x] Run focused changed assertions to green, then the complete audit suite. The missing-runtime-coverage assertion remains a required failing check at this checkpoint, not a skipped or relaxed check. Report exact pass/fail counts and the missing-surface list. Removing obsolete evidence may reduce the partial-coverage count; that is the correct outcome.
- [x] Separate current static-denominator assertions from the historical browser-evidence case. The fixed source-location/normalized-implementation counts 1244/915 no longer describe the current tree (pre-repair observation 1674/1324). Verify those summary counts against deduplicated current interaction identities and retain exact route/source ownership assertions; do not replace them with a lower minimum or conflate them with observed runtime leaf counts. Keep the historical 3001 observed leaf occurrences, 279 observed states and unresolved runtime denominator unchanged unless new executed evidence legitimately extends them. Put static consistency checks in an independently executed test so the intentional runtime-coverage failure cannot hide them.
- [x] Do not regenerate committed aggregate report artifacts yet: native route additions and actual runtime checks will change the denominator. Record a temporary generated inventory outside tracked report outputs for the next runtime phase. Run both Web typechecks and diff checking, obtain independent review, then controller change detection and scoped commit.

- [x] Diagnosed historical/current refinement: retire exact stale case eligibility for current catalogue/detail/organizer and Party/main/checkin/graph routes. Their source loaders/contracts or route-reachable controls changed, so the historical 20 lifecycle and 3 organizer-navigation cardinalities are not restoration targets. Keep original case records, historical 20 browser-base memberships, 20 lifecycle records, 3 navigation records, 2 unknown-organizer records and 3001/279 observations intact. Gate both surface and interaction evidence and prevent generic smoke fallback on the three public routes. Use independent historical-retention, current-eligibility and six required fresh-current-case tests; leave fresh runtime requirements failing, not skipped. Test historical records through the retained source maps rather than a mutable generated aggregate. No new runtime credit or production change is authorized by this refinement.

### Task 3: Repair Two Native Accessible-Name Findings

**Files:** Modify only `repos/orbit-app/src/screens/events/EventOperationsContent.tsx`, `repos/orbit-app/src/screens/tasks/TaskDetailScreen.tsx`, `repos/orbit-app/tests/event-operations-screen-render.test.tsx`, and `repos/orbit-app/tests/task-detail-interactions.test.ts`. Controller records the checkpoint in root plans. No Web or generated report edits.

**Interfaces:** EventOperationsContent's icon-only generation Pressable already calls onStartGeneration and gates on busy/active generation. TaskDetailScreen's modal scrim dismisses settings and is accompanied by a separately labeled close button. Do not change either action or write behavior.

- [x] Add RED rendered evidence that the generation button has an explicit accessible name, while its disabled conditions and callback remain unchanged. Use the existing renderToHtml helper, not a source-string-only test. Add a TaskDetail component interaction case for settings open, accessible close, decorative backdrop hiding and pointer dismissal with zero API writes.
- [x] Run impact for the two existing components and edited test helpers/callbacks. Label the generation Pressable `accessibilityLabel="开始生成匹配"`, preserving role, handler and all disabled logic.
- [x] Make the task-settings scrim an explicitly non-accessible decorative pointer target using the repo's native hiding convention: `accessible={false}`, `accessibilityElementsHidden`, and `importantForAccessibility="no-hide-descendants"`. Retain its onPress dismissal and the existing named close button. A stable testID is allowed if needed for the real component interaction test; do not hide the sheet or its descendants.
- [x] Verify the named close remains reachable and works, the scrim is absent from accessibility navigation but still dismisses on pointer activation, and neither action sends a mutation. Existing task edit/status/reminder failure tests must continue to pass.
- [x] Run the two changed suites, App typecheck and full App tests. Missing feature route-parity failures may remain until later native plans and must be reported explicitly. Re-run the full functional audit accessible-name assertion to zero candidates after Task 2's truthful hidden-control handling. Do not waive the separate runtime-coverage failure.
- [x] Obtain independent task review; controller runs change detection and scoped commit. Actual native assistive-technology/geometry validation remains part of the later simulator phase.

### Task 4: Verify the Static Checkpoint and Carry Runtime Work Forward

**Files:** Controller updates this plan and the completion verification records. No new implementation scope.

- [x] Review both task diffs and final static checkpoint. Preserve all unresolved runtime assertions and case-level limitations in the report.
- [x] Run the complete Web suite on the named local scratch DB with sanitized env, lifecycle DB enabled and ORBIT_RUN_POSTGRES_SMOKE=1. Record remaining runtime/audit failures explicitly; do not claim the suite is green.
- [ ] Continue native feature plans and actual runtime verification. After native additions, derive the denominator again from both trees rather than carrying forward 118 or a historical 115. Only after executed route-specific evidence exists should runtime records and generated audit artifacts be updated and the full audit required to pass.

## Task 1 Checkpoint

Scanner/status implementation and independent review are complete. Two scoped
fix rounds resolved lexical binding identity, class shadowing, unreachable
dispatch, and provable form-callback ownership without hiding genuine controls.
The final scoped suites pass 60/60 with zero P0/P1 candidates and zero skips;
both Web typechecks pass. The controller independently reproduced 60/60 on Node
22.23.2. GitNexus reports seven changed tracked files, 71 mapped symbols, zero
affected execution flows and LOW risk. Generated aggregate reports and runtime
evidence were not updated. Tasks 2-4 and the native feature/runtime plans remain
unfinished; this checkpoint is not full-suite or product completion.

## Task 2 Checkpoint

Full-inventory static repair and its scoped historical/current follow-up passed
independent spec and quality review. Exact Settings sign-out evidence survives
source movement; hidden file input and native guard classification is explicit;
actual accessible-name and static-denominator checks now execute meaningfully.
The old Home claim and current eligibility for six changed public/Party routes
no longer count as runtime proof. Their historical records remain unchanged.
The final complete audit run has 162 tests: 154 pass, eight required failures,
zero skips/cancellations. The controller reproduced this on Node22.23.2; both
Web typechecks pass. The failures are six fresh route cases, all-route runtime
coverage and the assertion containing two native name defects. Current observed
partial evidence is 87/118 routes, with 31 missing and zero fully verified;
188 interaction credits and all27 navigation replay occurrences remain. These
are observations, not reduced thresholds. Task 3 owns the native fixes; actual
runtime cases remain unfinished. No aggregate artifacts were regenerated.

## Task 3 And Full-Suite Checkpoint

The two native attribute repairs passed independent spec/quality review without
findings. Production callbacks, disabled logic and layout are unchanged. Focused
render/interaction tests pass31/31, independently reproduced by the controller on
Node22.23.2. Full App runs838tests:837pass, one known five-route parity failure,
zero skips; App typecheck passes. The full inventory's actual accessible-name
candidate list is now empty. Native-only hiding props are observed at the real
component boundary, not simulated as browser ARIA behavior; actual assistive
traversal and geometry still require native QA.

Precommit detection reports HIGH because TaskDetailScreen is the entry to six
mapped base-URL/cache/resource-state flows. The controller warned before
proceeding, inspected all28 mapped steps and rechecked the production diff:
only the two intended JSX attribute lines changed, with no hook/client/storage
implementation edits. This is recorded separately from the earlier LOW
upstream-caller results; the graph's function-level warning is not hidden.

Controller full Web validation on the same source and isolated Node22 completed
with2853tests,2846pass,7fail,zero skips/cancellations in91.3seconds. All database
variables point only to the owned scratch database, with lifecycle tests and
ORBIT_RUN_POSTGRES_SMOKE=1 enabled. The seven failures are the six fresh public
route cases and all-route runtime coverage. No non-audit failure appeared.
Log: /tmp/orbit-completion-static-full-web-node22-20260910.log. Whole-static-plan
review and subsequent native feature/runtime execution remain outstanding; this
is not an all-green full-suite or product-completion claim.

## Final Static Checkpoint

The whole-plan review identified one remaining obsolete delegated-listener proof:
a named function reassigned before registration retained its original body.
The single final fix wave reuses lexical write detection before accepting the
callback. Six regressions failed first, then all12 focused cases passed; the
complete surface suite passes53/53. The one scoped re-review marks the finding
ADDRESSED and the patch APPROVED, with no new Critical/Important or deferred issue.

Controller independent Node22.23.2 full Web verification with the owned local
database completed2861tests:2854pass,7fail,zero skipped/cancelled in82.1seconds.
All seven failures are the six required fresh public/Party cases and global
runtime coverage; no non-audit failure occurred. Log:
/tmp/orbit-completion-static-finalfix-full-web-node22-20260910.log.
Both Web typechecks pass. Precommit detection covers4files8mappedsymbols,
zero affected processes, LOW risk. No generated audit aggregate or business
runtime evidence changed. The three rulings below are retained verbatim.

This clears the static phase for native implementation, not full-product
acceptance. The open continuation item in Task4 transfers to the approved native
password recovery, event experience, batch import and runtime verification plans.
App's five missing feature routes and seven Web runtime gates remain required.

## Static-Phase Rulings

These three decisions remain visible for the eventual completion handoff. They do
not authorize new runtime credit or remove required acceptance checks.

1. Ruling: A callback prop proven to forward to an intrinsic form is component ownership/container evidence, not a second clickable control requiring its own accessible name. Retain traceable callback provenance on the owning form or an explicit non-leaf record; keep explicit roles, actual custom controls, and unresolved callbacks classified conservatively. This refines the plan's generic handler-bearing-custom rule to match rendered ownership and the approved accurate-audit goal. Cost if wrong: a genuine custom control could be undercounted, so require positive ownership and unknown/non-forwarded/explicit-role negative fixtures and retain the zero-P1 gate. No production ProposalForm edit, invented label, blanket Form exclusion or runtime credit is authorized.

2. Ruling: Correct the full-audit accessible-name assertion to inspect actual missing-static evidence rather than a conclusion the generator never emits, and add a bounded App-only accessibility task before final static verification. The five actual candidates are generation icon EventOperationsContent:88, task modal scrim TaskDetailScreen:277, and three explicitly hidden Web file inputs at batch2 start:170/detail:417,425. Hidden input records keep callback evidence but no accessible-name requirement; visible native controls are not waived. Cost if wrong: hiding a real focus target or overstating cross-platform hidden semantics could remove access, so retain the separate named close, require both native hiding props/accessible=false and real component tests, and leave runtime accessibility limitations explicit. No business action, API, layout, or production provider scope changes.

3. Ruling: Preserve historical public-event/organizer/Party case records and original cardinalities, but retire current eligibility for the six confirmed changed routes (/app/events, /app/events/[id], /app/o/[slug], /app/party, /app/party/checkin, /app/party/graph) and their exact stale case pairs. Apply retirement to both surface and interaction lookup, and block the old generic browser-smoke fallback on catalogue/detail/organizer. Split historical retention, current eligibility and required fresh runtime cases into independently executed tests; never restore20/3 by blanket rebinding or replace them with smaller current passing totals. Why: source diagnosis shows replaced contracts/loaders and removed controls; both Party children directly consume the same changed loadAppPartyRouteViewModel, which controller checked. Cost if wrong: retiring still-valid proof increases local runtime work for six routes, but retaining stale proof would falsely mark changed behavior verified. Keep all routes, historical3001/279 observations and case contents; no new runtime credit, production edit, generated aggregate or new artifact snapshot. Use retained raw historical map records for historical identity/cardinality checks rather than coupling tests to an aggregate file that the later runtime phase will regenerate.

## Historical Baseline

Before these repairs, the integrated inventory had 118 route surfaces (60 Web, 58 mobile), 94 surfaces with partial historical runtime evidence, and zero fully verified surfaces. The current route count will grow with five planned native routes. At least one current-route historical claim is obsolete, so 94 is an inventory observation, not a promise of valid present-version coverage. Static fixes must not turn that observation into a completion claim.
