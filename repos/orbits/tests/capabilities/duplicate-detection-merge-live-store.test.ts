import assert from "node:assert/strict";
import test from "node:test";

import { createLiveDuplicateMergeService } from "../../features/acquisition/live-merge-service";
import { createDuplicateMergeService } from "../../features/acquisition/service-factory";
import { createStorageDuplicateMergeProvider } from "../../features/acquisition/storage/duplicate-merge-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:duplicate-merge-live-test";
const NOW = "2026-07-02T09:45:00.000Z";
const DRAFT_ID = "event-draft:live:event_founder_salon:attendee_akira";
const CONTACT_ID = "contact_live_akira";
const SUGGESTION_ID = `live-merge:${DRAFT_ID}:${CONTACT_ID}`;

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
    sourceType: "event_import",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "duplicate-merge-live-test",
    providerRecordId: recordId,
    evidenceIds,
    targetType: collectionName === "contacts" ? "contact" : null,
    targetId: collectionName === "contacts" ? recordId : null,
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
    record("contacts", {
      id: CONTACT_ID,
      personId: "person_live_akira",
      displayName: "佐藤 明",
      organization: "Sato Robotics",
      role: "Founder",
      primaryEmail: "akira@sato.example.test",
      profileSnippet: "Founder building robotics tooling for manufacturers.",
      stage: "active",
      source: {
        type: "event_import",
        id: "source:existing-contact:akira",
        label: "Existing founder salon contact",
      },
      evidenceIds: ["evidence:contact:akira"],
      createdAt: "2026-07-01T09:00:00.000Z",
      updatedAt: "2026-07-01T09:00:00.000Z",
    }),
    record("contactDrafts", {
      id: DRAFT_ID,
      status: "pending_confirmation",
      source: {
        type: "event_import",
        id: "source:attendee:akira",
        label: "Founder salon attendee import",
      },
      displayName: "佐藤 明",
      role: "Founder",
      organization: "Sato Robotics",
      email: "akira@sato.example.test",
      relationshipContext:
        "Akira asked for introductions to manufacturing AI operators at the founder salon.",
      suggestedNextAction:
        "Review the duplicate match before creating another contact.",
      confidence: "high",
      createdAt: NOW,
      confirmation: {
        required: true,
        state: "pending",
        question: "Confirm whether this attendee draft belongs to the existing contact?",
      },
      evidence: [
        {
          evidenceId: "evidence:draft:akira",
          source: {
            type: "event_import",
            id: "source:attendee:akira",
            label: "Founder salon attendee import",
          },
          sourceLabel: "Founder salon attendee import",
          excerpt:
            "佐藤 明 from Sato Robotics joined the founder salon attendee list.",
          capturedFields: ["displayName", "organization", "email"],
          createdAt: NOW,
          createdBy: "live-contact-acquisition-draft-service",
        },
      ],
      provenance: {
        source: `live-record-store:contact-drafts:${WORKSPACE_ID}`,
        sourceLabel: "Contact draft live seed",
        evidenceIds: ["evidence:draft:akira"],
        collectedAt: NOW,
        privacy: "live-contact-acquisition-drafts",
        generationMethod: "live-store-query",
        liveDatabaseReadExecuted: true,
        contactDraftWriteExecuted: false,
        contactWriteExecuted: false,
        externalNetworkRequested: false,
      },
    }),
    record("evidence", {
      id: "evidence:contact:akira",
      sourceType: "event_import",
      sourceId: "source:existing-contact:akira",
      summary: "Existing contact came from the previous founder salon.",
      occurredAt: "2026-07-01T09:00:00.000Z",
      confidence: 0.9,
      createdBy: "profile_live_operator",
    }),
    record("evidence", {
      id: "evidence:draft:akira",
      sourceType: "event_import",
      sourceId: "source:attendee:akira",
      summary: "Attendee import lists Akira from Sato Robotics.",
      occurredAt: NOW,
      confidence: 0.92,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("duplicate merge live service detects source-backed draft/contact duplicates without writes", async () => {
  const store = createSeedStore();
  const provider = createStorageDuplicateMergeProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveDuplicateMergeService({
    now: () => NOW,
    provider,
  });

  const result = await service.listMergeSuggestions();
  const contactsAfterList = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.duplicateCandidates.length, 1);
  assert.equal(result.data.mergeSuggestions.length, 1);
  assert.equal(result.data.duplicateCandidates[0]?.importedDraftId, DRAFT_ID);
  assert.equal(result.data.duplicateCandidates[0]?.existingContactId, CONTACT_ID);
  assert.deepEqual(result.data.duplicateCandidates[0]?.matchReasons, [
    "email",
    "name_organization",
  ]);
  assert.equal(result.data.duplicateCandidates[0]?.confidence, "high");
  assert.equal(result.data.mergeSuggestions[0]?.id, SUGGESTION_ID);
  assert.equal(result.data.mergeSuggestions[0]?.databaseWriteExecuted, false);
  assert.equal(result.data.mergeSuggestions[0]?.contactWriteExecuted, false);
  assert.equal(result.data.provenance.privacy, "live-duplicate-detection-merge");
  assert.equal(result.data.provenance.generationMethod, "live-store-query");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
  assert.equal(result.data.provenance.destructiveMergeExecuted, false);
  assert.equal(contactsAfterList.length, 1);
});

test("duplicate merge live apply returns confirmation preview and leaves contacts unchanged", async () => {
  const store = createSeedStore();
  const provider = createStorageDuplicateMergeProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveDuplicateMergeService({
    now: () => NOW,
    provider,
  });

  const applied = await service.applyMergeSuggestion({
    actorLabel: "Live reviewer",
    suggestionId: SUGGESTION_ID,
  });
  const contactsAfterApply = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  });

  assert.equal(applied.success, true);
  assert.equal(applied.data.suggestionId, SUGGESTION_ID);
  assert.equal(applied.data.confirmedBy, "Live reviewer");
  assert.equal(applied.data.mergedContactPreview.contactId, CONTACT_ID);
  assert.equal(applied.data.mergedContactPreview.displayName, "佐藤 明");
  assert.equal(applied.data.createdEvidence.createdBy, "live-duplicate-merge-service");
  assert.equal(applied.data.mergeWriteExecuted, false);
  assert.equal(applied.data.destructiveMergeExecuted, false);
  assert.equal(applied.data.databaseWriteExecuted, false);
  assert.equal(applied.data.contactWriteExecuted, false);
  assert.equal(applied.data.provenance.privacy, "live-duplicate-detection-merge");
  assert.equal(applied.data.provenance.generationMethod, "live-store-confirmation");
  assert.equal(applied.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(contactsAfterApply.length, 1);
  assert.equal(contactsAfterApply[0]?.payload.displayName, "佐藤 明");
});

test("duplicate merge live service fails closed when storage is unconfigured", async () => {
  const service = createLiveDuplicateMergeService({
    now: () => NOW,
    provider: null,
  });

  const result = await service.listMergeSuggestions();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-duplicate-detection-merge");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("duplicate merge factory exposes live mode without breaking default mock", async () => {
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

    const mock = createDuplicateMergeService("mock").listMergeSuggestions();
    const live = await createDuplicateMergeService("live").listMergeSuggestions();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("duplicate merge API resolves ORBIT_MODULE_MODE=live and fails closed without storage", async () => {
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

    const listRoute = await import(
      "../../app/api/contact-drafts/merge-suggestions/route"
    );
    const applyRoute = await import(
      "../../app/api/contact-drafts/merge-suggestions/[id]/apply/route"
    );
    const listResponse = await listRoute.GET(
      new Request("https://orbit.local/api/contact-drafts/merge-suggestions"),
    );
    const applyResponse = await applyRoute.POST(
      new Request(
        `https://orbit.local/api/contact-drafts/merge-suggestions/${SUGGESTION_ID}/apply`,
        {
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({ id: SUGGESTION_ID }),
      },
    );
    const listBody = await listResponse.json();
    const applyBody = await applyResponse.json();

    assert.equal(listResponse.status, 503);
    assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(listBody.success, false);
    assert.equal(
      listBody.error.context.duplicateMergeErrorCode,
      "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(listBody.error.context.service, "duplicate-detection-and-merge-live");

    assert.equal(applyResponse.status, 503);
    assert.equal(applyResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(applyBody.success, false);
    assert.equal(
      applyBody.error.context.duplicateMergeErrorCode,
      "DUPLICATE_MERGE_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(applyBody.error.context.service, "duplicate-detection-and-merge-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
