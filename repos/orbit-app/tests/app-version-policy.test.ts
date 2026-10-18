import assert from "node:assert/strict";
import test from "node:test";

import { decideAppVersionGate } from "../src/view-models/app-version-policy";

const version = { minSupportedAppVersion: "1.4.0", latestAppVersion: "1.6.0" };

test("minimum version is advisory unless the server explicitly enforces it", () => {
  assert.deepEqual(decideAppVersionGate(version, "1.3.0"), { kind: "allow" });
  assert.deepEqual(decideAppVersionGate({ ...version, enforceMinimum: false }, "1.3.0"), { kind: "allow" });
  assert.deepEqual(decideAppVersionGate({ ...version, enforceMinimum: true }, "1.4.0"), { kind: "allow" });
  assert.deepEqual(decideAppVersionGate({ ...version, enforceMinimum: true }, "1.3.9"), {
    kind: "force-update",
    latestAppVersion: "1.6.0",
  });
});

test("missing network data or invalid policy fails open with a diagnostic", () => {
  assert.deepEqual(decideAppVersionGate(null, "1.0.0"), { kind: "allow", diagnostic: "policy-unavailable" });
  assert.deepEqual(decideAppVersionGate({ ...version, enforceMinimum: true }, undefined), { kind: "allow", diagnostic: "current-version-unavailable" });
  assert.deepEqual(decideAppVersionGate({ minSupportedAppVersion: "bad", latestAppVersion: "1.6.0", enforceMinimum: true }, "1.0.0"), { kind: "allow", diagnostic: "policy-invalid" });
  assert.deepEqual(decideAppVersionGate({ ...version, enforceMinimum: "true" }, "1.0.0"), { kind: "allow", diagnostic: "policy-invalid" });
  assert.deepEqual(decideAppVersionGate({ ...version, maintenance: { active: "true" } }, "1.0.0"), { kind: "allow", diagnostic: "policy-invalid" });
});

test("maintenance requires explicit active signal and only displays a valid until", () => {
  assert.deepEqual(decideAppVersionGate({ ...version, maintenance: { active: false } }, "1.5.0"), { kind: "allow" });
  assert.deepEqual(decideAppVersionGate({ ...version, maintenance: { active: true } }, "1.5.0"), { kind: "maintenance" });
  assert.deepEqual(decideAppVersionGate({ minSupportedAppVersion: "1.4.0", latestAppVersion: "0.0.0", enforceMinimum: false, maintenance: { active: true } }, "1.5.0"), { kind: "maintenance" });
  assert.deepEqual(decideAppVersionGate({ ...version, maintenance: { active: true, until: "2026-10-19T02:00:00Z" } }, "1.5.0"), {
    kind: "maintenance",
    until: "2026-10-19T02:00:00Z",
  });
  assert.deepEqual(decideAppVersionGate({ ...version, maintenance: { active: true, until: "tomorrow" } }, "1.5.0"), { kind: "maintenance" });
  assert.deepEqual(decideAppVersionGate({ ...version, maintenance: { active: true, until: "2026-02-31T02:00:00Z" } }, "1.5.0"), { kind: "maintenance" });
});
