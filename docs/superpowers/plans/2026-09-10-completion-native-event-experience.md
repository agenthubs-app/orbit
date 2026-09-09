# Native Event Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the missing native event experience workspace with real draft, preview, and explicit publish operations.

**Architecture:** Consume the existing event-scoped HTTP handlers. Share pure DTOs and a runtime response schema through the sanctioned copy channel. Keep the editable configuration and mutation state scoped to event, API client, and account, using existing themed native controls.

**Tech Stack:** TypeScript, Zod, Expo Router, React Native, node:test, runtime component tests.

**Spec:** Completion design approved in conversation on 2026-09-09. This is the event-experience subset: preserve existing API, optimistic revisions, actor/capability isolation, actual edit/preview/publish behavior, and visible failure recovery. This does not authorize deployment or production publication.

## Global Constraints

- Use only the existing integration worktree; preserve main worktree changes. Web tasks edit only Web files; App tasks edit only App files. Controller owns staging/commits.
- GitNexus impact before existing-symbol edits and warnings before HIGH/CRITICAL changes. TDD and apply_patch required; independent task and final review before commit.
- App uses HTTP, never imports Web feature source or accesses a database. Pure response contracts have zero imports; runtime schemas use the existing approved schema channel. Sync generated copies, never hand-edit them.
- No changes to service/repository business rules, pilot gate, capability access, actor resolution, or HTTP status codes. No real external publication, production credentials, remote writes, mail, model, or worker execution.
- Draft save uses optimistic expectedRevision, including null only for first creation. Publish uses the last accepted server revision and requires explicit user confirmation. Never publish unsaved local edits as if they were saved.
- The deadline freezes the matching question set, NOT all display fields. After the deadline, introduction/accent edits remain allowed only with the published question set unchanged. If no published question set exists, show the server's blocked state; do not invent a local bypass.
- Suppress stale responses after account/server/event change, unmount, or superseding operation. Prevent duplicate mutations synchronously. Reject malformed/wrong-event success payloads rather than reporting success.
- Cover assets are not organizer-configurable. Keep coverAssetId null; do not add uploads, arbitrary URLs, templates, profile dimensions, or required custom questions.

### Task 1: Promote Experience Response Contracts and Validation

**Files:** Create `repos/orbits/shared/contract/event-experience.ts`, `repos/orbits/shared/api-schema/event-experience.ts`, `repos/orbits/tests/api-schema/event-experience-schema.test.ts`. Modify `repos/orbits/tests/contract-compatibility.typecheck.ts` and the pure export barrel `repos/orbits/shared/contract/index.ts`. Append a scoped continuation note to `repos/orbits/docs/superpowers/plans/2026-09-06-remote-sync.md`.

Ruling: Include the existing contract barrel and add explicit type-only exports
for all seven experience DTOs and PasswordResetResponse. The required unchanged
contract-surface test found both missing exports; the original file list omitted
the established export convention, including the earlier password DTO. This is
necessary shared-boundary integration, not a new runtime API or policy. Cost if
wrong: the public type barrel exposes these already-shared DTO names and its
generated App copy must be refreshed in Task2. No runtime export or test waiver.

**Interfaces:** The source of truth is `features/events/experience/contract.ts`. Promote `EventExperienceConfigurationContract`, `EventExperienceQuestionContract`, `EventExperienceQuestionSetContract`, `EventExperienceVersionContract`, `EventExperienceHeadContract`, `EventExperienceSnapshotContract`, and `EventExperiencePreviewResponseContract` with the same field names, nullability, readonly arrays, and literal unions. Do not copy service/repository interfaces or EventExperienceError into shared.

The source question-set type is named `EventExperienceQuestionSetInput`; the
shared `EventExperienceQuestionSetContract` matches it structurally. There is no
source type named EventExperiencePreviewResponse. Its HTTP wrapper is
`{ version: EventExperienceVersion }`, as returned by the preview POST handler.
Check that wrapper against an actual injected handler response fixture and use
`ContractMatches<{ version: EventExperienceVersion }, EventExperiencePreviewResponseContract>`
for compile-time compatibility. Do not invent or change backend types to fit a
presumed source name.

- [x] Read the existing contract and validators. Add red schema tests for a complete server snapshot, unpublished/null versions, legitimate ephemeral preview, missing fields, invalid revision/version values, invalid configuration shape, mismatched head/version pointers, and mixed-event versions. Schema validates response structure/identity, not a duplicate implementation of business authorization.

```ts
assert.equal(eventExperienceSnapshotSchema.safeParse(snapshot).success, true);
assert.equal(eventExperienceSnapshotSchema.safeParse({
  ...snapshot, head: { ...snapshot.head, revision: -1 },
}).success, false);
assert.equal(eventExperiencePreviewResponseSchema.safeParse({
  version: { ...version, eventId: "preview", createdByActorId: "preview", version: 0 },
}).success, true);
```

- [x] Analyze impact for the compatibility object/test file. Create zero-import DTOs by copying only the HTTP data shape. Fixed question IDs/intents are target_attendees, value_offered, desired_outcome, follow_up_preference, positioning; profile fields retain their matching camelCase names. templateId is default; tracks are v1/v2. No runtime constants enter the pure contract directory.
- [x] Implement Zod schemas using the existing schema convention. Export `eventExperienceSnapshotSchema` and `eventExperiencePreviewResponseSchema`. Snapshot head/version event IDs must agree; non-null head draft/published pointers must match returned versions. Preview is explicitly eventId/actorId preview and version zero, not a normal persisted snapshot. Require finite non-negative integer revisions and valid required timestamps/strings. Keep readonly output typing compatible with the pure DTOs.
- [x] Add real consumed `ContractMatches<SourceType, ContractType>` assertions to the existing compatibility object, so changing source types breaks the full typecheck. Bind the configuration, question, head, version, snapshot, and preview data shape.

```ts
eventExperienceSnapshot: true,
// in the corresponding satisfies type:
eventExperienceSnapshot: ContractMatches<EventExperienceSnapshot, EventExperienceSnapshotContract>;
```

- [x] Run the new schema tests, `tests/contract-surface.test.ts`, `tests/api/event-experience-routes.test.ts`, and `tests/experience/event-experience-service.test.ts`; both Web typechecks. Keep service/pilot/403/409 tests unchanged. Record exact verification scope, get independent review, and controller commits only this subset.

### Task 2: Build Native Experience Editor and Route

**Files:** Create `repos/orbit-app/app/events/[id]/operations/experience.tsx`, `repos/orbit-app/src/screens/events/EventExperienceScreen.tsx`, `repos/orbit-app/src/screens/events/EventExperienceContent.tsx`, `repos/orbit-app/src/view-models/event-experience.ts`, `repos/orbit-app/tests/event-experience-view-model.test.ts`, `repos/orbit-app/tests/event-experience-screen-render.test.tsx`, and `repos/orbit-app/tests/event-experience-interactions.test.ts`. Modify `repos/orbit-app/src/screens/events/EventOperationsScreen.tsx`, `repos/orbit-app/src/screens/events/EventOperationsContent.tsx`, `repos/orbit-app/src/view-models/initial-route.ts`, `repos/orbit-app/src/view-models/mobile-route-access.ts`, their existing route/render tests, and `repos/orbit-app/README.md`. Generated contract/schema copies come only from sync.

**Interfaces:** Base path `/api/events/${encodeURIComponent(eventId)}/experience`; GET returns snapshot, PUT base or `/draft` accepts `{ configuration, expectedRevision }`, POST `/preview` accepts `{ configuration }` and returns `{ version }`, POST `/publish` accepts `{ expectedRevision }` and returns snapshot. Use the existing client methods with `{ body }`, not direct fetch or Web imports.

- [x] Run `npm run sync:contract`. Add red pure tests for initial configuration, draft-before-published precedence, question track switching, editable display fields, freeze semantics, and safe mutation paths. Standard track always uses the two required target/value questions in that order. Custom track allows zero to four unique fixed-intent optional questions. Options remain two to five unique nonempty strings; prompts maximum 240 characters and options 80. No new profile dimension can be entered.
- [x] Keep defaults and intent-to-field mapping aligned with the existing Web editor. The native view-model must use typed contract field access. Derive the payload from editor state without silently dropping invalid empty option rows; invalid input is a visible form error.

```ts
export function initialEventExperienceConfiguration(): EventExperienceConfigurationContract;
export function eventExperienceConfigurationFromSnapshot(snapshot: EventExperienceSnapshotContract | null): EventExperienceConfigurationContract;
export function eventExperienceQuestionsForTrack(track: "v1" | "v2", questions: readonly EventExperienceQuestionContract[]): readonly EventExperienceQuestionContract[];
```

- [x] Add runtime RED tests executing real screen/content/view-model code with local API fixtures: GET success/404-first-creation/403/unavailable; PUT exact null/current revision; save failure preserves edits; wrong-event/malformed payload rejected; preview sends current configuration but does not save/publish; editing invalidates preview; explicit publish cancel sends nothing and confirm sends once; no draft/unsaved edits cannot publish; stale response after account/server/event change cannot update current state. Add deferred/double-press cases, not source-text substitutes.
- [x] Analyze impact for edited existing navigation/screens/tests. Implement the private route with the existing wrapper:

```tsx
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { EventExperienceScreen } from "../../../../src/screens/events/EventExperienceScreen";
export default withOrbitPrivateRoute(EventExperienceScreen);
```

- [x] Implement event/client/account-scoped loading and form state. GET 404 creates an unsaved default editor; other failures must not grant editing access. Reset all data and mutations on scope change. Validate HTTP success payloads with the shared schemas plus exact requested eventId before accepting them. Require an online successful initial read or authorized NOT_FOUND response before any mutation; cached/offline content is not mutation authority.
- [x] Implement Content using AppScreen/themed components, compact unframed sections, and individual repeated question items. Include introduction, accent swatches with optional hex input/default reset, standard/custom segmented choice, bounded question and option editors, save/preview/publish controls, version/deadline metadata, retry/back navigation, and visible dirty/busy/error/notice states. Use existing Ionicons for add/remove/back/preview tools and accessibility labels. User-facing labels describe questions and status, not v1/v2, actor IDs, provider, hash, or database internals.
- [x] Save the exact local configuration and expected revision. On success accept server normalization and clear dirty state; on failure preserve edits. A 409 displays conflict and offers explicit reload of the authoritative snapshot. Reload warns before discarding unsaved edits; never silently overwrite them.

```ts
const result = await client.put<EventExperienceSnapshotContract>(basePath, {
  body: { configuration, expectedRevision: snapshot?.head.revision ?? null },
});
```

- [x] Preview the current local configuration through the preview endpoint and render its introduction, accent, questions, and options without any registration submit action. Do not write the preview to snapshots or confuse it with published state. Invalidate preview whenever any configuration input changes.
- [x] Publish only a saved draft with no unsaved edits, after an Alert confirmation describing the persisted draft version. Send current accepted head.revision, never a fabricated next version. Keep publication capability errors and conflicts visible; do not treat them as successful saves.
- [x] Freeze question controls at the deadline while retaining legal introduction/accent edits. If the draft question set differs from published at freeze time, offer an explicit restore-published-questions action that keeps display edits; do not silently replace the draft. If no published version exists, explain the blocked deadline state. Tests must cover display-only save after freeze, forbidden question mutation, and stale frozen-state 409.
- [x] Add a real operations navigation action to the new route and return link. Extend initial-route handling only for this route and add experience to the existing event path-param classification. Test encoded event IDs and removal of duplicate `id` query parameters in login return links. Do not broaden unrelated route permissions.
- [x] Run new view-model/render/interaction tests, existing event operations/roles route/render tests, initial-route and mobile-route-access tests, contract/schema-sync tests, and App typecheck. Run the full App suite and record any still-missing batch routes rather than waiving parity. Update README with actual capabilities and verification boundaries.
- [ ] Independent task and whole-feature review, change detection, controller commit. Follow with local HTTP/DB cross-client and simulator checks in the final runtime phase; no production publish is included here.

## Current Source Findings

### Task 2 Checkpoint

Native editor, private route, operations entry and generated copies passed task
review after one bounded fix round. Android Alert truncated the fixed-intent
menu; it now uses a cross-platform inline option list with explicit cancellation.
The reviewer marked I1 addressed, no new findings. Genuine native-limitRED1/10
became10/10; allcoveringexperiencefiles83/83zeroSkip, AppTCexit0. Controller
independently reproduced83/83 in37.89seconds. Log:
/tmp/orbit-completion-experience-task2-fix1-independent-node22-20260910.log.

Controller post-fix fullApp946tests945passoneknownthree-batch-routeparityfailure,
zeroSkip/cancel42.25seconds. Log:
/tmp/orbit-completion-experience-task2-fix1-full-app-node22-20260910.log.
Pre-fix fullaffectedWebaudits170tests163pass7knownruntimefailzeroSkip established
87/120coverage and33missing surfaces; the menu fix does not add runtime credit.
ActualHTTP/database/headercompatibility, simulator behavior and wholefeature
review remain pending. No real publish or provider execution was performed.

### Task 1 Checkpoint

SixWebfiles486add0del passed independent spec/quality review with no findings.
The existing barrel omission was repaired per the recorded ruling; unchanged
contract-surface tests now pass. Schema behavior RED5/11 became11/11; allfour
required files21/21zeroSkip and bothWebTCpass. Parent independently reproduced
21/21zeroSkip in0.46seconds at the reviewed candidate. Log:
/tmp/orbit-completion-experience-task1-independent-node22-20260910.log.

Parent fullsanitizedNode22Web suite with ownedDB/smoke enabled:2910tests2903pass
7fail0skip/cancel82.57seconds. Exactfailures are six required fresh public/Party
cases plus globalruntimecoverage87/119;32surfaces remain missing, now including
the native reset route. No non-audit failure. Log:
/tmp/orbit-completion-experience-task1-full-web-node22-20260910.log.
ActualHTTP/DBexperience, nativeAppsync/editor and wholefeature review remain
pending. Sourcebusinessrules/handlers were unchanged; memoryservice and injected
previewhandler fixtures are not cross-client runtime proof.

The existing Web editor/service supports immutable versions, ephemeral preview, an event pilot gate, separate configure/publish capabilities, and question-set freeze with display-only changes still legal. Native currently has no experience route or operations link. Existing typechecks and route files cannot prove this missing flow works.
