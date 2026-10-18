import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import { loadAppVersionGate } from "../src/api/app-version";

test("startup version reader uses the public version route and enforces only an explicit policy", async () => {
  const paths: string[] = [];
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async (url) => {
    paths.push(String(url));
    return Response.json({ success: true, data: { minSupportedAppVersion: "1.4.0", latestAppVersion: "1.6.0", enforceMinimum: true } });
  } });
  assert.deepEqual(await loadAppVersionGate(client, "1.3.0"), { kind: "force-update", latestAppVersion: "1.6.0" });
  assert.deepEqual(paths, ["http://localhost:3400/api/app/version"]);
});

test("version request failure is safe to enter and carries a diagnostic", async () => {
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async () => Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "offline" } }, { status: 503 }) });
  assert.deepEqual(await loadAppVersionGate(client, "1.0.0"), { kind: "allow", diagnostic: "policy-unavailable" });
  const offlineClient = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async () => { throw new Error("offline"); } });
  assert.deepEqual(await loadAppVersionGate(offlineClient, "1.0.0"), { kind: "allow", diagnostic: "policy-unavailable" });
});

test("explicit maintenance survives a missing latest-version setting", async () => {
  const client = createOrbitApiClient({ baseUrl: "http://localhost:3400", fetchImpl: async () => Response.json({
    success: true,
    data: { minSupportedAppVersion: "1.4.0", latestAppVersion: "0.0.0", enforceMinimum: false, maintenance: { active: true } },
  }) });
  assert.deepEqual(await loadAppVersionGate(client, "1.5.0"), { kind: "maintenance" });
});
