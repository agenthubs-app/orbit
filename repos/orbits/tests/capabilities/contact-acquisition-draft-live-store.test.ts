import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactAcquisitionDraftService } from "../../features/acquisition/live-service";
import { createContactAcquisitionDraftService } from "../../features/acquisition/service-factory";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:contact-draft-live-test";
const NOW = "2026-07-01T10:00:00.000Z";
const DRAFT_ID = "event-draft:live:event_live_signup:attendee_live_yuki";

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
    sourceType: "system",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "contact-draft-live-test",
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
    record("events", {
      id: "event_live_signup",
      name: "Tokyo Founder Signup Salon",
      location: "Shibuya",
      startsAt: "2026-07-03T09:00:00.000Z",
      source: {
        type: "event_import",
        id: "source:event:signup",
        label: "Live signup event",
      },
      evidenceIds: ["evidence:event:signup"],
    }),
    record("attendees", {
      id: "attendee_live_yuki",
      eventId: "event_live_signup",
      personId: "person_live_yuki",
      displayName: "山田 由紀",
      organization: "Yamada AI Studio",
      role: "Founder",
      status: "imported",
      source: {
        type: "event_import",
        id: "source:attendee:yuki",
        label: "Live attendee signup",
      },
      evidenceIds: ["evidence:attendee:yuki"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("eventParticipantIntents", {
      id: "intent_live_yuki",
      eventId: "event_live_signup",
      attendeeId: "attendee_live_yuki",
      personId: "person_live_yuki",
      lookingFor: ["AI product partners in Japan"],
      canOffer: ["Founder-led customer discovery"],
      preferredLanguage: "ja",
      confidence: 0.91,
      source: {
        type: "event_import",
        id: "source:intent:yuki",
        label: "Live participant intent",
      },
      evidenceIds: ["evidence:intent:yuki"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("networkPeople", {
      id: "person_live_yuki",
      personKind: "external_contact",
      displayName: "山田 由紀",
      organization: "Yamada AI Studio",
      role: "Founder",
      location: "Tokyo",
      primaryEmail: "yuki@example.test",
      profileSnippet: "Building AI workflow tooling for Japanese SMBs.",
      source: {
        type: "event_import",
        id: "source:person:yuki",
        label: "Live person source",
      },
      evidenceIds: ["evidence:person:yuki"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("evidence", {
      id: "evidence:attendee:yuki",
      sourceType: "event_import",
      sourceId: "source:attendee:yuki",
      summary: "Yuki signed up for the salon and requested AI product partners.",
      occurredAt: NOW,
      confidence: 0.91,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("contact acquisition draft live service derives event drafts from live storage", async () => {
  const store = createSeedStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveContactAcquisitionDraftService({ provider });

  const result = await service.listContactDrafts();

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.drafts.length, 1);
  assert.equal(result.data.drafts[0]?.id, DRAFT_ID);
  assert.equal(result.data.drafts[0]?.source.type, "event_import");
  assert.equal(result.data.drafts[0]?.displayName, "山田 由紀");
  assert.equal(result.data.drafts[0]?.relationshipContext.includes("AI product partners"), true);
  assert.equal(result.data.drafts[0]?.evidence[0]?.createdBy, "live-contact-acquisition-draft-service");
  assert.equal(result.data.provenance.privacy, "live-contact-acquisition-drafts");
  assert.equal(result.data.provenance.generationMethod, "live-store-derived-event-draft");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.contactWriteExecuted, false);
});

test("contact acquisition draft live confirmation updates only contactDrafts storage", async () => {
  const store = createSeedStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveContactAcquisitionDraftService({
    now: () => NOW,
    provider,
  });

  const result = await service.confirmContactDraft({
    actorLabel: "Live reviewer",
    draftId: DRAFT_ID,
  });
  const savedDraft = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: DRAFT_ID,
  });
  const contacts = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.confirmedDraft.status, "confirmed");
  assert.equal(result.data.confirmedDraft.confirmation.actorLabel, "Live reviewer");
  assert.equal(result.data.contactCandidate.readyForContactWrite, true);
  assert.equal(result.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(result.data.createdEvidence.createdBy, "live-contact-acquisition-draft-service");
  assert.equal(result.data.provenance.contactDraftWriteExecuted, true);
  assert.equal(result.data.provenance.contactWriteExecuted, false);
  assert.equal(savedDraft?.payload.status, "confirmed");
  assert.equal(contacts.length, 0);
});

test("contact acquisition draft live service fails closed when storage is unconfigured", async () => {
  const service = createLiveContactAcquisitionDraftService({
    now: () => NOW,
    provider: null,
  });

  const result = await service.listContactDrafts();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-contact-acquisition-drafts");
});

test("contact acquisition draft service factory exposes live mode without breaking default mock", async () => {
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

    const mock = createContactAcquisitionDraftService("mock").listContactDrafts();
    const live = await createContactAcquisitionDraftService("live").listContactDrafts();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("contact draft API resolves ORBIT_MODULE_MODE=live and returns a live envelope", async () => {
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

    const route = await import("../../app/api/contact-drafts/route");
    const response = await route.GET(
      new Request("https://orbit.local/api/contact-drafts"),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(body.success, false);
    assert.equal(
      body.error.context.contactAcquisitionDraftErrorCode,
      "CONTACT_DRAFT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(body.error.context.service, "contact-acquisition-draft-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
