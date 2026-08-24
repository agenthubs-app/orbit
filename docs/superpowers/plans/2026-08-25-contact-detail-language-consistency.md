# Contact Detail Language Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make contact detail evidence and relationship value use exactly one account-selected language across Web and iOS, then safely repair stale generated evidence in the local database.

**Architecture:** Add a shared `zh | en | ja` contract and deterministic locale resolver, persist `preferredLanguage` on the actor profile, and make the contact/value services emit localized display text from structured semantic codes. Clients send `X-Orbit-Language`; a generated-record-only repair command reconciles stale evidence after a dry-run backup.

**Tech Stack:** TypeScript, Next.js route handlers, React/React Native with Expo, Node test runner, Postgres live-record store, GitNexus.

**Spec:** `docs/superpowers/specs/2026-08-25-contact-detail-language-consistency-design.md`

## Global Constraints

- Supported languages are exactly `"zh" | "en" | "ja"`; the default is `zh`.
- Proper names, brands, product names, activity names, and common acronyms remain in their original form.
- System explanations must never concatenate Chinese, English, and Japanese variants.
- User-authored notes and evidence are never overwritten by the generated-data repair.
- Web and iOS visuals remain unchanged except for language state required by this work.
- Every modified symbol requires GitNexus upstream impact analysis before editing.
- Every implementation task starts with a failing test and ends with focused verification.

---

### Task 1: Shared Language Contract And Resolver

**Files:**
- Create: `repos/orbits/shared/contract/language.ts`
- Create: `repos/orbits/shared/i18n/orbit-language.ts`
- Modify: `repos/orbits/shared/contract/index.ts`
- Modify: `repos/orbits/app/(app)/app/orbit-language-core.ts`
- Test: `repos/orbits/tests/services/orbit-language.test.ts`
- Generated: `repos/orbit-app/src/api/contract/language.ts`
- Generated: `repos/orbit-app/src/api/contract/index.ts`
- Test: `repos/orbit-app/tests/contract-sync.test.ts`

**Interfaces:**
- Produces: `OrbitLanguage`, `ORBIT_LANGUAGES`, `parseOrbitLanguage(value)`, `resolveOrbitLanguage({ requestLanguage, preferredLanguage, fallbackLanguage })`.
- Consumes: no feature-layer services.

- [ ] **Step 1: Add resolver tests that fail before the shared module exists**

```ts
assert.equal(resolveOrbitLanguage({ requestLanguage: "ja", preferredLanguage: "zh" }), "ja");
assert.equal(resolveOrbitLanguage({ requestLanguage: "xx", preferredLanguage: "en" }), "en");
assert.equal(resolveOrbitLanguage({}), "zh");
```

- [ ] **Step 2: Run the focused backend test and confirm module-resolution failure**

Run: `cd repos/orbits && node --test --import tsx tests/services/orbit-language.test.ts`

- [ ] **Step 3: Implement the shared enum and deterministic resolver**

```ts
export const ORBIT_LANGUAGES = ["zh", "en", "ja"] as const;
export type OrbitLanguage = (typeof ORBIT_LANGUAGES)[number];

export function resolveOrbitLanguage(input: {
  requestLanguage?: string | null;
  preferredLanguage?: string | null;
  fallbackLanguage?: OrbitLanguage;
}): OrbitLanguage {
  return parseOrbitLanguage(input.requestLanguage)
    ?? parseOrbitLanguage(input.preferredLanguage)
    ?? input.fallbackLanguage
    ?? "zh";
}
```

- [ ] **Step 4: Re-export the shared type from the existing Web language module and sync the mobile contract**

Run: `cd repos/orbit-app && npm run sync:contract`

- [ ] **Step 5: Run backend resolver tests and mobile contract-sync test**

Run: `cd repos/orbits && node --test --import tsx tests/services/orbit-language.test.ts`

Run: `cd repos/orbit-app && node --test --import tsx tests/contract-sync.test.ts`

### Task 2: Persist Account Language On The Profile Boundary

**Files:**
- Modify: `repos/orbits/shared/domain/contracts.ts`
- Modify: `repos/orbits/shared/contract/profile.ts`
- Modify: `repos/orbits/features/profile/contract.ts`
- Modify: `repos/orbits/features/profile/live-service.ts`
- Modify: `repos/orbits/features/profile/storage/profile-live-record-provider.ts`
- Modify: `repos/orbits/features/account/contract.ts`
- Modify: `repos/orbits/features/account/live-service.ts`
- Test: `repos/orbits/tests/capabilities/profile-live-store.test.ts`
- Test: `repos/orbits/tests/pages/app-account-auth-live-route-services.test.ts`
- Test: `repos/orbits/tests/pages/app-profile-live-route-services.test.ts`
- Generated: `repos/orbit-app/src/api/contract/profile.ts`

**Interfaces:**
- Consumes: `OrbitLanguage` and `parseOrbitLanguage` from Task 1.
- Produces: `UserProfileDTO.preferredLanguage`, `ManualProfileContract.preferredLanguage`, update support through existing `PUT /api/profile`, and `AccountSessionPayload.profile.preferredLanguage`.

- [ ] **Step 1: Add failing profile read/write tests**

```ts
assert.equal(readResult.data.profile?.preferredLanguage, "zh");
const updated = await service.updateProfile({ preferredLanguage: "ja" }, { actorId });
assert.equal(updated.data.profile?.preferredLanguage, "ja");
```

- [ ] **Step 2: Verify the focused tests fail because the field is absent**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/profile-live-store.test.ts tests/pages/app-account-auth-live-route-services.test.ts tests/pages/app-profile-live-route-services.test.ts`

- [ ] **Step 3: Add the field to shared DTOs and validate updates against the three-language enum**

```ts
export interface ManualProfileUpdateInput {
  preferredLanguage?: OrbitLanguage;
}
```

Invalid values return `PROFILE_VALIDATION_FAILED`; missing historical values read as `zh` without rewriting until the next profile save or migration.

- [ ] **Step 4: Include the preference in account session projection**

```ts
profile: {
  ...existingProfile,
  preferredLanguage: profile.preferredLanguage ?? "zh",
}
```

- [ ] **Step 5: Sync contracts and run focused profile/account tests**

Run: `cd repos/orbit-app && npm run sync:contract`

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/profile-live-store.test.ts tests/pages/app-account-auth-live-route-services.test.ts tests/pages/app-profile-live-route-services.test.ts`

### Task 3: Localize Contact Detail Evidence At The Service Boundary

**Files:**
- Create: `repos/orbits/features/contacts/contact-detail-localization.ts`
- Modify: `repos/orbits/features/contacts/detail-contract.ts`
- Modify: `repos/orbits/features/contacts/live-detail-service.ts`
- Modify: `repos/orbits/features/contacts/mock-detail-service.ts`
- Modify: `repos/orbits/app/api/contacts/[id]/handler.ts`
- Modify: `repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts`
- Test: `repos/orbits/tests/pages/app-contact-detail-live-route-services.test.ts`
- Test: `repos/orbits/tests/capabilities/contact-detail-language-localization.test.ts`

**Interfaces:**
- Consumes: `OrbitLanguage`, request header `X-Orbit-Language`.
- Produces: `ContactDetailLookupInput.language`, `ContactDetail.contentLanguage`, localized source labels, role/location fallbacks, evidence excerpts, relationship context, next action, and compatibility extraction for legacy `ZH:/EN:/JA:` summaries.

- [ ] **Step 1: Add failing Chinese, English, and Japanese contact-detail tests**

```ts
for (const language of ["zh", "en", "ja"] as const) {
  const result = await service.getContactDetail({ actorId, contactId, language });
  assert.equal(result.data.contact?.contentLanguage, language);
  assertSingleSystemLanguage(result.data.contact, language);
}
```

The Chinese QR assertion is `二维码交换记录：<sourceName>` and must not contain `QR scan at`.

- [ ] **Step 2: Run the focused tests and confirm the current English source/fallback strings fail**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/contact-detail-language-localization.test.ts tests/pages/app-contact-detail-live-route-services.test.ts`

- [ ] **Step 3: Implement deterministic contact copy tables and legacy-summary extraction**

```ts
export function localizeContactSource(input: {
  language: OrbitLanguage;
  sourceType: ContactDetailSourceType;
  sourceName?: string;
}): string;

export function selectLegacyLocalizedSummary(
  summary: string,
  language: OrbitLanguage,
): { text: string; contentLanguage: OrbitLanguage | "original" };
```

The compatibility parser selects one labeled segment only. It never joins segments and is isolated for removal after migration.

- [ ] **Step 4: Thread language through route, service, notes, evidence, last interaction, and next action**

```ts
const language = resolveOrbitLanguage({
  requestLanguage: request.headers.get("X-Orbit-Language"),
});
```

- [ ] **Step 5: Run contact-detail service and route tests**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/contact-detail-language-localization.test.ts tests/pages/app-contact-detail-live-route-services.test.ts`

### Task 4: Structure And Localize Relationship Value

**Files:**
- Modify: `repos/orbits/features/analysis/value-contract.ts`
- Create: `repos/orbits/features/analysis/value-localization.ts`
- Modify: `repos/orbits/features/analysis/live-value-service.ts`
- Modify: `repos/orbits/features/analysis/mock-value-service.ts`
- Modify: `repos/orbits/features/analysis/value-fixtures.ts`
- Modify: `repos/orbits/app/api/analysis/relationship-value/[id]/route.ts`
- Modify: `repos/orbits/app/api/analysis/relationship-value/recompute/route.ts`
- Test: `repos/orbits/tests/capabilities/relationship-value-live-store.test.ts`
- Test: `repos/orbits/tests/capabilities/relationship-value-language-localization.test.ts`

**Interfaces:**
- Consumes: `OrbitLanguage` and `resolveOrbitLanguage`.
- Produces: `RelationshipValueFactorKind`, `RelationshipValueDueWindow`, `RelationshipValueReasonCode`, language-aware lookup/recompute input, structured factor/action codes, and one-language display labels.

- [ ] **Step 1: Add failing semantic-code and three-language tests**

```ts
assert.deepEqual(
  assessment.priorityScore.factors.map((factor) => factor.kind),
  ["business_relevance", "relationship_strength", "trust_level", "relationship_stage", "source_evidence_quality"],
);
assert.equal(zh.suggestedNextAction.dueWindow, "24 小时内");
assert.equal(en.suggestedNextAction.dueWindow, "within 24 hours");
assert.equal(ja.suggestedNextAction.dueWindow, "24時間以内");
```

- [ ] **Step 2: Run focused tests and confirm structured codes are missing**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/relationship-value-live-store.test.ts tests/capabilities/relationship-value-language-localization.test.ts`

- [ ] **Step 3: Add stable semantic fields while keeping compatibility display fields**

```ts
export interface RelationshipValuePriorityFactor {
  kind: RelationshipValueFactorKind;
  label: string;
  points: number;
  level?: string;
  evidenceIds: readonly string[];
}
```

`calculation`, `rationale.summary`, `limitations`, action `label`, `dueWindow`, and `reason` become localized projections. Scoring math remains unchanged.

- [ ] **Step 4: Thread request language through GET and recompute routes**

Both routes resolve the same header and pass `language` into the service. Recompute must produce the same language as lookup.

- [ ] **Step 5: Run relationship-value focused tests**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/relationship-value-live-store.test.ts tests/capabilities/relationship-value-language-localization.test.ts`

### Task 5: Make iOS Language A Request-Level Capability

**Files:**
- Create: `repos/orbit-app/src/api/OrbitLanguageProvider.tsx`
- Create: `repos/orbit-app/src/api/orbit-language-storage.ts`
- Modify: `repos/orbit-app/app/_layout.tsx`
- Modify: `repos/orbit-app/src/api/client.ts`
- Modify: `repos/orbit-app/src/hooks/useOrbitApiClient.ts`
- Modify: `repos/orbit-app/src/hooks/useApiResource.ts`
- Modify: `repos/orbit-app/src/api/AuthSessionProvider.tsx`
- Test: `repos/orbit-app/tests/api-client.test.ts`
- Test: `repos/orbit-app/tests/orbit-language-provider-source.test.ts`

**Interfaces:**
- Consumes: synced `OrbitLanguage`, account session `preferredLanguage`, existing base URL and auth cookie.
- Produces: `useOrbitLanguage()`, local cache keyed by base URL and actor, `OrbitApiClientOptions.language`, and automatic `X-Orbit-Language` on all API calls.

- [ ] **Step 1: Add failing API-header and provider-source tests**

```ts
const client = createOrbitApiClient({ fetchImpl, language: "ja" });
await client.get("/api/contacts/contact_001");
assert.equal(request.headers["X-Orbit-Language"], "ja");
```

- [ ] **Step 2: Run focused mobile tests and confirm language support is absent**

Run: `cd repos/orbit-app && node --test --import tsx tests/api-client.test.ts tests/orbit-language-provider-source.test.ts`

- [ ] **Step 3: Implement cached language state and wrap the authenticated app tree**

```tsx
<OrbitAuthSessionProvider>
  <OrbitLanguageProvider>
    <OrbitRouteAccessBoundary />
  </OrbitLanguageProvider>
</OrbitAuthSessionProvider>
```

The provider starts with cached `zh`, then adopts `account/me` preference. Switching calls `PUT /api/profile` and invalidates language-sensitive snapshots.

- [ ] **Step 4: Inject language into direct clients and resource clients**

`useOrbitApiClient` and `useApiResource` both include language in memo dependencies. Snapshot keys include language so a Chinese response cannot appear after switching to Japanese.

- [ ] **Step 5: Run mobile API, storage, provider, and snapshot tests**

Run: `cd repos/orbit-app && node --test --import tsx tests/api-client.test.ts tests/orbit-language-provider-source.test.ts tests/snapshot-store.test.ts`

### Task 6: Consume Single-Language Detail Data On iOS And Web

**Files:**
- Modify: `repos/orbit-app/src/view-models/contacts.ts`
- Modify: `repos/orbit-app/src/view-models/relationship-value.ts`
- Modify: `repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx`
- Test: `repos/orbit-app/tests/detail-view-model.test.ts`
- Test: `repos/orbit-app/tests/relationship-value-view-model.test.ts`
- Test: `repos/orbit-app/tests/contact-detail-screen-source.test.ts`
- Modify: `repos/orbits/app/(app)/app/contacts/[id]/page.tsx`
- Modify: `repos/orbits/app/(app)/app/orbit-language-context.tsx`
- Test: `repos/orbits/tests/pages/app-contact-detail-language.test.tsx`

**Interfaces:**
- Consumes: localized detail/value payloads and `useOrbitLanguage` from Task 5.
- Produces: direct display of service-localized fields, no `preferredChineseSegment` main path, and Web preference persistence through `PUT /api/profile`.

- [ ] **Step 1: Add failing adapters tests with Chinese, English, and Japanese payloads**

```ts
assert.equal(contactDetailToSummary(zhPayload).sourceLabel, "二维码交换记录：佐藤健一");
assert.equal(relationshipValueToView(jaPayload).factors[0]?.label, "ビジネス関連性");
```

- [ ] **Step 2: Run focused Web/iOS presentation tests**

Run: `cd repos/orbit-app && node --test --import tsx tests/detail-view-model.test.ts tests/relationship-value-view-model.test.ts tests/contact-detail-screen-source.test.ts`

Run: `cd repos/orbits && node --test --import tsx tests/pages/app-contact-detail-language.test.tsx`

- [ ] **Step 3: Remove Chinese-only sanitizing from the primary path**

Adapters prefer structured/localized API fields. The old parser remains only behind a named legacy-response adapter until the compatibility window closes.

- [ ] **Step 4: Persist Web language selection without changing the current selector UI**

`setLanguage` keeps cookie/local storage behavior and additionally sends `PUT /api/profile` with `{ preferredLanguage: nextLanguage }`; navigation remains immediate and persistence failure is logged without blocking the switch.

- [ ] **Step 5: Run focused adapter, screen-source, and Web page tests**

Use the commands from Step 2 and require all to pass.

### Task 7: Repair Generated Evidence Safely

**Files:**
- Create: `repos/orbits/shared/storage/repair-generated-contact-language.ts`
- Create: `repos/orbits/scripts/repair-generated-contact-language.ts`
- Modify: `repos/orbits/package.json`
- Test: `repos/orbits/tests/services/repair-generated-contact-language.test.ts`
- Output ignored by Git: `.artifacts/data-migrations/contact-language/*.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: current generated relationship fixtures and `LiveRecordStoreLike`.
- Produces: `planGeneratedContactLanguageRepair`, `applyGeneratedContactLanguageRepair`, `GeneratedContactLanguageRepairManifest`, CLI `db:repair:contact-language` with dry-run default and explicit `--apply`.

- [ ] **Step 1: Add failing repair safety tests**

```ts
assert.equal(plan.changes.every((change) => change.provider === "generated-relationship-fixtures"), true);
assert.equal(plan.skippedUserRecords, 1);
assert.equal(await applyTwiceAndCountChanges(), 0);
```

- [ ] **Step 2: Run the focused repair test and confirm the module is absent**

Run: `cd repos/orbits && node --test --import tsx tests/services/repair-generated-contact-language.test.ts`

- [ ] **Step 3: Implement generated-only reconciliation and manifest backup**

The planner only accepts records where `collectionName === "evidence"`, `provider === "generated-relationship-fixtures"`, and `providerRecordId` maps to a current fixture. Before apply, write old envelopes and checksums to a timestamped manifest. Conflicts and unknown provenance are skipped and reported.

- [ ] **Step 4: Run dry-run against the configured local database**

Run: `cd repos/orbits && npm run db:repair:contact-language -- --workspace "$ORBIT_WORKSPACE_ID"`

Expected: nonzero stale generated evidence, zero proposed user-authored mutations, and explicit counts for wrong-person references.

- [ ] **Step 5: Apply, verify, and rerun dry-run for idempotency**

Run: `cd repos/orbits && npm run db:repair:contact-language -- --workspace "$ORBIT_WORKSPACE_ID" --apply`

Run: `cd repos/orbits && npm run db:repair:contact-language -- --workspace "$ORBIT_WORKSPACE_ID"`

Expected: second dry-run reports zero changes.

### Task 8: Full Regression And Simulator Acceptance

**Files:**
- Modify only failing tests or implementation files already named above.
- Evidence: `.artifacts/ios/contact-language/zh-contact-001.png`
- Evidence: `.artifacts/ios/contact-language/en-contact-001.png`
- Evidence: `.artifacts/ios/contact-language/ja-contact-001.png`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified backend, Web, iOS, database, and simulator behavior.

- [ ] **Step 1: Run backend typecheck and full test suite**

Run: `cd repos/orbits && npm run typecheck && npm test`

- [ ] **Step 2: Run iOS typecheck, contract sync check, and full test suite**

Run: `cd repos/orbit-app && npm run typecheck && npm test`

- [ ] **Step 3: Run source-level language leak checks**

```bash
rg -n 'QR scan at|Business relevance|Relationship strength|The generated relationship graph suggests|within 24 hours' \
  repos/orbits/features/contacts repos/orbits/features/analysis
```

Expected: no hardcoded display prose in live service implementations; translations may exist only in localization tables and tests.

- [ ] **Step 4: Open `contact_001` in the iOS simulator under each language and capture screenshots**

Verify source evidence, relationship value, action suggestion, and system labels use one language; proper name `佐藤健一`, brand names, and `AI` remain unchanged.

- [ ] **Step 5: Run Git diff checks and GitNexus change detection**

Run: `git diff --check`

Run: `git status --short`

Use `gitnexus_detect_changes(scope: "all")`; investigate any unexpected process or HIGH/CRITICAL risk before completion.

- [ ] **Step 6: Report migration counts, tests, simulator results, residual compatibility code, and all files changed**

Do not claim completion if the migration skipped conflicts, a language path was not exercised, or either full suite failed.
