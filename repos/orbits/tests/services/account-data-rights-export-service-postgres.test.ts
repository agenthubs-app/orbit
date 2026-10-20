import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("export service enforces recent login, actor download isolation, five-minute grants, and seven-day expiry", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const { createAccountExportRecordStore } = await import("../../features/account/data-rights/records");
    const { createAccountExportService } = await import("../../features/account/data-rights/service");
    let now = new Date("2026-10-20T10:00:00.000Z");
    const records = createAccountExportRecordStore({ db, workspaceId: "w", now: () => now });
    const objects = new Map<string, Buffer>();
    const service = createAccountExportService({ records, storage: {
      async get(_actor, key) { return objects.get(key) ?? null; },
    }, secret: "test-secret-1234567890", now: () => now, publicBaseUrl: "https://orbit.example.com" });
    const request = new Request("https://orbit.example.com/api/account/exports");
    assert.equal((await service.create("actor", { scope: ["contacts"], idempotencyKey: "old" }, now.getTime() - 11 * 60_000)).kind, "reauth");
    const created = await service.create("actor", { scope: ["contacts"], idempotencyKey: "current" }, now.getTime() - 60_000);
    assert.equal(created.kind, "accepted");
    const claim = await records.claimNext();
    assert.ok(claim);
    const key = "private-actor.zip";
    const bytes = Buffer.from("PK archive");
    objects.set(key, bytes);
    await records.markReady("actor", created.export!.id, claim.leaseToken, { fileKey: key, checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, fileName: "test.zip", fileSizeBytes: bytes.length });
    const own = await service.get("actor", created.export!.id, request);
    assert.equal(own.kind, "found");
    assert.ok(own.export?.downloadUrl);
    assert.ok(!JSON.stringify(own).includes(key));
    const url = new URL(own.export!.downloadUrl!);
    assert.equal((await service.download("other", created.export!.id, url)).kind, "not-found");
    assert.equal((await service.download("actor", created.export!.id, url)).kind, "ok");
    now = new Date(now.getTime() + 300_000);
    assert.equal((await service.download("actor", created.export!.id, url)).kind, "invalid-grant");
    now = new Date("2026-10-27T10:00:00.000Z");
    const expired = await service.get("actor", created.export!.id, request);
    assert.equal(expired.kind, "found");
    if (expired.kind === "found") assert.equal(expired.export.status, "expired");
    const newUrl = new URL("https://orbit.example.com/api/account/exports/test/download");
    assert.equal((await service.download("actor", created.export!.id, newUrl)).kind, "expired");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});
