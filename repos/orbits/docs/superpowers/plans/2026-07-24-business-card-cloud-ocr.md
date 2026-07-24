# Business Card Cloud OCR and Invitation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make business-card capture a primary Contacts entry, extract real card images with paid Gemini, write a reviewed contact exactly once, and offer a separately confirmed Orbit invitation.

**Architecture:** Acquisition owns image validation, Gemini extraction, normalization, and the review draft. A new Contacts command boundary owns idempotent confirmed-contact writes. Followups keeps invitation composition, while a small invitation delivery boundary records `ready_for_delivery` when no real email provider is configured and never claims a send.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript 5.7, Node test runner, Gemini Interactions API, existing live-record store and Orbit design tokens.

## Global Constraints

- Use `gemini-3.5-flash-lite`, media resolution `high`, thinking level `minimal`, and strict JSON output.
- Read `GEMINI_API_KEY` first and `GOOGLE_API_KEY` only as a compatibility fallback.
- Accept JPEG, PNG, and WebP images up to 10 MiB.
- Never persist the raw card image or print card fields/API keys in application logs.
- Never create a contact before explicit field review and confirmation.
- Contact confirmation and invitation confirmation are two different actions.
- Missing OCR or email configuration fails visibly and never falls back to live fixture data.
- Preserve the current user's unrelated changes in the dirty worktree.
- Run GitNexus upstream impact before every existing symbol edit and warn before HIGH or CRITICAL changes.

### Visual Direction

- Subject: a relationship operator turning a physical card into a trusted Orbit relationship record.
- Audience: bilingual founders and operators capturing contacts immediately after meeting.
- Single job: get from photo to reviewed contact with a clear optional invitation decision.
- Palette: Orbit void `#06050D`, surface `#12101F`, iris `#8B7BF0`,
  evidence sky `#6FA8F8`, verified mint `#34C98E`, review amber `#E0B472`.
- Type: Noto Sans SC/Inter for controls and fields; Noto Serif SC/Newsreader
  only for the captured person's name; JetBrains Mono/Geist Mono for provenance.
- Signature: a "capture rail" linking the card preview to editable,
  evidence-marked fields without invented confidence scores.
- Restraint check: no generic gradient hero, decorative metric cards, or
  unrelated animation. Motion is limited to one capture-to-review transition
  and respects reduced motion.

---

### Task 1: Cloud OCR Types and Deterministic Review Policy

**Files:**
- Create: `features/acquisition/business-card-cloud-ocr.ts`
- Modify: `features/acquisition/business-card-contract.ts`
- Test: `tests/capabilities/business-card-cloud-ocr.test.ts`

**Interfaces:**
- Produces: `BusinessCardCloudOcrProvider.extract(input)`,
  `normalizeBusinessCardExtraction(extraction)`, and
  `reviewIssuesForBusinessCard(extraction)`.
- Consumes: no provider or storage implementation.

- [ ] **Step 1: Write the failing normalization and review tests**

```ts
test("preserves labeled multi-office contact points and flags review issues", () => {
  const extraction = normalizeBusinessCardExtraction({
    fullName: "未来 花子",
    nativeFullName: "未来 花子",
    romanizedFullName: null,
    organization: "架空産業株式会社",
    departments: [],
    title: "代表取締役社長",
    emails: [{ label: "E-mail", value: "hanako@example.test" }],
    contactPoints: [
      { label: "本社", type: "phone", value: "03-0000-1111" },
      { label: "関西事業所", type: "fax", value: "06-0000-2222" },
      { label: "本社", type: "fax", value: "06-0000-2222" },
    ],
    website: "https://example.test",
    addresses: [
      { label: "本社", value: "東京都テスト区1-2-3" },
      { label: "関西事業所", value: "大阪府サンプル市4-5-6" },
    ],
    certifications: [],
    detectedLanguages: ["ja"],
  });

  assert.equal(extraction.contactPoints.length, 3);
  assert.deepEqual(
    reviewIssuesForBusinessCard(extraction).map((issue) => issue.code),
    ["MULTIPLE_OFFICES", "SHARED_CONTACT_VALUE"],
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts
```

Expected: FAIL because `business-card-cloud-ocr.ts` does not exist.

- [ ] **Step 3: Add the extraction, provider, and review types**

```ts
export type BusinessCardContactPointType = "phone" | "mobile" | "fax";

export interface BusinessCardLabeledValue {
  label: string | null;
  value: string;
}

export interface BusinessCardContactPoint extends BusinessCardLabeledValue {
  type: BusinessCardContactPointType;
}

export interface BusinessCardStructuredExtraction {
  fullName: string | null;
  nativeFullName: string | null;
  romanizedFullName: string | null;
  organization: string | null;
  departments: readonly string[];
  title: string | null;
  emails: readonly BusinessCardLabeledValue[];
  contactPoints: readonly BusinessCardContactPoint[];
  website: string | null;
  addresses: readonly BusinessCardLabeledValue[];
  certifications: readonly string[];
  detectedLanguages: readonly string[];
}

export interface BusinessCardCloudOcrProvider {
  model: string;
  providerName: string;
  extract(input: {
    imageBase64: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
  }): Promise<{
    extraction: BusinessCardStructuredExtraction;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }>;
}
```

Add `imageBase64`, `mimeType`, and `imageSizeBytes` to
`BusinessCardScanOcrInput`. Extend provenance with real provider/model/usage
fields and booleans that can truthfully be `true` on the cloud path.

- [ ] **Step 4: Implement normalization and deterministic review rules**

Normalization trims values but retains duplicate labeled contact points.
Review issues include:

```ts
export type BusinessCardReviewIssueCode =
  | "IDENTITY_MISSING"
  | "INVALID_EMAIL"
  | "INVALID_PHONE"
  | "MULTIPLE_OFFICES"
  | "SHARED_CONTACT_VALUE"
  | "NATIVE_ROMANIZED_NAME_CONFLICT";
```

`needsReview` is `issues.length > 0`; it never comes from provider
self-assessment.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts
```

Expected: all cloud OCR normalization tests pass.

- [ ] **Step 6: Commit**

```bash
git add features/acquisition/business-card-cloud-ocr.ts features/acquisition/business-card-contract.ts tests/capabilities/business-card-cloud-ocr.test.ts
git commit -m "feat: define business card cloud OCR contract"
```

### Task 2: Gemini Interactions Provider

**Files:**
- Create: `features/acquisition/gemini-business-card-ocr-provider.ts`
- Modify: `tests/capabilities/business-card-cloud-ocr.test.ts`

**Interfaces:**
- Consumes: `BusinessCardCloudOcrProvider` from Task 1.
- Produces: `createConfiguredGeminiBusinessCardOcrProvider(options?)`.

- [ ] **Step 1: Write failing provider request tests**

Inject a fake `fetch` and assert:

```ts
assert.equal(request.model, "gemini-3.5-flash-lite");
assert.equal(request.input[1].resolution, "high");
assert.equal(request.input[1].mime_type, "image/jpeg");
assert.equal(request.generation_config.thinking_level, "minimal");
assert.equal(request.response_format.mime_type, "application/json");
assert.equal(request.response_format.schema.additionalProperties, false);
```

Also test:

- `GEMINI_API_KEY` wins over `GOOGLE_API_KEY`;
- the response text is read from `steps[].content[].text`;
- non-2xx, invalid JSON, timeout, and invalid structured output become typed
  provider errors without echoing card content or keys.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts
```

Expected: FAIL because the Gemini provider module does not exist.

- [ ] **Step 3: Implement the provider**

Use:

```ts
const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";
const model = env.ORBIT_BUSINESS_CARD_OCR_MODEL?.trim()
  || "gemini-3.5-flash-lite";
const apiKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim();
```

The request puts the extraction prompt before the image and sets:

```ts
{
  model,
  input: [
    { type: "text", text: BUSINESS_CARD_EXTRACTION_PROMPT },
    { type: "image", data: imageBase64, mime_type: mimeType, resolution: "high" },
  ],
  response_format: {
    type: "text",
    mime_type: "application/json",
    schema: BUSINESS_CARD_EXTRACTION_JSON_SCHEMA,
  },
  generation_config: { thinking_level: "minimal" },
}
```

Use an `AbortController` with a 20-second default timeout. Return usage and
latency, not the raw provider response.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts
```

Expected: provider request, parsing, key precedence, and controlled-failure
tests pass.

- [ ] **Step 5: Commit**

```bash
git add features/acquisition/gemini-business-card-ocr-provider.ts tests/capabilities/business-card-cloud-ocr.test.ts
git commit -m "feat: add Gemini business card OCR provider"
```

### Task 3: Live Scan Service and Upload Route

**Files:**
- Modify: `features/acquisition/live-business-card-scan-service.ts`
- Modify: `features/acquisition/service-factory.ts`
- Modify: `app/api/contact-drafts/business-card/scan/route.ts`
- Modify: `tests/capabilities/business-card-scan-ocr-live-store.test.ts`
- Test: `tests/capabilities/business-card-cloud-ocr.test.ts`

**Interfaces:**
- Consumes: cloud provider from Task 2.
- Produces: a real `BusinessCardScanOcrPayload` for an uploaded image while
  preserving the existing source-backed no-image path.

- [ ] **Step 1: Write the failing live-service test**

```ts
const result = await createLiveBusinessCardScanOcrService({
  cloudOcrProvider: fakeProvider,
  provider: null,
  now: () => NOW,
}).scanBusinessCard({
  imageBase64: "aW1hZ2U=",
  imageName: "card.jpg",
  imageSizeBytes: 5,
  mimeType: "image/jpeg",
});

assert.equal(result.success, true);
assert.equal(result.data.ocr.ocrProviderCalled, true);
assert.equal(result.data.ocr.aiExtractionExecuted, true);
assert.equal(result.data.provenance.model, "gemini-3.5-flash-lite");
assert.equal(result.data.draft?.contactWriteExecuted, false);
```

Assert the existing `scanBusinessCard()` no-image live-store test remains
unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts tests/capabilities/business-card-scan-ocr-live-store.test.ts
```

Expected: FAIL because `cloudOcrProvider` is not accepted and the real OCR flags
cannot be true.

- [ ] **Step 3: Implement cloud-path dispatch**

At the beginning of `scanBusinessCard`, route inputs with `imageBase64` to
`scanUploadedBusinessCard`. That path:

- requires a configured cloud provider;
- never reads the fixture graph;
- normalizes extraction and computes deterministic issues;
- creates a non-reversible SHA-256 digest with `node:crypto`;
- returns a pending-confirmation draft;
- never persists the image or contact.

No-image calls continue through the existing storage-backed behavior.

- [ ] **Step 4: Parse multipart and JSON uploads**

For multipart, read `formData.get("image")` as `File`, validate MIME and
`file.size <= 10 * 1024 * 1024`, then pass:

```ts
{
  imageBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  imageName: file.name,
  imageSizeBytes: file.size,
  mimeType: file.type,
}
```

For JSON, accept the same fields for deterministic route tests. Invalid MIME,
size, or absent image returns the contract's validation error.

- [ ] **Step 5: Wire the configured provider through the service factory**

The live constructor calls
`createConfiguredGeminiBusinessCardOcrProvider({ env: process.env })`. A missing
key passes `null` and produces `BUSINESS_CARD_OCR_UNCONFIGURED` only when an
image is submitted.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts tests/capabilities/business-card-scan-ocr-live-store.test.ts tests/capabilities/business-card-scan-ocr-mock.test.ts
```

Expected: all mock, storage-backed live, cloud live, and route tests pass.

- [ ] **Step 7: Commit**

```bash
git add features/acquisition/live-business-card-scan-service.ts features/acquisition/service-factory.ts app/api/contact-drafts/business-card/scan/route.ts tests/capabilities/business-card-cloud-ocr.test.ts tests/capabilities/business-card-scan-ocr-live-store.test.ts
git commit -m "feat: scan uploaded business cards with Gemini"
```

### Task 4: Idempotent Confirmed-Contact Write

**Files:**
- Create: `features/contacts/contact-write-contract.ts`
- Create: `features/contacts/live-contact-write-service.ts`
- Create: `features/contacts/storage/contact-write-live-record-provider.ts`
- Modify: `features/contacts/service-factory.ts`
- Create: `app/api/contacts/business-card/confirm/route.ts`
- Test: `tests/capabilities/business-card-contact-write.test.ts`

**Interfaces:**
- Consumes: corrected business-card draft fields and evidence fingerprint.
- Produces: `confirmBusinessCardContact(input)` with `created`, `duplicate`, or
  controlled failure outcome.

- [ ] **Step 1: Write failing idempotency and duplicate tests**

```ts
const first = await service.confirmBusinessCardContact(input);
const second = await service.confirmBusinessCardContact(input);

assert.equal(first.success, true);
assert.equal(first.data.state, "created");
assert.equal(second.success, true);
assert.equal(second.data.contactId, first.data.contactId);
assert.equal(store.listRecords({
  workspaceId: WORKSPACE_ID,
  collectionName: "contacts",
}).length, 1);
```

Add a second test with an existing same normalized email. It must return
`state: "duplicate_review"` and perform zero writes.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- tests/capabilities/business-card-contact-write.test.ts
```

Expected: FAIL because the contact-write boundary does not exist.

- [ ] **Step 3: Implement the command contract**

```ts
export interface ConfirmBusinessCardContactInput {
  draftId: string;
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  relationshipContext: string;
  evidenceIds: readonly string[];
  imageDigest: string;
  actorLabel: string;
}
```

The output includes `contactId`, `state`, `contactWriteExecuted`,
`duplicateContactId`, evidence IDs, and timestamps.

- [ ] **Step 4: Implement storage and service**

Derive a stable record ID from the draft ID. Before `upsertRecord`, list Contacts
and compare normalized email, then normalized `(displayName, organization)`.
Write a `ContactDTO`-shaped payload with `stage: "new"`,
`source.type: "business_card_ocr"`, and at least one evidence ID.

- [ ] **Step 5: Implement the confirmation route**

`POST /api/contacts/business-card/confirm` reads only the allowed corrected
fields and requires `confirmed: true`. It resolves the Contacts write service
through `features/contacts/service-factory.ts`; missing storage fails closed.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```bash
npm test -- tests/capabilities/business-card-contact-write.test.ts tests/capabilities/contacts-live-store.test.ts
```

Expected: contact create, idempotency, duplicate stop, validation, and
unconfigured-store tests pass.

- [ ] **Step 7: Commit**

```bash
git add features/contacts/contact-write-contract.ts features/contacts/live-contact-write-service.ts features/contacts/storage/contact-write-live-record-provider.ts features/contacts/service-factory.ts app/api/contacts/business-card/confirm/route.ts tests/capabilities/business-card-contact-write.test.ts
git commit -m "feat: confirm business card drafts into contacts"
```

### Task 5: Optional Staged Orbit Invitation

**Files:**
- Create: `features/followups/contact-invitation-contract.ts`
- Create: `features/followups/staged-contact-invitation-service.ts`
- Modify: `features/followups/service-factory.ts`
- Create: `app/api/contact-invitations/route.ts`
- Test: `tests/capabilities/contact-invitation-staged.test.ts`

**Interfaces:**
- Consumes: a confirmed contact ID, reviewed email, and editable invitation
  subject/body.
- Produces: `prepareInvitation` and `confirmInvitation`, ending at
  `ready_for_delivery` when no delivery provider exists.

- [ ] **Step 1: Write failing separation and no-send tests**

```ts
const prepared = await service.prepareInvitation({
  contactId: "contact:card-1",
  recipientEmail: "person@example.com",
  recipientName: "Person",
});
const confirmed = await service.confirmInvitation({
  invitationId: prepared.data.invitationId,
  subject: prepared.data.subject,
  body: prepared.data.body,
  confirmed: true,
});

assert.equal(confirmed.data.status, "ready_for_delivery");
assert.equal(confirmed.data.externalSendRequested, false);
assert.equal(confirmed.data.emailProviderRequested, false);
assert.equal(confirmed.data.messageSent, false);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- tests/capabilities/contact-invitation-staged.test.ts
```

Expected: FAIL because the staged invitation boundary does not exist.

- [ ] **Step 3: Implement preparation and confirmation**

Preparation uses the existing `invitation` message-draft wording rules and
stores no external side effect. Confirmation requires the same invitation ID
and explicit `confirmed: true`; it returns:

```ts
{
  status: "ready_for_delivery",
  externalSendRequested: false,
  emailProviderRequested: false,
  messageSent: false,
  nextAction: "Configure an email delivery provider before sending this invitation.",
}
```

- [ ] **Step 4: Implement the API route**

`POST /api/contact-invitations` prepares a preview.
`PATCH /api/contact-invitations` confirms edited subject/body. Both use stable
envelopes and runtime boundary headers.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npm test -- tests/capabilities/contact-invitation-staged.test.ts tests/capabilities/message-draft-generator-live-rules.test.ts
```

Expected: invitation preview and explicit confirmation pass, with all external
send flags false.

- [ ] **Step 6: Commit**

```bash
git add features/followups/contact-invitation-contract.ts features/followups/staged-contact-invitation-service.ts features/followups/service-factory.ts app/api/contact-invitations/route.ts tests/capabilities/contact-invitation-staged.test.ts
git commit -m "feat: stage optional Orbit contact invitations"
```

### Task 6: Primary Capture and Review UI

**Files:**
- Create: `app/(app)/app/contacts/business-card-capture-workspace.tsx`
- Modify: `app/(app)/app/contacts/orbit-real-cards-import.tsx`
- Test: `tests/pages/app-business-card-capture-workspace.test.tsx`
- Modify: `tests/pages/app-contacts-new-live-route-services.test.ts`

**Interfaces:**
- Consumes: scan, contact-confirmation, and invitation routes from Tasks 3–5.
- Produces: the primary `/app/contacts/new` scan-to-contact workflow.

- [ ] **Step 1: Write failing interaction tests**

Render the workspace and assert:

```ts
assert.ok(screen.getByRole("button", { name: "拍照扫描" }));
assert.ok(screen.getByLabelText("上传名片图片"));
assert.ok(screen.getByText("图片只用于本次云端识别"));
```

Simulate upload → OCR response → edit field → review all → confirm contact.
Assert the invite choice is absent before contact confirmation, then appears
unchecked afterward. Selecting it shows editable subject/body and a separate
`确认邀请` button.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- tests/pages/app-business-card-capture-workspace.test.tsx
```

Expected: FAIL because the capture workspace does not exist.

- [ ] **Step 3: Implement capture states**

Use:

```ts
type CaptureState =
  | { kind: "idle" }
  | { kind: "preview"; file: File; previewUrl: string }
  | { kind: "processing"; previewUrl: string }
  | { kind: "review"; previewUrl: string; payload: ScanPayload }
  | { kind: "confirmed"; contactId: string; email: string }
  | { kind: "failure"; message: string; retryable: boolean };
```

The file input has `accept="image/jpeg,image/png,image/webp"` and
`capture="environment"`. Revoke object URLs on replacement/unmount.

- [ ] **Step 4: Implement the capture rail UI**

Desktop uses a 42/58 split: real image preview left, editable review rail right.
Mobile stacks the same semantic order. Review issues use amber; reviewed fields
use mint. There are no model confidence percentages.

Primary action sequence:

```text
拍照扫描 / 上传图片 → 开始识别 → 确认并收录 → 邀请对方加入 Orbit（可选）
```

Contact confirmation remains disabled until required identity fields are
present and deterministic review issues have been acknowledged.

- [ ] **Step 5: Implement optional invitation preview**

After contact confirmation, render an unchecked choice. If selected, prepare a
draft and show recipient, subject, body, `暂不邀请`, and `确认邀请`. A staged
confirmation displays `邀请已准备，尚未发送` rather than a success-send toast.

- [ ] **Step 6: Run UI tests and verify GREEN**

Run:

```bash
npm test -- tests/pages/app-business-card-capture-workspace.test.tsx tests/pages/app-contacts-new-live-route-services.test.ts
```

Expected: upload, validation, OCR, review, contact confirmation, invitation
decline, invitation staging, accessibility labels, and mobile semantic-order
tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/'(app)'/app/contacts/business-card-capture-workspace.tsx app/'(app)'/app/contacts/orbit-real-cards-import.tsx tests/pages/app-business-card-capture-workspace.test.tsx tests/pages/app-contacts-new-live-route-services.test.ts
git commit -m "feat: add primary business card capture workflow"
```

### Task 7: Evaluation, Documentation, and Full Verification

**Files:**
- Create: `scripts/evaluate-business-card-ocr.ts`
- Modify: `package.json`
- Modify: `features/acquisition/DESIGN.md`
- Modify: `features/contacts/DESIGN.md`
- Modify: `features/followups/DESIGN.md`
- Modify: `docs/architecture/modules/acquisition.md`
- Modify: `docs/architecture/modules/contacts.md`
- Modify: `docs/architecture/modules/followups.md`
- Modify: `docs/evaluations/2026-07-24-business-card-ocr-baseline.md`

**Interfaces:**
- Consumes: the configured provider and local test-card directory.
- Produces: a redacted JSON/Markdown metrics summary; never copies source images
  or extracted PII into the repository.

- [ ] **Step 1: Add the explicit evaluation command**

Add:

```json
"eval:business-card-ocr": "tsx scripts/evaluate-business-card-ocr.ts"
```

The script accepts `--input-dir`, reports filename, validity, latency, tokens,
estimated cost, and review-issue counts, and prints no extracted values.

- [ ] **Step 2: Run the three-card evaluation**

Run:

```bash
npm run eval:business-card-ocr -- --input-dir /Users/xzhao/Documents/business-card
```

Expected: three successful structured results, no raw field output, and metrics
consistent with the baseline report.

- [ ] **Step 3: Update architecture documentation**

Document:

- paid Gemini cloud processing and key fallback;
- no raw-image persistence;
- confirmed-contact write ownership;
- duplicate stop;
- separate invitation confirmation;
- `ready_for_delivery` semantics when email delivery is unconfigured.

- [ ] **Step 4: Run complete focused verification**

Run:

```bash
npm test -- tests/capabilities/business-card-cloud-ocr.test.ts tests/capabilities/business-card-scan-ocr-live-store.test.ts tests/capabilities/business-card-scan-ocr-mock.test.ts tests/capabilities/business-card-contact-write.test.ts tests/capabilities/contact-invitation-staged.test.ts tests/pages/app-business-card-capture-workspace.test.tsx tests/pages/app-contacts-new-live-route-services.test.ts
npm run lint
npx gitnexus detect-changes
git diff --check
```

Expected: all focused tests pass, type/lint pass, GitNexus reports only expected
Acquisition/Contacts/Followups/UI flows, and no whitespace errors remain.

- [ ] **Step 5: Visually verify the product route**

At desktop, compact desktop, and mobile widths verify:

- capture entry dominance;
- local preview orientation and replacement;
- processing and failure feedback;
- field editing and evidence rail;
- separate contact and invitation confirmations;
- keyboard focus and reduced-motion behavior.

- [ ] **Step 6: Commit**

```bash
git add scripts/evaluate-business-card-ocr.ts package.json features/acquisition/DESIGN.md features/contacts/DESIGN.md features/followups/DESIGN.md docs/architecture/modules/acquisition.md docs/architecture/modules/contacts.md docs/architecture/modules/followups.md docs/evaluations/2026-07-24-business-card-ocr-baseline.md
git commit -m "docs: verify business card capture workflow"
```
