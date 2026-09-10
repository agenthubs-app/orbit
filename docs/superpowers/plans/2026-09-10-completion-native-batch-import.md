# Native Batch Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three missing native batch-import routes with image collection, resumable upload, processing status, item review, and explicit contact confirmation.

**Architecture:** Consume both existing batch HTTP APIs without duplicating repository/OCR policies. Promote pure DTOs and response validation through the existing contract/schema channel. Add bounded binary transport to the existing account-scoped native API client, then build reusable native review presentation plus separate legacy review and current ingestion workspaces.

**Tech Stack:** TypeScript, Zod, Expo Router, Expo ImagePicker/FileSystem/Crypto, React Native, node:test.

**Spec:** Completion design approved in conversation on 2026-09-09. This plan implements native batch review/import using existing endpoints, actor isolation, version conflicts, explicit confirmation, real controls and failure recovery. It does not authorize cloud storage changes or real OCR/provider execution.

## Global Constraints

- Work in `/Users/xzhao/Projects/orbit/.worktrees/remote-sync-20260907`; main worktree changes are not ours. Web tasks edit only Web files, App tasks only App files, controller owns root plans/staging/commits.
- TDD and apply_patch required. GitNexus upstream impact before existing-symbol edits; report HIGH/CRITICAL before edits. Independent task and final review required.
- App never imports Web feature source or accesses a database. Shared contracts have zero imports; use only sanctioned contract/schema sync. No whitelist expansion or manual copy edits.
- Keep existing backend state machines, actor resolution, duplicate detection, atomic confirmation, worker limits, leases, expiry and If-Match semantics. No automatic confirmation, duplicate override, cancellation, exclusion, skip, finalize, or publication.
- Current ingestion limits are 100 images and 10 MiB raw bytes per image. Keep raw files as local URIs, read/hash/upload a bounded number at a time, and do not hold all images as base64 buffers. No automatic infinite retry loop. Each upload trigger attempts each eligible item at most once, with at most two uploads in flight; failed items await explicit retry.
- Retain original bytes for SHA-256 manifest identity. Do not hash one representation and upload another, assume ImagePicker base64 equals the original file, or mislabel JPEG bytes as HEIC. Use installed SDK file APIs and verify actual bytes/MIME.
- Pending URI state is memory-only and keyed by API server, account, and batch. Clear on identity/server change, cancellation/completion, and expired batch. After app restart, reselect files and match exact clientDigest to the server manifest; never upload a different photo into an awaiting item.
- Protect all async results and mutations against account/server/batch/item changes and unmount. Stop polling on terminal state and when screen is inactive. Retain edits through refresh/failure; do not silently replace them with a poll result.
- Fetch protected card images through authenticated transport with the existing explicit-cookie/credentials rules. Never put session cookies into URLs or use an unauthenticated public image fallback. Load only the current review image; clear on item/scope changes and after removal.
- No production credentials, external OCR/mail/model calls, remote database writes, deployment, or shared object-store changes. Only the existing disposable local scratch database is permitted in server tests.

### Task 1: Share Batch HTTP Data Shapes and Runtime Schemas

**Files:** Create `repos/orbits/shared/contract/business-card-batch.ts`, `repos/orbits/shared/api-schema/business-card-batch.ts`, `repos/orbits/tests/api-schema/business-card-batch-schema.test.ts`; modify `repos/orbits/tests/contract-compatibility.typecheck.ts` and `repos/orbits/shared/contract/index.ts`, and append a dated note to `repos/orbits/docs/superpowers/plans/2026-09-06-remote-sync.md`.

Ruling: Include the existing pure contract barrel in Task1 and explicitly export
the new batch DTO names with export type. The unchanged required contract-surface
test enforces this established convention; the initial file list omitted it.
Cost if wrong: these already-shared DTO names become available through the public
type barrel and its generated App copy changes in Task2. No runtime exports,
business policy changes or weaker tests are authorized by this correction.

Ruling: Retain the explicitly mandated unchanged route tests' workspace:test
fixture identifiers inside their in-memory stores or fresh random schemas on
the owned scratch database. The controller brief's workspace restriction applies
to configured persistent runtime data; rewriting these established test-only
identifiers would expand source scope without increasing isolation. New fixtures
and runtime configuration still use test:remote-sync-20260907. Cost if wrong:
test-only rows carry a different logical workspace name until their owned schema
is cleaned; they must never share a persistent/unowned schema. This does not
authorize another database, production records, or a remote image store.

**Interfaces:** Source types are `features/acquisition/business-card-batch-contract.ts`, `features/acquisition/business-card-ingest-v2/contract.ts`, and the DTO-only portion of `business-card-cloud-ocr.ts`. Keep original fields including all extraction contact points, labels, addresses, names, review issues, and usage. Do not promote provider interfaces, constants, normalization, retry policy functions, repositories, or Error classes.

HTTP acknowledgment distinctions are intentional. Legacy confirm returns
`{ state: "created", contactId }` or
`{ state: "duplicate_review", duplicateContactId }`; it does not return an item.
Current confirm/manual-entry returns `{ state: "created", contactId, item }` or
the same duplicate-review projection without an item. The created item's
confirmedContactId must agree with contactId. Legacy retry/skip/finish return
state-only pending/skipped/completed acknowledgments; current retry/skip return
`{ item }`. Bind schemas to these actual handler projections, not one combined
optional-everything shape. Inspect route handlers for the remaining action shapes.

- [x] Add red schema fixtures for legacy detail, current collection/create/detail/summary/item-action/batch-action/confirmation responses. Cover null/optional fields, processing projection, complete extraction, malformed IDs/status/version, cross-batch items, and duplicate-review versus confirmed results.
- [x] The legacy processing GET deliberately omits item.extraction. Model that response projection explicitly; allow missing extraction only for a processing batch, not a review-ready extracted item. Keep the source DTO's required extraction field unchanged in its base contract.

```ts
export interface BusinessCardBatchDetailContract {
  batch: BusinessCardBatchContract;
  items: readonly (Omit<BusinessCardBatchItemContract, "extraction"> & {
    extraction?: BusinessCardBatchItemContract["extraction"];
  })[];
}
export interface IngestBatchDetailContract {
  batch: IngestBatchContract;
  items: readonly IngestItemContract[];
}
```

- [x] Run red tests, impact compatibility/test symbols, then add zero-import DTOs and Zod schemas. Schemas validate shape and parent/item identity, not a second repository state machine. Preserve every source enum member and readonly/null semantics. Include the shared fixed review input fields: displayName, organization, role, email, phone, relationshipContext, notes, allowDuplicate.
- [x] Add consumed ContractMatches assertions for base batch/item/manifest/summary/extraction/review-issue/usage types. Extra API response wrappers are checked against actual injected HTTP-handler fixtures in the schema tests; do not infer success from generic ApiEnvelope alone.
- [x] Run schema tests, `tests/contract-surface.test.ts`, `tests/api/business-card-batch-routes.test.ts`, and `tests/api/business-card-ingest-v2-routes.test.ts` using only local fixture dependencies/owned scratch DB as required; both Web typechecks. Record exact evidence, independent review, controller change detection and commit.

### Task 1 Checkpoint

Six Web files add 35 pure DTO declarations, 23 schemas and 12 consumed source
compatibility assertions. Independent spec/quality review approved with no
findings. Behavioral identity/projection RED29/32 became GREEN32/32; five
covering files47/47zeroSkip, both Web typechecks and strict scoped compile pass.
Controller independently reproduced47/47zeroSkip in1.07seconds and both Web
typechecks exited0 without diagnostics. Full sanitizedNode22Web with ownedDB
and lifecycle smoke:2942tests2935pass7knownruntimeauditfail0skip/cancel83.18s.
Failures remain six fresh public/Party requirements plus global87/120coverage,
33missing surfaces. No non-audit failure or runtime evidence credit.

Logs: /tmp/orbit-completion-batch-task1-independent-node22-20260910.log,
/tmp/orbit-completion-batch-task1-full-web-node22-20260910.log,
/tmp/orbit-completion-batch-task1-independent-typecheck-node22-20260910.log,
/tmp/orbit-completion-batch-task1-independent-app-typecheck-node22-20260910.log.
Precommit detection of six Web files mapped five existing symbols, zero flows,
LOW; new unindexed files are covered by direct review, not inferred safe from
empty graph mappings. App generated sync belongs to Task2; native/runtime work
and whole-feature review remain pending. No backend source or provider changed.

### Task 2: Add Bounded Native Binary Transport and File Preparation

Task1 integration repair: Task2 sync exposed TS2375 under App's
exactOptionalPropertyTypes. A three-line source schema projection now omits
undefined allowDuplicate while retaining explicit false/true and all strings;
DTO/compiler settings are unchanged. BehavioralRED34/35 became35/35zeroSkip;
strict+exactOptionalPropertyTypes source compile and both Web typechecks pass.
Scoped independent re-review approved I1 at source with no new findings.
Controller reproduced35/35zeroSkip0.76s and exact-optional compile exit0. Logs:
/tmp/orbit-completion-batch-task1-fix1-independent-node22-20260910.log and
/tmp/orbit-completion-batch-task1-fix1-exactoptional-node22-20260910.log.
Actual App typecheck after sanctioned resync now exits0, independently confirmed
in Task2, closing I1 at the consumer. The prior full Web2942 result predates this
bounded repair and is not labeled post-fix evidence.

**Files:** Modify `repos/orbit-app/src/api/client.ts`, `repos/orbit-app/tests/api-client.test.ts`, and `repos/orbit-app/package.json`/lockfile only if the installed SDK's FileSystem is not a direct dependency. Create `repos/orbit-app/src/api/batch-images.ts` and `repos/orbit-app/tests/batch-images.test.ts`. Generated contracts/schemas come from sync.

Ruling: Permit the Task2 package/lockfile edit to add pinned magic-bytes.js1.13.1
alongside the required direct Expo FileSystem dependency. Installed FileSystem
and ImagePicker derive MIME from extensions/metadata, so those values cannot
satisfy actual-byte identification; the plan forbids a handwritten parser.
The maintained byte-signature library has no runtime dependencies and accepts
Uint8Array. Cost if wrong: an additional approximately62KB unpacked dependency,
native bundling risk and possible signature misclassification. Keep the existing
image MIME allowlist, reject unknown/ambiguous supported-image matches, verify
misleading metadata and actual JPEG/PNG/WebP/HEIF/HEIC fixtures, and verify native
bundling. Signature identification is not full image decoding or server acceptance.
No custom signature registration, codec, Node polyfill or unrelated dependency
upgrade is authorized by this correction.

Preparation sources: installedexpo-file-system/ios/FileSystemFile.swift:78 and
android/unifiedfile/JavaFile.kt:56; [library API](https://github.com/LarsKoelpin/magic-bytes),
[package metadata](https://raw.githubusercontent.com/LarsKoelpin/magic-bytes/master/package.json)
and [signature table](https://raw.githubusercontent.com/LarsKoelpin/magic-bytes/master/src/model/pattern-tree.ts).
Sanitizednpmview confirmed1.13.1, no dependencies, unpacked62477bytes. No package
has been installed at this preparation checkpoint.

Ruling: Promote the already-installed base64-js1.5.1 to an exact direct App
dependency for selected-image encoding, using its public fromByteArray API. The
candidate relied on ambient btoa, whose availability is not established for
native execution; installed React Native's own binaryToBase64 utility uses this
library. Cost if wrong: direct dependency/version-maintenance responsibility and
potential platform encoding differences, requiring exact-byte and iOS-entry-bundle
verification. No private RN import, handwritten encoder, Buffer/global polyfill
or unrelated dependency upgrade is authorized. This uses existing runtime code
rather than depending on an undeclared browser global.

**Interfaces:** Extend OrbitApiRequestOptions with mutually exclusive JSON body versus rawBody, and optional `responseType: "bytes"`; default remains JSON. Binary success data is `{ bytes: Uint8Array, contentType: string }` with existing status/meta envelope. Preserve existing method signatures/generic calls. File preparation returns `{ uri, fileName, mimeType, rawSize, clientDigest }` and uses the actual uploaded bytes.

- [x] Sync Task 1 contracts/schema. Add RED transport tests proving raw bytes reach fetch unstringified, JSON remains unchanged, declared image Content-Type survives, explicit Cookie keeps credentials omit, 401 still uses the existing expiry path, and JSON errors on binary requests remain normal localized failures. Coalesced GET keys must distinguish bytes from JSON and retain header/account isolation.

```ts
const bytes = new Uint8Array([0, 255, 17, 128]);
await client.put("/api/test/content", { rawBody: bytes, headers: { "Content-Type": "image/jpeg" } });
assert.equal(capturedInit.body, bytes);
assert.equal(capturedInit.credentials, "omit");
```

- [x] Add red file tests for exact SHA-256 digest/size, empty file, 10 MiB boundary, over-limit, unsupported format, cancellation, and sequential preparation of 100 files without retaining byte arrays. Use injected native file/Crypto boundaries while executing the real preparation code. Reject a changed/unreadable URI before upload rather than transmitting bytes that differ from the manifest.
- [x] Analyze affected client helpers. Implement the raw-body branch with existing auth/header construction; implement bytes response only for successful binary responses, retaining error-envelope handling for failures. Do not weaken isEnvelope or bypass 401 behavior. Update GET coalescing options to include response representation and to bypass body-bearing requests.
- [x] Read the installed Expo bundled-native-module version for FileSystem and add that compatible direct dependency through Expo's package tooling if needed. Use File.bytes() or the verified SDK equivalent; use Expo Crypto for digest. Derive MIME from actual chosen file bytes/metadata consistently, with local fixture coverage for JPEG, PNG, WebP and supported HEIC/HEIF. Do not add a handwritten image codec or file parser.
- [x] `batch-images.ts` must expose bounded preparation/read helpers and authenticated selected-image loading using the client bytes mode. Return visible failures on unsupported/missing image; never log image bytes, cookies, or file contents. Convert only the selected validated image to a native-display source in memory.
- [x] Export the prepared-file metadata type and the preparation, digest-checked byte-read, and authenticated image-load helpers from this one module; report their exact signatures for Tasks 3-5. Native file/crypto boundaries remain injectable for unit tests. No API route construction belongs in the file helper: callers supply the encoded protected-image path, and ingestion view-models own upload/replacement paths.
- [x] Run full API-client tests, batch image tests, contract/schema sync tests and App typecheck. Independent review then controller change detection/commit. Native binary I/O and image rendering still require simulator evidence in the runtime phase.

Task2 verification checkpoint: nine App files add raw/bytes/signal transport,
sequential original-file preparation, digest-checked reads and authenticated
selected-image loading. Exact interfaces and ownership are preserved in the
task report. Final focused54/54zeroSkip/cancel; independently fullApp982tests,
981pass, one exact approved three-batch-route-parity failure, zero skip/cancel,
46.68s. Parent AppTC exits0 with no diagnostics. Independent spec/quality review
approved with no findings. Existing intentional session-expiry Error:boom output
is retained, not hidden. Logs:
/tmp/orbit-completion-batch-task2-independent-full-app-node22-20260910.log and
/tmp/orbit-completion-batch-task2-independent-typecheck-node22-20260910.log.

Encoder behavioralRED19/21 becameGREEN21/21 with btoa absent and exact475/49153
byte roundtrips. Actual iOS helper-entry bundle includes production helper,
detector, encoder, FileSystem and Crypto:2248235bytes/619sources. This is bundling,
not simulator/nativeI/O/HTTP/server image acceptance. Direct dependencies are
FileSystem~57.0.1(resolved57.0.6), magic-bytes.js1.13.1 and base64-js1.5.1; only
authorized lock entries/root metadata changed, existing encoder node unchanged.
The 10MiB pre/post checks bound acceptance/retention, not streaming allocation
for a changing local file or an unknown/misdeclared response. Caller lifecycle,
scope clearing and max-two upload scheduling remain Tasks3-5. Precommit App-only
detection:9files180mappedSymbols0flowsLOW; factory CRITICAL blast radius remains
the reason for fullApp verification, not waived by a narrow graph result.

### Task 3: Implement Shared Review Presentation and Legacy Batch Detail

**Files:** Create `repos/orbit-app/src/view-models/business-card-batch.ts`, `repos/orbit-app/src/components/BusinessCardBatchReviewForm.tsx`, `repos/orbit-app/src/screens/contacts/BusinessCardBatchScreen.tsx`, `repos/orbit-app/app/contacts/new/batch/[id].tsx`, `repos/orbit-app/tests/business-card-batch-view-model.test.ts`, and `repos/orbit-app/tests/business-card-batch-interactions.test.ts`. Modify initial-route/mobile-route-access view-models and their tests for this route only.

**Interfaces:** Legacy API base `/api/contact-drafts/business-card/batches`. GET `/{id}` returns detail; POST item confirm accepts the fixed review fields plus allowDuplicate and returns created/duplicate_review; item retry/skip return pending/skipped; batch finish returns completed. Item image is `/{id}/items/{itemId}/image`. Encode every path segment.

- [x] Add red pure tests for processing/review/completed/failed states, current item selection, preserved edited fields, exact API paths, and confirm-result validation. Initialize fixed review fields from typed extraction. Phone selects only phone/mobile, never WeChat/website/fax. Prefer printed native CJK name and preserve unused name variants in notes.
- [x] All recognized information not in a fixed field must remain visible and carried into editable notes: alternate emails/contact points with printed labels, departments, website, addresses, certifications, and unused names. detectedLanguages is metadata, not a contact note. Use one native presentation helper shared by both native batch workspaces; do not duplicate OCR/provider/repository policy or import Web code. Add a complete-extraction fixture that asserts every retained value.
- [x] Add runtime RED tests for loading/unavailable/forbidden/missing batch; processing poll and terminal stop; edited confirm exact body; duplicate review requiring a second explicit override action; cancellation of override sending nothing; skip/retry/finish acknowledgments; 409/refetch; delayed poll/mutation after scope switch; rapid duplicate clicks; malformed success; image unavailable and image removal. Test callbacks on actual components, not only source strings.
- [x] Run impact for edited existing navigation helpers. Implement the private route and screen with existing AppScreen/themed controls. Shared review form displays the actual selected card image, fixed fields, notes, and review warnings, with explicit confirm/skip/retry actions. Keep processing progress and statuses truthful; stalled processing gets visible recovery copy without exposing worker commands.

```tsx
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { BusinessCardBatchScreen } from "../../../../src/screens/contacts/BusinessCardBatchScreen";
export default withOrbitPrivateRoute(BusinessCardBatchScreen);
```

- [x] Poll at the existing three-second cadence only while active processing, with one in-flight read and cleanup. Refresh after mutation but preserve the current edited form until its item is confirmed/skipped or the user explicitly reloads. Never copy the Web loader's silent-error/null-screen behavior.
- [x] Confirm only extracted items. Validate exact response state/contact ID; duplicate_review does not advance or mark confirmed. Editing fields or switching items clears duplicate override consent. Finish only after all items are resolved and after the server confirms completed. Link confirmed contacts through encoded IDs. Failed image/OCR is never labeled confirmed.
- [x] Run focused view-model/interactions, navigation/auth return tests, App typecheck, then independent review and controller commit.

Task3 verification checkpoint: legacy private detail route, controlled shared
review form, extraction presentation and navigation/auth-return support are
implemented in ten App files. Independent task review found three defects;
one TDD fix round retained same-valued alternate contact meanings, added guarded
native Image error/unavailable/reload handling, and preserved edits made while an
explicit reload is pending. Scoped independent re-review closed I1/I2/I3 with no
new Critical/Important/Minor findings. Shared form now requires onImageError;
the parent owns scope/item/image-attempt guards and authenticated retry. Canonical
account ownership is pinned from accepted server detail, not equated to the raw
mobile session subject.

Post-fix independent six-file verification:97/97pass, zero fail/skip/cancel,
26.977159375s; actual full App typecheck exits0 with no diagnostics. Logs:
/tmp/orbit-completion-batch-task3-fix1-independent-node22-20260910.log and
/tmp/orbit-completion-batch-task3-fix1-independent-typecheck-node22-20260910.log.
Before the bounded fixes, fullApp1038tests1037pass with only the two approved
Task4 route gaps, zero skip/cancel49.399323708s; three Web audits170tests163pass
with seven required runtime-evidence failures, zero skip/cancel71.562351709s.
Those full runs remain pre-fix evidence, not claimed rerun after the fix.
Current measured audit coverage at that checkpoint is87/121,34missing surfaces,
including the new legacy native route; availability does not establish runtime
coverage. Original scaffold/setup RED failures are not treated as callback-level
RED; genuine per-finding behavioral RED/GREEN is retained in the task report.
RNWeb geometry/image/callback cases do not prove native codecs/icon fonts,
simulator navigation, real HTTP/database/OCR behavior or cross-client alignment.
Task4/5 and the separate runtime phase remain required.

### Task 4: Implement Current Batch Collection, Resume and Upload

**Files:** Create `repos/orbit-app/src/view-models/business-card-ingest.ts`, `repos/orbit-app/src/screens/contacts/BusinessCardIngestStartScreen.tsx`, `repos/orbit-app/src/screens/contacts/BusinessCardIngestScreen.tsx`, `repos/orbit-app/src/screens/contacts/business-card-pending-files.ts`, `repos/orbit-app/app/contacts/new/batch2/index.tsx`, `repos/orbit-app/app/contacts/new/batch2/[id].tsx`, `repos/orbit-app/tests/business-card-ingest-view-model.test.ts`, and `repos/orbit-app/tests/business-card-ingest-interactions.test.ts`. Modify ContactAcquisitionScreen, initial-route/mobile-route-access helpers and existing covering tests.

**Interfaces:** Current base `/api/contact-drafts/business-card/batches/v2`. GET collection returns batches; POST `{ idempotencyKey, manifest }` returns detail plus reused. Content PUT uses raw bytes; item replace POST raw bytes with `If-Match: String(item.version)`. Collecting item exclude, batch finalize/cancel are POST. Reuse Task 2 image helpers and Task 3 fixed review form in Task 5.

Task 4 owns `itemContentPath(batchId: string, itemId: string): string` and
`itemReplacePath(batchId: string, itemId: string): string` in its ingestion
view-model. Their paths are the current base followed by encoded batch ID,
`/items/`, encoded item ID, then `/content` or `/replace`. These are new local
path helpers, not presumed exports from Task 2. Task 5 consumes the same helpers.

- [ ] Add RED tests for max 100/10 MiB limits, stable creation key across an ambiguous retry, new key when the user changes the manifest, create-result validation, existing batch listing, digest resume after memory loss, wrong-file rejection, raw upload bytes, failed upload explicit retry, exactly one attempt per item per trigger, at most two in-flight uploads, and no auto-finalize. Exercise expired/cancelled and stale scope responses.
- [ ] Implement image selection with the existing ImagePicker and verified file-byte helper. Selection cancellation is not a failure. Render the selected files and allow explicit removal before create. Keep creation input/key frozen for one submission attempt; a lost response retries the same manifest/key.
- [ ] Expose recent current and legacy batches through their existing collection GET endpoints so the legacy detail route is reachable. Distinguish APIs internally, not with implementation-version jargon on screen. A failed list source is a visible partial failure, not an empty-list success.
- [ ] Add the three-second active collecting/processing refresh and memory-only pending URI handoff keyed by server/account/batch. After restart, reselect and compute digest to match existing awaiting_upload items; report unmatched files. Upload only awaiting items whose current bytes match the manifest. Stop the upload pass after each item has had its one attempt; no for(;;) retry of a failed file.

```ts
await client.put(itemContentPath(batchId, item.id), {
  rawBody: bytes,
  headers: { "Content-Type": file.mimeType },
});
// Replacement requires the current accepted item version:
await client.post(itemReplacePath(batchId, item.id), {
  rawBody: replacementBytes,
  headers: { "Content-Type": replacement.mimeType, "If-Match": String(item.version) },
});
```

- [ ] Add explicit exclusion/cancel/finalize confirmations and validate returned item/batch identities/status before presenting success. Finalize only when no awaiting uploads remain and there is a nonexcluded uploaded image. 409/410 responses show recovery and authoritative reload; never silently drop failed files or bypass server state.
- [ ] Wire ContactAcquisitionScreen to the new batch entry using an icon+text action and add private routes/auth-return mappings. The exact route parity is `/contacts/new/batch2` and `/contacts/new/batch2/[id]`; directory/index.tsx must normalize correctly in the existing parity test. Extend only these paths plus legacy path support from Task 3.
- [ ] Run image/API client, new ingest, contact acquisition and navigation tests; App typecheck. Independent review and controller commit. Task 4 is the collection/upload portion, not finished review parity until Task 5.

### Task 5: Complete Current Ingestion Review and Failure Recovery

**Files:** Modify Task 4 ingest screen/view-model/tests and Task 3 shared form/tests as needed. Update `repos/orbit-app/README.md` with actual batch support and verification limits. No Web code changes.

**Interfaces:** Current detail includes batch version/reviewGeneration and item versions. POST confirm/manual-entry accepts fixed fields and allowDuplicate. Confirm requires extracted; manual entry starts at terminal_failed. Retry/skip return `{ item }`. Replace is raw POST with If-Match. Complete/cancel/expired status comes only from accepted server detail/results, not local counts.

- [ ] Add RED runtime tests for extracted review, preserved extra contact values, terminal failure manual entry, retry eligibility, replacement If-Match conflict, duplicate confirmation, edited fields preserved through background refresh, declined duplicate override, contact navigation, completed cleanup, and stale account/server/item/version responses. Test error acknowledgments and duplicate presses for every mutation family.
- [ ] Render Task 3's form with current image and review issues. Offer legal retry/manual/replace/skip controls from the current item state; the server remains authoritative. Show nonretryable failures as such. Terminal failed items may be manually entered with explicit save, never auto-converted to contacts.
- [ ] In duplicate review, show the existing contact link and a separate explicit create-anyway confirmation. Only that specific unchanged item/form may send allowDuplicate true. Validate created/contactId/item consistency; a transport 200 with malformed data is not success.
- [ ] Preserve local edits on version conflicts and offer explicit reload; refresh the version before any retry or replacement. On completion/cancel/expiry clear pending files and selected image data. A poll must not revive an old form after completion or account change.
- [ ] Run all batch/ingest/image/client/navigation tests and App typecheck. Run the full App suite; route parity should pass after password recovery and experience plans are also implemented. Record actual failures if prerequisites remain. Independent task and whole-feature review, change detection, and controller commit.

## Runtime Acceptance Still Required

Mocks validate UI state and payloads only. The completion runtime phase must run native file selection/upload/image display, real local HTTP/DB create-to-confirm and resume flows, two-actor denial, stale version rejection, and Web-to-App/App-to-Web readback. OCR for these checks uses an explicitly injected local deterministic provider; production OCR, object storage persistence across cloud instances, worker deployment, and real external credentials remain separate gates.
