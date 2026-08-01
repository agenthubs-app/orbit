import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactDraftGetHandler,
  createContactDraftPatchHandler,
} from "../../app/api/contact-drafts/[id]/handler";
import { createConfirmContactDraftHandler } from "../../app/api/contact-drafts/[id]/confirm/handler";
import { createLiveBusinessCardReviewService } from "../../features/acquisition/live-business-card-review-service";
import { createBusinessCardReviewService } from "../../features/acquisition/service-factory";
import {
  BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS,
  createStorageBusinessCardReviewProvider,
} from "../../features/acquisition/storage/business-card-review-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:business-card-review-live-test";
const ACTOR_ID = "account:business-card-review-owner";
const NOW = "2026-07-02T14:10:00.000Z";
const LIVE_DRAFT_ID = "business-card-review:live:contact_012";

async function createSeedStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => NOW,
    store,
    workspaceId: WORKSPACE_ID,
  });
  const actorRecords = store
    .listRecords({ workspaceId: WORKSPACE_ID })
    .filter(
      (record) =>
        record.collectionName === "contacts" ||
        record.collectionName === "evidence",
    );

  await Promise.all(
    actorRecords.map((record) =>
      store.upsertRecord({
        ...record,
        userId: ACTOR_ID,
      }),
    ),
  );

  return store;
}

test("business card review live service persists actor-scoped review drafts without writing contacts", async () => {
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
  const reviewDraftsBefore = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName:
      BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
  }).length;

  const lookup = await service.getReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
  });
  const update = await service.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
    reviewedFields: {
      email: "chihiro.yamada@example.test",
      phone: "+81-90-0000-0012",
    },
    reviewerLabel: "Live reviewer",
  });
  const failedUpdate = await service.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
    reviewedFields: {
      email: "must-not-be-persisted@example.test",
    },
    reviewerLabel: "Live reviewer",
    scenario: "failure",
  });
  const repeatedUpdate = await service.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
    reviewedFields: {
      email: "chihiro.yamada@example.test",
      phone: "+81-90-0000-0012",
    },
    reviewerLabel: "Live reviewer",
  });
  const refreshedService = createLiveBusinessCardReviewService({
    now: () => NOW,
    provider,
  });
  const refreshedLookup = await refreshedService.getReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
  });
  const confirm = await refreshedService.confirmReviewedDraft({
    actorId: ACTOR_ID,
    actorLabel: "Live operator",
    draftId: LIVE_DRAFT_ID,
  });
  const foreignLookup = await service.getReviewDraft({
    actorId: "account:other-business-card-review-owner",
    draftId: LIVE_DRAFT_ID,
  });
  const foreignPersistedReview =
    await provider.readBusinessCardReviewDraft(
      "account:other-business-card-review-owner",
      LIVE_DRAFT_ID,
    );
  const contactsAfter = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  }).length;
  const contactDraftsAfter = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  }).length;
  const reviewDraftRecords = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName:
      BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
  });

  assert.equal(lookup.success, true);
  assert.equal(lookup.data.state, "success");
  assert.equal(lookup.data.reviewDraft?.id, LIVE_DRAFT_ID);
  assert.equal(
    lookup.data.reviewDraft?.displayName,
    defaultMockFixtures.contacts.find((contact) => contact.id === "contact_012")
      ?.displayName,
  );
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
  assert.equal(update.data.reviewDraft?.databaseWriteExecuted, true);
  assert.equal(update.data.provenance.databaseWriteExecuted, true);
  assert.equal(failedUpdate.success, false);
  assert.equal(failedUpdate.error.code, "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED");
  assert.equal(repeatedUpdate.success, true);
  assert.equal(
    repeatedUpdate.data.reviewDraft?.reviewedAt,
    update.data.reviewDraft?.reviewedAt,
  );
  assert.equal(
    repeatedUpdate.data.provenance.databaseWriteExecuted,
    false,
  );
  assert.equal(refreshedLookup.success, true);
  assert.equal(refreshedLookup.data.reviewDraft?.status, "reviewed");
  assert.equal(
    refreshedLookup.data.reviewDraft?.extractedFields.email.reviewedValue,
    "chihiro.yamada@example.test",
  );
  assert.equal(refreshedLookup.data.reviewDraft?.databaseWriteExecuted, false);
  assert.equal(
    refreshedLookup.data.provenance.databaseWriteExecuted,
    false,
  );

  assert.equal(confirm.success, true);
  assert.equal(confirm.data.confirmedDraft.status, "confirmed");
  assert.equal(confirm.data.confirmedDraft.confirmation.actorLabel, "Live operator");
  assert.equal(confirm.data.createdEvidence.createdBy, "live-business-card-review-service");
  assert.equal(confirm.data.contactCandidate.readyForContactWrite, true);
  assert.equal(confirm.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(
    confirm.data.contactCandidate.email,
    "chihiro.yamada@example.test",
  );
  assert.equal(confirm.data.provenance.databaseWriteExecuted, true);
  assert.equal(foreignLookup.success, true);
  assert.equal(foreignLookup.data.state, "empty");
  assert.equal(foreignLookup.data.reviewDraft, null);
  assert.equal(foreignPersistedReview, null);

  assert.equal(contactsBefore, defaultMockFixtures.contacts.length);
  assert.equal(contactsAfter, contactsBefore);
  assert.equal(contactDraftsAfter, contactDraftsBefore);
  assert.equal(reviewDraftRecords.length, reviewDraftsBefore + 1);
  assert.equal(reviewDraftRecords[0]?.userId, ACTOR_ID);
  assert.equal(
    (
      reviewDraftRecords[0]?.payload.reviewedFields as {
        email?: string;
      }
    )?.email,
    "chihiro.yamada@example.test",
  );
});

test("business card review live service fails closed when review-draft persistence fails", async () => {
  const store = await createSeedStore();
  const storageProvider = createStorageBusinessCardReviewProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveBusinessCardReviewService({
    now: () => NOW,
    provider: {
      ...storageProvider,
      upsertBusinessCardReviewDraft() {
        throw new Error("controlled review-draft write failure");
      },
    },
  });

  const result = await service.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
    reviewedFields: {
      displayName: "Must not persist",
    },
    reviewerLabel: "Live reviewer",
  });
  const reviewDraftRecords = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName:
      BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_REVIEW_LIVE_STORE_FAILED");
  assert.equal(reviewDraftRecords.length, 0);
});

test("business card review live service fails closed when storage is unconfigured", async () => {
  const service = createLiveBusinessCardReviewService({
    provider: null,
  });

  const result = await service.getReviewDraft({
    actorId: ACTOR_ID,
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
      actorId: ACTOR_ID,
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

    const updateResponse = await createContactDraftPatchHandler(async () => ({
      id: ACTOR_ID,
      name: "Live reviewer",
    }))(
      new Request(`https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}`, {
        method: "PATCH",
      }),
      {
        params: Promise.resolve({ id: LIVE_DRAFT_ID }),
      },
    );
    const confirmResponse = await createConfirmContactDraftHandler(async () => ({
      id: ACTOR_ID,
      name: "Live operator",
    }))(
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

test("business card review requires an actor and draft APIs reject unauthenticated access", async () => {
  let graphRead = false;
  const service = createLiveBusinessCardReviewService({
    provider: {
      source: "test",
      sourceLabel: "test",
      readBusinessCardReviewGraph() {
        graphRead = true;
        return {
          contacts: [],
          evidence: [],
          generatedAt: NOW,
        };
      },
      readBusinessCardReviewDraft() {
        return null;
      },
      upsertBusinessCardReviewDraft() {
        throw new Error("must not write without an actor");
      },
      confirmBusinessCardReviewDraft() {
        throw new Error("must not confirm without an actor");
      },
    },
  });
  const serviceResult = await service.getReviewDraft({
    actorId: "",
    draftId: LIVE_DRAFT_ID,
  });
  const context = {
    params: Promise.resolve({ id: LIVE_DRAFT_ID }),
  };
  const getResponse = await createContactDraftGetHandler(async () => null)(
    new Request(`https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}`),
    context,
  );
  const patchResponse = await createContactDraftPatchHandler(async () => null)(
    new Request(`https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}`, {
      method: "PATCH",
    }),
    context,
  );
  const confirmResponse = await createConfirmContactDraftHandler(
    async () => null,
  )(
    new Request(
      `https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}/confirm`,
      { method: "POST" },
    ),
    context,
  );

  assert.equal(serviceResult.success, false);
  assert.equal(serviceResult.error.code, "BUSINESS_CARD_REVIEW_ACTOR_REQUIRED");
  assert.equal(graphRead, false);
  assert.equal(getResponse.status, 401);
  assert.equal(patchResponse.status, 401);
  assert.equal(confirmResponse.status, 401);
});

test("business card review confirmation persists and survives cold readback idempotently", async () => {
  const store = await createSeedStore();
  const provider = createStorageBusinessCardReviewProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  let tick = 0;
  const service = createLiveBusinessCardReviewService({
    now: () => {
      tick += 1;

      return tick === 1 ? NOW : `2026-07-02T14:2${Math.min(tick, 9)}:00.000Z`;
    },
    provider,
  });

  await service.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
    reviewedFields: { email: "confirmed.readback@example.test" },
    reviewerLabel: "Live reviewer",
  });
  const [first, second] = await Promise.all([
    service.confirmReviewedDraft({
      actorId: ACTOR_ID,
      actorLabel: "Live operator",
      draftId: LIVE_DRAFT_ID,
    }),
    service.confirmReviewedDraft({
      actorId: ACTOR_ID,
      actorLabel: "Live operator",
      draftId: LIVE_DRAFT_ID,
    }),
  ]);
  const third = await service.confirmReviewedDraft({
    actorId: ACTOR_ID,
    actorLabel: "Live operator",
    draftId: LIVE_DRAFT_ID,
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(third.success, true);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(first.data.confirmedDraft.status, "confirmed");
  assert.equal(first.data.provenance.databaseWriteExecuted, true);

  const persisted = await provider.readBusinessCardReviewDraft(
    ACTOR_ID,
    LIVE_DRAFT_ID,
  );

  assert.equal(persisted?.status, "confirmed");
  assert.equal(persisted?.confirmedBy, "Live operator");

  const coldService = createLiveBusinessCardReviewService({
    now: () => "2026-07-02T15:00:00.000Z",
    provider: createStorageBusinessCardReviewProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const coldLookup = await coldService.getReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
  });

  assert.equal(coldLookup.success, true);
  assert.equal(coldLookup.data.reviewDraft?.status, "confirmed");
  assert.equal(
    coldLookup.data.reviewDraft?.confirmation.state,
    "confirmed",
  );
  assert.equal(
    coldLookup.data.reviewDraft?.confirmation.confirmedAt,
    persisted?.confirmedAt,
  );

  const reSave = await coldService.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
    reviewedFields: { email: "post.confirm.edit@example.test" },
    reviewerLabel: "Live reviewer",
  });

  assert.equal(reSave.success, true);
  assert.equal(
    reSave.data.reviewDraft?.status,
    "confirmed",
    "a review edit after confirmation must not downgrade the persisted confirmed state",
  );
});

test("cloud business card drafts can be reviewed, confirmed, and read back without a contacts row", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageBusinessCardReviewProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveBusinessCardReviewService({
    now: () => NOW,
    provider,
  });
  const cloudDraftId = "business-card-review:cloud:0123456789abcdef01234567";

  const patch = await service.updateReviewDraft({
    actorId: ACTOR_ID,
    draftId: cloudDraftId,
    reviewedFields: {
      displayName: "Cloud Card Person",
      organization: "Cloud Org",
      email: "cloud.card@example.test",
    },
    reviewerLabel: "Live reviewer",
  });

  assert.equal(patch.success, true);
  assert.equal(patch.data.reviewDraft?.id, cloudDraftId);
  assert.equal(patch.data.reviewDraft?.status, "reviewed");
  assert.equal(patch.data.provenance.databaseWriteExecuted, true);

  const confirm = await service.confirmReviewedDraft({
    actorId: ACTOR_ID,
    actorLabel: "Live operator",
    draftId: cloudDraftId,
  });

  assert.equal(confirm.success, true);
  assert.equal(confirm.data.confirmedDraft.id, cloudDraftId);
  assert.equal(confirm.data.confirmedDraft.status, "confirmed");
  assert.equal(
    confirm.data.contactCandidate.displayName,
    "Cloud Card Person",
  );

  const readback = await service.getReviewDraft({
    actorId: ACTOR_ID,
    draftId: cloudDraftId,
  });

  assert.equal(readback.success, true);
  assert.equal(readback.data.reviewDraft?.id, cloudDraftId);
  assert.equal(readback.data.reviewDraft?.status, "confirmed");

  const foreign = await service.confirmReviewedDraft({
    actorId: "account:business-card-review-foreign",
    actorLabel: "Foreign operator",
    draftId: cloudDraftId,
  });

  assert.equal(foreign.success, false);
  assert.equal(
    foreign.error.code,
    "BUSINESS_CARD_REVIEW_DRAFT_NOT_FOUND",
  );
  assert.equal(
    store.listRecords({
      workspaceId: WORKSPACE_ID,
      collectionName: "contacts",
    }).length,
    0,
  );
});

test("confirming an unreviewed business card draft still fails closed as pending", async () => {
  const store = await createSeedStore();
  const service = createLiveBusinessCardReviewService({
    now: () => NOW,
    provider: createStorageBusinessCardReviewProvider({
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const confirm = await service.confirmReviewedDraft({
    actorId: ACTOR_ID,
    actorLabel: "Live operator",
    draftId: LIVE_DRAFT_ID,
  });

  assert.equal(confirm.success, false);
  assert.equal(confirm.error.code, "BUSINESS_CARD_REVIEW_PENDING");

  const persisted = await createStorageBusinessCardReviewProvider({
    store,
    workspaceId: WORKSPACE_ID,
  }).readBusinessCardReviewDraft(ACTOR_ID, LIVE_DRAFT_ID);

  assert.equal(persisted, null);
});
