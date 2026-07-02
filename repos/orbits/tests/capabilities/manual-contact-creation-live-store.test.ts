import assert from "node:assert/strict";
import test from "node:test";

import { createLiveContactAcquisitionDraftService } from "../../features/acquisition/live-service";
import { createLiveManualContactCreationService } from "../../features/acquisition/live-manual-service";
import { createManualContactCreationService } from "../../features/acquisition/service-factory";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:manual-contact-live-test";
const NOW = "2026-07-02T08:30:00.000Z";

function createStore() {
  return createMemoryLiveRecordStore<Record<string, unknown>>();
}

function manualInput() {
  return {
    displayName: "佐藤 明",
    role: "Founder",
    organization: "Sato Robotics",
    note:
      "佐藤 明 from Sato Robotics asked for intros to manufacturing AI operators after the founder salon.",
    tags: ["topic:manufacturing-ai", "priority:warm-follow-up"],
    followUpHint: "Send Akira the manufacturing AI operator intro tomorrow.",
    source: {
      id: "source:manual-note:akira-sato",
      label: "Live manual note from founder salon",
    },
  } as const;
}

function listCollection(
  store: ReturnType<typeof createStore>,
  collectionName: string,
): readonly LiveRecord<Record<string, unknown>>[] {
  return store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName,
  });
}

test("manual contact live creation persists a central contactDraft without contact writes", async () => {
  const store = createStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveManualContactCreationService({
    now: () => NOW,
    provider,
  });

  const result = await service.createManualContactDraft(manualInput());
  const savedDrafts = listCollection(store, "contactDrafts");
  const contacts = listCollection(store, "contacts");
  const savedPayload = savedDrafts[0]?.payload as
    | {
        note?: unknown;
        source?: { type?: unknown };
        tags?: unknown;
      }
    | undefined;
  const centralDrafts = await createLiveContactAcquisitionDraftService({
    provider,
  }).listContactDrafts();

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.draft?.status, "pending_confirmation");
  assert.equal(result.data.draft?.source.type, "manual");
  assert.equal(result.data.draft?.displayName, "佐藤 明");
  assert.equal(result.data.draft?.organization, "Sato Robotics");
  assert.equal(result.data.draft?.evidence[0]?.createdBy, "live-manual-contact-service");
  assert.equal(result.data.provenance.privacy, "live-manual-contact-creation");
  assert.equal(result.data.provenance.generationMethod, "live-store-manual-contact-draft");
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.data.provenance.contactDraftWriteExecuted, true);
  assert.equal(result.data.provenance.contactWriteExecuted, false);
  assert.equal(result.data.draft?.duplicateCheck.externalLookupExecuted, false);

  assert.equal(savedDrafts.length, 1);
  assert.equal(savedDrafts[0]?.collectionName, "contactDrafts");
  assert.equal(savedPayload?.source?.type, "manual");
  assert.equal(savedPayload?.note, manualInput().note);
  assert.deepEqual(savedPayload?.tags, manualInput().tags);
  assert.equal(contacts.length, 0);

  assert.equal(centralDrafts.success, true);
  assert.equal(centralDrafts.data.drafts.length, 1);
  assert.equal(centralDrafts.data.drafts[0]?.id, result.data.draft?.id);
  assert.equal(centralDrafts.data.drafts[0]?.source.type, "manual");
  assert.equal(centralDrafts.data.drafts[0]?.displayName, "佐藤 明");
});

test("manual contact live confirmation updates only the contactDrafts collection", async () => {
  const store = createStore();
  const provider = createStorageContactAcquisitionDraftProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveManualContactCreationService({
    now: () => NOW,
    provider,
  });

  const created = await service.createManualContactDraft(manualInput());
  assert.equal(created.success, true);
  const draftId = created.data.draft?.id ?? "";

  const confirmed = await service.confirmManualContactDraft({
    actorLabel: "Live reviewer",
    draftId,
  });
  const savedDraft = store.getRecord({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
    recordId: draftId,
  });
  const savedPayload = savedDraft?.payload as
    | {
        confirmation?: { actorLabel?: unknown };
        status?: unknown;
      }
    | undefined;
  const contacts = listCollection(store, "contacts");

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data.confirmedDraft.status, "confirmed");
  assert.equal(confirmed.data.confirmedDraft.confirmation.actorLabel, "Live reviewer");
  assert.equal(confirmed.data.createdEvidence.createdBy, "live-manual-contact-service");
  assert.equal(confirmed.data.contactCandidate.readyForContactWrite, true);
  assert.equal(confirmed.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(confirmed.data.contactCandidate.duplicateLookupExecuted, false);
  assert.equal(confirmed.data.provenance.contactDraftWriteExecuted, true);
  assert.equal(confirmed.data.provenance.contactWriteExecuted, false);
  assert.equal(savedPayload?.status, "confirmed");
  assert.equal(savedPayload?.confirmation?.actorLabel, "Live reviewer");
  assert.equal(contacts.length, 0);
});

test("manual contact live service fails closed when storage is unconfigured", async () => {
  const service = createLiveManualContactCreationService({
    now: () => NOW,
    provider: null,
  });

  const result = await service.createManualContactDraft(manualInput());

  assert.equal(result.success, false);
  assert.equal(result.error.code, "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-manual-contact-creation");
  assert.equal(result.error.provenance.contactDraftWriteExecuted, false);
  assert.equal(result.error.provenance.contactWriteExecuted, false);
});

test("manual contact creation factory exposes live mode without breaking default mock", async () => {
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

    const mock = createManualContactCreationService("mock").createManualContactDraft();
    const live = await createManualContactCreationService("live").createManualContactDraft(
      manualInput(),
    );

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("manual contact API resolves ORBIT_MODULE_MODE=live and fails closed without storage", async () => {
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

    const createRoute = await import("../../app/api/contact-drafts/manual/route");
    const confirmRoute = await import("../../app/api/contact-drafts/[id]/confirm/route");
    const createResponse = await createRoute.POST(
      new Request("https://orbit.local/api/contact-drafts/manual", {
        body: JSON.stringify(manualInput()),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const confirmResponse = await confirmRoute.POST(
      new Request(
        "https://orbit.local/api/contact-drafts/manual-draft:live:missing/confirm",
        {
          method: "POST",
        },
      ),
      {
        params: Promise.resolve({ id: "manual-draft:live:missing" }),
      },
    );
    const createBody = await createResponse.json();
    const confirmBody = await confirmResponse.json();

    assert.equal(createResponse.status, 503);
    assert.equal(createResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(createBody.success, false);
    assert.equal(
      createBody.error.context.manualContactCreationErrorCode,
      "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(createBody.error.context.service, "manual-contact-creation-live");

    assert.equal(confirmResponse.status, 503);
    assert.equal(confirmResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(confirmBody.success, false);
    assert.equal(
      confirmBody.error.context.manualContactCreationErrorCode,
      "MANUAL_CONTACT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(confirmBody.error.context.service, "manual-contact-creation-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
