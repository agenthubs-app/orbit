import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { prepareBatchImages, type BatchImageNative, type PreparedBatchImage } from "../src/api/batch-images";
import type { IngestBatchDetailContract } from "../src/api/contract/business-card-batch";
import * as ingest from "../src/view-models/business-card-ingest";
import { activatePendingIdentity, clearPendingFiles, pendingFiles, rememberPendingFiles, retainPendingIdentity } from "../src/screens/contacts/business-card-pending-files";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"));
const digest = "sha256:" + createHash("sha256").update(png).digest("hex");
const file: PreparedBatchImage = { uri: "file:///card.png", fileName: "card.png", mimeType: "image/png", rawSize: png.length, clientDigest: digest };
const native: BatchImageNative = { openFile: async () => ({ exists: true, size: png.length, bytes: async () => png }), sha256: async bytes => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer };
const stamp = "2026-09-10T00:00:00Z";
for (const later of [200, 409, 410, 503]) test("FinalFix I2 upload404 stops once, stays quarantined with late " + later, async () => {
  const d = detail(4);
  const replies: ((response: Response) => void)[] = [];
  const unavailable: number[] = [];
  const failure = (status: number) => new Response(JSON.stringify({ success: false, error: { code: status === 404 ? "NOT_FOUND" : "FAILED", message: "unavailable" } }), { status, headers: { "content-type": "application/json" } });
  const client = createOrbitApiClient({ fetchImpl: async () => {
    if (replies.length >= 2) { replies.push(() => {}); return failure(503); }
    return new Promise<Response>(resolve => replies.push(resolve));
  } });
  const options = { client, detail: d, files: new Map(d.items.map(i => [i.id, file])), signal: new AbortController().signal, isCurrent: () => true, native, onUnavailable: (status: number) => unavailable.push(status) };
  const pending = ingest.uploadPendingPass(options);
  while (replies.length < 2) await new Promise(resolve => setImmediate(resolve));
  replies[0]!(failure(404));
  await new Promise(resolve => setImmediate(resolve));
  const immediate = [...unavailable];
  replies[1]!(later === 200 ? new Response(JSON.stringify({ success: true, data: { item: { ...d.items[1], status: "uploaded", version: 2 }, alreadyUploaded: false } }), { headers: { "content-type": "application/json" } }) : failure(later));
  const result = await pending;
  assert.deepEqual(immediate, [404], "revoke authority before the other in-flight upload settles");
  assert.equal(replies.length, 2, "no third or fourth dispatch after NOT_FOUND");
  assert.equal(result.recovery, true);
  assert.equal(result.gone, later === 410, "404 must not assert definitive Gone");
  assert.equal(result.uploaded.length, later === 200 ? 1 : 0, "already-dispatched exact acknowledgment remains scope-owned");
});

for (const statuses of [[409, 410], [410, 409], [410, 503]]) test("Fix1 concurrent uploads preserve Gone for response order " + statuses.join(","), async () => {
  const d = detail(3);
  const replies: ((response: Response) => void)[] = [];
  let started!: () => void;
  const bothStarted = new Promise<void>(resolve => { started = resolve; });
  const client = createOrbitApiClient({ fetchImpl: async () => new Promise<Response>(resolve => { replies.push(resolve); if (replies.length === 2) started(); }) });
  const pending = ingest.uploadPendingPass({ client, detail: d, files: new Map(d.items.map(i => [i.id, file])), signal: new AbortController().signal, isCurrent: () => true, native });
  await bothStarted;
  const failure = (status: number) => new Response(JSON.stringify({ success: false, error: { code: "FAILED", message: "recover" } }), { status, headers: { "content-type": "application/json" } });
  replies[0]!(failure(statuses[0]!));
  await new Promise(resolve => setImmediate(resolve));
  replies[1]!(failure(statuses[1]!));
  const result = await pending;
  assert.equal(result.recovery, true);
  assert.equal(result.gone, true);
  assert.equal(replies.length, 2, "recovery must stop dispatch of the third item");
});
function detail(count = 1): IngestBatchDetailContract {
  return { batch: { id: "batch:/", actorId: "canonical-owner", status: "collecting", expectedItems: count, version: 1, reviewGeneration: 0, idempotencyKey: "key-1", manifestFingerprint: "a".repeat(64), statusReason: null, createdAt: stamp, updatedAt: stamp, finalizedAt: null, expiresAt: "2099-01-01T00:00:00Z" }, items: Array.from({ length: count }, (_, i) => ({ id: "item:" + i, batchId: "batch:/", seq: i + 1, status: "awaiting_upload", version: 1, sourceFileName: "card.png", rawSize: png.length, rawMimeType: "image/png", clientDigest: digest, imageDigest: null, derivativeObjectKey: null, derivativeSize: null, extraction: null, extractionSchemaVersion: null, reviewIssues: [], usage: null, confirmedContactId: null, attemptCount: 0, nextRetryAt: null, leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: stamp, updatedAt: stamp })) };
}
const ok = (data: unknown, status = 200) => ({ success: true as const, data, status, meta: { featureMode: null, privacy: null, runtimeBoundary: null } });

test("Task5 replacement validates new image digest but preserves original manifest identity", () => {
  for (const [batchStatus, itemStatus, nextStatus] of [["collecting", "uploaded", "uploaded"], ["processing", "terminal_failed", "queued"], ["ready_for_review", "terminal_failed", "queued"]] as const) {
    const d = detail(); d.batch.status = batchStatus;
    const old = { ...d.items[0]!, status: itemStatus };
    const replacement = { ...file, clientDigest: "sha256:" + "b".repeat(64), rawSize: 100, mimeType: "image/jpeg" as const };
    const item = { ...old, status: nextStatus, version: 2, imageDigest: replacement.clientDigest, derivativeObjectKey: "private/new", derivativeSize: 80 };
    assert.equal(ingest.acceptedIngestReview(ok({ item }), d, old, "replace", replacement)?.state, "accepted");
    for (const patch of [{ imageDigest: old.clientDigest }, { clientDigest: replacement.clientDigest }, { rawSize: 100 }, { rawMimeType: replacement.mimeType }, { derivativeObjectKey: null }, { derivativeSize: null }, { id: "other" }, { batchId: "other" }, { seq: 2 }, { version: 1 }, { status: "extracted" }]) {
      assert.equal(ingest.acceptedIngestReview(ok({ item: { ...item, ...patch } }), d, old, "replace", replacement), null, JSON.stringify(patch));
    }
    assert.equal(ingest.acceptedIngestReview(ok({ item }, 503), d, old, "replace", replacement), null);
  }
});
test("Task5 explicit retry covers every terminal error independently of automatic worker limits", () => {
  for (const status of ["processing", "ready_for_review"] as const) for (const errorCode of ["IMAGE_INVALID", "LEASE_EXHAUSTED", "OCR_PROVIDER_FAILED", "OCR_PROVIDER_TIMEOUT", "OCR_INVALID_OUTPUT"] as const) {
    const d = detail(); d.batch.status = status;
    const old = { ...d.items[0]!, status: "terminal_failed" as const, errorCode, attemptCount: 999 };
    assert.equal(ingest.canReviewIngest(d, old, "retry"), true);
    assert.equal(ingest.canReviewIngest(d, old, "manual-entry"), true);
    assert.equal(ingest.canReviewIngest(d, old, "confirm"), false);
    assert.equal(ingest.acceptedIngestReview(ok({ item: { ...old, status: "queued", version: 2, attemptCount: 0, errorCode: null } }), d, old, "retry")?.state, "accepted");
  }
});
test("Task5 review acknowledgments reject stale versions, state and contact inconsistencies", () => {
  const d = detail(); d.batch.status = "ready_for_review";
  const old = { ...d.items[0]!, status: "extracted" as const };
  const item = { ...old, status: "confirmed" as const, version: 2, confirmedContactId: "contact" };
  assert.equal(ingest.acceptedIngestReview(ok({ state: "created", contactId: "contact", item }), d, old, "confirm")?.state, "accepted");
  for (const patch of [{ id: "other" }, { batchId: "other" }, { version: 1 }, { version: 0 }, { seq: 2 }, { status: "extracted" }, { confirmedContactId: "other" }, { clientDigest: "sha256:" + "b".repeat(64) }]) {
    assert.equal(ingest.acceptedIngestReview(ok({ state: "created", contactId: "contact", item: { ...item, ...patch } }), d, old, "confirm"), null);
  }
  for (const status of ["completed", "cancelled", "expired", "collecting"] as const) {
    assert.equal(ingest.canReviewIngest({ ...d, batch: { ...d.batch, status } }, old, "confirm"), false);
  }
});

test("creation freezes manifest/key across ambiguous retry and changes key on manifest edits", () => {
  const files = [{ ...file }]; let keys = 0;
  const first = ingest.creationAttempt(files, null, () => "key-" + ++keys);
  assert.ok(first);
  assert.deepEqual(first.manifest, [{ fileName: "card.png", mimeType: "image/png", rawSize: png.length, seq: 1, clientDigest: digest }]);
  assert.equal(ingest.creationAttempt(files, first, () => "key-" + ++keys), first);
  files[0]!.fileName = "changed.png";
  assert.equal(ingest.creationAttempt(files, first, () => "key-" + ++keys).idempotencyKey, "key-2");
  assert.equal(first.manifest[0]!.fileName, "card.png"); assert.equal(Object.isFrozen(first.manifest[0]), true);
});
test("creation enforces nonempty, 100-image and 10 MiB raw limits", () => {
  assert.throws(() => ingest.creationAttempt([], null, () => "k"));
  assert.ok(ingest.creationAttempt(Array(100).fill({ ...file, rawSize: 10485760 }), null, () => "k"));
  assert.throws(() => ingest.creationAttempt(Array(101).fill(file), null, () => "k"));
  assert.throws(() => ingest.creationAttempt([{ ...file, rawSize: 10485761 }], null, () => "k"));
});
test("create requires HTTP2xx, schema, same key and exact manifest without equating owner to session subject", () => {
  const attempt = ingest.creationAttempt([file], null, () => "key-1"); const d = detail();
  assert.ok(ingest.acceptedIngestCreate(ok({ ...d, reused: false }), attempt));
  for (const data of [{ ...d }, { ...d, reused: false, batch: { ...d.batch, idempotencyKey: "other" } }, { ...d, reused: false, items: [{ ...d.items[0], clientDigest: "sha256:" + "b".repeat(64) }] }]) assert.equal(ingest.acceptedIngestCreate(ok(data), attempt), null);
  assert.equal(ingest.acceptedIngestCreate(ok({ ...d, reused: true }, 503), attempt), null);
});
test("detail validates requested batch, canonical owner, parents, duplicate IDs/sequence and counts", () => {
  const d = detail(2);
  assert.ok(ingest.acceptedIngestDetail(ok(d), "batch:/", null));
  assert.equal(ingest.acceptedIngestDetail(ok(d), "other", null), null);
  assert.equal(ingest.acceptedIngestDetail(ok(d), "batch:/", "other-owner"), null);
  for (const items of [[d.items[0]], [d.items[0], d.items[0]], [d.items[0], { ...d.items[1], batchId: "wrong" }]]) assert.equal(ingest.acceptedIngestDetail(ok({ ...d, items }), "batch:/", null), null);
});
test("collections validate actual wrappers, HTTP status and consistent owners", () => {
  const batch = detail().batch;
  assert.equal(ingest.acceptedBatchCollection(ok({ batches: [batch] }), "current")?.[0]?.id, "batch:/");
  assert.equal(ingest.acceptedBatchCollection(ok({ batches: [batch, { ...batch, id: "two", actorId: "other" }] }), "current"), null);
  assert.equal(ingest.acceptedBatchCollection(ok({ batches: [batch] }, 503), "current"), null);
  assert.equal(ingest.acceptedBatchCollection(ok({ batch }), "legacy"), null);
});
test("resume after memory loss matches digest/bytes/MIME, not name, and reports unmatched files", () => {
  const d = detail(); const renamed = { ...file, uri: "file:///reselected.png", fileName: "renamed.png" };
  const wrong = { ...file, clientDigest: "sha256:" + "b".repeat(64) };
  const resumed = ingest.matchPendingFiles(d, [wrong, renamed]);
  assert.equal(resumed.matched.get("item:0")?.uri, renamed.uri); assert.deepEqual(resumed.unmatched, [wrong]);
  assert.equal(ingest.matchPendingFiles(d, [{ ...file, mimeType: "image/heic" }]).matched.size, 0);
  assert.equal(ingest.matchPendingFiles({ ...d, batch: { ...d.batch, status: "expired" } }, [file]).matched.size, 0);
});
test("finalize requires collecting, no awaiting uploads, a nonexcluded uploaded item and unexpired batch", () => {
  const d = detail(); assert.equal(ingest.canFinalizeIngest(d), false);
  const uploaded = { ...d, items: [{ ...d.items[0]!, status: "uploaded" as const }] };
  assert.equal(ingest.canFinalizeIngest(uploaded), true);
  assert.equal(ingest.canFinalizeIngest({ ...uploaded, batch: { ...d.batch, status: "cancelled" } }), false);
  assert.equal(ingest.canFinalizeIngest({ ...uploaded, batch: { ...d.batch, expiresAt: stamp } }), false);
  assert.equal(ingest.canFinalizeIngest({ ...d, items: [{ ...d.items[0]!, status: "excluded" }] }), false);
});
test("content and replacement paths encode both identifiers", () => {
  assert.equal(ingest.itemContentPath("batch:/", "item:/"), "/api/contact-drafts/business-card/batches/v2/batch%3A%2F/items/item%3A%2F/content");
  assert.equal(ingest.itemReplacePath("batch:/", "item:/"), "/api/contact-drafts/business-card/batches/v2/batch%3A%2F/items/item%3A%2F/replace");
});
test("raw upload uses exact rechecked bytes, two workers, one attempt per item per trigger and no finalize", async () => {
  const d = detail(5); const files = new Map(d.items.map(i => [i.id, file]));
  let inFlight = 0, peak = 0; const paths: string[] = [];
  const client = createOrbitApiClient({ fetchImpl: async (url, init) => {
    const path = new URL(String(url)).pathname; paths.push(path); peak = Math.max(peak, ++inFlight);
    assert.equal(init?.method, "PUT"); assert.equal(init?.body, png); assert.equal(new Headers(init?.headers).get("content-type"), "image/png");
    await new Promise(r => setTimeout(r, 5)); inFlight--;
    return new Response(JSON.stringify({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "retry explicitly" } }), { status: 503, headers: { "content-type": "application/json" } });
  } });
  const run = () => ingest.uploadPendingPass({ client, detail: d, files, signal: new AbortController().signal, isCurrent: () => true, native });
  const first = await run(); assert.equal(paths.length, 5); assert.equal(peak, 2); assert.equal(new Set(paths).size, 5); assert.equal(first.failed.length, 5);
  await run(); assert.equal(paths.length, 10);
});
test("upload rejects wrong bytes, stale scope, terminal batches and mismatched action replies", async () => {
  const d = detail(); let requests = 0;
  const client = createOrbitApiClient({ fetchImpl: async () => { requests++; return new Response(JSON.stringify({ success: true, data: { item: { ...d.items[0], id: "wrong", status: "uploaded" }, alreadyUploaded: false } }), { headers: { "content-type": "application/json" } }); } });
  const args = { client, detail: d, files: new Map([["item:0", file]]), signal: new AbortController().signal, isCurrent: () => true, native };
  assert.equal((await ingest.uploadPendingPass(args)).failed.length, 1); assert.equal(requests, 1);
  await ingest.uploadPendingPass({ ...args, isCurrent: () => false });
  await ingest.uploadPendingPass({ ...args, detail: { ...d, batch: { ...d.batch, status: "cancelled" } } });
  await ingest.uploadPendingPass({ ...args, files: new Map([["item:0", { ...file, clientDigest: "sha256:" + "b".repeat(64) }]]) });
  assert.equal(requests, 1);
  let current = true;
  await ingest.uploadPendingPass({ ...args, isCurrent: () => current, native: { ...native, openFile: async () => { current = false; return { exists: true, size: png.length, bytes: async () => png }; } } });
  assert.equal(requests, 1);
});
test("installed helper boundary prepares original bytes without retaining raw arrays", async () => {
  const prepared = await prepareBatchImages([{ uri: file.uri, mimeType: "image/heic" }], { native });
  assert.equal(prepared[0]?.mimeType, "image/png"); assert.equal(prepared[0]?.clientDigest, digest);
});

test("pending URI ownership is isolated by server/subject/readiness/batch and clears on last owner unmount", async () => {
  const d = detail();
  const one = activatePendingIdentity("https://one.invalid", "subject", true);
  const release = retainPendingIdentity(one);
  const scope = { identity: one, batchId: d.batch.id };
  assert.deepEqual(rememberPendingFiles(scope, d, [file]), []);
  assert.equal(pendingFiles(scope, d).get("item:0")?.uri, file.uri);
  assert.equal(pendingFiles({ ...scope, batchId: "other" }, d).size, 0);
  const two = activatePendingIdentity("https://one.invalid", "other-subject", true);
  assert.equal(pendingFiles(scope, d).size, 0);
  assert.deepEqual(rememberPendingFiles(scope, d, [file]), [file]);
  const second = { identity: two, batchId: d.batch.id };
  rememberPendingFiles(second, d, [file]);
  activatePendingIdentity("https://two.invalid", "other-subject", true);
  assert.equal(pendingFiles(second, d).size, 0);
  const ready = activatePendingIdentity("https://two.invalid", "other-subject", true);
  rememberPendingFiles({ identity: ready, batchId: d.batch.id }, d, [file]);
  activatePendingIdentity("https://two.invalid", "other-subject", false);
  assert.equal(pendingFiles({ identity: ready, batchId: d.batch.id }, d).size, 0);
  release();
  const last = activatePendingIdentity("https://one.invalid", "subject", true);
  const stop = retainPendingIdentity(last);
  const final = { identity: last, batchId: d.batch.id };
  rememberPendingFiles(final, d, [file]); stop(); await Promise.resolve();
  assert.equal(pendingFiles(final, d).size, 0);
});
test("pending handoff survives overlapping route owners but removes cancelled/completed/expired entries", async () => {
  const identity = activatePendingIdentity("https://one.invalid", "subject", true);
  const scope = { identity, batchId: detail().batch.id };
  const start = retainPendingIdentity(identity); const next = retainPendingIdentity(identity);
  rememberPendingFiles(scope, detail(), [file]); start(); await Promise.resolve();
  assert.equal(pendingFiles(scope, detail()).size, 1);
  for (const status of ["cancelled", "completed", "expired"] as const) {
    rememberPendingFiles(scope, detail(), [file]);
    assert.equal(pendingFiles(scope, { ...detail(), batch: { ...detail().batch, status } }).size, 0);
    assert.equal(pendingFiles(scope, detail()).size, 0);
  }
  rememberPendingFiles(scope, detail(), [file]); clearPendingFiles(scope);
  assert.equal(pendingFiles(scope, detail()).size, 0); next();
});
test("expired pending entries stay cleared even after a later clock correction", async () => {
  const now = Date.now();
  const d = { ...detail(), batch: { ...detail().batch, expiresAt: new Date(now + 20).toISOString() } };
  const identity = activatePendingIdentity("https://expiry.invalid", "subject", true);
  const scope = { identity, batchId: d.batch.id }; const release = retainPendingIdentity(identity);
  rememberPendingFiles(scope, d, [file]); await new Promise(r => setTimeout(r, 35));
  const original = Date.now; Date.now = () => now;
  try { assert.equal(pendingFiles(scope, d).size, 0); }
  finally { Date.now = original; release(); }
});

test("upload accepts only the exact item's advanced uploaded version under HTTP2xx", async () => {
  const d = detail();
  const uploaded = { ...d.items[0]!, status: "uploaded" as const, version: 2 };
  const args = { detail: d, files: new Map([["item:0", file]]), signal: new AbortController().signal, isCurrent: () => true, native };
  for (const [patch, status, accepted] of [
    [{}, 200, true], [{ id: "other" }, 200, false], [{ batchId: "other" }, 200, false],
    [{ seq: 2 }, 200, false], [{ clientDigest: "sha256:" + "b".repeat(64) }, 200, false],
    [{ rawMimeType: "image/heic" }, 200, false], [{ rawSize: 1 }, 200, false],
    [{ status: "awaiting_upload" }, 200, false], [{ version: 1 }, 200, false],
    [{}, 503, false],
  ] as const) {
    const client = createOrbitApiClient({ fetchImpl: async () => new Response(JSON.stringify({ success: true, data: { item: { ...uploaded, ...patch }, alreadyUploaded: false } }), { status, headers: { "content-type": "application/json" } }) });
    const result = await ingest.uploadPendingPass({ ...args, client });
    assert.equal(result.uploaded.length, accepted ? 1 : 0, JSON.stringify({ patch, status }));
    assert.equal(result.failed.length, accepted ? 0 : 1, JSON.stringify({ patch, status }));
  }
});
