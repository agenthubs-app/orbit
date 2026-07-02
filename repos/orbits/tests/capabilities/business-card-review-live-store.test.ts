import assert from "node:assert/strict";
import test from "node:test";

import { PATCH as updateDraft } from "../../app/api/contact-drafts/[id]/route";
import { POST as confirmDraft } from "../../app/api/contact-drafts/[id]/confirm/route";
import { createLiveBusinessCardReviewService } from "../../features/acquisition/live-business-card-review-service";
import { createBusinessCardReviewService } from "../../features/acquisition/service-factory";
import { createStorageBusinessCardReviewProvider } from "../../features/acquisition/storage/business-card-review-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:business-card-review-live-test";
const NOW = "2026-07-02T14:10:00.000Z";
const LIVE_DRAFT_ID = "business-card-review:live:contact_012";

async function createSeedStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => NOW,
    store,
    workspaceId: WORKSPACE_ID,
  });

  return store;
}

test("business card review live service derives review drafts from business-card contacts without writes", async () => {
  const store = await createSeedStore();
  const provider = createStorageBusinessCardReviewProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveBusinessCardReviewService({
    now: () => NOW,
    provider,
  });
  const contactsBefore = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  }).length;
  const contactDraftsBefore = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  }).length;

  const lookup = await service.getReviewDraft({
    draftId: LIVE_DRAFT_ID,
  });
  const update = await service.updateReviewDraft({
    draftId: LIVE_DRAFT_ID,
    reviewedFields: {
      email: "chihiro.yamada@example.test",
      phone: "+81-90-0000-0012",
    },
    reviewerLabel: "Live reviewer",
  });
  const confirm = await service.confirmReviewedDraft({
    actorLabel: "Live operator",
    draftId: LIVE_DRAFT_ID,
  });
  const contactsAfter = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  }).length;
  const contactDraftsAfter = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  }).length;

  assert.equal(lookup.success, true);
  assert.equal(lookup.data.state, "success");
  assert.equal(lookup.data.reviewDraft?.id, LIVE_DRAFT_ID);
  assert.equal(lookup.data.reviewDraft?.displayName, "山田 千尋");
  assert.equal(lookup.data.reviewDraft?.source.type, "business_card_ocr");
  assert.equal(lookup.data.reviewDraft?.ocrProviderCalled, false);
  assert.equal(lookup.data.reviewDraft?.contactWriteExecuted, false);
  assert.equal(lookup.data.reviewDraft?.databaseWriteExecuted, false);
  assert.equal(lookup.data.provenance.privacy, "live-business-card-review");
  assert.equal(lookup.data.provenance.generationMethod, "live-store-query");
  assert.equal(lookup.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(lookup.data.provenance.databaseWriteExecuted, false);

  assert.equal(update.success, true);
  assert.equal(update.data.reviewDraft?.status, "reviewed");
  assert.equal(update.data.reviewDraft?.reviewedBy, "Live reviewer");
  assert.equal(
    update.data.reviewDraft?.extractedFields.email.reviewState,
    "edited",
  );
  assert.equal(
    update.data.reviewDraft?.extractedFields.email.reviewedValue,
    "chihiro.yamada@example.test",
  );
  assert.equal(update.data.reviewEvidence?.createdBy, "live-business-card-review-service");
  assert.equal(update.data.provenance.databaseWriteExecuted, false);

  assert.equal(confirm.success, true);
  assert.equal(confirm.data.confirmedDraft.status, "confirmed");
  assert.equal(confirm.data.confirmedDraft.confirmation.actorLabel, "Live operator");
  assert.equal(confirm.data.createdEvidence.createdBy, "live-business-card-review-service");
  assert.equal(confirm.data.contactCandidate.readyForContactWrite, true);
  assert.equal(confirm.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(confirm.data.provenance.databaseWriteExecuted, false);

  assert.equal(contactsBefore, defaultMockFixtures.contacts.length);
  assert.equal(contactsAfter, contactsBefore);
  assert.equal(contactDraftsAfter, contactDraftsBefore);
});

test("business card review live service fails closed when storage is unconfigured", async () => {
  const service = createLiveBusinessCardReviewService({
    provider: null,
  });

  const result = await service.getReviewDraft({
    draftId: LIVE_DRAFT_ID,
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-business-card-review");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("business card review factory exposes live mode without breaking default mock", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;

  try {
    delete process.env.ORBIT_MODULE_MODE;
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const mock = createBusinessCardReviewService("mock").getReviewDraft({
      draftId: "demo-business-card-draft",
    });
    const live = await createBusinessCardReviewService("live").getReviewDraft({
      draftId: LIVE_DRAFT_ID,
    });

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("business card review API resolves ORBIT_MODULE_MODE=live for live draft ids", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousFeatureMode = process.env.ORBIT_FEATURE_MODE;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    delete process.env.ORBIT_FEATURE_MODE;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;
    delete process.env.ORBIT_DATABASE_URL;

    const updateResponse = await updateDraft(
      new Request(`https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}`, {
        method: "PATCH",
      }),
      {
        params: Promise.resolve({ id: LIVE_DRAFT_ID }),
      },
    );
    const confirmResponse = await confirmDraft(
      new Request(
        `https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}/confirm`,
        {
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({ id: LIVE_DRAFT_ID }),
      },
    );
    const updateBody = await updateResponse.json();
    const confirmBody = await confirmResponse.json();

    assert.equal(updateResponse.status, 503);
    assert.equal(updateResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(updateBody.success, false);
    assert.equal(
      updateBody.error.context.businessCardReviewErrorCode,
      "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(updateBody.error.context.service, "business-card-review-live");

    assert.equal(confirmResponse.status, 503);
    assert.equal(confirmResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(confirmBody.success, false);
    assert.equal(
      confirmBody.error.context.businessCardReviewErrorCode,
      "BUSINESS_CARD_REVIEW_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(confirmBody.error.context.service, "business-card-review-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
