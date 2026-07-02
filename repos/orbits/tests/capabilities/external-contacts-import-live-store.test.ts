import assert from "node:assert/strict";
import test from "node:test";

import { GET as listCandidates } from "../../app/api/contact-drafts/external/candidates/route";
import { POST as importExternalContacts } from "../../app/api/contact-drafts/external/import/route";
import { createLiveExternalContactsImportService } from "../../features/acquisition/live-external-import-service";
import { createExternalContactsImportService } from "../../features/acquisition/service-factory";
import { createStorageExternalContactsImportProvider } from "../../features/acquisition/storage/external-import-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:external-import-live-test";
const NOW = "2026-07-02T12:10:00.000Z";

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
    sourceType: "external_contacts",
    sourceId: `source:${collectionName}:${recordId}`,
    sourceLabel: `Live ${collectionName} seed`,
    provider: "external-import-live-test",
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
      id: "person_001",
      personKind: "external_contact",
      displayName: "高橋 智子",
      organization: "Aoba Foods",
      role: "Investor Partner",
      location: "Shenzhen",
      primaryEmail: "tomoko@example.test",
      profileSnippet: "Looking for restaurant reservation CRM pilot customers.",
      source: {
        type: "manual",
        id: "source:external-person:person_001",
        label: "Current-user external contact record",
      },
      evidenceIds: ["evidence:contact:001"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("networkPeople", {
      id: "person_002",
      personKind: "external_contact",
      displayName: "渡辺 颯太",
      organization: "Kansai Foods",
      role: "Product Manager",
      location: "Tokyo",
      primaryEmail: "sota@example.test",
      profileSnippet: "Interested in post-event follow-up operations.",
      source: {
        type: "manual",
        id: "source:external-person:person_002",
        label: "Current-user external contact record",
      },
      evidenceIds: ["evidence:contact:002"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("networkPeople", {
      id: "person_003",
      personKind: "platform_user",
      displayName: "Platform User",
      organization: "Orbit",
      role: "Member",
      source: {
        type: "system",
        id: "source:platform-user:person_003",
        label: "Generated platform user profile",
      },
      evidenceIds: ["evidence:contact:003"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("contacts", {
      id: "contact_existing_001",
      personId: "person_001",
      displayName: "高橋 智子",
      organization: "Aoba Foods",
      role: "Investor Partner",
      primaryEmail: "tomoko@example.test",
      stage: "reviewing",
      source: {
        type: "manual",
        id: "source:contact:existing",
        label: "Existing contact record",
      },
      evidenceIds: ["evidence:contact:001"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    record("evidence", {
      id: "evidence:contact:001",
      sourceType: "external_contacts",
      sourceId: "source:external-person:person_001",
      summary: "Tomoko was imported into the generated external contact pool.",
      occurredAt: NOW,
      confidence: 0.88,
      createdBy: "profile_live_operator",
    }),
    record("evidence", {
      id: "evidence:contact:002",
      sourceType: "external_contacts",
      sourceId: "source:external-person:person_002",
      summary: "Sota was imported into the generated external contact pool.",
      occurredAt: NOW,
      confidence: 0.84,
      createdBy: "profile_live_operator",
    }),
  ]);
}

test("external contacts live service derives review candidates from live networkPeople without writes", async () => {
  const store = createSeedStore();
  const provider = createStorageExternalContactsImportProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveExternalContactsImportService({
    provider,
  });

  const result = await service.listExternalContactCandidates();
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
  assert.equal(result.data.candidates.length, 2);
  assert.equal(result.data.sources.length, 4);
  assert.equal(result.data.candidates[0]?.candidateId, "external-candidate:live:person_001");
  assert.equal(result.data.candidates[0]?.displayName, "高橋 智子");
  assert.equal(result.data.candidates[0]?.sourceKind, "phone");
  assert.equal(result.data.candidates[0]?.duplicateHint, "Existing live contact: 高橋 智子");
  assert.equal(result.data.candidates[0]?.providerSyncRequested, false);
  assert.equal(result.data.candidates[0]?.contactWriteExecuted, false);
  assert.equal(result.data.candidates[0]?.databaseWriteExecuted, false);
  assert.equal(result.data.candidates[0]?.fileParsingAtScale, false);
  assert.equal(result.data.provenance.privacy, "live-external-contacts-import");
  assert.equal(result.data.provenance.generationMethod, "live-store-query");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
  assert.equal(contacts.length, 1);
  assert.equal(contactDrafts.length, 0);
});

test("external contacts live import stages contact drafts without contactDraft or contact writes", async () => {
  const store = createSeedStore();
  const provider = createStorageExternalContactsImportProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveExternalContactsImportService({
    provider,
  });

  const result = await service.importExternalContacts({
    sourceKind: "google_contacts",
  });
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
  assert.equal(result.data.candidates.length, 1);
  assert.equal(result.data.contactDrafts.length, 1);
  assert.equal(result.data.contactDrafts[0]?.id, "external-draft:live:person_002");
  assert.equal(result.data.contactDrafts[0]?.displayName, "渡辺 颯太");
  assert.equal(result.data.contactDrafts[0]?.sourceKind, "google_contacts");
  assert.equal(result.data.contactDrafts[0]?.evidence[0]?.createdBy, "live-external-contacts-import-service");
  assert.equal(result.data.contactDrafts[0]?.providerSyncRequested, false);
  assert.equal(result.data.contactDrafts[0]?.contactWriteExecuted, false);
  assert.equal(result.data.contactDrafts[0]?.databaseWriteExecuted, false);
  assert.equal(result.data.provenance.privacy, "live-external-contacts-import");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(contacts.length, 1);
  assert.equal(contactDrafts.length, 0);
});

test("external contacts live service fails closed when storage is unconfigured", async () => {
  const service = createLiveExternalContactsImportService({
    provider: null,
  });

  const result = await service.listExternalContactCandidates();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-external-contacts-import");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("external contacts import factory exposes live mode without breaking default mock", async () => {
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

    const mock = await createExternalContactsImportService("mock").importExternalContacts();
    const live = await createExternalContactsImportService("live").importExternalContacts();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("external contacts import API resolves ORBIT_MODULE_MODE=live and fails closed without storage", async () => {
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

    const candidatesResponse = await listCandidates(
      new Request("https://orbit.local/api/contact-drafts/external/candidates"),
    );
    const importResponse = await importExternalContacts(
      new Request("https://orbit.local/api/contact-drafts/external/import", {
        method: "POST",
      }),
    );
    const candidatesBody = await candidatesResponse.json();
    const importBody = await importResponse.json();

    assert.equal(candidatesResponse.status, 503);
    assert.equal(candidatesResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(candidatesBody.success, false);
    assert.equal(
      candidatesBody.error.context.externalContactsImportErrorCode,
      "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(candidatesBody.error.context.service, "external-contacts-import-live");

    assert.equal(importResponse.status, 503);
    assert.equal(importResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(importBody.success, false);
    assert.equal(
      importBody.error.context.externalContactsImportErrorCode,
      "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(importBody.error.context.service, "external-contacts-import-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
