import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../app/api/app/version/route";

const CONFIG_KEYS = [
  "ORBIT_MODULE_MODE",
  "ORBIT_APP_MIN_SUPPORTED_VERSION",
  "ORBIT_APP_LATEST_VERSION",
  "ORBIT_APP_ENFORCE_MINIMUM",
  "ORBIT_APP_MAINTENANCE_ACTIVE",
  "ORBIT_APP_MAINTENANCE_UNTIL",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

async function withVersionConfig(values: Partial<Record<(typeof CONFIG_KEYS)[number], string>>, run: () => Promise<void>) {
  const previous = Object.fromEntries(CONFIG_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of CONFIG_KEYS) {
      if (key in values) process.env[key] = values[key];
      else delete process.env[key];
    }
    process.env.ORBIT_MODULE_MODE = "live";
    await run();
  } finally {
    for (const key of CONFIG_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const readVersion = () => GET(new Request("http://localhost/api/app/version"));

test("live version route reads server policy and never caches it", async () => {
  await withVersionConfig({
    ORBIT_APP_MIN_SUPPORTED_VERSION: "1.4.0",
    ORBIT_APP_LATEST_VERSION: "1.6.2",
    ORBIT_APP_ENFORCE_MINIMUM: "true",
    VERCEL_GIT_COMMIT_SHA: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  }, async () => {
    const response = await readVersion();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-orbit-feature-mode"), "live");
    assert.deepEqual((await response.json()).data, {
      minSupportedAppVersion: "1.4.0",
      latestAppVersion: "1.6.2",
      enforceMinimum: true,
      webBuildId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    });
  });
});

test("missing or invalid version policy fails open with a diagnostic, not demo versions", async () => {
  await withVersionConfig({ ORBIT_APP_MIN_SUPPORTED_VERSION: "not-a-version", ORBIT_APP_ENFORCE_MINIMUM: "true" }, async () => {
    const response = await readVersion();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      minSupportedAppVersion: "0.0.0",
      latestAppVersion: "0.0.0",
      enforceMinimum: false,
    });
  });
  await withVersionConfig({ ORBIT_APP_MIN_SUPPORTED_VERSION: "1.4.0", ORBIT_APP_ENFORCE_MINIMUM: "true" }, async () => {
    const response = await readVersion();
    const data = (await response.json()).data;
    assert.equal(data.enforceMinimum, false, "a missing latest version is not an enforceable policy");
    assert.equal(data.latestAppVersion, "0.0.0", "a missing release must not advertise an update");
  });
  await withVersionConfig({
    ORBIT_APP_MIN_SUPPORTED_VERSION: "2.0.0",
    ORBIT_APP_LATEST_VERSION: "1.9.0",
    ORBIT_APP_ENFORCE_MINIMUM: "true",
  }, async () => {
    const response = await readVersion();
    assert.equal((await response.json()).data.enforceMinimum, false, "minimum cannot exceed latest");
  });
});

test("maintenance requires an explicit active signal and only exposes a valid until", async () => {
  await withVersionConfig({ ORBIT_APP_MIN_SUPPORTED_VERSION: "1.4.0", ORBIT_APP_MAINTENANCE_ACTIVE: "true" }, async () => {
    assert.deepEqual((await (await readVersion()).json()).data, {
      minSupportedAppVersion: "1.4.0",
      latestAppVersion: "0.0.0",
      enforceMinimum: false,
      maintenance: { active: true },
    });
  });
  await withVersionConfig({ ORBIT_APP_MAINTENANCE_ACTIVE: "true", ORBIT_APP_MAINTENANCE_UNTIL: "2026-10-19T02:00:00Z" }, async () => {
    assert.deepEqual((await (await readVersion()).json()).data.maintenance, { active: true, until: "2026-10-19T02:00:00Z" });
  });
  await withVersionConfig({ ORBIT_APP_MAINTENANCE_ACTIVE: "false", ORBIT_APP_MAINTENANCE_UNTIL: "2026-10-19T02:00:00Z" }, async () => {
    assert.equal((await (await readVersion()).json()).data.maintenance, undefined);
  });
  await withVersionConfig({ ORBIT_APP_MAINTENANCE_ACTIVE: "true", ORBIT_APP_MAINTENANCE_UNTIL: "tomorrow" }, async () => {
    assert.deepEqual((await (await readVersion()).json()).data.maintenance, { active: true });
  });
  await withVersionConfig({ ORBIT_APP_MAINTENANCE_ACTIVE: "true", ORBIT_APP_MAINTENANCE_UNTIL: "2026-02-31T02:00:00Z" }, async () => {
    assert.deepEqual((await (await readVersion()).json()).data.maintenance, { active: true }, "normalized calendar dates are not valid published times");
  });
});
