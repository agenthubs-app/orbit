import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ZodType } from "zod";

import { createBusinessCardBatchDetailHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/handler";
import { createBusinessCardBatchItemConfirmHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/confirm/handler";
import { createBusinessCardBatchItemActionHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/actions-shared";
import { createBusinessCardBatchFinishHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/finish/handler";
import * as handlers from "../../app/api/contact-drafts/business-card/batches/v2/handlers";
import type { BusinessCardBatchDTO, BusinessCardBatchItemDTO } from "../../features/acquisition/business-card-batch-contract";
import type { BusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import type { IngestBatchDTO, IngestItemDTO, IngestBatchSummary } from "../../features/acquisition/business-card-ingest-v2/contract";
import { createBusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const now = "2026-09-10T00:00:00.000Z";
const digest = `sha256:${"a".repeat(64)}`;
const resolveActor = async () => ({ id: "actor:batch-schema" });
const extraction: BusinessCardStructuredExtraction = {
  fullName: "  Aki Example  ", nativeFullName: "Native name", romanizedFullName: "Aki Example",
  organization: "Example Inc.", departments: ["Research", "Sales"], title: "Director",
  emails: [{ label: null, value: "aki@example.test" }, { label: "office", value: "office@example.test" }],
  contactPoints: ["phone", "mobile", "fax", "wechat", "line", "whatsapp", "website", "other"].map((type) => ({
    type: type as BusinessCardStructuredExtraction["contactPoints"][number]["type"], label: "Office", value: "visible value",
  })),
  website: "https://example.test", addresses: [{ label: "HQ", value: "1 Example Street" }, { label: null, value: "2 Example Street" }],
  certifications: ["PE"], detectedLanguages: ["ja", "en"],
};
const usage = { inputTokens: 10, outputTokens: 5, latencyMs: 1.5 };
const legacyBatch: BusinessCardBatchDTO = {
  id: "batch:legacy", actorId: "actor:batch-schema", status: "ready_for_review", totalItems: 1,
  processedItems: 1, failedItems: 0, confirmedItems: 0, skippedItems: 0,
  sourceFiles: [{ fileName: "card.pdf", kind: "pdf", itemCount: 1 }], createdAt: now, updatedAt: now, expiresAt: now,
};
const legacyItem: BusinessCardBatchItemDTO = {
  id: "item:legacy", batchId: legacyBatch.id, actorId: legacyBatch.actorId, seq: 1,
  sourceFileName: "card.pdf", sourcePage: 1, status: "extracted", imagePath: "local/card.jpg",
  imageDigest: digest, uploadMimeType: "image/jpeg", extraction,
  reviewIssues: [{ code: "INVALID_PHONE", field: "contactPoints", message: "Review visible value" }],
  usage, errorCode: null, attempts: 1, leaseOwner: null, leasedAt: null, confirmedContactId: null,
  createdAt: now, updatedAt: now,
};
const batch: IngestBatchDTO = {
  id: "batch:current", actorId: "actor:batch-schema", status: "collecting", expectedItems: 1,
  version: 1, reviewGeneration: 0, idempotencyKey: "key:fixture", manifestFingerprint: "a".repeat(64),
  statusReason: null, createdAt: now, updatedAt: now, finalizedAt: null, expiresAt: now,
};
const item: IngestItemDTO = {
  id: "item:current", batchId: batch.id, seq: 1, status: "awaiting_upload", version: 1,
  sourceFileName: "card.heic", rawSize: 100, rawMimeType: "image/heic", clientDigest: digest,
  imageDigest: null, derivativeObjectKey: null, derivativeSize: null, extraction: null,
  extractionSchemaVersion: null, reviewIssues: [], usage: null, confirmedContactId: null,
  attemptCount: 0, nextRetryAt: null, leaseExpiresAt: null, errorStage: null, errorCode: null,
  createdAt: now, updatedAt: now,
};
const summary: IngestBatchSummary = {
  batch, counts: { awaitingUpload: 1, uploaded: 0, excluded: 0, queuedReady: 0, queuedWaitingRetry: 0,
    processing: 0, extracted: 0, terminalFailed: 0, confirmed: 0, skipped: 0 },
};
const manifest = { fileName: "card.heic", mimeType: "image/heic", rawSize: 100, seq: 1, clientDigest: digest };
const reviewInput = { displayName: "Aki Example", organization: "Example Inc.", role: "Director",
  email: "aki@example.test", phone: "", relationshipContext: "Met at event", notes: "Keep this text", allowDuplicate: false };

// Missing exports fail as named assertions during RED, not as an import crash.
async function schema(name: string): Promise<ZodType> {
  const module = await import("../../shared/api-schema/business-card-batch").catch((error: NodeJS.ErrnoException) => {
    assert.ok(error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND", String(error));
    return {};
  });
  const result = (module as Record<string, ZodType>)[name];
  assert.ok(result, `Missing runtime schema: ${name}`);
  return result;
}

const validFixtures: Record<string, unknown> = {
  businessCardStructuredExtractionSchema: extraction,
  businessCardReviewIssueSchema: legacyItem.reviewIssues[0], businessCardCloudOcrUsageSchema: usage,
  businessCardBatchSchema: legacyBatch, businessCardBatchItemSchema: legacyItem,
  businessCardBatchDetailSchema: { batch: legacyBatch, items: [legacyItem] },
  businessCardBatchConfirmationResponseSchema: { state: "created", contactId: "contact:new" },
  businessCardBatchRetryResponseSchema: { state: "pending" }, businessCardBatchSkipResponseSchema: { state: "skipped" },
  businessCardBatchFinishResponseSchema: { state: "completed" }, businessCardBatchReviewInputSchema: reviewInput,
  ingestManifestEntrySchema: manifest, ingestBatchSchema: batch, ingestItemSchema: item,
  ingestBatchSummarySchema: summary, ingestBatchDetailSchema: { batch, items: [item] },
  ingestBatchCollectionResponseSchema: { batches: [batch] }, ingestBatchCreateResponseSchema: { batch, items: [item], reused: false },
  ingestItemActionResponseSchema: { item }, ingestUploadResponseSchema: { item, alreadyUploaded: false },
  ingestBatchActionResponseSchema: { batch }, ingestFinalizeResponseSchema: { batch, alreadyFinalized: false },
  ingestConfirmationResponseSchema: { state: "created", contactId: "contact:new", item: { ...item, status: "confirmed", confirmedContactId: "contact:new" } },
};

for (const [name, value] of Object.entries(validFixtures)) {
  test(`${name} preserves the complete fixture and rejects omitted required fields`, async () => {
    const validator = await schema(name);
    assert.deepEqual(validator.parse(value), value);
    for (const key of Object.keys(value as object)) {
      if (name === "businessCardBatchReviewInputSchema" && key === "allowDuplicate") continue;
      assert.equal(validator.safeParse({ ...value as object, [key]: undefined }).success, false, key);
    }
    for (const invalid of [null, [], "wrong", 1]) assert.equal(validator.safeParse(invalid).success, false);
  });
}

test("legacy processing projection alone permits omitted extraction", async () => {
  const validator = await schema("businessCardBatchDetailSchema");
  const { extraction: _extraction, ...projected } = legacyItem;
  const processing = { batch: { ...legacyBatch, status: "processing" }, items: [projected] };
  assert.deepEqual(validator.parse(processing), processing);
  for (const status of ["ready_for_review", "completed"]) {
    assert.equal(validator.safeParse({ ...processing, batch: { ...legacyBatch, status } }).success, false);
  }
  assert.equal((await schema("businessCardBatchItemSchema")).safeParse(projected).success, false);
  assert.equal((await schema("ingestBatchDetailSchema")).safeParse({ batch: { ...batch, status: "processing" }, items: [{ ...item, extraction: undefined }] }).success, false);
});

test("nullable extraction fields, labels, leases and usage retain null and full values", async () => {
  const emptyExtraction = { ...extraction, fullName: null, nativeFullName: null, romanizedFullName: null,
    organization: null, title: null, website: null, emails: [], addresses: [], contactPoints: [] };
  assert.deepEqual((await schema("businessCardStructuredExtractionSchema")).parse(emptyExtraction), emptyExtraction);
  const legacy = { ...legacyItem, sourcePage: null, imagePath: null, extraction: null, usage: null, leasedAt: now, leaseOwner: "worker:1", errorCode: "OCR_PROVIDER_FAILED" };
  assert.deepEqual((await schema("businessCardBatchItemSchema")).parse(legacy), legacy);
  const full = { ...item, status: "extracted", imageDigest: digest, derivativeObjectKey: "card.jpg", derivativeSize: 100,
    extraction, extractionSchemaVersion: 1, reviewIssues: legacyItem.reviewIssues, usage, nextRetryAt: now, leaseExpiresAt: now,
    errorStage: "ocr", errorCode: "OCR_INVALID_OUTPUT" };
  assert.deepEqual((await schema("ingestItemSchema")).parse(full), full);
  assert.equal((await schema("businessCardBatchReviewInputSchema")).safeParse({ ...reviewInput, allowDuplicate: undefined }).success, true);
});

test("all source enum members remain accepted without a second state machine", async () => {
  for (const [name, fixture, field, values] of [
    ["businessCardBatchSchema", legacyBatch, "status", ["processing", "ready_for_review", "completed"]],
    ["businessCardBatchItemSchema", legacyItem, "status", ["pending", "processing", "extracted", "failed", "confirmed", "skipped"]],
    ["businessCardBatchItemSchema", legacyItem, "errorCode", ["OCR_PROVIDER_FAILED", "OCR_PROVIDER_TIMEOUT", "OCR_INVALID_OUTPUT"]],
    ["ingestBatchSchema", batch, "status", ["collecting", "processing", "ready_for_review", "completed", "cancelled", "expired"]],
    ["ingestItemSchema", item, "status", ["awaiting_upload", "uploaded", "excluded", "queued", "processing", "extracted", "terminal_failed", "confirmed", "skipped"]],
    ["ingestItemSchema", item, "errorStage", ["normalize", "ocr", "lease"]],
    ["ingestItemSchema", item, "errorCode", ["IMAGE_INVALID", "OCR_PROVIDER_FAILED", "OCR_PROVIDER_TIMEOUT", "OCR_INVALID_OUTPUT", "LEASE_EXHAUSTED"]],
    ["businessCardReviewIssueSchema", legacyItem.reviewIssues[0], "code", ["IDENTITY_MISSING", "INVALID_EMAIL", "INVALID_PHONE", "MULTIPLE_OFFICES", "SHARED_CONTACT_VALUE", "NATIVE_ROMANIZED_NAME_CONFLICT", "ORG_SUFFIX_MISSING", "VERIFICATION_MISMATCH"]],
  ] as const) {
    const validator = await schema(name);
    for (const value of values) assert.equal(validator.safeParse({ ...fixture, [field]: value }).success, true, `${name}:${value}`);
    assert.equal(validator.safeParse({ ...fixture, [field]: "invented" }).success, false);
  }
});

test("detail and create reject cross-batch and legacy cross-actor items", async () => {
  for (const name of ["ingestBatchDetailSchema", "ingestBatchCreateResponseSchema"]) {
    assert.equal((await schema(name)).safeParse({ batch, items: [{ ...item, batchId: "batch:other" }], reused: false }).success, false);
  }
  for (const override of [{ batchId: "batch:other" }, { actorId: "actor:other" }]) {
    assert.equal((await schema("businessCardBatchDetailSchema")).safeParse({ batch: legacyBatch, items: [{ ...legacyItem, ...override }] }).success, false);
  }
});

test("IDs, versions, counters, timestamps and digests reject malformed values", async () => {
  for (const [name, fixture, fields] of [
    ["businessCardBatchSchema", legacyBatch, ["id", "actorId"]],
    ["businessCardBatchItemSchema", legacyItem, ["id", "batchId", "actorId"]],
    ["ingestBatchSchema", batch, ["id", "actorId", "idempotencyKey"]],
    ["ingestItemSchema", item, ["id", "batchId"]],
  ] as const) {
    for (const field of fields) for (const value of ["", "  ", null, 42]) {
      assert.equal((await schema(name)).safeParse({ ...fixture, [field]: value }).success, false, `${name}:${field}`);
    }
    assert.equal((await schema(name)).safeParse({ ...fixture, createdAt: "yesterday" }).success, false);
  }
  for (const name of ["ingestBatchSchema", "ingestItemSchema"]) {
    for (const version of [0, -1, 0.5, "1", null, Infinity, NaN]) {
      assert.equal((await schema(name)).safeParse({ ...(name === "ingestBatchSchema" ? batch : item), version }).success, false);
    }
  }
  for (const count of [-1, 0.5, "1", null, Infinity]) {
    assert.equal((await schema("ingestBatchSummarySchema")).safeParse({ ...summary, counts: { ...summary.counts, queuedWaitingRetry: count } }).success, false);
  }
  for (const clientDigest of ["", "a".repeat(64), "sha256:xyz"]) {
    assert.equal((await schema("ingestManifestEntrySchema")).safeParse({ ...manifest, clientDigest }).success, false);
    assert.equal((await schema("ingestItemSchema")).safeParse({ ...item, clientDigest }).success, false);
  }
  for (const invalid of [{ rawSize: 0 }, { seq: 0 }, { rawSize: -1 }, { rawSize: 1.5 }]) {
    assert.equal((await schema("ingestManifestEntrySchema")).safeParse({ ...manifest, ...invalid }).success, false);
  }
});

test("extraction nested fields are required and malformed contact points and usage fail", async () => {
  const validator = await schema("businessCardStructuredExtractionSchema");
  for (const value of [
    { ...extraction, emails: [{ value: "a@example.test" }] },
    { ...extraction, addresses: [{ label: null, value: 42 }] },
    { ...extraction, contactPoints: [{ label: null, value: "id", type: "telegram" }] },
    { ...extraction, contactPoints: [{ label: null, type: "wechat" }] },
    { ...extraction, detectedLanguages: [42] },
  ]) assert.equal(validator.safeParse(value).success, false);
  for (const value of [{ ...usage, inputTokens: -1 }, { ...usage, outputTokens: "5" }, { ...usage, latencyMs: Infinity }]) {
    assert.equal((await schema("businessCardCloudOcrUsageSchema")).safeParse(value).success, false);
  }
});

test("confirmation schemas distinguish duplicate review, legacy ack and current confirmed item", async () => {
  const legacy = await schema("businessCardBatchConfirmationResponseSchema");
  const current = await schema("ingestConfirmationResponseSchema");
  const duplicate = { state: "duplicate_review", duplicateContactId: "contact:existing" };
  assert.deepEqual(legacy.parse(duplicate), duplicate);
  assert.deepEqual(current.parse(duplicate), duplicate);
  for (const validator of [legacy, current]) for (const invalid of [
    { state: "duplicate_review" }, { ...duplicate, duplicateContactId: "" }, { ...duplicate, item },
    { ...duplicate, contactId: "contact:new" }, { state: "created" }, { state: "pending" },
  ]) assert.equal(validator.safeParse(invalid).success, false);
  const created = validFixtures.ingestConfirmationResponseSchema as { state: string; contactId: string; item: IngestItemDTO };
  assert.equal(legacy.safeParse(created).success, false);
  assert.equal(current.safeParse({ state: "created", contactId: "contact:new" }).success, false);
  assert.equal(current.safeParse({ ...created, item: { ...created.item, confirmedContactId: "contact:other" } }).success, false);
  assert.equal(current.safeParse({ ...created, item }).success, false);
  for (const [name, valid] of Object.entries(validFixtures).filter(([name]) => /(?:Retry|Skip|Finish)ResponseSchema$/.test(name))) {
    assert.equal((await schema(name)).safeParse({ ...valid as object, item }).success, false);
  }
});

function params<T extends Record<string, string>>(value: T) { return { params: Promise.resolve(value) }; }
function request(body?: unknown) {
  return new Request("http://orbit.local/fixture", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}
async function parsedResponse(name: string, response: Response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual((await schema(name)).parse(body.data), body.data);
  return body.data;
}

test("unchanged legacy handlers produce processing/detail and distinct action acknowledgments", async () => {
  let currentBatch = legacyBatch;
  const service: BusinessCardBatchService = {
    async getBatch() { return { batch: currentBatch, items: [legacyItem] }; },
    async confirmItem() {}, async retryItem() {}, async skipItem() {}, async finishBatch() {},
    async createBatch() { throw new Error("unused fixture dependency"); },
    async listBatches() { throw new Error("unused fixture dependency"); },
    async claimPendingItems() { throw new Error("unused fixture dependency"); },
    async completeItem() { throw new Error("unused fixture dependency"); },
    async failItem() { throw new Error("unused fixture dependency"); },
    async sweepExpired() { throw new Error("unused fixture dependency"); },
  };
  const context = params({ id: legacyBatch.id, itemId: legacyItem.id });
  const detail = createBusinessCardBatchDetailHandler(resolveActor, service);
  await parsedResponse("businessCardBatchDetailSchema", await detail(request(), context));
  currentBatch = { ...legacyBatch, status: "processing" };
  const processing = await parsedResponse("businessCardBatchDetailSchema", await detail(request(), context));
  assert.equal("extraction" in processing.items[0], false);
  for (const state of ["created", "duplicate_review"] as const) {
    const confirm = createBusinessCardBatchItemConfirmHandler(resolveActor, service, {
      async confirmBusinessCardContact(input) {
        return { success: true, data: { state, contactId: "contact:new", duplicateContactId: state === "duplicate_review" ? "contact:existing" : null,
          confirmedAt: now, contactWriteExecuted: state === "created", evidenceIds: input.evidenceIds } };
      },
    });
    const data = await parsedResponse("businessCardBatchConfirmationResponseSchema", await confirm(request(reviewInput), context));
    assert.deepEqual(data, state === "created" ? { state, contactId: "contact:new" } : { state, duplicateContactId: "contact:existing" });
  }
  for (const [action, name, state] of [["retry", "businessCardBatchRetryResponseSchema", "pending"], ["skip", "businessCardBatchSkipResponseSchema", "skipped"]] as const) {
    assert.deepEqual(await parsedResponse(name, await createBusinessCardBatchItemActionHandler(action, resolveActor, service)(request(), context)), { state });
  }
  assert.deepEqual(await parsedResponse("businessCardBatchFinishResponseSchema", await createBusinessCardBatchFinishHandler(resolveActor, service)(request(), context)), { state: "completed" });
});

test("unchanged current handlers emit exact wrappers with injected local repository and image storage", {
  skip: process.env.ORBIT_EVENT_DATABASE_URL ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  assert.equal(databaseUrl, "postgresql://xzhao@127.0.0.1:5432/orbit_merge_verify_20260907_c45a", "Only the owned scratch database is allowed");
  const schemaName = `bc_schema_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  let pool: Pool | undefined;
  try {
    await admin.query(`create schema ${schemaName}`);
    pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schemaName}` });
    const client = await pool.connect();
    try { await runBusinessCardIngestV2Migrations(client); await runOrbitRecordsMigration(client); }
    finally { client.release(); }
    const workspaceId = "test:remote-sync-20260907";
    const deps: handlers.IngestV2HandlerDeps = {
      resolveActor, isOcrProviderConfigured: () => true,
      runtime: { ready: Promise.resolve(), workspaceId, repository: createBusinessCardIngestRepository({ pool, workspaceId }),
        store: { async put(bytes) { return { objectKey: `fixture:${randomUUID()}`, size: bytes.length }; }, async get() { return null; }, async delete() {} } },
    };
    const bytes = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
    const uploadDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const collection = handlers.createIngestV2CollectionHandlers(deps);
    const payload = { idempotencyKey: "schema-key", manifest: [1, 2, 3, 4].map((seq) => ({ fileName: `card-${seq}.jpg`, mimeType: "image/jpeg", rawSize: bytes.length, seq, clientDigest: uploadDigest })) };
    const created = await parsedResponse("ingestBatchCreateResponseSchema", await collection.POST(request(payload)), 201);
    assert.equal(created.reused, false);
    assert.equal((await parsedResponse("ingestBatchCreateResponseSchema", await collection.POST(request(payload)))).reused, true);
    await parsedResponse("ingestBatchCollectionResponseSchema", await collection.GET());
    const id = created.batch.id as string;
    const items = created.items as IngestItemDTO[];
    const detail = handlers.createIngestV2BatchDetailHandler(deps);
    await parsedResponse("ingestBatchDetailSchema", await detail(request(), params({ id })));
    await parsedResponse("ingestBatchSummarySchema", await detail(new Request("http://orbit.local/fixture?view=summary"), params({ id })));
    const content = () => new Request("http://orbit.local/fixture", { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new Uint8Array(bytes) });
    for (const entry of items) {
      const context = params({ id, itemId: entry.id });
      assert.equal((await parsedResponse("ingestUploadResponseSchema", await handlers.createIngestV2UploadHandler(deps)(content(), context))).alreadyUploaded, false);
    }
    assert.equal((await parsedResponse("ingestUploadResponseSchema", await handlers.createIngestV2UploadHandler(deps)(content(), params({ id, itemId: items[0].id })))).alreadyUploaded, true);
    const replaceRequest = content(); replaceRequest.headers.set("if-match", "2");
    await parsedResponse("ingestItemActionResponseSchema", await handlers.createIngestV2ReplaceHandler(deps)(replaceRequest, params({ id, itemId: items[3].id })));
    await parsedResponse("ingestItemActionResponseSchema", await handlers.createIngestV2ExcludeHandler(deps)(request(), params({ id, itemId: items[3].id })));
    assert.equal((await parsedResponse("ingestFinalizeResponseSchema", await handlers.createIngestV2FinalizeHandler(deps)(request(), params({ id })))).alreadyFinalized, false);
    assert.equal((await parsedResponse("ingestFinalizeResponseSchema", await handlers.createIngestV2FinalizeHandler(deps)(request(), params({ id })))).alreadyFinalized, true);
    // Fixture seeding replaces OCR only; confirmation still uses its real transaction and contact writer.
    await pool.query("update bc_ingest_items set status = 'extracted', extraction = $1::jsonb where batch_id = $2 and status <> 'excluded'", [JSON.stringify(extraction), id]);
    const confirmed = await parsedResponse("ingestConfirmationResponseSchema", await handlers.createIngestV2ConfirmHandler(deps)(request(reviewInput), params({ id, itemId: items[0].id })));
    assert.equal(confirmed.state, "created");
    assert.equal(confirmed.contactId, confirmed.item.confirmedContactId);
    const duplicate = await parsedResponse("ingestConfirmationResponseSchema", await handlers.createIngestV2ConfirmHandler(deps)(request(reviewInput), params({ id, itemId: items[1].id })));
    assert.deepEqual(duplicate, { state: "duplicate_review", duplicateContactId: confirmed.contactId });
    await pool.query("update bc_ingest_items set status = 'terminal_failed', error_code = 'OCR_PROVIDER_TIMEOUT', error_stage = 'ocr' where id = $1", [items[2].id]);
    await parsedResponse("ingestItemActionResponseSchema", await handlers.createIngestV2RetryHandler(deps)(request(), params({ id, itemId: items[2].id })));
    await pool.query("update bc_ingest_items set status = 'terminal_failed', extraction = null where id = $1", [items[2].id]);
    assert.equal((await parsedResponse("ingestConfirmationResponseSchema", await handlers.createIngestV2ManualEntryHandler(deps)(request({ ...reviewInput, displayName: "Another person", email: "another@example.test" }), params({ id, itemId: items[2].id })))).state, "created");
    await parsedResponse("ingestItemActionResponseSchema", await handlers.createIngestV2SkipHandler(deps)(request(), params({ id, itemId: items[1].id })));
    const cancelBatch = await parsedResponse("ingestBatchCreateResponseSchema", await collection.POST(request({ ...payload, idempotencyKey: "cancel-key" })), 201);
    await parsedResponse("ingestBatchActionResponseSchema", await handlers.createIngestV2CancelHandler(deps)(request(), params({ id: cancelBatch.batch.id })));
  } finally {
    await pool?.end();
    await admin.query(`drop schema if exists ${schemaName} cascade`);
    await admin.end();
  }
});
