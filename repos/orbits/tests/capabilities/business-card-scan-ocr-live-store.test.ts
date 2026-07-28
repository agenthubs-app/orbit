import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessCardScanHandler } from "../../app/api/contact-drafts/business-card/scan/handler";
import { createLiveBusinessCardScanOcrService } from "../../features/acquisition/live-business-card-scan-service";
import { createBusinessCardScanOcrService } from "../../features/acquisition/service-factory";
import { createStorageBusinessCardScanOcrProvider } from "../../features/acquisition/storage/business-card-scan-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE_ID = "workspace:business-card-scan-live-test";
const ACTOR_ID = "account:business-card-scan-owner";
const NOW = "2026-07-02T16:10:00.000Z";
const LIVE_DRAFT_ID = "business-card-review:live:contact_012";
const TEST_IMAGE_BASE64 = "aW1hZ2U=";

async function createSeedStore() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => NOW,
    store,
    workspaceId: WORKSPACE_ID,
  });
  const actorRecords = store
    .listRecords({ workspaceId: WORKSPACE_ID })
    .filter(
      (record) =>
        record.collectionName === "contacts" ||
        record.collectionName === "evidence",
    );

  await Promise.all(
    actorRecords.map((record) =>
      store.upsertRecord({
        ...record,
        userId: ACTOR_ID,
      }),
    ),
  );

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

  const scan = await service.scanBusinessCard({ actorId: ACTOR_ID });
  const lookup = await service.getBusinessCardDraft({
    actorId: ACTOR_ID,
    draftId: LIVE_DRAFT_ID,
  });
  const foreignScan = await service.scanBusinessCard({
    actorId: "account:other-business-card-owner",
  });
  const foreignLookup = await service.getBusinessCardDraft({
    actorId: "account:other-business-card-owner",
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
  assert.equal(
    scan.data.draft?.displayName,
    defaultMockFixtures.contacts.find((contact) => contact.id === "contact_012")
      ?.displayName,
  );
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
  assert.equal(
    lookup.data.displayName,
    defaultMockFixtures.contacts.find((contact) => contact.id === "contact_012")
      ?.displayName,
  );
  assert.equal(lookup.data.contactWriteExecuted, false);
  assert.equal(foreignScan.success, true);
  assert.equal(foreignScan.data.state, "empty");
  assert.equal(foreignScan.data.draft, null);
  assert.equal(foreignLookup.success, false);
  assert.equal(foreignLookup.error.code, "BUSINESS_CARD_DRAFT_NOT_FOUND");

  assert.equal(contactsBefore, defaultMockFixtures.contacts.length);
  assert.equal(contactsAfter, contactsBefore);
  assert.equal(draftsAfter, draftsBefore);
});

test("business card scan live service fails closed when storage is unconfigured", async () => {
  const service = createLiveBusinessCardScanOcrService({
    provider: null,
  });

  const result = await service.scanBusinessCard({ actorId: ACTOR_ID });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED");
  assert.equal(result.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(result.error.provenance.privacy, "live-business-card-scan-ocr");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.databaseWriteExecuted, false);
});

test("business card scan live service extracts an uploaded image without reading or writing storage", async () => {
  const service = createLiveBusinessCardScanOcrService({
    cloudOcrProvider: {
      model: "gemini-3.5-flash-lite",
      providerName: "google-gemini-interactions",
      async extract(input) {
        assert.deepEqual(input, {
          imageBase64: TEST_IMAGE_BASE64,
          mimeType: "image/jpeg",
        });

        return {
          extraction: {
            addresses: [{ label: "Tokyo", value: "Chiyoda, Tokyo" }],
            certifications: [],
            contactPoints: [
              { label: "Mobile", type: "mobile", value: "+81 90 0000 0000" },
            ],
            departments: ["Partnerships"],
            detectedLanguages: ["ja", "en"],
            emails: [{ label: "Email", value: "person@example.com" }],
            fullName: "青空 太郎",
            nativeFullName: "青空 太郎",
            organization: "架空技研株式会社",
            romanizedFullName: null,
            title: "室長",
            website: "https://example.test",
          },
          usage: {
            inputTokens: 1156,
            latencyMs: 25,
            outputTokens: 236,
          },
        };
      },
    },
    now: () => NOW,
    provider: null,
  });

  const result = await service.scanBusinessCard({
    actorId: ACTOR_ID,
    imageBase64: TEST_IMAGE_BASE64,
    imageName: "card.jpg",
    imageSizeBytes: 5,
    mimeType: "image/jpeg",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.state, "success");
  assert.equal(result.data.capture.captureMethod, "uploaded-business-card");
  assert.match(result.data.capture.imageDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.data.ocr.ocrProviderCalled, true);
  assert.equal(result.data.ocr.aiExtractionExecuted, true);
  assert.equal(result.data.ocr.structuredExtraction?.fullName, "青空 太郎");
  assert.equal(result.data.draft?.displayName, "青空 太郎");
  assert.equal(result.data.draft?.email, "person@example.com");
  assert.equal(result.data.draft?.contactWriteExecuted, false);
  assert.equal(result.data.provenance.provider, "google-gemini-interactions");
  assert.equal(result.data.provenance.model, "gemini-3.5-flash-lite");
  assert.equal(result.data.provenance.inputTokens, 1156);
  assert.equal(result.data.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
  assert.equal(result.data.provenance.storageWriteExecuted, false);
});

test("uploaded business card scan fails visibly when cloud OCR is unconfigured", async () => {
  const service = createLiveBusinessCardScanOcrService({
    cloudOcrProvider: null,
    provider: null,
  });

  const result = await service.scanBusinessCard({
    actorId: ACTOR_ID,
    imageBase64: TEST_IMAGE_BASE64,
    imageName: "card.jpg",
    imageSizeBytes: 5,
    mimeType: "image/jpeg",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_OCR_UNCONFIGURED");
  assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
  assert.equal(result.error.provenance.ocrProviderRequested, false);
});

test("uploaded business card scan rejects unsupported images before calling OCR", async () => {
  let providerCalled = false;
  const service = createLiveBusinessCardScanOcrService({
    cloudOcrProvider: {
      model: "gemini-3.5-flash-lite",
      providerName: "google-gemini-interactions",
      async extract() {
        providerCalled = true;
        throw new Error("Should not be called.");
      },
    },
  });

  const result = await service.scanBusinessCard({
    actorId: ACTOR_ID,
    imageBase64: TEST_IMAGE_BASE64,
    imageName: "card.gif",
    imageSizeBytes: 5,
    mimeType: "image/gif",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_IMAGE_UNSUPPORTED");
  assert.equal(providerCalled, false);
});

test("uploaded business card scan rejects images larger than ten MiB", async () => {
  const service = createLiveBusinessCardScanOcrService({
    cloudOcrProvider: {
      model: "gemini-3.5-flash-lite",
      providerName: "google-gemini-interactions",
      async extract() {
        throw new Error("Should not be called.");
      },
    },
  });

  const result = await service.scanBusinessCard({
    actorId: ACTOR_ID,
    imageBase64: TEST_IMAGE_BASE64,
    imageName: "card.jpg",
    imageSizeBytes: 10 * 1024 * 1024 + 1,
    mimeType: "image/jpeg",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_IMAGE_TOO_LARGE");
});

test("uploaded business card scan redacts cloud OCR failures", async () => {
  const service = createLiveBusinessCardScanOcrService({
    cloudOcrProvider: {
      model: "gemini-3.5-flash-lite",
      providerName: "google-gemini-interactions",
      async extract() {
        throw new Error("printed-card-content");
      },
    },
  });

  const result = await service.scanBusinessCard({
    actorId: ACTOR_ID,
    imageBase64: TEST_IMAGE_BASE64,
    imageName: "card.jpg",
    imageSizeBytes: 5,
    mimeType: "image/jpeg",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_OCR_PROVIDER_FAILED");
  assert.equal(result.error.message.includes("printed-card-content"), false);
  assert.equal(result.error.provenance.ocrProviderRequested, true);
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
    const live = await createBusinessCardScanOcrService("live").scanBusinessCard({
      actorId: ACTOR_ID,
    });

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

    const response = await createBusinessCardScanHandler(async () => ({
      id: ACTOR_ID,
    }))(
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

test("business card scan API accepts JSON image uploads and reaches the cloud OCR boundary", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousGeminiApiKey = process.env.GEMINI_API_KEY;
  const previousGoogleApiKey = process.env.GOOGLE_API_KEY;

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const response = await createBusinessCardScanHandler(async () => ({
      id: ACTOR_ID,
    }))(
      new Request("https://orbit.local/api/contact-drafts/business-card/scan", {
        body: JSON.stringify({
          imageBase64: TEST_IMAGE_BASE64,
          imageName: "card.jpg",
          imageSizeBytes: 5,
          mimeType: "image/jpeg",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(
      body.error.context.businessCardScanOcrErrorCode,
      "BUSINESS_CARD_OCR_UNCONFIGURED",
    );
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.GEMINI_API_KEY = previousGeminiApiKey;
    process.env.GOOGLE_API_KEY = previousGoogleApiKey;
  }
});

test("business card scan API accepts multipart image uploads and reaches the cloud OCR boundary", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const previousGeminiApiKey = process.env.GEMINI_API_KEY;
  const previousGoogleApiKey = process.env.GOOGLE_API_KEY;

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const formData = new FormData();
    formData.append(
      "image",
      new Blob(["image"], { type: "image/png" }),
      "card.png",
    );
    const response = await createBusinessCardScanHandler(async () => ({
      id: ACTOR_ID,
    }))(
      new Request("https://orbit.local/api/contact-drafts/business-card/scan", {
        body: formData,
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(
      body.error.context.businessCardScanOcrErrorCode,
      "BUSINESS_CARD_OCR_UNCONFIGURED",
    );
  } finally {
    process.env.ORBIT_MODULE_MODE = previousModuleMode;
    process.env.GEMINI_API_KEY = previousGeminiApiKey;
    process.env.GOOGLE_API_KEY = previousGoogleApiKey;
  }
});

test("business card scan rejects a missing actor before provider or OCR access", async () => {
  let graphRead = false;
  let ocrCalled = false;
  const service = createLiveBusinessCardScanOcrService({
    cloudOcrProvider: {
      model: "test-model",
      providerName: "test-provider",
      async extract() {
        ocrCalled = true;
        throw new Error("must not run");
      },
    },
    provider: {
      source: "test",
      sourceLabel: "test",
      readBusinessCardScanOcrGraph() {
        graphRead = true;
        return {
          contacts: [],
          evidence: [],
          generatedAt: NOW,
        };
      },
    },
  });

  const result = await service.scanBusinessCard({
    actorId: "",
    imageBase64: TEST_IMAGE_BASE64,
    imageName: "card.jpg",
    imageSizeBytes: 5,
    mimeType: "image/jpeg",
  });

  assert.equal(result.success, false);
  assert.equal(result.error.code, "BUSINESS_CARD_SCAN_ACTOR_REQUIRED");
  assert.equal(graphRead, false);
  assert.equal(ocrCalled, false);
});

test("business card scan API rejects unauthenticated reads before parsing input", async () => {
  const response = await createBusinessCardScanHandler(async () => null)(
    new Request("https://orbit.local/api/contact-drafts/business-card/scan", {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "UNAUTHORIZED");
  assert.equal(body.error.context.service, "authenticated-api-actor");
});
