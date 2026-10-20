import assert from "node:assert/strict";
import test from "node:test";

import {
  accountDeletionCreateInputSchema,
  accountExportCreateInputSchema,
  accountExportSchema,
} from "../../shared/api-schema/account";

const allScopes = ["contacts", "notes", "tasks", "events", "plans"];

test("export requests keep legacy selected CSV and require the complete exclusive all-JSON preset", () => {
  const legacy = accountExportCreateInputSchema.parse({ scope: ["contacts"], idempotencyKey: "same-request" });
  assert.deepEqual(legacy, { scope: ["contacts"], idempotencyKey: "same-request" });
  assert.equal(accountExportCreateInputSchema.safeParse({ scope: ["contacts"], idempotencyKey: "vcard", mode: "selected", contactsFormat: "vcard" }).success, true);
  assert.equal(accountExportCreateInputSchema.safeParse({ scope: allScopes, idempotencyKey: "all", mode: "all-json" }).success, true);
  for (const body of [
    { scope: ["contacts"], idempotencyKey: "partial", mode: "all-json" },
    { scope: allScopes, idempotencyKey: "mixed", mode: "all-json", contactsFormat: "vcard" },
    { scope: ["notes"], idempotencyKey: "no-contacts", contactsFormat: "vcard" },
    { scope: ["contacts", "contacts"], idempotencyKey: "repeat" },
    { scope: ["contacts"], idempotencyKey: "extra", actorId: "someone-else" },
  ]) assert.equal(accountExportCreateInputSchema.safeParse(body).success, false, JSON.stringify(body));
});

test("deletion application requires a one-time reauth receipt and explicit confirmation", () => {
  assert.deepEqual(accountDeletionCreateInputSchema.parse({ reauthReceipt: "receipt-123", confirmed: true }), { reauthReceipt: "receipt-123", confirmed: true });
  for (const body of [null, {}, { confirmed: true }, { reauthReceipt: "x", confirmed: false }, { reauthReceipt: "x", confirmed: true, accountId: "other" }]) {
    assert.equal(accountDeletionCreateInputSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("export responses accept new progress fields and still read older responses", () => {
  const base = { id: "export-1", scope: ["contacts"], status: "ready", requestedAt: "2026-10-20T00:00:00.000Z" };
  assert.deepEqual(accountExportSchema.parse(base), base);
  const newReply = accountExportSchema.parse({ ...base, mode: "all-json", completedItems: 5, totalItems: 5, readyAt: "2026-10-20T01:00:00.000Z", fileName: "orbit-export.zip", fileSizeBytes: 128, futureKey: true });
  assert.equal(newReply.mode, "all-json");
  assert.equal(newReply.completedItems, 5);
  assert.equal("futureKey" in newReply, false);
});
