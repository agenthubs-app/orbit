import assert from "node:assert/strict";
import test from "node:test";

import { resolveBusinessCardCaptureAvailability } from "../../features/acquisition/business-card-capture-availability";

const DATABASE_ENV = {
  ORBIT_EVENT_DATABASE_URL: "postgresql://orbit.invalid/audit",
  ORBIT_WORKSPACE_ID: "workspace:audit",
};

test("business card capture availability requires live mode without calling providers", () => {
  const result = resolveBusinessCardCaptureAvailability({
    ...DATABASE_ENV,
    GEMINI_API_KEY: "configured-for-test",
    ORBIT_MODULE_MODE: "hybrid",
  });

  assert.deepEqual(result, {
    available: false,
    contactStorageConfigured: true,
    mode: "hybrid",
    ocrProviderConfigured: true,
    reason: "live_mode_required",
  });
});

test("business card capture availability reports an unconfigured OCR provider", () => {
  const result = resolveBusinessCardCaptureAvailability({
    ...DATABASE_ENV,
    ORBIT_MODULE_MODE: "live",
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "ocr_provider_unconfigured");
  assert.equal(result.ocrProviderConfigured, false);
  assert.equal(result.contactStorageConfigured, true);
});

test("business card capture availability reports missing durable contact storage", () => {
  const result = resolveBusinessCardCaptureAvailability({
    GEMINI_API_KEY: "configured-for-test",
    ORBIT_MODULE_MODE: "live",
  });

  assert.equal(result.available, false);
  assert.equal(result.reason, "contact_storage_unconfigured");
  assert.equal(result.ocrProviderConfigured, true);
  assert.equal(result.contactStorageConfigured, false);
});

test("business card capture is ready with only a DeepSeek key in live mode", () => {
  const result = resolveBusinessCardCaptureAvailability({
    ...DATABASE_ENV,
    DEEPSEEK_API_KEY: "configured-for-test",
    ORBIT_MODULE_MODE: "live",
  });

  assert.deepEqual(result, {
    available: true,
    contactStorageConfigured: true,
    mode: "live",
    ocrProviderConfigured: true,
    reason: "ready",
  });
});

test("business card capture becomes ready only when live OCR and storage are configured", () => {
  const result = resolveBusinessCardCaptureAvailability({
    ...DATABASE_ENV,
    GOOGLE_API_KEY: "configured-for-test",
    ORBIT_MODULE_MODE: "live",
  });

  assert.deepEqual(result, {
    available: true,
    contactStorageConfigured: true,
    mode: "live",
    ocrProviderConfigured: true,
    reason: "ready",
  });
});
