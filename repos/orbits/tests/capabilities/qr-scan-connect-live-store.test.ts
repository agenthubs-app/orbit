import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmContactDraftHandler } from "../../app/api/contact-drafts/[id]/confirm/handler";
import { createQrScanPostHandler } from "../../app/api/contact-drafts/qr/scan/handler";
import { createLiveQrScanConnectService } from "../../features/acquisition/live-qr-service";
import { createQrScanConnectService } from "../../features/acquisition/service-factory";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import type { RelationshipRecordWriteProvider } from "../../features/contacts/contact-write-contract";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import type { ContactDTO } from "../../shared/domain/contracts";
import {
  createMemoryLiveRecordStore,
  type LiveRecordStore,
} from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:qr-scan-connect-live-test";
const NOW = "2026-07-02T15:20:00.000Z";
const ACTOR_A = "account:qr-a";
const ACTOR_B = "account:qr-b";
const QR_TEXT =
  "orbit-qr:name=QR Runtime Contact;role=Audit Partner;organization=Orbit QA;email=qr-runtime@example.invalid;event=Tokyo QA Lab;mutual=Audit Operator;topic=idempotency,persistence";

function collectionCount(
  store: LiveRecordStore<Record<string, unknown>>,
  collectionName: string,
): number {
  return store.listRecords({
    collectionName,
    workspaceId: WORKSPACE_ID,
  }).length;
}

function createService(input: {
  actorId: string;
  recordProvider?: RelationshipRecordWriteProvider | null;
  store: LiveRecordStore<Record<string, unknown>>;
}) {
  return createLiveQrScanConnectService({
    actorId: input.actorId,
    draftProvider: createStorageContactAcquisitionDraftProvider({
      actorId: input.actorId,
      sourceLabel: "QR live test drafts",
      store: input.store,
      workspaceId: WORKSPACE_ID,
    }),
    now: () => NOW,
    recordProvider:
      input.recordProvider === undefined
        ? createStorageBusinessCardContactWriteProvider({
            recordProvider: "orbit-qr-live-test",
            store: input.store,
            workspaceId: WORKSPACE_ID,
          })
        : input.recordProvider,
  });
}

test("QR scan persists the submitted fields, then confirms one contact, connection, and evidence set", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createService({ actorId: ACTOR_A, store });

  const firstScan = await service.scanQrCode({
    qrText: QR_TEXT,
    scanLabel: "Tokyo QR audit",
  });

  assert.equal(firstScan.success, true);
  assert.equal(firstScan.data.state, "success");
  assert.equal(firstScan.data.scan.scanMethod, "rule-based-qr-text");
  assert.equal(firstScan.data.scan.qrText, QR_TEXT);
  assert.equal(firstScan.data.scan.databaseWriteExecuted, true);
  assert.equal(firstScan.data.scan.deviceCameraAccessed, false);
  assert.equal(firstScan.data.scan.qrDecoderProviderCalled, false);
  assert.equal(firstScan.data.scan.cryptographicValidationExecuted, false);
  assert.equal(firstScan.data.draft?.displayName, "QR Runtime Contact");
  assert.equal(firstScan.data.draft?.organization, "Orbit QA");
  assert.equal(firstScan.data.draft?.role, "Audit Partner");
  assert.equal(
    firstScan.data.draft?.email,
    "qr-runtime@example.invalid",
  );
  assert.deepEqual(firstScan.data.draft?.mutualContext.sharedTopics, [
    "idempotency",
    "persistence",
  ]);
  assert.deepEqual(firstScan.data.draft?.confirmation.writeTargets, [
    "contact",
    "connection",
  ]);
  assert.equal(collectionCount(store, "contactDrafts"), 1);
  assert.equal(collectionCount(store, "contacts"), 0);
  assert.equal(collectionCount(store, "connections"), 0);

  const repeatedScan = await service.scanQrCode({ qrText: QR_TEXT });

  assert.equal(repeatedScan.success, true);
  assert.equal(repeatedScan.data.scan.databaseWriteExecuted, false);
  assert.equal(repeatedScan.data.draft?.id, firstScan.data.draft?.id);
  assert.equal(collectionCount(store, "contactDrafts"), 1);

  const draftId = firstScan.data.draft?.id;
  assert.ok(draftId);

  const confirmation = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId,
  });

  assert.equal(confirmation.success, true);
  assert.equal(confirmation.data.confirmedDraft.status, "confirmed");
  assert.equal(
    confirmation.data.confirmedDraft.confirmation.actorLabel,
    "Live QR reviewer",
  );
  assert.equal(confirmation.data.contactCandidate.contactWriteExecuted, true);
  assert.equal(
    confirmation.data.connectionCandidate.connectionWriteExecuted,
    true,
  );
  assert.match(
    confirmation.data.contactCandidate.contactId ?? "",
    /^contact:qr:/,
  );
  assert.match(
    confirmation.data.connectionCandidate.connectionId ?? "",
    /^connection:qr:/,
  );
  assert.equal(collectionCount(store, "contactDrafts"), 1);
  assert.equal(collectionCount(store, "contacts"), 1);
  assert.equal(collectionCount(store, "connections"), 1);
  assert.equal(collectionCount(store, "evidence"), 2);

  const contact = store.listRecords({
    collectionName: "contacts",
    workspaceId: WORKSPACE_ID,
  })[0];
  const connection = store.listRecords({
    collectionName: "connections",
    workspaceId: WORKSPACE_ID,
  })[0];

  assert.equal(contact.userId, ACTOR_A);
  assert.equal(contact.payload.displayName, "QR Runtime Contact");
  assert.equal(contact.payload.primaryEmail, "qr-runtime@example.invalid");
  assert.equal(connection.userId, ACTOR_A);
  assert.equal(connection.payload.contactId, contact.recordId);
  assert.deepEqual(connection.payload.sharedTopics, [
    "idempotency",
    "persistence",
  ]);

  const repeatedConfirmation = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId,
  });

  assert.equal(repeatedConfirmation.success, true);
  assert.equal(
    repeatedConfirmation.data.contactCandidate.contactId,
    confirmation.data.contactCandidate.contactId,
  );
  assert.equal(
    repeatedConfirmation.data.connectionCandidate.connectionId,
    confirmation.data.connectionCandidate.connectionId,
  );
  assert.equal(
    repeatedConfirmation.data.contactCandidate.contactWriteExecuted,
    false,
  );
  assert.equal(
    repeatedConfirmation.data.connectionCandidate.connectionWriteExecuted,
    false,
  );
  assert.equal(
    repeatedConfirmation.data.provenance.contactWriteExecuted,
    false,
  );
  assert.equal(
    repeatedConfirmation.data.provenance.connectionWriteExecuted,
    false,
  );
  assert.equal(collectionCount(store, "contactDrafts"), 1);
  assert.equal(collectionCount(store, "contacts"), 1);
  assert.equal(collectionCount(store, "connections"), 1);
  assert.equal(collectionCount(store, "evidence"), 2);
});

test("QR drafts cannot be read or confirmed across actor boundaries", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const actorAService = createService({ actorId: ACTOR_A, store });
  const actorBService = createService({ actorId: ACTOR_B, store });
  const scan = await actorAService.scanQrCode({ qrText: QR_TEXT });

  assert.equal(scan.success, true);
  assert.ok(scan.data.draft);

  const actorBConfirmation = await actorBService.confirmQrConnectionDraft({
    actorLabel: "Actor B",
    draftId: scan.data.draft.id,
  });

  assert.equal(actorBConfirmation.success, false);
  assert.equal(actorBConfirmation.error.code, "QR_SCAN_DRAFT_NOT_FOUND");
  assert.equal(collectionCount(store, "contacts"), 0);
  assert.equal(collectionCount(store, "connections"), 0);
});

test("QR confirmation fails closed when relationship writes are unconfigured", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createService({
    actorId: ACTOR_A,
    recordProvider: null,
    store,
  });
  const scan = await service.scanQrCode({ qrText: QR_TEXT });

  assert.equal(scan.success, true);
  assert.ok(scan.data.draft);

  const result = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId: scan.data.draft.id,
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "QR_SCAN_CONNECT_WRITE_UNCONFIGURED");
  assert.equal(collectionCount(store, "contactDrafts"), 1);
  assert.equal(collectionCount(store, "contacts"), 0);
  assert.equal(collectionCount(store, "connections"), 0);
});

test("QR confirmation keeps a duplicate contact pending for explicit review", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const recordProvider = createStorageBusinessCardContactWriteProvider({
    recordProvider: "orbit-qr-live-test",
    store,
    workspaceId: WORKSPACE_ID,
  });
  const existingContact: ContactDTO = {
    id: "contact:existing-qr-email",
    displayName: "Existing Person",
    organization: "Elsewhere",
    primaryEmail: "qr-runtime@example.invalid",
    stage: "captured",
    source: {
      id: "source:existing",
      label: "Existing source",
      type: "manual",
    },
    evidenceIds: ["evidence:existing"],
    createdAt: NOW,
    updatedAt: NOW,
  };
  await recordProvider.saveContact(existingContact, ACTOR_A);
  const service = createService({ actorId: ACTOR_A, recordProvider, store });
  const scan = await service.scanQrCode({ qrText: QR_TEXT });

  assert.equal(scan.success, true);
  assert.ok(scan.data.draft);

  const result = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId: scan.data.draft.id,
  });

  assert.equal(result.success, false);
  assert.equal(
    result.error.code,
    "QR_SCAN_CONTACT_DUPLICATE_REVIEW_REQUIRED",
  );
  assert.equal(collectionCount(store, "contacts"), 1);
  assert.equal(collectionCount(store, "connections"), 0);
  const storedDraft = store.listRecords({
    collectionName: "contactDrafts",
    workspaceId: WORKSPACE_ID,
  })[0];
  assert.equal(storedDraft.payload.status, "pending_confirmation");
});

test("QR confirmation retry reuses a stable contact after a connection write failure", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const baseProvider = createStorageBusinessCardContactWriteProvider({
    recordProvider: "orbit-qr-live-test",
    store,
    workspaceId: WORKSPACE_ID,
  });
  let shouldFailConnection = true;
  const flakyProvider: RelationshipRecordWriteProvider = {
    ...baseProvider,
    async saveConnection(connection, actorId) {
      if (shouldFailConnection) {
        shouldFailConnection = false;
        throw new Error("controlled connection write failure");
      }

      return baseProvider.saveConnection(connection, actorId);
    },
  };
  const service = createService({
    actorId: ACTOR_A,
    recordProvider: flakyProvider,
    store,
  });
  const scan = await service.scanQrCode({ qrText: QR_TEXT });

  assert.equal(scan.success, true);
  assert.ok(scan.data.draft);

  const firstConfirmation = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId: scan.data.draft.id,
  });

  assert.equal(firstConfirmation.success, false);
  assert.equal(
    firstConfirmation.error.code,
    "QR_SCAN_CONNECTION_WRITE_FAILED",
  );
  assert.equal(collectionCount(store, "contacts"), 1);
  assert.equal(collectionCount(store, "connections"), 0);

  const retry = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId: scan.data.draft.id,
  });

  assert.equal(retry.success, true);
  assert.equal(retry.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(retry.data.connectionCandidate.connectionWriteExecuted, true);
  assert.equal(collectionCount(store, "contacts"), 1);
  assert.equal(collectionCount(store, "connections"), 1);
});

test("QR scan rejects missing or non-Orbit payloads without staging drafts", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createService({ actorId: ACTOR_A, store });

  for (const qrText of ["", "https://example.com/contact"]) {
    const result = await service.scanQrCode({ qrText });

    assert.equal(result.success, false);
    assert.equal(result.error.code, "QR_SCAN_PAYLOAD_REQUIRED");
  }

  assert.equal(collectionCount(store, "contactDrafts"), 0);
});

test("QR scan live service fails closed when actor or storage is unconfigured", async () => {
  const missingActor = createLiveQrScanConnectService({
    draftProvider: null,
  });
  const missingStorage = createLiveQrScanConnectService({
    actorId: ACTOR_A,
    draftProvider: null,
  });

  const actorResult = await missingActor.scanQrCode({ qrText: QR_TEXT });
  const storageResult = await missingStorage.scanQrCode({ qrText: QR_TEXT });

  assert.equal(actorResult.success, false);
  assert.equal(actorResult.error.code, "QR_SCAN_ACTOR_REQUIRED");
  assert.equal(storageResult.success, false);
  assert.equal(
    storageResult.error.code,
    "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
  );
});

test("QR scan connect factory exposes live mode without breaking default mock", async () => {
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

    const mock = createQrScanConnectService("mock").scanQrCode();
    const live = await createQrScanConnectService("live").scanQrCode({
      qrText: QR_TEXT,
    });

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "QR_SCAN_ACTOR_REQUIRED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("QR scan connect API resolves ORBIT_MODULE_MODE=live for live draft ids", async () => {
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

    const scanResponse = await createQrScanPostHandler(
      async () => ({ id: "account:qr-live-test", name: "QR tester" }),
    )(
      new Request("https://orbit.local/api/contact-drafts/qr/scan", {
        body: JSON.stringify({ qrText: QR_TEXT }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const confirmResponse = await createConfirmContactDraftHandler(
      async () => ({ id: "account:qr-live-test", name: "QR tester" }),
    )(
      new Request(
        "https://orbit.local/api/contact-drafts/qr-draft:live:missing/confirm",
        { method: "POST" },
      ),
      {
        params: Promise.resolve({ id: "qr-draft:live:missing" }),
      },
    );
    const scanBody = await scanResponse.json();
    const confirmBody = await confirmResponse.json();

    assert.equal(scanResponse.status, 503);
    assert.equal(scanResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(scanBody.success, false);
    assert.equal(
      scanBody.error.context.qrScanConnectErrorCode,
      "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(scanBody.error.context.service, "qr-scan-connect-live");

    assert.equal(confirmResponse.status, 503);
    assert.equal(confirmResponse.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(confirmBody.success, false);
    assert.equal(
      confirmBody.error.context.qrScanConnectErrorCode,
      "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(confirmBody.error.context.service, "qr-scan-connect-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("QR scan API rejects anonymous requests before parsing scan content", async () => {
  const response = await createQrScanPostHandler(async () => null)(
    new Request("https://orbit.local/api/contact-drafts/qr/scan", {
      body: JSON.stringify({
        qrText: "anonymous QR data must not reach the provider",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "UNAUTHORIZED");
  assert.equal(body.error.context.service, "authenticated-api-actor");
});
