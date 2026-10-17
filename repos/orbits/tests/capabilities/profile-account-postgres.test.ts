import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createProfileRouteHandlers } from "../../app/api/profile/handlers";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createTransactionalStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_R18A_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/orbit_line_c_test") {
    throw new Error("R18a tests require the isolated local orbit_line_c_test database");
  }
}

test("R18a PostgreSQL route saves visibility, and the projected reader preserves it through a legacy PUT and fresh read", { skip: databaseUrl ? false : "Local C test database URL is not configured" }, async t => {
  const schema = "r18a_profile_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 2 });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  t.after(async () => {
    await client.close();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  });
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  const provider = createTransactionalStorageProfileProvider({ client, workspaceId: "workspace:r18a-route" });
  const actorId = "actor:r18a-pg";
  const service = createLiveProfileService({ provider });
  const route = createProfileRouteHandlers({ resolveActor: async () => ({ id: actorId }), profileService: () => service });
  const publicFields = { companyRole: false, offeringSeeking: true, intro: false };
  const put = (body: object) => route.PUT(new Request("http://local/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const created = await put({ displayName: "佐藤", organization: "会社", role: "代表", publicFields });
  assert.equal(created.status, 200);
  const first = await service.getProfile({ actorId });
  assert.ok(first.success);
  assert.deepEqual(first.data.profile?.publicFields, publicFields);
  const legacy = await put({ role: "取締役" });
  assert.equal(legacy.status, 200);
  const fresh = await createLiveProfileService({ provider }).getProfile({ actorId });
  assert.ok(fresh.success);
  assert.deepEqual(fresh.data.profile?.publicFields, publicFields);
  assert.equal(fresh.data.completeness.card?.score, 25);
  const other = await service.getProfile({ actorId: "actor:other" });
  assert.ok(other.success);
  assert.equal(other.data.profile, null);
});
