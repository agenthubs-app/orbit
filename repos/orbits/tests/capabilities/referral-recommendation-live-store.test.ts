import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmRecommendedContactPostHandler } from "../../app/api/contact-drafts/recommended/[id]/confirm/handler";
import { createReferralRecommendationPostHandler } from "../../app/api/contact-drafts/referral/handler";
import type { ContactAcquisitionDraft } from "../../features/acquisition/contract";
import { createLiveContactAcquisitionDraftService } from "../../features/acquisition/live-service";
import { createLiveReferralRecommendationService } from "../../features/acquisition/live-referral-service";
import { createReferralRecommendationService } from "../../features/acquisition/service-factory";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import { createStorageReferralRecommendationProvider } from "../../features/acquisition/storage/referral-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:referral-live-test";
const NOW = "2026-07-02T10:20:00.000Z";
const RECOMMENDATION_ID = "recommendation_live_mika";
const SECOND_RECOMMENDATION_ID = "recommendation_live_rin";
const ACTOR_A = "account:referral-a";
const ACTOR_B = "account:referral-b";

function record(
  collectionName: string,
  payload: Record<string, unknown>,
  actorId: string = ACTOR_A,
): LiveRecord<Record<string, unknown>> {
  const recordId =
    typeof payload.id === "string" ? payload.id : `${collectionName}:unknown`;
  const evidenceIds = Array.isArray(payload.evidenceIds)
    ? payload.evidenceIds.filter((item): item is string => typeof item === "string")
    : [`evidence:${collectionName}:${recordId}`];

  return {
    workspaceId: WORKSPACE_ID,
    collectionName,
    recordId,
    userId: actorId,
    sourceType: "referral",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "referral-live-test",
    providerRecordId: recordId,
    evidenceIds,
    targetType: null,
    targetId: null,
    occurredAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    lifecycleState: "active",
    searchText: JSON.stringify(payload),
    payload,
  };
}

function seedRecords(
  actorId: string,
  options: { withSecondRecommendation?: boolean } = {},
): LiveRecord<Record<string, unknown>>[] {
  const records = [
    record("networkPeople", {
      id: "person_live_mika",
      personKind: "external_contact",
      displayName: "三浦 美香",
      organization: "Miura Climate Studio",
      role: "Partnerships Lead",
      profileSnippet: "Works with climate operators on partner pilots.",
      source: {
        type: "referral",
        id: "source:person:mika",
        label: "Live referral target",
      },
      evidenceIds: ["evidence:person:mika"],
      createdAt: NOW,
      updatedAt: NOW,
    }, actorId),
    record("networkPeople", {
      id: "person_live_eli",
      personKind: "external_contact",
      displayName: "Eli Kapoor",
      organization: "Signal Bridge Ventures",
      role: "Seed Investor",
      profileSnippet: "Introduces portfolio operators to climate partners.",
      source: {
        type: "referral",
        id: "source:person:eli",
        label: "Live recommender",
      },
      evidenceIds: ["evidence:person:eli"],
      createdAt: NOW,
      updatedAt: NOW,
    }, actorId),
    record("matchRecommendations", {
      id: RECOMMENDATION_ID,
      eventId: "event_live_referral",
      targetPersonId: "person_live_mika",
      introducedByPersonId: "person_live_eli",
      recommendationType: "warm_intro",
      score: 0.91,
      businessRelevanceScore: 88,
      sharedTopics: ["climate partnerships", "operator pilots"],
      suggestedActions: ["Ask Eli for opt-in before drafting outreach"],
      reason: "Eli can introduce Mika for climate partner pilot context.",
      source: {
        type: "referral",
        id: "source:recommendation:mika",
        label: "Live referral recommendation",
      },
      evidenceIds: ["evidence:recommendation:mika"],
      createdAt: NOW,
      updatedAt: NOW,
    }, actorId),
    record("evidence", {
      id: "evidence:recommendation:mika",
      sourceType: "referral",
      sourceId: "source:recommendation:mika",
      summary:
        "Eli recommended Mika as a warm climate partnerships contact.",
      occurredAt: NOW,
      confidence: 0.91,
      createdBy: "profile_live_operator",
    }, actorId),
    record("evidence", {
      id: "evidence:person:eli",
      sourceType: "referral",
      sourceId: "source:person:eli",
      summary: "Eli has trusted investor intro context.",
      occurredAt: NOW,
      confidence: 0.86,
      createdBy: "profile_live_operator",
    }, actorId),
  ];

  if (options.withSecondRecommendation) {
    records.push(
      record("matchRecommendations", {
        id: SECOND_RECOMMENDATION_ID,
        eventId: "event_live_referral",
        targetPersonId: "person_live_mika",
        introducedByPersonId: "person_live_eli",
        recommendationType: "context_share",
        score: 0.7,
        businessRelevanceScore: 74,
        sharedTopics: ["community referrals"],
        suggestedActions: ["Confirm context before any outreach"],
        reason: "Community members shared Mika's partnership context.",
        source: {
          type: "referral",
          id: "source:recommendation:rin",
          label: "Live referral recommendation",
        },
        evidenceIds: ["evidence:recommendation:mika"],
        createdAt: NOW,
        updatedAt: NOW,
      }, actorId),
    );
  }

  return records;
}

function createSeedStore(
  actorId: string = ACTOR_A,
  options: { withSecondRecommendation?: boolean } = {},
) {
  return createMemoryLiveRecordStore<Record<string, unknown>>(
    seedRecords(actorId, options),
  );
}

function activeContactDrafts(
  store: ReturnType<typeof createSeedStore>,
): readonly LiveRecord<Record<string, unknown>>[] {
  return store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  });
}

test("referral staging persists actor-owned contact drafts to the central queue without contact writes", async () => {
  const store = createSeedStore();
  const provider = createStorageReferralRecommendationProvider({
    actorId: ACTOR_A,
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveReferralRecommendationService({
    now: () => NOW,
    provider,
  });

  const result = await service.createReferralContactDrafts();
  const contacts = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });
  const contactDrafts = activeContactDrafts(store);

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.recommendations.length, 1);
  assert.equal(result.data.contactDrafts.length, 1);
  assert.equal(result.data.recommendations[0]?.id, RECOMMENDATION_ID);
  assert.equal(result.data.recommendations[0]?.displayName, "三浦 美香");
  assert.equal(result.data.recommendations[0]?.sourceKind, "investor_intro");
  assert.equal(result.data.recommendations[0]?.recommender.displayName, "Eli Kapoor");
  assert.equal(result.data.recommendations[0]?.contactWriteExecuted, false);

  const draft = result.data.contactDrafts[0];

  assert.ok(draft);
  assert.match(draft.id, /^referral-draft:live:[a-f0-9]{32}$/);
  assert.doesNotMatch(draft.id, /recommendation_live_mika|account:referral-a/);
  assert.equal(draft.recommendationId, RECOMMENDATION_ID);
  assert.equal(draft.userConfirmed, false);
  assert.equal(draft.contactWriteExecuted, false);
  assert.equal(draft.databaseWriteExecuted, true);
  assert.equal(draft.provenance.contactDraftWriteExecuted, true);

  assert.equal(result.data.provenance.privacy, "live-referral-recommendations");
  assert.equal(result.data.provenance.generationMethod, "live-store-staging");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, true);
  assert.equal(result.data.provenance.contactDraftWriteExecuted, true);
  assert.equal(result.data.provenance.externalNetworkRequested, false);

  assert.equal(contacts.length, 0);
  assert.equal(contactDrafts.length, 1);
  assert.equal(contactDrafts[0]?.userId, ACTOR_A);
  assert.equal(contactDrafts[0]?.recordId, draft.id);

  const storedPayload = contactDrafts[0]?.payload as unknown as
    | ContactAcquisitionDraft
    | undefined;

  assert.equal(storedPayload?.status, "pending_confirmation");
  assert.equal(storedPayload?.confirmation.state, "pending");
  assert.equal(storedPayload?.source.type, "referral");
  assert.equal(
    storedPayload?.evidence[0]?.createdBy,
    "live-referral-recommendation-service",
  );
});

test("referral confirmation persists the confirmed draft state for the owning actor", async () => {
  const store = createSeedStore();
  const provider = createStorageReferralRecommendationProvider({
    actorId: ACTOR_A,
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveReferralRecommendationService({
    now: () => NOW,
    provider,
  });

  const confirmed = await service.confirmRecommendedContact({
    actorLabel: "Live reviewer",
    recommendationId: RECOMMENDATION_ID,
  });
  const contacts = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });
  const contactDrafts = activeContactDrafts(store);

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.confirmedContact.recommendationId, RECOMMENDATION_ID);
  assert.equal(confirmed.data.confirmedContact.displayName, "三浦 美香");
  assert.equal(confirmed.data.confirmedContact.confirmedBy, "Live reviewer");
  assert.equal(confirmed.data.createdEvidence.createdBy, "live-referral-recommendation-service");
  assert.equal(confirmed.data.contactWriteExecuted, false);
  assert.equal(confirmed.data.externalActionExecuted, false);
  assert.equal(confirmed.data.databaseWriteExecuted, true);
  assert.equal(confirmed.data.contactDraftWriteExecuted, true);
  assert.match(
    confirmed.data.contactDraftId ?? "",
    /^referral-draft:live:[a-f0-9]{32}$/,
  );
  assert.equal(
    confirmed.data.confirmedContact.contactDraftId,
    confirmed.data.contactDraftId,
  );
  assert.equal(confirmed.data.confirmedContact.databaseWriteExecuted, true);
  assert.equal(confirmed.data.provenance.privacy, "live-referral-recommendations");
  assert.equal(confirmed.data.provenance.generationMethod, "live-store-confirmation");
  assert.equal(confirmed.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(confirmed.data.provenance.databaseWriteExecuted, true);

  assert.equal(contacts.length, 0);
  assert.equal(contactDrafts.length, 1);
  assert.equal(contactDrafts[0]?.userId, ACTOR_A);

  const storedPayload = contactDrafts[0]?.payload as unknown as
    | ContactAcquisitionDraft
    | undefined;

  assert.equal(storedPayload?.status, "confirmed");
  assert.equal(storedPayload?.confirmation.state, "confirmed");
  assert.equal(storedPayload?.confirmation.confirmedAt, NOW);
  assert.equal(storedPayload?.confirmation.actorLabel, "Live reviewer");
});

test("referral recommendations and staged drafts are isolated by actor ownership", async () => {
  const store = createSeedStore(ACTOR_A);
  const actorAService = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_A,
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const actorBService = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_B,
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const actorAResult = await actorAService.createReferralContactDrafts();
  const actorBResult = await actorBService.createReferralContactDrafts();
  const actorBConfirmation =
    await actorBService.confirmRecommendedContact({
      actorLabel: "Actor B",
      recommendationId: RECOMMENDATION_ID,
    });

  assert.equal(actorAResult.success, true);
  assert.equal(actorAResult.data.recommendations.length, 1);
  assert.equal(actorBResult.success, true);
  assert.equal(actorBResult.data.state, "empty");
  assert.equal(actorBConfirmation.success, false);
  assert.equal(
    actorBConfirmation.error.code,
    "REFERRAL_RECOMMENDATION_NOT_FOUND",
  );

  const contactDrafts = activeContactDrafts(store);

  assert.equal(contactDrafts.length, 1);
  assert.equal(contactDrafts[0]?.userId, ACTOR_A);
});

test("the same recommendation id yields distinct actor-scoped draft ids per actor", async () => {
  const storeA = createSeedStore(ACTOR_A);
  const storeB = createSeedStore(ACTOR_B);
  const actorAService = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_A,
      store: storeA,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const actorBService = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_B,
      store: storeB,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const actorAResult = await actorAService.createReferralContactDrafts();
  const actorBResult = await actorBService.createReferralContactDrafts();

  assert.equal(actorAResult.success, true);
  assert.equal(actorBResult.success, true);

  const draftA = actorAResult.data.contactDrafts[0]?.id;
  const draftB = actorBResult.data.contactDrafts[0]?.id;

  assert.ok(draftA);
  assert.ok(draftB);
  assert.notEqual(draftA, draftB);
});

test("referral drafts survive cold readback through the central queue and generic confirm", async () => {
  const store = createSeedStore();
  const referralService = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_A,
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const staged = await referralService.createReferralContactDrafts();

  assert.equal(staged.success, true);
  const draftId = staged.data.contactDrafts[0]?.id;
  assert.ok(draftId);

  const centralProvider = createStorageContactAcquisitionDraftProvider({
    actorId: ACTOR_A,
    store,
    workspaceId: WORKSPACE_ID,
  });
  const centralService = createLiveContactAcquisitionDraftService({
    now: () => "2026-07-02T12:20:00.000Z",
    provider: centralProvider,
  });
  const coldQueue = await centralService.listContactDrafts();

  assert.equal(coldQueue.success, true);
  assert.equal(coldQueue.data.drafts.length, 1);
  assert.equal(coldQueue.data.drafts[0]?.id, draftId);
  assert.equal(coldQueue.data.drafts[0]?.status, "pending_confirmation");
  assert.equal(coldQueue.data.drafts[0]?.source.type, "referral");

  const confirmation = await centralService.confirmContactDraft({
    actorLabel: "Actor A",
    draftId,
  });

  assert.equal(confirmation.success, true);
  assert.equal(confirmation.data.confirmedDraft.status, "confirmed");
  assert.equal(confirmation.data.contactCandidate.contactWriteExecuted, false);

  const confirmedRecordBeforeReplay = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: draftId,
  });
  const replay = await referralService.createReferralContactDrafts();
  const confirmedRecordAfterReplay = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: draftId,
  });

  assert.equal(replay.success, true);
  assert.equal(replay.data.contactDrafts[0]?.id, draftId);
  assert.equal(replay.data.contactDrafts[0]?.userConfirmed, true);
  assert.equal(
    replay.data.contactDrafts[0]?.confirmedAt,
    "2026-07-02T12:20:00.000Z",
  );
  assert.deepEqual(confirmedRecordAfterReplay, confirmedRecordBeforeReplay);

  const confirmedPayload = confirmedRecordAfterReplay?.payload as unknown as
    | ContactAcquisitionDraft
    | undefined;

  assert.equal(confirmedPayload?.status, "confirmed");
  assert.equal(
    confirmedPayload?.confirmation.confirmedAt,
    "2026-07-02T12:20:00.000Z",
  );
});

test("recommended contact confirmation is idempotent under sequential and concurrent replays", async () => {
  const store = createSeedStore();
  let tick = 0;
  const service = createLiveReferralRecommendationService({
    now: () => {
      tick += 1;

      return tick === 1 ? NOW : `2026-07-02T10:2${Math.min(tick, 9)}:00.000Z`;
    },
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_A,
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const [first, second] = await Promise.all([
    service.confirmRecommendedContact({
      actorLabel: "Live reviewer",
      recommendationId: RECOMMENDATION_ID,
    }),
    service.confirmRecommendedContact({
      actorLabel: "Live reviewer",
      recommendationId: RECOMMENDATION_ID,
    }),
  ]);
  const third = await service.confirmRecommendedContact({
    actorLabel: "Live reviewer",
    recommendationId: RECOMMENDATION_ID,
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(third.success, true);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);

  const contactDrafts = activeContactDrafts(store);

  assert.equal(contactDrafts.length, 1);

  const storedPayload = contactDrafts[0]?.payload as unknown as
    | ContactAcquisitionDraft
    | undefined;
  const confirmationEvidence = storedPayload?.evidence.filter((entry) =>
    entry.evidenceId.startsWith("evidence:referral-live-confirmed:"),
  );

  assert.equal(storedPayload?.status, "confirmed");
  assert.equal(confirmationEvidence?.length, 1);
});

test("referral staging fails closed when the atomic draft writer rejects", async () => {
  const store = createSeedStore();
  const service = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_A,
      atomicDraftWriter: async (records) => {
        assert.equal(records.length, 1);
        throw new Error("controlled referral draft write failure");
      },
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const result = await service.createReferralContactDrafts();

  assert.equal(result.success, false);
  assert.equal(
    result.error.code,
    "REFERRAL_RECOMMENDATION_LIVE_STORE_WRITE_FAILED",
  );
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
  assert.equal(result.error.provenance.contactDraftWriteExecuted, false);
  assert.equal(activeContactDrafts(store).length, 0);
});

test("a partial referral staging failure rolls back already-written drafts", async () => {
  const store = createSeedStore(ACTOR_A, { withSecondRecommendation: true });
  let draftUpserts = 0;
  const failingStore: LiveRecordStoreLike<Record<string, unknown>> = {
    listRecords: (input) => store.listRecords(input),
    getRecord: (input) => store.getRecord(input),
    deleteRecord: (input) => store.deleteRecord(input),
    upsertRecord: (recordInput) => {
      if (recordInput.collectionName === "contactDrafts") {
        draftUpserts += 1;

        if (draftUpserts === 2) {
          throw new Error("controlled second draft write failure");
        }
      }

      return store.upsertRecord(recordInput);
    },
  };
  const service = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: createStorageReferralRecommendationProvider({
      actorId: ACTOR_A,
      store: failingStore,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const result = await service.createReferralContactDrafts();

  assert.equal(result.success, false);
  assert.equal(
    result.error.code,
    "REFERRAL_RECOMMENDATION_LIVE_STORE_WRITE_FAILED",
  );
  assert.equal(activeContactDrafts(store).length, 0);

  const includingDeleted = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    includeDeleted: true,
  });

  assert.equal(includingDeleted.length, 1);
  assert.equal(includingDeleted[0]?.lifecycleState, "deleted");
});

test("referral live service fails closed when storage is unconfigured", async () => {
  const service = createLiveReferralRecommendationService({
    now: () => NOW,
    provider: null,
  });

  const result = await service.createReferralContactDrafts();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-referral-recommendations");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("referral recommendation factory exposes live mode without breaking default mock", async () => {
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

    const mock = createReferralRecommendationService("mock").createReferralContactDrafts();
    const live = await createReferralRecommendationService("live").createReferralContactDrafts();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("referral recommendation API resolves ORBIT_MODULE_MODE=live and fails closed without storage", async () => {
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

    const resolveActor = async () => ({
      id: "account:referral-live-test",
      name: "Referral tester",
    });
    const referralResponse = await createReferralRecommendationPostHandler(
      resolveActor,
    )(
      new Request("https://orbit.local/api/contact-drafts/referral", {
        method: "POST",
      }),
    );
    const confirmResponse =
      await createConfirmRecommendedContactPostHandler(resolveActor)(
      new Request(
        `https://orbit.local/api/contact-drafts/recommended/${RECOMMENDATION_ID}/confirm`,
        { method: "POST" },
      ),
      {
        params: Promise.resolve({ id: RECOMMENDATION_ID }),
      },
    );
    const referralBody = await referralResponse.json();
    const confirmBody = await confirmResponse.json();

    assert.equal(referralResponse.status, 503);
    assert.equal(referralResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(referralBody.success, false);
    assert.equal(
      referralBody.error.context.referralRecommendationErrorCode,
      "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(referralBody.error.context.service, "referral-recommendation-live");

    assert.equal(confirmResponse.status, 503);
    assert.equal(confirmResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(confirmBody.success, false);
    assert.equal(
      confirmBody.error.context.referralRecommendationErrorCode,
      "REFERRAL_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(confirmBody.error.context.service, "referral-recommendation-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("referral APIs reject anonymous create and confirmation before provider access", async () => {
  const resolveActor = async () => null;
  const referralResponse =
    await createReferralRecommendationPostHandler(resolveActor)(
      new Request("https://orbit.local/api/contact-drafts/referral", {
        method: "POST",
      }),
    );
  const confirmResponse =
    await createConfirmRecommendedContactPostHandler(resolveActor)(
      new Request(
        `https://orbit.local/api/contact-drafts/recommended/${RECOMMENDATION_ID}/confirm`,
        {
          body: JSON.stringify({ actorLabel: "spoofed reviewer" }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({ id: RECOMMENDATION_ID }),
      },
    );

  for (const response of [referralResponse, confirmResponse]) {
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.equal(body.error.context.service, "authenticated-api-actor");
  }
});
