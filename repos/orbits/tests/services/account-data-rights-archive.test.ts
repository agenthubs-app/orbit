import assert from "node:assert/strict";
import test from "node:test";

import { unzipSync, strFromU8 } from "fflate";

test("selected export contains safe CSV and vCard with a manifest", async () => {
  const { buildAccountExportArchive } = await import("../../features/account/data-rights/archive");
  const zip = await buildAccountExportArchive({
    scope: ["contacts", "notes"], mode: "selected", contactsFormat: "csv", generatedAt: "2026-10-20T00:00:00.000Z",
    read: async scope => scope === "contacts"
      ? [{ id: "c1", displayName: "=SUM(1,2)", email: "x@example.com", phone: "+81", organization: "A, Inc." }]
      : [{ id: "n1", title: "a", body: "line\nnext", createdAt: "2026-10-19T00:00:00Z" }],
  });
  const files = unzipSync(zip);
  assert.deepEqual(Object.keys(files).sort(), ["contacts.csv", "manifest.json", "notes.csv"]);
  assert.match(strFromU8(files["contacts.csv"]!), /"'=SUM\(1,2\)"/);
  assert.match(strFromU8(files["notes.csv"]!), /"line\nnext"/);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.generatedAt, "2026-10-20T00:00:00.000Z");
  assert.equal(manifest.files[0].count, 1);

  const plansZip = await buildAccountExportArchive({
    scope: ["plans"], mode: "selected", contactsFormat: "csv", generatedAt: "2026-10-20T00:00:00.000Z",
    read: async () => [{ id: "log1", kind: "log", title: "note", body: "progress", planId: "p1" }],
  });
  assert.match(strFromU8(unzipSync(plansZip)["plans.csv"]!), /"log","note","progress"/);

  const vcard = await buildAccountExportArchive({
    scope: ["contacts"], mode: "selected", contactsFormat: "vcard", generatedAt: "2026-10-20T00:00:00.000Z",
    read: async () => [{ id: "c1", displayName: "A;B, C\nD", email: "x@example.com" }],
  });
  const card = strFromU8(unzipSync(vcard)["contacts.vcf"]!);
  assert.match(card, /FN:A\\;B\\, C\\nD/);
  assert.match(card, /EMAIL:x@example.com/);
});

test("all-json reads five domains, excludes unrequested files, and fails visibly on missing or oversized data", async () => {
  const { buildAccountExportArchive } = await import("../../features/account/data-rights/archive");
  const readScopes: string[] = [];
  const archive = await buildAccountExportArchive({
    scope: ["contacts"], mode: "all-json", contactsFormat: "csv", generatedAt: "2026-10-20T00:00:00.000Z",
    read: async scope => { readScopes.push(scope); return [{ id: scope }]; },
  });
  assert.deepEqual(readScopes, ["contacts", "notes", "plans", "tasks", "events"]);
  const files = unzipSync(archive);
  assert.deepEqual(Object.keys(files).sort(), ["contacts.json", "events.json", "manifest.json", "notes.json", "plans.json", "tasks.json"]);
  await assert.rejects(() => buildAccountExportArchive({
    scope: ["contacts"], mode: "selected", contactsFormat: "csv", generatedAt: "2026-10-20T00:00:00.000Z",
    read: async () => null,
  }), /Export domain unavailable: contacts/);
  await assert.rejects(() => buildAccountExportArchive({
    scope: ["notes"], mode: "selected", contactsFormat: "csv", generatedAt: "2026-10-20T00:00:00.000Z", maxBytes: 100,
    read: async () => [{ body: "long".repeat(100) }],
  }), /Export exceeds size limit/);
});
