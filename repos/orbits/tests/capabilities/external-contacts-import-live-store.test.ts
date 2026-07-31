import assert from "node:assert/strict";
import test from "node:test";

import { createExternalContactCandidatesGetHandler } from "../../app/api/contact-drafts/external/candidates/handler";
import { createExternalContactsImportPostHandler } from "../../app/api/contact-drafts/external/import/handler";
import type { ContactAcquisitionDraft } from "../../features/acquisition/contract";
import { createLiveContactAcquisitionDraftService } from "../../features/acquisition/live-service";
import { createLiveExternalContactsImportService } from "../../features/acquisition/live-external-import-service";
import { createExternalContactsImportService } from "../../features/acquisition/service-factory";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import { createStorageExternalContactsImportProvider } from "../../features/acquisition/storage/external-import-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
  type LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:external-import-live-test";
const NOW = "2026-07-02T12:10:00.000Z";
const ACTOR_A = "account:external-a";
const ACTOR_B = "account:external-b";

function record(
  collectionName: string,
  payload: Record<string, unknown>,
  options: {
    actorId?: string;
    recordId?: string;
  } = {},
): LiveRecord<Record<string, unknown>> {
  const recordId =
    options.recordId ??
    (typeof payload.id === "string" ? payload.id : `${collectionName}:unknown`);
  const evidenceIds = Array.isArray(payload.evidenceIds)
    ? payload.evidenceIds.filter((item): item is string => typeof item === "string")
    : [`evidence:${collectionName}:${recordId}`];

  return {
    workspaceId: WORKSPACE_ID,
    collectionName,
    recordId,
    userId: options.actorId ?? ACTOR_A,
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

function createSeedStore(actorId = ACTOR_A) {
  return createMemoryLiveRecordStore<Record<string, unknown>>([
    record("networkPeople", {
      id: "person_001",
      personKind: "external_contact",
      externalSourceKind: "phone",
      displayName: "高橋 智子",
      organization: "Aoba Foods",
      role: "Investor Partner",
      location: "Shenzhen",
      primaryEmail: "tomoko@example.test",
      profileSnippet: "Looking for restaurant reservation CRM pilot customers.",
      source: {
        type: "external_contacts",
        id: "source:external-person:person_001",
        label: "Current-user external contact record",
      },
      evidenceIds: ["evidence:contact:001"],
      createdAt: NOW,
      updatedAt: NOW,
    }, { actorId }),
    record("networkPeople", {
      id: "person_002",
      personKind: "external_contact",
      externalSourceKind: "google_contacts",
      displayName: "渡辺 颯太",
      organization: "Kansai Foods",
      role: "Product Manager",
      location: "Tokyo",
      primaryEmail: "sota@example.test",
      profileSnippet: "Interested in post-event follow-up operations.",
      source: {
        type: "external_contacts",
        id: "source:external-person:person_002",
        label: "Current-user external contact record",
      },
      evidenceIds: ["evidence:contact:002"],
      createdAt: NOW,
      updatedAt: NOW,
    }, { actorId }),
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
    }, { actorId }),
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
    }, { actorId }),
    record("evidence", {
      id: "evidence:contact:001",
      sourceType: "external_contacts",
      sourceId: "source:external-person:person_001",
      summary: "Tomoko was imported into the generated external contact pool.",
      occurredAt: NOW,
      confidence: 0.88,
      createdBy: "profile_live_operator",
    }, { actorId }),
    record("evidence", {
      id: "evidence:contact:002",
      sourceType: "external_contacts",
      sourceId: "source:external-person:person_002",
      summary: "Sota was imported into the generated external contact pool.",
      occurredAt: NOW,
      confidence: 0.84,
      createdBy: "profile_live_operator",
    }, { actorId }),
  ]);
}

test("external contacts live service derives review candidates from live networkPeople without writes", async () => {
  const store = createSeedStore();
  const provider = createStorageExternalContactsImportProvider({
    actorId: ACTOR_A,
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
  assert.match(
    result.data.candidates[0]?.candidateId ?? "",
    /^external-candidate:live:[a-f0-9]{32}$/,
  );
  assert.doesNotMatch(
    result.data.candidates[0]?.candidateId ?? "",
    /person_001|account:external-a/,
  );
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

test("external contacts live import atomically persists actor-owned central drafts without contact writes", async () => {
  const store = createSeedStore();
  const provider = createStorageExternalContactsImportProvider({
    actorId: ACTOR_A,
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
  assert.match(
    result.data.contactDrafts[0]?.id ?? "",
    /^external-draft:live:[a-f0-9]{32}$/,
  );
  assert.doesNotMatch(
    result.data.contactDrafts[0]?.id ?? "",
    /person_002|account:external-a/,
  );
  assert.equal(result.data.contactDrafts[0]?.displayName, "渡辺 颯太");
  assert.equal(result.data.contactDrafts[0]?.sourceKind, "google_contacts");
  assert.equal(result.data.contactDrafts[0]?.evidence[0]?.createdBy, "live-external-contacts-import-service");
  assert.equal(result.data.contactDrafts[0]?.providerSyncRequested, false);
  assert.equal(result.data.contactDrafts[0]?.contactWriteExecuted, false);
  assert.equal(result.data.contactDrafts[0]?.databaseWriteExecuted, true);
  assert.equal(result.data.provenance.privacy, "live-external-contacts-import");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(contacts.length, 1);
  assert.equal(result.data.provenance.databaseWriteExecuted, true);
  assert.equal(result.data.provenance.contactDraftWriteExecuted, true);
  assert.equal(contactDrafts.length, 1);
  assert.equal(contactDrafts[0]?.userId, ACTOR_A);
  const storedDraft = contactDrafts[0]?.payload as unknown as
    | ContactAcquisitionDraft
    | undefined;
  assert.equal(storedDraft?.status, "pending_confirmation");
  assert.equal(storedDraft?.confirmation.state, "pending");
});

test("external contact candidates are isolated by actor ownership metadata", async () => {
  const store = createSeedStore();

  for (const collectionName of ["contacts", "evidence", "networkPeople"]) {
    const records = store.listRecords({
      workspaceId: WORKSPACE_ID,
      collectionName,
    });

    for (const item of records) {
      await store.upsertRecord({
        ...item,
        userId: ACTOR_A,
      });
    }
  }

  const actorAService = createLiveExternalContactsImportService({
    provider: createStorageExternalContactsImportProvider({
      actorId: "account:external-a",
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const actorBService = createLiveExternalContactsImportService({
    provider: createStorageExternalContactsImportProvider({
      actorId: "account:external-b",
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });

  const actorACandidates =
    await actorAService.listExternalContactCandidates();
  const actorBCandidates =
    await actorBService.listExternalContactCandidates();

  assert.equal(actorACandidates.success, true);
  assert.equal(actorACandidates.data.candidates.length, 2);
  assert.equal(actorBCandidates.success, true);
  assert.equal(actorBCandidates.data.state, "empty");
  assert.equal(actorBCandidates.data.candidates.length, 0);
  assert.deepEqual(
    actorBCandidates.data.sources.map((source) => source.permissionState),
    [
      "live-not-connected",
      "live-not-connected",
      "live-not-connected",
      "live-not-connected",
    ],
  );
});

test("external contact import replay is stable and never downgrades a confirmed central draft", async () => {
  const store = createSeedStore();
  const externalProvider = createStorageExternalContactsImportProvider({
    actorId: ACTOR_A,
    store,
    workspaceId: WORKSPACE_ID,
  });
  const externalService = createLiveExternalContactsImportService({
    provider: externalProvider,
  });
  const firstImport = await externalService.importExternalContacts({
    sourceKind: "google_contacts",
  });

  assert.equal(firstImport.success, true);
  const draftId = firstImport.data.contactDrafts[0]?.id;
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
  const replay = await externalService.importExternalContacts({
    sourceKind: "google_contacts",
  });
  const confirmedRecordAfterReplay = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: draftId,
  });

  assert.equal(replay.success, true);
  assert.equal(replay.data.contactDrafts[0]?.id, draftId);
  assert.deepEqual(confirmedRecordAfterReplay, confirmedRecordBeforeReplay);
  const confirmedPayload = confirmedRecordAfterReplay?.payload as unknown as
    | ContactAcquisitionDraft
    | undefined;
  assert.equal(confirmedPayload?.status, "confirmed");
  assert.equal(
    confirmedPayload?.confirmation.confirmedAt,
    "2026-07-02T12:20:00.000Z",
  );
  assert.equal(
    store.listRecords({
      workspaceId: WORKSPACE_ID,
      collectionName: "contacts",
    }).length,
    1,
  );
});

test("external contact import fails atomically before any central draft is visible", async () => {
  const store = createSeedStore();
  const provider = createStorageExternalContactsImportProvider({
    actorId: ACTOR_A,
    atomicDraftWriter: async (records) => {
      assert.equal(records.length, 2);
      throw new Error("controlled second-draft failure");
    },
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveExternalContactsImportService({
    provider,
  });
  const result = await service.importExternalContacts();

  assert.equal(result.success, false);
  assert.equal(
    result.error.code,
    "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_WRITE_FAILED",
  );
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
  assert.equal(result.error.provenance.contactDraftWriteExecuted, false);
  assert.equal(
    store.listRecords({
      workspaceId: WORKSPACE_ID,
      collectionName: "contactDrafts",
    }).length,
    0,
  );
});

test("the storage provider rolls back an unexpected second-draft write failure to zero active drafts", async () => {
  const backingStore = createSeedStore();
  let draftWriteCount = 0;
  const failingStore: LiveRecordStoreLike<Record<string, unknown>> = {
    deleteRecord: (input) => backingStore.deleteRecord(input),
    getRecord: (input) => backingStore.getRecord(input),
    listRecords: (input) => backingStore.listRecords(input),
    upsertRecord: (record) => {
      if (record.collectionName === "contactDrafts") {
        draftWriteCount += 1;
        if (draftWriteCount === 2) {
          throw new Error("controlled second contactDraft write failure");
        }
      }
      return backingStore.upsertRecord(record);
    },
  };
  const service = createLiveExternalContactsImportService({
    provider: createStorageExternalContactsImportProvider({
      actorId: ACTOR_A,
      store: failingStore,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const result = await service.importExternalContacts();
  const activeDrafts = backingStore.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  });
  const allDrafts = backingStore.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    includeDeleted: true,
  });

  assert.equal(result.success, false);
  assert.equal(
    result.error.code,
    "EXTERNAL_CONTACTS_IMPORT_LIVE_STORE_WRITE_FAILED",
  );
  assert.equal(activeDrafts.length, 0);
  assert.equal(allDrafts.length, 1);
  assert.equal(allDrafts[0]?.lifecycleState, "deleted");
});

test("the same provider person id produces stable per-actor ids without cross-account overwrite", async () => {
  const store = createSeedStore();
  const actorARecords = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "networkPeople",
  });

  for (const sourceRecord of actorARecords) {
    await store.upsertRecord({
      ...sourceRecord,
      recordId: `${sourceRecord.recordId}:actor-b-storage`,
      userId: ACTOR_B,
    });
  }

  for (const sourceRecord of store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "evidence",
  })) {
    await store.upsertRecord({
      ...sourceRecord,
      recordId: `${sourceRecord.recordId}:actor-b-storage`,
      userId: ACTOR_B,
    });
  }

  const actorAService = createLiveExternalContactsImportService({
    provider: createStorageExternalContactsImportProvider({
      actorId: ACTOR_A,
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const actorBService = createLiveExternalContactsImportService({
    provider: createStorageExternalContactsImportProvider({
      actorId: ACTOR_B,
      store,
      workspaceId: WORKSPACE_ID,
    }),
  });
  const actorAImport = await actorAService.importExternalContacts({
    sourceKind: "google_contacts",
  });
  const actorBImport = await actorBService.importExternalContacts({
    sourceKind: "google_contacts",
  });

  assert.equal(actorAImport.success, true);
  assert.equal(actorBImport.success, true);
  const actorADraftId = actorAImport.data.contactDrafts[0]?.id;
  const actorBDraftId = actorBImport.data.contactDrafts[0]?.id;
  assert.ok(actorADraftId);
  assert.ok(actorBDraftId);
  assert.notEqual(actorADraftId, actorBDraftId);
  assert.equal(
    store.getRecord({
      workspaceId: WORKSPACE_ID,
      collectionName: "contactDrafts",
      recordId: actorADraftId,
    })?.userId,
    ACTOR_A,
  );
  assert.equal(
    store.getRecord({
      workspaceId: WORKSPACE_ID,
      collectionName: "contactDrafts",
      recordId: actorBDraftId,
    })?.userId,
    ACTOR_B,
  );
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

    const resolveActor = async () => ({
      id: "account:external-live-test",
      name: "External tester",
    });
    const candidatesResponse = await createExternalContactCandidatesGetHandler(
      resolveActor,
    )(
      new Request("https://orbit.local/api/contact-drafts/external/candidates"),
    );
    const importResponse = await createExternalContactsImportPostHandler(
      resolveActor,
    )(
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

test("external contact APIs reject anonymous list and import before provider access", async () => {
  const resolveActor = async () => null;
  const candidatesResponse =
    await createExternalContactCandidatesGetHandler(resolveActor)(
      new Request("https://orbit.local/api/contact-drafts/external/candidates"),
    );
  const importResponse =
    await createExternalContactsImportPostHandler(resolveActor)(
      new Request("https://orbit.local/api/contact-drafts/external/import", {
        body: JSON.stringify({ sourceKind: "phone" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

  for (const response of [candidatesResponse, importResponse]) {
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.equal(body.error.context.service, "authenticated-api-actor");
  }
});
