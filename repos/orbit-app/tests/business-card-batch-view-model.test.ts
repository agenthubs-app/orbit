import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessCardBatchDetailContract, BusinessCardStructuredExtractionContract } from "../src/api/contract/business-card-batch";
import type { ApiResult } from "../src/api/types";
import { acceptedLegacyBatch, acceptedLegacyConfirmation, businessCardReviewFields, legacyBatchPath, legacyBatchPresentation, reconcileBusinessCardReviewDraft } from "../src/view-models/business-card-batch";

export const extraction: BusinessCardStructuredExtractionContract = {
  fullName: "Misaki Hayashi", nativeFullName: "林 美咲", romanizedFullName: "HAYASHI Misaki",
  organization: "Orbit Labs", title: "Director", departments: ["Research", "Partnerships"],
  emails: [{ label: "Work", value: "one@example.invalid" }, { label: "Personal", value: "two@example.invalid" }],
  contactPoints: [{ type: "wechat", label: "微信", value: "misaki-chat" }, { type: "website", label: "Profile", value: "https://profile.invalid" }, { type: "fax", label: "FAX", value: "03-fax" }, { type: "mobile", label: "携帯", value: "090-primary" }, { type: "phone", label: "Osaka", value: "06-office" }, { type: "line", label: "LINE", value: "misaki-line" }, { type: "whatsapp", label: "WA", value: "misaki-wa" }, { type: "other", label: "Desk", value: "desk-44" }],
  website: "https://orbit.invalid", addresses: [{ label: "Tokyo", value: "Tokyo address" }, { label: "Osaka", value: "Osaka address" }], certifications: ["PhD", "PMP"], detectedLanguages: ["ja", "en"]
};
const stamp = "2026-09-10T00:00:00Z";
test("FinalFix I1 labeled channels deduplicate by meaning, retaining phone fax and messaging labels", () => {
  const fields = businessCardReviewFields({ ...extraction, contactPoints: [
    { type: "phone", label: "Office", value: "0312345678" },
    { type: "fax", label: "Office", value: "0312345678" },
    { type: "fax", label: "Office", value: "0312345678" },
    { type: "wechat", label: "Tokyo", value: "same-account" },
    { type: "whatsapp", label: "Tokyo", value: "same-account" },
  ] });
  assert.equal(fields.phone, "0312345678");
  for (const line of ["phone (Office): 0312345678", "fax (Office): 0312345678", "wechat (Tokyo): same-account", "whatsapp (Tokyo): same-account"]) {
    assert.equal(fields.notes.split("\n").filter(note => note === line).length, 1, line);
  }
});

export function detail(status: BusinessCardBatchDetailContract["batch"]["status"] = "ready_for_review", statuses: BusinessCardBatchDetailContract["items"][number]["status"][] = ["extracted"]): BusinessCardBatchDetailContract {
  return { batch: { id: "batch:/ 空", actorId: "one", status, totalItems: statuses.length, processedItems: statuses.length, failedItems: statuses.filter(s => s === "failed").length, confirmedItems: statuses.filter(s => s === "confirmed").length, skippedItems: statuses.filter(s => s === "skipped").length, sourceFiles: [], createdAt: stamp, updatedAt: stamp, expiresAt: "2099-09-10T00:00:00Z" }, items: statuses.map((status, i) => ({ id: `item:${i}`, batchId: "batch:/ 空", actorId: "one", seq: i + 1, sourceFileName: `card-${i}.png`, sourcePage: null, status, imagePath: "private/object", imageDigest: `sha256:${"a".repeat(64)}`, uploadMimeType: "image/png", extraction, reviewIssues: [{ code: "INVALID_EMAIL", field: "email", message: "核对邮箱" }], usage: null, errorCode: status === "failed" ? "OCR_PROVIDER_FAILED" : null, attempts: 1, leaseOwner: null, leasedAt: null, confirmedContactId: status === "confirmed" ? "contact:/ 空" : null, createdAt: stamp, updatedAt: stamp })) };
}
function ok(data: unknown, status = 200): ApiResult<unknown> { return { success: true, data, status, meta: { featureMode: null, privacy: null, runtimeBoundary: null } }; }

test("complete extraction preserves every unused printed value and label, not language metadata", () => {
  const fields = businessCardReviewFields(extraction);
  assert.deepEqual({ ...fields, notes: "" }, { displayName: "林 美咲", organization: "Orbit Labs", role: "Director", email: "one@example.invalid", phone: "090-primary", relationshipContext: "", notes: "" });
  for (const retained of ["Misaki Hayashi", "HAYASHI Misaki", "Research", "Partnerships", "Personal", "two@example.invalid", "微信", "misaki-chat", "Profile", "https://profile.invalid", "FAX", "03-fax", "Osaka", "06-office", "LINE", "misaki-line", "WA", "misaki-wa", "Desk", "desk-44", "https://orbit.invalid", "Tokyo", "Tokyo address", "Osaka address", "PhD", "PMP"]) assert.ok(fields.notes.includes(retained), retained);
  assert.ok(!fields.notes.includes("detectedLanguages")); assert.ok(!fields.notes.split(/\s+/).includes("ja"));
});
test("phone ignores all non-phone/mobile values and CJK native selection retains distinct names", () => {
  assert.equal(businessCardReviewFields({ ...extraction, contactPoints: extraction.contactPoints.filter(p => p.type !== "mobile" && p.type !== "phone") }).phone, "");
  assert.equal(businessCardReviewFields({ ...extraction, nativeFullName: "김민수" }).displayName, "김민수");
  assert.equal(businessCardReviewFields({ ...extraction, nativeFullName: "Latin native" }).displayName, "Misaki Hayashi");
  assert.equal(businessCardReviewFields(null).notes, "");
});
test("paths encode each batch/item segment and never use object-store image paths", () => {
  const base = "/api/contact-drafts/business-card/batches/batch%3A%2F%20%E7%A9%BA";
  assert.equal(legacyBatchPath("batch:/ 空"), base);
  for (const action of ["confirm", "retry", "skip", "image"] as const) assert.equal(legacyBatchPath("batch:/ 空", "item:/ 空", action), `${base}/items/item%3A%2F%20%E7%A9%BA/${action}`);
  assert.equal(legacyBatchPath("batch:/ 空", undefined, "finish"), `${base}/finish`);
});

for (const selectedType of ["phone", "mobile"] as const) for (const alternateType of ["fax", "wechat", "other"] as const) test(`same-valued unlabeled ${alternateType} survives selected ${selectedType}`, () => {
  const fields = businessCardReviewFields({ ...extraction, contactPoints: [
    { type: selectedType, label: null, value: "0312345678" },
    { type: alternateType, label: null, value: "0312345678" },
  ] });
  assert.equal(fields.phone, "0312345678");
  assert.ok(fields.notes.split("\n").includes(`${alternateType}: 0312345678`), fields.notes);
  assert.ok(!fields.notes.split("\n").includes(`${selectedType}: 0312345678`));
});
test("selection stays on the current unresolved item; processing polls; settled failures may finish", () => {
  assert.deepEqual(legacyBatchPresentation(detail("processing", ["processing", "extracted"]), "item:1"), { selectedId: "item:1", polling: true, canFinish: false });
  assert.equal(legacyBatchPresentation(detail("ready_for_review", ["confirmed", "extracted", "failed"]), "item:0").selectedId, "item:1");
  assert.equal(legacyBatchPresentation(detail("ready_for_review", ["confirmed", "skipped", "failed"]), null).canFinish, true);
  assert.equal(legacyBatchPresentation(detail("completed", ["confirmed", "failed"]), null).polling, false);
  assert.equal(legacyBatchPresentation(detail("completed", ["confirmed", "failed"]), null).canFinish, false);
});
test("detail requires HTTP, schema, batch/actor identity and complete distinct items", () => {
  const d = detail(); assert.deepEqual(acceptedLegacyBatch(ok(d), d.batch.id, "one"), d);
  for (const invalid of [ok(d, 503), ok({}), ok({ ...d, items: [] }), ok({ ...d, items: [...d.items, ...d.items] })]) assert.equal(acceptedLegacyBatch(invalid, d.batch.id, "one"), null);
  assert.equal(acceptedLegacyBatch(ok(d), "other", "one"), null); assert.equal(acceptedLegacyBatch(ok(d), d.batch.id, "two"), null);
  const processing = detail("processing"); const { extraction: _, ...projected } = processing.items[0]!;
  assert.ok(acceptedLegacyBatch(ok({ ...processing, items: [projected] }), d.batch.id, "one"));
});
test("confirmation only accepts exact created/contactId or duplicate_review/duplicateContactId at HTTP2xx", () => {
  for (const data of [{ state: "created", contactId: "contact:/ 空" }, { state: "duplicate_review", duplicateContactId: "duplicate" }]) assert.deepEqual(acceptedLegacyConfirmation(ok(data)), data);
  for (const data of [{ state: "created" }, { state: "created", contactId: " " }, { state: "duplicate_review", contactId: "c" }, { state: "created", contactId: "c", extra: true }]) assert.equal(acceptedLegacyConfirmation(ok(data)), null);
  assert.equal(acceptedLegacyConfirmation(ok({ state: "created", contactId: "c" }, 409)), null);
});

test("canonical account owner is bound by the first scoped read, not guessed from a session subject", () => {
  const d = detail();
  assert.deepEqual(acceptedLegacyBatch(ok(d), d.batch.id, null), d);
  assert.equal(acceptedLegacyBatch(ok(d), d.batch.id, "different-owner"), null);
});

test("confirmed items require a contact identity and sequences must be distinct", () => {
  const d = detail("ready_for_review", ["confirmed"]);
  assert.equal(acceptedLegacyBatch(ok({ ...d, items: [{ ...d.items[0], confirmedContactId: null }] }), d.batch.id, null), null);
  const two = detail("ready_for_review", ["extracted", "extracted"]);
  assert.equal(acceptedLegacyBatch(ok({ ...two, items: two.items.map(item => ({ ...item, seq: 1 })) }), d.batch.id, null), null);
});

test("review draft reconciliation preserves intentional edits and treats omitted extraction as a projection", () => {
  const initial = { fields: businessCardReviewFields(extraction), dirty: false };
  const edited = { fields: { ...initial.fields, notes: "Intentional replacement", displayName: "Reviewed name" }, dirty: true };
  assert.deepEqual(reconcileBusinessCardReviewDraft(extraction, undefined), initial);
  assert.equal(reconcileBusinessCardReviewDraft(extraction, edited), edited);
  assert.equal(reconcileBusinessCardReviewDraft(undefined, edited, true), edited);
  assert.equal(reconcileBusinessCardReviewDraft(undefined, initial), initial);
  assert.equal(reconcileBusinessCardReviewDraft(null, edited), edited);
  assert.deepEqual(reconcileBusinessCardReviewDraft(extraction, edited, true), initial);
  assert.equal(reconcileBusinessCardReviewDraft(null, initial), null);
});
