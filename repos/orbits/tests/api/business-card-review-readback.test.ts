import assert from "node:assert/strict";
import test from "node:test";
import { createContactDraftGetHandler, createContactDraftPatchHandler } from "../../app/api/contact-drafts/[id]/handler";
import { createLiveBusinessCardReviewService } from "../../features/acquisition/live-business-card-review-service";
import { createLiveBusinessCardScanOcrService } from "../../features/acquisition/live-business-card-scan-service";
import { businessCardReviewServiceFactory, businessCardScanOcrServiceFactory } from "../../features/acquisition/service-factory";
import { createStorageBusinessCardReviewProvider } from "../../features/acquisition/storage/business-card-review-live-record-provider";
import { createStorageBusinessCardScanOcrProvider } from "../../features/acquisition/storage/business-card-scan-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("HTTP PATCH then GET returns the saved cloud card review, including cleared values", async (t) => {
  const workspaceId = "workspace:card-http-readback";
  const actorId = "actor:card-http-readback";
  const draftId = "business-card-review:cloud:0123456789abcdef01234567";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const reviewResolution = businessCardReviewServiceFactory.create("mock");
  const scanResolution = businessCardScanOcrServiceFactory.create("mock");
  // Replace only factory configuration: handlers, live services, record
  // providers, actor scoping and the in-memory store remain real. A new
  // service instance for every call proves readback is not in-process state.
  t.mock.method(businessCardReviewServiceFactory, "create", () => ({
    ...reviewResolution,
    service: createLiveBusinessCardReviewService({
      provider: createStorageBusinessCardReviewProvider({ store, workspaceId })
    })
  }));
  t.mock.method(businessCardScanOcrServiceFactory, "create", () => ({
    ...scanResolution,
    service: createLiveBusinessCardScanOcrService({
      provider: createStorageBusinessCardScanOcrProvider({ store, workspaceId })
    })
  }));
  const actor = async () => ({ id: actorId, name: "Card Reviewer" });
  const context = { params: Promise.resolve({ id: draftId }) };
  const url = `https://orbit.test/api/contact-drafts/${encodeURIComponent(draftId)}`;
  const reviewedFields = { displayName: "Reviewed Person", organization: "", role: "", email: "", phone: "" };
  const patch = await createContactDraftPatchHandler(actor)(new Request(url, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ reviewedFields })
  }), context);
  assert.equal(patch.status, 200);
  const patchBody = await patch.json();
  assert.equal(patchBody.success, true);

  const response = await createContactDraftGetHandler(actor)(new Request(url), context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.reviewDraft.id, draftId);
  assert.equal(body.data.reviewDraft.status, "reviewed");
  for (const [field, value] of Object.entries(reviewedFields)) {
    assert.equal(body.data.reviewDraft[field], value);
  }
  assert.equal(store.listRecords({ workspaceId, collectionName: "contacts" }).length, 0);

  const foreign = await createContactDraftGetHandler(async () => ({ id: "other-actor" }))(new Request(url), context);
  const foreignBody = await foreign.json();
  assert.equal(foreignBody.data?.reviewDraft ?? null, null);
});
