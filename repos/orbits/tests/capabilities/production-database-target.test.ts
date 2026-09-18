import assert from "node:assert/strict";
import test from "node:test";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";

test("approved target accepts only the pinned host and workspace", () => {
  const env = {
    ORBIT_EVENT_DATABASE_URL: "postgres://user:secret@new.example/db",
    ORBIT_WORKSPACE_ID: "workspace:new",
    ORBIT_EXPECTED_DATABASE_HOST: "new.example",
    ORBIT_EXPECTED_WORKSPACE_ID: "workspace:new",
  };
  assert.equal(resolveLiveDatabaseConnectionConfig(env)?.workspaceId, "workspace:new");
  assert.throws(() => resolveLiveDatabaseConnectionConfig({ ...env, ORBIT_EVENT_DATABASE_URL: "postgres://user:secret@old.example/db" }), /approved environment/);
  assert.throws(() => resolveLiveDatabaseConnectionConfig({ ...env, ORBIT_WORKSPACE_ID: "workspace:old" }), /approved environment/);
  assert.throws(() => resolveLiveDatabaseConnectionConfig({ ...env, ORBIT_EVENT_DATABASE_URL: undefined }), /missing/);
});

test("local unconfigured environments remain supported", () => {
  assert.equal(resolveLiveDatabaseConnectionConfig({}), null);
  assert.throws(() => resolveLiveDatabaseConnectionConfig({ VERCEL_ENV: "production" }), /explicitly pinned/);
});
