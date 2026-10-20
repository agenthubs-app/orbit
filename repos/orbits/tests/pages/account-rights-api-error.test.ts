import assert from "node:assert/strict";
import test from "node:test";

import { accountRightsApi, AccountRightsApiError } from "../../app/(app)/app/orbit-2026/account-rights/api";

test("export quota response keeps its nested reason for the recovery message", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: false, error: {
    code: "CONFLICT", message: "The daily export limit has been reached.",
    context: { reason: "DAILY_EXPORT_LIMIT" },
  } }, { status: 429 });
  try {
    await assert.rejects(accountRightsApi.createExport({
      scope: ["contacts", "notes", "plans", "tasks"], mode: "selected", contactsFormat: "csv", idempotencyKey: "retry",
    }), (error: unknown) => error instanceof AccountRightsApiError && error.status === 429 && error.reason === "DAILY_EXPORT_LIMIT");
  } finally {
    globalThis.fetch = original;
  }
});
