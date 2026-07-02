import assert from "node:assert/strict";
import test from "node:test";

import { POST as scanCard } from "../../app/api/contact-drafts/business-card/scan/route";
import { createLiveBusinessCardScanOcrService } from "../../features/acquisition/live-business-card-scan-service";
import { createBusinessCardScanOcrService } from "../../features/acquisition/service-factory";
import { createStorageBusinessCardScanOcrProvider } from "../../features/acquisition/storage/business-card-scan-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:business-card-scan-live-test";
const NOW = "2026-07-02T16:10:00.000Z";
const LIVE_DRAFT_ID = "business-card-review:live:contact_012";

async function createSeedStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => NOW,
    store,
    workspaceId: WORKSPACE_ID,
  });

  return store;
}

test("business card scan live service derives OCR drafts from business-card contacts without writes", async () => {
  const store = await createSeedStore();
  const provider = createStorageBusinessCardScanOcrProvider({
    store,
    workspaceId: WORKSPACE_ID,
  });
  const service = createLiveBusinessCardScanOcrService({
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

  const scan = await service.scanBusinessCard();
  const lookup = await service.getBusinessCardDraft({
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
  assert.equal(scan.data.capture.captureMethod, "live-store-business-card-record");
  assert.equal(scan.data.capture.deviceCameraAccessed, false);
  assert.equal(scan.data.capture.uploadStorageExecuted, false);
  assert.equal(scan.data.capture.storageWriteExecuted, false);
  assert.equal(scan.data.ocr.status, "complete");
  assert.equal(scan.data.ocr.ocrProviderCalled, false);
  assert.equal(scan.data.ocr.aiExtractionExecuted, false);
  assert.equal(scan.data.draft?.id, LIVE_DRAFT_ID);
  assert.equal(scan.data.draft?.displayName, "山田 千尋");
  assert.equal(scan.data.draft?.source.type, "business_card_ocr");
  assert.equal(scan.data.draft?.contactWriteExecuted, false);
  assert.equal(
    scan.data.draft?.evidence[0]?.createdBy,
    "live-business-card-scan-service",
  );
  assert.equal(scan.data.provenance.privacy, "live-business-card-scan-ocr");
  assert.equal(scan.data.provenance.generationMethod, "live-store-query");
  assert.equal(scan.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(scan.data.provenance.databaseWriteExecuted, false);

  assert.equal(lookup.success, true);
  assert.equal(lookup.data.id, LIVE_DRAFT_ID);
  assert.equal(lookup.data.displayName, "山田 千尋");
  assert.equal(lookup.data.contactWriteExecuted, false);

  assert.equal(contactsBefore, defaultMockFixtures.contacts.length);
  assert.equal(contactsAfter, contactsBefore);
  assert.equal(draftsAfter, draftsBefore);
});

test("business card scan live service fails closed when storage is unconfigured", async () => {
  const service = createLiveBusinessCardScanOcrService({
    provider: null,
  });

  const result = await service.scanBusinessCard();

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-business-card-scan-ocr");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("business card scan OCR factory exposes live mode without breaking default mock", async () => {
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

    const mock = createBusinessCardScanOcrService("mock").scanBusinessCard();
    const live = await createBusinessCardScanOcrService("live").scanBusinessCard();

    assert.equal(mock.success, true);
    assert.equal(live.success, false);
    assert.equal(live.error.code, "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("business card scan API resolves ORBIT_MODULE_MODE=live", async () => {
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

    const response = await scanCard(
      new Request("https://orbit.local/api/contact-drafts/business-card/scan", {
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.equal(body.success, false);
    assert.equal(
      body.error.context.businessCardScanOcrErrorCode,
      "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED",
    );
    assert.equal(body.error.context.service, "business-card-scan-ocr-live");
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.ORBIT_FEATURE_MODE = previousFeatureMode;
    process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
  }
});
