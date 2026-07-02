import assert from "node:assert/strict";
import test from "node:test";

import { POST as confirmRecommendation } from "../../app/api/contact-drafts/recommended/[id]/confirm/route";
import { POST as createReferralDrafts } from "../../app/api/contact-drafts/referral/route";
import { createLiveReferralRecommendationService } from "../../features/acquisition/live-referral-service";
import { createReferralRecommendationService } from "../../features/acquisition/service-factory";
import { createStorageReferralRecommendationProvider } from "../../features/acquisition/storage/referral-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:referral-live-test";
const NOW = "2026-07-02T10:20:00.000Z";
const RECOMMENDATION_ID = "recommendation_live_mika";

function record(
  collectionName: string,
  payload: Record<string, unknown>,
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
    userId: null,
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

function createSeedStore() {
  return createMemoryLiveRecordStore<Record<string, unknown>>([
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
    }),
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
    }),
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
    }),
    record("evidence", {
      id: "evidence:recommendation:mika",
      sourceType: "referral",
      sourceId: "source:recommendation:mika",
      summary:
        "Eli recommended Mika as a warm climate partnerships contact.",
      occurredAt: NOW,
      confidence: 0.91,
      createdBy: "profile_live_operator",
    }),
    record("evidence", {
      id: "evidence:person:eli",
      sourceType: "referral",
      sourceId: "source:person:eli",
      summary: "Eli has trusted investor intro context.",
      occurredAt: NOW,
      confidence: 0.86,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("referral live service derives recommended contacts from live match recommendations without writes", async () => {
  const store = createSeedStore();
  const provider = createStorageReferralRecommendationProvider({
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
  const contactDrafts = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.recommendations.length, 1);
  assert.equal(result.data.contactDrafts.length, 1);
  assert.equal(result.data.recommendations[0]?.id, RECOMMENDATION_ID);
  assert.equal(result.data.recommendations[0]?.displayName, "三浦 美香");
  assert.equal(result.data.recommendations[0]?.sourceKind, "investor_intro");
  assert.equal(result.data.recommendations[0]?.recommender.displayName, "Eli Kapoor");
  assert.equal(result.data.recommendations[0]?.contactWriteExecuted, false);
  assert.equal(result.data.recommendations[0]?.databaseWriteExecuted, false);
  assert.equal(result.data.contactDrafts[0]?.id, `referral-draft:live:${RECOMMENDATION_ID}`);
  assert.equal(result.data.contactDrafts[0]?.contactWriteExecuted, false);
  assert.equal(result.data.contactDrafts[0]?.databaseWriteExecuted, false);
  assert.equal(result.data.provenance.privacy, "live-referral-recommendations");
  assert.equal(result.data.provenance.generationMethod, "live-store-query");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
  assert.equal(result.data.provenance.externalNetworkRequested, false);
  assert.equal(contacts.length, 0);
  assert.equal(contactDrafts.length, 0);
});

test("referral live confirmation returns a review preview without contact or outreach writes", async () => {
  const store = createSeedStore();
  const provider = createStorageReferralRecommendationProvider({
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

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.confirmedContact.recommendationId, RECOMMENDATION_ID);
  assert.equal(confirmed.data.confirmedContact.displayName, "三浦 美香");
  assert.equal(confirmed.data.confirmedContact.confirmedBy, "Live reviewer");
  assert.equal(confirmed.data.createdEvidence.createdBy, "live-referral-recommendation-service");
  assert.equal(confirmed.data.contactWriteExecuted, false);
  assert.equal(confirmed.data.externalActionExecuted, false);
  assert.equal(confirmed.data.databaseWriteExecuted, false);
  assert.equal(confirmed.data.provenance.privacy, "live-referral-recommendations");
  assert.equal(confirmed.data.provenance.generationMethod, "live-store-confirmation");
  assert.equal(confirmed.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(contacts.length, 0);
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

    const referralResponse = await createReferralDrafts(
      new Request("https://orbit.local/api/contact-drafts/referral", {
        method: "POST",
      }),
    );
    const confirmResponse = await confirmRecommendation(
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
