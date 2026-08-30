# iOS Network Industry Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persisted single-primary-industry model, preserve user-managed custom tags, and upgrade industry, location, role, and relationship analysis to a shared interactive pie-chart and actor-scoped drill-down flow in iOS.

**Architecture:** A shared, localized industry catalog supplies stable IDs to Web and iOS. Contacts persist `primaryIndustryId` on the canonical contact record while existing custom tags remain in contact detail state; read providers compose both into analytics views. Dashboard services normalize all four dimensions into stable buckets and expose one deterministic structure-detail endpoint. Expo Router reuses one pie-chart component and one detail screen for every dimension.

**Tech Stack:** TypeScript 5.7+, Next.js 16 route handlers, PostgreSQL-backed Orbit live-record store, React Native/Expo Router 57, `react-native-svg`, Node test runner with `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-29-ios-network-industry-taxonomy-design.md`

## Global Constraints

- Each contact has zero or one `primaryIndustryId`; `unclassified` is a missing state, not a valid industry ID.
- Custom tags remain multi-select and never contribute additional pie slices.
- Fixed industry labels must be localized from stable IDs in Chinese, English, and Japanese.
- All live reads and writes remain actor-scoped; route callers never choose another actor ID.
- Industry analysis is deterministic and must not request an AI provider.
- Existing Web consumers must tolerate the new optional contact and response fields.
- Unknown industry IDs fail validation and never write storage.
- No runtime organization-suffix inference remains after migration.
- Every migration skip and ambiguity is reported explicitly.
- Every structure dimension assigns each visible contact to exactly one bucket, including a neutral missing-data bucket.
- First tap selects and explodes a slice; tapping the selected slice again or pressing the detail action navigates to the shared detail route.

---

### Task 1: Shared Industry Catalog And Cross-Client Contracts

**Files:**
- Create: `repos/orbits/shared/contract/industries.ts`
- Modify: `repos/orbits/shared/contract/index.ts`
- Modify: `repos/orbits/shared/contract/contacts.ts`
- Modify: `repos/orbits/shared/domain/contracts.ts`
- Create: `repos/orbits/tests/services/industry-taxonomy.test.ts`
- Regenerate: `repos/orbit-app/src/api/contract/industries.ts`
- Regenerate: `repos/orbit-app/src/api/contract/index.ts`
- Regenerate: `repos/orbit-app/src/api/contract/contacts.ts`
- Test: `repos/orbit-app/tests/contract-sync.test.ts`

**Interfaces:**
- Produces: `IndustryIdCode`, `IndustryCatalogEntryContract`, `INDUSTRY_CATALOG`, `isIndustryIdCode(value)`, and optional `ContactDTO.primaryIndustryId`.
- Consumes: `OrbitLanguage` values `zh`, `en`, and `ja` from the existing language contract.

- [ ] **Step 1: Write failing taxonomy and contract tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  INDUSTRY_CATALOG,
  isIndustryIdCode,
} from "../../shared/contract/industries";

test("industry catalog has stable unique ids and all three labels", () => {
  assert.equal(new Set(INDUSTRY_CATALOG.map((item) => item.id)).size, 14);
  assert.ok(
    INDUSTRY_CATALOG.every(
      (item) => item.labels.zh && item.labels.en && item.labels.ja,
    ),
  );
  assert.equal(isIndustryIdCode("food_hospitality"), true);
  assert.equal(isIndustryIdCode("unclassified"), false);
});
```

- [ ] **Step 2: Run the new test and verify the missing module failure**

Run: `cd repos/orbits && node --test --import tsx tests/services/industry-taxonomy.test.ts`  
Expected: FAIL because `shared/contract/industries.ts` does not exist.

- [ ] **Step 3: Add the fixed catalog and validator**

```ts
export const INDUSTRY_IDS = [
  "food_hospitality",
  "technology_internet",
  "finance_investment",
  "professional_services",
  "manufacturing_supply_chain",
  "retail_consumer",
  "trade_logistics",
  "real_estate_construction",
  "healthcare_life_sciences",
  "education_research",
  "media_creative",
  "community_nonprofit",
  "government_public_affairs",
  "other",
] as const;

export type IndustryIdCode = (typeof INDUSTRY_IDS)[number];

export interface IndustryCatalogEntryContract {
  id: IndustryIdCode;
  labels: { zh: string; en: string; ja: string };
  sortOrder: number;
}

export function isIndustryIdCode(value: unknown): value is IndustryIdCode {
  return typeof value === "string" && INDUSTRY_IDS.includes(value as IndustryIdCode);
}

export const INDUSTRY_CATALOG: readonly IndustryCatalogEntryContract[] = [
  { id: "food_hospitality", labels: { zh: "餐饮与食品", en: "Food & Hospitality", ja: "飲食・食品" }, sortOrder: 10 },
  { id: "technology_internet", labels: { zh: "科技与互联网", en: "Technology & Internet", ja: "テクノロジー・インターネット" }, sortOrder: 20 },
  { id: "finance_investment", labels: { zh: "金融与投资", en: "Finance & Investment", ja: "金融・投資" }, sortOrder: 30 },
  { id: "professional_services", labels: { zh: "专业服务", en: "Professional Services", ja: "プロフェッショナルサービス" }, sortOrder: 40 },
  { id: "manufacturing_supply_chain", labels: { zh: "制造与供应链", en: "Manufacturing & Supply Chain", ja: "製造・サプライチェーン" }, sortOrder: 50 },
  { id: "retail_consumer", labels: { zh: "零售与消费", en: "Retail & Consumer", ja: "小売・消費財" }, sortOrder: 60 },
  { id: "trade_logistics", labels: { zh: "贸易与物流", en: "Trade & Logistics", ja: "貿易・物流" }, sortOrder: 70 },
  { id: "real_estate_construction", labels: { zh: "房地产与建设", en: "Real Estate & Construction", ja: "不動産・建設" }, sortOrder: 80 },
  { id: "healthcare_life_sciences", labels: { zh: "医疗与健康", en: "Healthcare & Life Sciences", ja: "医療・ヘルスケア" }, sortOrder: 90 },
  { id: "education_research", labels: { zh: "教育与研究", en: "Education & Research", ja: "教育・研究" }, sortOrder: 100 },
  { id: "media_creative", labels: { zh: "文化传媒与创意", en: "Media & Creative", ja: "メディア・クリエイティブ" }, sortOrder: 110 },
  { id: "community_nonprofit", labels: { zh: "社群与非营利", en: "Community & Nonprofit", ja: "コミュニティ・非営利" }, sortOrder: 120 },
  { id: "government_public_affairs", labels: { zh: "政府与公共事务", en: "Government & Public Affairs", ja: "政府・公共政策" }, sortOrder: 130 },
  { id: "other", labels: { zh: "其他", en: "Other", ja: "その他" }, sortOrder: 140 },
];
```

Export the catalog from `shared/contract/index.ts`, add `primaryIndustryId?: IndustryIdCode` and `customTags?: readonly string[]` to `ContactDTO`, and add optional `primaryIndustryId` plus `primaryIndustryLabel` to contact list/detail-facing contracts. Broaden contact-list tag values from the legacy fixed union to `string` so existing custom tags remain representable.

- [ ] **Step 4: Sync the shared contract into iOS**

Run: `cd repos/orbit-app && npm run sync:contract`  
Expected: `industries.ts`, `contacts.ts`, and `index.ts` are copied into `src/api/contract/`.

- [ ] **Step 5: Run contract tests and typechecks**

Run: `cd repos/orbits && node --test --import tsx tests/services/industry-taxonomy.test.ts`  
Expected: PASS.

Run: `cd repos/orbit-app && node --test --import tsx tests/contract-sync.test.ts`  
Expected: PASS.

Run: `cd repos/orbits && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit the catalog and contracts**

```bash
git add repos/orbits/shared/contract repos/orbits/shared/domain/contracts.ts repos/orbits/tests/services/industry-taxonomy.test.ts repos/orbit-app/src/api/contract
git commit -m "feat(contacts): add fixed industry taxonomy"
```

---

### Task 2: Persist Primary Industry And Preserve Custom Tags

**Files:**
- Modify: `repos/orbits/features/contacts/detail-contract.ts`
- Modify: `repos/orbits/features/contacts/contract.ts`
- Modify: `repos/orbits/features/contacts/live-service.ts`
- Modify: `repos/orbits/features/contacts/live-detail-service.ts`
- Modify: `repos/orbits/features/contacts/mock-detail-service.ts`
- Modify: `repos/orbits/features/contacts/storage/contact-live-record-provider.ts`
- Modify: `repos/orbits/features/dashboard/storage/dashboard-live-record-provider.ts`
- Modify: `repos/orbits/app/api/contacts/[id]/handler.ts`
- Modify: `repos/orbits/features/contacts/contact-graph-query.ts`
- Modify: `repos/orbits/tests/capabilities/contact-detail-live-store.test.ts`
- Modify: `repos/orbits/tests/capabilities/contact-detail-tag-and-status-mock.test.ts`
- Modify: `repos/orbits/tests/capabilities/contacts-live-store.test.ts`
- Modify: `repos/orbits/tests/capabilities/network-distribution-live-store.test.ts`

**Interfaces:**
- Consumes: `IndustryIdCode`, `isIndustryIdCode`, and `ContactDTO.primaryIndustryId` from Task 1.
- Produces: `ContactDetail.primaryIndustryId`, `ContactDetail.primaryIndustryLabel`, `ContactDetailUpdateInput.primaryIndustryId`, actor-scoped custom-tag search/filtering, and provider method `updateContactPrimaryIndustry(contactId, actorId, industryId)`.

- [ ] **Step 1: Add failing live-store tests for set, clear, and reject**

```ts
const updated = await service.updateContactDetail({
  actorId: "account:xiaoyu",
  contactId: "contact:food-1",
  primaryIndustryId: "food_hospitality",
});
assert.equal(updated.success, true);
assert.equal(updated.data.contact?.primaryIndustryId, "food_hospitality");

const rejected = await service.updateContactDetail({
  actorId: "account:xiaoyu",
  contactId: "contact:food-1",
  primaryIndustryId: "made_up_industry",
});
assert.equal(rejected.success, false);
assert.equal(rejected.error.code, "CONTACT_DETAIL_INDUSTRY_NOT_SUPPORTED");
```

Also assert that setting `primaryIndustryId: null` clears the field and that a different actor cannot mutate the contact.

- [ ] **Step 2: Run the focused backend tests and verify failures**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/contact-detail-live-store.test.ts tests/capabilities/contact-detail-tag-and-status-mock.test.ts`  
Expected: FAIL because the update contract and provider do not accept `primaryIndustryId`.

- [ ] **Step 3: Extend detail contracts and route parsing**

Add the input shape:

```ts
export interface ContactDetailUpdateInput extends ContactDetailLookupInput {
  primaryIndustryId?: IndustryIdCode | string | null;
  // existing tags/status/note/lastInteraction fields remain unchanged
}
```

Extend `PatchBody` and `readPatchBody()` so missing means “leave unchanged”, `null` means “clear”, and strings are validated by the service. Keep `tags` independently writable in the same request.

- [ ] **Step 4: Add actor-scoped canonical contact mutation**

Extend `LiveContactsGraphProvider`:

```ts
updateContactPrimaryIndustry?: (
  contactId: string,
  actorId: string,
  primaryIndustryId: IndustryIdCode | null,
) => LiveContactsProviderResult<ContactDTO>;
```

In `createStorageContactGraphProvider`, load the existing contact record, verify `record.userId === actorId` or an actor-owned connection points to it, preserve all metadata and payload fields, replace only `payload.primaryIndustryId` and `updatedAt`, update `searchText`, and upsert the same record ID. Parse `primaryIndustryId` in both contact storage providers using `isIndustryIdCode`.

- [ ] **Step 5: Validate and persist in live and mock services**

Use this decision order in `updateContactDetail()`:

```ts
if (
  input.primaryIndustryId !== undefined &&
  input.primaryIndustryId !== null &&
  !isIndustryIdCode(input.primaryIndustryId)
) {
  return failure("CONTACT_DETAIL_INDUSTRY_NOT_SUPPORTED", context);
}
```

When the field is present, call `updateContactPrimaryIndustry`; then perform the existing detail-state write for tags, status, notes, and recent interaction. Reload the detail payload before returning success. If either required write fails, return the existing live-store write failure and keep the error visible.

- [ ] **Step 6: Compose tags for read consumers without changing their storage source**

When graph providers load contacts, also load actor-owned `contact_detail_states`, index each record by `contactId`, and expose its `tags` as optional `ContactDTO.customTags`. The contact record remains the source for `primaryIndustryId`; detail state remains the source for custom tags.

Update `runContactsGraphQuery()` so free-text search includes `contact.customTags`, tag filters compare against those strings, list items return them, and available tag filters are derived from actor-visible custom tags. Validate tag filter values by length/count rather than the legacy fixed whitelist; source, value, and status filters keep their current whitelists. Add a live-store assertion that saving `日本市场` makes that contact discoverable by query and tag filter without exposing another actor's tags.

- [ ] **Step 7: Run backend tests and typecheck**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/contact-detail-live-store.test.ts tests/capabilities/contact-detail-tag-and-status-mock.test.ts tests/capabilities/contacts-live-store.test.ts tests/capabilities/network-distribution-live-store.test.ts`  
Expected: PASS.

Run: `cd repos/orbits && npm run typecheck`  
Expected: PASS.

- [ ] **Step 8: Commit persistence support**

```bash
git add repos/orbits/features/contacts repos/orbits/features/dashboard/storage repos/orbits/app/api/contacts repos/orbits/tests/capabilities
git commit -m "feat(contacts): persist primary industry"
```

---

### Task 3: Normalize Four Dimensions And Add Structure Detail API

**Files:**
- Modify: `repos/orbits/features/dashboard/distribution-contract.ts`
- Modify: `repos/orbits/features/dashboard/live-distribution-service.ts`
- Modify: `repos/orbits/features/dashboard/mock-distribution-service.ts`
- Modify: `repos/orbits/features/dashboard/service-factory.ts`
- Create: `repos/orbits/app/api/dashboard/structure/[dimension]/[bucketId]/route.ts`
- Create: `repos/orbits/app/api/industries/route.ts`
- Modify: `repos/orbits/tests/capabilities/network-distribution-live-store.test.ts`
- Modify: `repos/orbits/tests/capabilities/network-distribution-analytics-mock.test.ts`
- Create: `repos/orbits/tests/api/structure-analysis-routes.test.ts`

**Interfaces:**
- Consumes: fixed catalog and contact fields from Tasks 1-2.
- Produces: stable bucket IDs for all four distributions, `StructureDimensionDetailPayload`, `getStructureDetail(input)`, `GET /api/industries`, and `GET /api/dashboard/structure/:dimension/:bucketId`.

- [ ] **Step 1: Write failing aggregation and detail tests**

```ts
assert.deepEqual(
  result.data.industryDistribution.map((item) => [item.industryId, item.contactCount]),
  [
    ["food_hospitality", 2],
    ["technology_internet", 1],
  ],
);
assert.equal(result.data.unclassifiedContactCount, 1);
assert.equal(
  result.data.industryDistribution.reduce((sum, item) => sum + item.contactCount, 0) +
    result.data.unclassifiedContactCount,
  4,
);

const detail = await service.getStructureDetail({
  dimension: "industry",
  bucketId: "food_hospitality",
});
assert.deepEqual(detail.data.relationshipQuality.map((item) => item.contactCount), [1, 1, 0]);
assert.deepEqual(detail.data.commonTags[0], { label: "日本市场", contactCount: 2 });
assert.equal(detail.data.provenance.aiProviderRequested, false);
```

Include a contact named `Example Technologies` whose explicit industry is `food_hospitality`; assert it remains food to prove suffix inference is gone. Add equivalent total-preservation tests for location, role, and relationship, including each neutral missing-data bucket.

- [ ] **Step 2: Run the focused distribution tests and verify failure**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/network-distribution-live-store.test.ts tests/capabilities/network-distribution-analytics-mock.test.ts tests/api/structure-analysis-routes.test.ts`  
Expected: FAIL because stable bucket IDs, total-preserving distributions, shared detail service, and routes are absent.

- [ ] **Step 3: Aggregate only explicit primary industry**

Delete `IndustryDefinition.suffixes` and `contactsForIndustry()` organization matching. Implement:

```ts
function contactsByIndustry(graph: LiveDashboardGraph, id: IndustryIdCode) {
  return graph.contacts.filter((contact) => contact.primaryIndustryId === id);
}
```

Iterate `INDUSTRY_CATALOG` in stable order, omit zero-count named industries, and return `unclassifiedContactCount` separately. Calculate displayed percentages with a largest-remainder allocator so named and unclassified buckets total exactly 100.

- [ ] **Step 4: Normalize location, role, and relationship buckets**

Use stable server-side definitions for location, role, and relationship. Assign every contact exactly once per dimension. Preserve original location and job-title text for display, but never use localized display labels as route IDs. Contacts that cannot be classified enter a neutral missing-data bucket.

- [ ] **Step 5: Add deterministic shared detail analysis**

Add `getStructureDetail()` to `NetworkDistributionAnalyticsService`. Resolve the selected dimension and bucket with a server-owned allowlist, then reuse the same relationship-quality, common-tag, stable-sort, provenance, and insight builders. Contacts without a connection are `reconnect`. Invalid dimensions or bucket IDs fail visibly.

- [ ] **Step 6: Add actor-scoped routes**

`GET /api/industries` returns localized catalog entries using the request language resolver. `GET /api/dashboard/structure/[dimension]/[bucketId]` validates both stable IDs, resolves the authenticated actor, creates the actor-scoped live service, and returns the shared success/error envelope. Never accept `actorId` from query or body.

- [ ] **Step 7: Run route, service, and type tests**

Run: `cd repos/orbits && node --test --import tsx tests/capabilities/network-distribution-live-store.test.ts tests/capabilities/network-distribution-analytics-mock.test.ts tests/api/structure-analysis-routes.test.ts`  
Expected: PASS.

Run: `cd repos/orbits && npm run typecheck`  
Expected: PASS.

- [ ] **Step 8: Commit analytics and routes**

```bash
git add repos/orbits/features/dashboard repos/orbits/app/api/dashboard/structure repos/orbits/app/api/industries repos/orbits/tests
git commit -m "feat(analysis): add structure distribution drill-down"
```

---

### Task 4: Migrate Existing Contacts With Visible Reporting

**Files:**
- Create: `repos/orbits/scripts/migrate-contact-primary-industries.ts`
- Modify: `repos/orbits/package.json`
- Create: `repos/orbits/tests/services/contact-primary-industry-migration.test.ts`
- Modify: `repos/orbits/shared/storage/seed-generated-fixtures.ts`
- Modify: `repos/orbits/scripts/seed-account-contact-fixtures.ts`

**Interfaces:**
- Consumes: `IndustryIdCode`, live-record store config, and canonical `contacts` collection.
- Produces: `classifyLegacyContact(payload)`, `migrateContactPrimaryIndustries(options)`, CLI command `npm run contacts:migrate-primary-industries`, and a structured migration report.

- [ ] **Step 1: Write migration tests for preserve, explicit map, unique rule, conflict, and unknown**

```ts
assert.equal(classifyLegacyContact({ primaryIndustryId: "finance_investment" }).kind, "preserved");
assert.deepEqual(
  classifyLegacyContact({ id: "contact_029", organization: "红桥科技" }),
  { kind: "mapped", industryId: "technology_internet", reason: "xiaoyu-explicit-map" },
);
assert.equal(
  classifyLegacyContact({ organization: "贸易食品顾问", role: "物流负责人" }).kind,
  "conflict",
);
assert.equal(classifyLegacyContact({ organization: "未知机构" }).kind, "unclassified");
```

- [ ] **Step 2: Run migration test and verify failure**

Run: `cd repos/orbits && node --test --import tsx tests/services/contact-primary-industry-migration.test.ts`  
Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Implement deterministic migration and dry-run default**

The CLI defaults to dry-run. `--apply` writes only missing valid `primaryIndustryId` values. Return and print:

```ts
interface MigrationReport {
  scanned: number;
  preserved: string[];
  migrated: { contactId: string; industryId: IndustryIdCode; reason: string }[];
  unclassified: string[];
  conflicts: { contactId: string; candidates: IndustryIdCode[] }[];
}
```

Use an explicit map for current Xiaoyu fixture contacts, reviewed legacy tag mappings second, and unique keyword rules third. Never call the old runtime suffix function. Exit nonzero on storage failure; conflicts remain unwritten.

- [ ] **Step 4: Add explicit industries to generated and account fixtures**

Update fixture contact payloads so new databases are born with valid `primaryIndustryId` values. Preserve existing tags and public-profile industry text.

- [ ] **Step 5: Run tests, dry-run, apply, and verify idempotency**

Run: `cd repos/orbits && node --test --import tsx tests/services/contact-primary-industry-migration.test.ts tests/services/live-generated-fixture-seed.test.ts`  
Expected: PASS.

Run: `cd repos/orbits && npm run contacts:migrate-primary-industries -- --actor account:xiaoyu`  
Expected: prints nonzero scanned count and no writes.

Run: `cd repos/orbits && npm run contacts:migrate-primary-industries -- --actor account:xiaoyu --apply`  
Expected: prints migrated, preserved, unclassified, and conflicts; no silent skips.

Run the same `--apply` command again.  
Expected: `migrated` is empty and prior rows are reported as preserved.

- [ ] **Step 6: Commit migration and fixture data**

```bash
git add repos/orbits/scripts/migrate-contact-primary-industries.ts repos/orbits/package.json repos/orbits/shared/storage/seed-generated-fixtures.ts repos/orbits/scripts/seed-account-contact-fixtures.ts repos/orbits/tests/services/contact-primary-industry-migration.test.ts
git commit -m "feat(data): migrate contact primary industries"
```

---

### Task 5: iOS View Models, Endpoints, And Contact Industry Editor

**Files:**
- Modify: `repos/orbit-app/src/api/endpoints.ts`
- Create: `repos/orbit-app/src/view-models/industries.ts`
- Modify: `repos/orbit-app/src/view-models/dashboard.ts`
- Modify: `repos/orbit-app/src/view-models/contacts-analysis.ts`
- Modify: `repos/orbit-app/src/view-models/contacts.ts`
- Modify: `repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx`
- Create: `repos/orbit-app/tests/industries-view-model.test.ts`
- Modify: `repos/orbit-app/tests/contacts-analysis-view-model.test.ts`
- Modify: `repos/orbit-app/tests/contact-detail-screen-source.test.ts`

**Interfaces:**
- Consumes: synchronized catalog and backend response contracts from Tasks 1-3.
- Produces: `industryCatalogToOptions()`, `structureDetailToView()`, `buildContactIndustryMetadataRequest()`, and endpoint exports `structureDetailPath(dimension, bucketId)` and `INDUSTRIES_ENDPOINT`.

- [ ] **Step 1: Write failing view-model tests**

```ts
const request = buildContactIndustryMetadataRequest({
  primaryIndustryId: "food_hospitality",
  tags: ["日本市场", "连锁经营", "日本市场"],
});
assert.deepEqual(request.body, {
  primaryIndustryId: "food_hospitality",
  tags: ["日本市场", "连锁经营"],
});

const view = structureDetailToView(payload);
assert.equal(view.title, "餐饮与食品");
assert.equal(view.contacts[0].name, "佐藤健一");
assert.equal(view.quality.reduce((sum, item) => sum + item.percentage, 0), 100);
```

Also test unknown IDs, `null` clear, 20-tag maximum, 32-character validation, empty data, and localized catalog labels.

- [ ] **Step 2: Run focused iOS tests and verify failures**

Run: `cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/industries-view-model.test.ts tests/contacts-analysis-view-model.test.ts tests/contact-detail-screen-source.test.ts`  
Expected: FAIL because the industry view model and editor do not exist.

- [ ] **Step 3: Implement endpoint and pure view-model boundaries**

Add:

```ts
export const INDUSTRIES_ENDPOINT = "/api/industries";

export function structureDetailPath(dimension: string, bucketId: string): string {
  return `/api/dashboard/structure/${encodeURIComponent(dimension)}/${encodeURIComponent(bucketId)}`;
}
```

Keep payload parsing in `view-models/industries.ts`; screens receive only typed display values. Map backend quality IDs to `强关系`, `保持联系`, and `待重新联系` without recomputing server analysis.

- [ ] **Step 4: Replace the free-text-only tag editor with industry plus chip editing**

In `ContactDetailScreen`, load the fixed catalog once, render a single-select industry menu, render existing tags as removable chips, and keep one text input plus add button for a new tag. Save industry and tags through the existing contact PATCH client. Preserve the draft on failure and refresh detail data only after success.

- [ ] **Step 5: Run iOS tests and typecheck**

Run: `cd repos/orbit-app && npm test -- --test-name-pattern="industry|contact detail|contacts analysis"`  
Expected: PASS.

Run: `cd repos/orbit-app && npm run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit view models and editor**

```bash
git add repos/orbit-app/src/api repos/orbit-app/src/view-models repos/orbit-app/src/screens/contacts/ContactDetailScreen.tsx repos/orbit-app/tests
git commit -m "feat(ios): edit contact industries and tags"
```

---

### Task 6: Interactive Pie Charts And Shared Structure Drill-Down Screen

**Files:**
- Modify: `repos/orbit-app/package.json`
- Modify: `repos/orbit-app/package-lock.json`
- Create: `repos/orbit-app/src/components/AnalysisPieChart.tsx`
- Modify: `repos/orbit-app/src/screens/contacts/ContactsDashboardScreen.tsx`
- Create: `repos/orbit-app/src/screens/contacts/ContactStructureDetailScreen.tsx`
- Create: `repos/orbit-app/app/contacts/analysis/[dimension]/[bucketId].tsx`
- Create: `repos/orbit-app/tests/analysis-pie-chart-source.test.ts`
- Modify: `repos/orbit-app/tests/contacts-dashboard-screen-source.test.ts`
- Create: `repos/orbit-app/tests/contact-structure-detail-screen-source.test.ts`

**Interfaces:**
- Consumes: distribution and detail view models from Task 5.
- Produces: accessible `AnalysisPieChart`, Expo route `/contacts/analysis/[dimension]/[bucketId]`, and option-2 interaction flow for every structure dimension.

- [ ] **Step 1: Install the Expo-compatible SVG dependency**

Run: `cd repos/orbit-app && npx expo install react-native-svg`  
Expected: Expo selects a compatible version and updates both package files.

- [ ] **Step 2: Write failing source and interaction-boundary tests**

Assert that:

```ts
assert.match(chartSource, /accessibilityRole="button"/);
assert.match(chartSource, /onSelect\(slice\.id\)/);
assert.match(dashboardSource, /查看详情/);
assert.match(dashboardSource, /contacts\/analysis/);
assert.match(detailSource, /查看分析依据/);
assert.match(detailSource, /查看全部.*位联系人/);
```

Also assert that `AnalysisPieChart` imports `react-native-svg`, does not contain handcrafted inline SVG XML, exposes text labels outside the chart, offsets the selected slice, and calls a separate activation callback when the selected slice is tapped again.

- [ ] **Step 3: Run the new UI tests and verify failures**

Run: `cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/analysis-pie-chart-source.test.ts tests/contacts-dashboard-screen-source.test.ts tests/contact-structure-detail-screen-source.test.ts`  
Expected: FAIL because chart, route, and detail screen are absent.

- [ ] **Step 4: Build the reusable accessible pie chart**

Use `Svg`, `Path`, and `G` from `react-native-svg`. Compute arcs from normalized counts in one pure helper, but keep each visible slice wrapped in a `Pressable` overlay or accessible legend row. Use the existing Orbit color tokens plus stable non-purple category colors from the selected mock. Center text shows total contacts; selection uses offset/stroke rather than color alone.

- [ ] **Step 5: Replace all four structure breakdown surfaces**

In `StructureBreakdownCard`, render the selected option-2 composition for industry, location, role, and relationship: section header, pie and legend, selected-group summary, and `查看详情`. Default to the largest bucket per dimension and preserve an independent selection for each dimension. Show `管理行业` only for industry.

- [ ] **Step 6: Add the shared structure detail route and screen**

The route file exports `ContactStructureDetailScreen`. The screen reads `dimension` and `bucketId`, requests `structureDetailPath(dimension, bucketId)`, and renders:

1. title, count, and total share;
2. relationship-quality segmented bar and deterministic insight;
3. four overlapping common tags;
4. one-row `全部 / 强关系 / 待联系` filter;
5. compact avatar/name/organization/status contact rows;
6. navigation to `/contacts/[id]`.

Loading, offline, failure, empty industry, and unknown ID use existing `LoadingState`, `ErrorState`, and `EmptyState` components.

- [ ] **Step 7: Run focused and full iOS verification**

Run: `cd repos/orbit-app && node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/analysis-pie-chart-source.test.ts tests/contacts-dashboard-screen-source.test.ts tests/contact-structure-detail-screen-source.test.ts tests/contacts-analysis-view-model.test.ts tests/industries-view-model.test.ts`  
Expected: PASS.

Run: `cd repos/orbit-app && npm run typecheck`  
Expected: PASS.

Run: `cd repos/orbit-app && npm test`  
Expected: PASS.

- [ ] **Step 8: Commit the selected iOS flow**

```bash
git add repos/orbit-app/package.json repos/orbit-app/package-lock.json repos/orbit-app/src/components/AnalysisPieChart.tsx repos/orbit-app/src/screens/contacts repos/orbit-app/app/contacts/analysis repos/orbit-app/tests
git commit -m "feat(ios): add interactive structure analysis"
```

---

### Task 7: End-To-End Verification And Simulator Acceptance

**Files:**
- Modify: `repos/orbit-app/design-qa.md`
- Modify: `design-qa.md`
- Create: `.artifacts/screenshots/ios-industry-distribution-2026-08-29.png`
- Create: `.artifacts/screenshots/ios-industry-detail-2026-08-29.png`
- Create: `.artifacts/screenshots/ios-contact-industry-editor-2026-08-29.png`

**Interfaces:**
- Consumes: all implemented services, migrated local data, and selected visual references.
- Produces: verified screenshots in the ignored artifact path and QA records pointing to the committed design previews.

- [ ] **Step 1: Run backend and iOS suites**

Run: `cd repos/orbits && node --test --import tsx tests/services/industry-taxonomy.test.ts tests/services/contact-primary-industry-migration.test.ts tests/capabilities/contact-detail-live-store.test.ts tests/capabilities/network-distribution-live-store.test.ts tests/api/industry-routes.test.ts`  
Expected: PASS.

Run: `cd repos/orbits && npm run typecheck`  
Expected: PASS.

Run: `cd repos/orbit-app && npm test && npm run typecheck`  
Expected: PASS.

- [ ] **Step 2: Start or reuse backend and Metro without terminating active user sessions**

Run backend on port 3000 only if health check fails; otherwise reuse it. Run Metro on port 8081 only if it is not already serving the app. Confirm the Simulator is booted before launching Orbit.

- [ ] **Step 3: Verify the live workflow in Simulator**

Sign in as Xiaoyu and verify:

1. `人脉分析 > 结构 > 行业` displays a nonblank pie using migrated live data.
2. Selecting a slice updates the detail panel without navigation.
3. `查看联系人` opens the matching industry and excludes other industries.
4. Opening a contact, changing `主要行业`, and adding a custom tag persists after refresh.
5. Returning to analysis updates counts and common tags.
6. An unclassified contact appears in the neutral slice and management path.

- [ ] **Step 4: Capture and compare screenshots**

Capture the three required states into `.artifacts/screenshots/`. Compare the implementation beside the committed option-2 references at the same 390x844-equivalent viewport. Record visible differences, fixes, final route, test commands, and timestamp in both QA documents. Screenshots remain ignored and are not committed.

- [ ] **Step 5: Run GitNexus change detection and inspect scope**

Run `gitnexus_detect_changes({ repo: "orbit", scope: "all" })`.  
Expected: only contact contracts/storage, dashboard analytics/routes, migration, and iOS contact analysis flows are affected. Investigate any unrelated process before committing.

- [ ] **Step 6: Commit QA records**

```bash
git add design-qa.md repos/orbit-app/design-qa.md
git commit -m "test(ios): verify industry analysis flow"
```

- [ ] **Step 7: Confirm clean worktree and commit order**

Run: `git status --short`  
Expected: no output.

Run: `git log --oneline -7`  
Expected: separate commits for taxonomy, persistence, analytics, migration, iOS editing, iOS analysis, and QA.
