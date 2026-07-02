import assert from "node:assert/strict";
import test from "node:test";

import { POST as scanQr } from "../../app/api/contact-drafts/qr/scan/route";
import { POST as confirmDraft } from "../../app/api/contact-drafts/[id]/confirm/route";
import { createLiveQrScanConnectService } from "../../features/acquisition/live-qr-service";
import { createQrScanConnectService } from "../../features/acquisition/service-factory";
import { createStorageQrScanConnectProvider } from "../../features/acquisition/storage/qr-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:qr-scan-connect-live-test";
const NOW = "2026-07-02T15:20:00.000Z";
const LIVE_DRAFT_ID = "qr-draft:live:contact_001";

async function createSeedStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => NOW,
    store,
    workspaceId: WORKSPACE_ID,
  });

  return store;
}

test("QR scan live service derives connection drafts from qr_scan contacts without writes", async () => {
  const store = await createSeedStore();
  const provider = createStorageQrScanConnectProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveQrScanConnectService({
    now: () => NOW,
    provider,
  });
  const contactsBefore = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  }).length;
  const draftsBefore = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  }).length;

  const scan = await service.scanQrCode();
  const confirm = await service.confirmQrConnectionDraft({
    actorLabel: "Live QR reviewer",
    draftId: LIVE_DRAFT_ID,
  });
  const contactsAfter = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contacts",
  }).length;
  const draftsAfter = store.listRecords({
    workspaceId: WORKSPACE_ID,
    collectionName: "contactDrafts",
  }).length;

  assert.equal(scan.success, true);
  assert.equal(scan.data.state, "success");
  assert.equal(scan.data.scan.scanMethod, "live-store-qr-record");
  assert.equal(scan.data.scan.deviceCameraAccessed, false);
  assert.equal(scan.data.scan.qrDecoderProviderCalled, false);
  assert.equal(scan.data.scan.cryptographicValidationExecuted, false);
  assert.equal(scan.data.scan.externalLookupExecuted, false);
  assert.equal(scan.data.scan.databaseWriteExecuted, false);
  assert.equal(scan.data.draft?.id, LIVE_DRAFT_ID);
  assert.equal(scan.data.draft?.displayName, "佐藤 健一");
  assert.equal(scan.data.draft?.source.type, "qr_scan");
  assert.equal(scan.data.draft?.contactWriteExecuted, false);
  assert.equal(scan.data.draft?.connectionWriteExecuted, false);
  assert.equal(scan.data.provenance.privacy, "live-qr-scan-connect");
  assert.equal(scan.data.provenance.generationMethod, "live-store-query");
  assert.equal(scan.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(scan.data.provenance.databaseWriteExecuted, false);

  assert.equal(confirm.success, true);
  assert.equal(confirm.data.confirmedDraft.status, "confirmed");
  assert.equal(confirm.data.confirmedDraft.confirmation.actorLabel, "Live QR reviewer");
  assert.equal(confirm.data.createdEvidence.createdBy, "live-qr-scan-connect-service");
  assert.equal(confirm.data.contactCandidate.contactWriteExecuted, false);
  assert.equal(confirm.data.connectionCandidate.connectionWriteExecuted, false);
  assert.equal(confirm.data.provenance.databaseWriteExecuted, false);

  assert.equal(contactsBefore, defaultMockFixtures.contacts.length);
  assert.equal(contactsAfter, contactsBefore);
  assert.equal(draftsAfter, draftsBefore);
});

test("QR scan live service fails closed when storage is unconfigured", async () => {
  const service = createLiveQrScanConnectService({
    provider: null,
  });

  const result = await service.scanQrCode();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-qr-scan-connect");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
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
    const live = await createQrScanConnectService("live").scanQrCode();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "QR_SCAN_CONNECT_LIVE_STORE_UNCONFIGURED");
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

    const scanResponse = await scanQr(
      new Request("https://orbit.local/api/contact-drafts/qr/scan", {
        method: "POST",
      }),
    );
    const confirmResponse = await confirmDraft(
      new Request(`https://orbit.local/api/contact-drafts/${LIVE_DRAFT_ID}/confirm`, {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: LIVE_DRAFT_ID }),
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
