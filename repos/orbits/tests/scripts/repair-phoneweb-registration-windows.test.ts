import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { repairFixture } from "../services/fixtures/phoneweb-registration-window-repair-fixture";

const networkGuardPreload = fileURLToPath(new URL("../support/deny-network-preload.cjs", import.meta.url));
const databaseEnvironmentKeys = [
  "ORBIT_EVENT_DATABASE_URL", "ORBIT_POSTGRES_URL", "DATABASE_URL", "DIRECT_URL",
  "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE",
  "ORBIT_REGISTRATION_REPAIR_URL", "ORBIT_REGISTRATION_REPAIR_TEST_URL", "ORBIT_REGISTRATION_REPAIR_REQUIRE_DB",
] as const;

function isolatedChildEnvironment(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  for (const key of databaseEnvironmentKeys) delete env[key];
  Object.assign(env, overrides);
  return env;
}

function spawnRepair(args: string[], overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, [
    "--require", networkGuardPreload,
    "--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", ...args,
  ], { encoding: "utf8", env: isolatedChildEnvironment(overrides) });
}

test("actual CLI defaults to offline dry-run and leaves the reviewed snapshot unchanged", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "orbit-0064-cli-"));
  const filename = path.join(directory, "synthetic-source.json");
  const bytes = JSON.stringify(repairFixture);
  writeFileSync(filename, bytes, { flag: "wx" });
  try {
    const result = spawnRepair(["--snapshot", filename]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.mode, "dry-run");
    assert.equal(output.plan.changes.length, 13);
    assert.equal(readFileSync(filename, "utf8"), bytes);
    assert.match(result.stderr, /guard: denied=0/u);
  } finally { rmSync(directory, { recursive: true }); }
});

for (const args of [[], ["--aply"], ["--apply"], ["--rollback"], ["--apply", "--rollback", "receipt.json"], ["--snapshot", "missing.json", "--apply"]]) {
  test(`actual CLI refuses unsafe or incomplete invocation ${JSON.stringify(args)}`, () => {
    const result = spawnRepair(args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Repair/u);
    assert.match(result.stderr, /guard: denied=0/u);
  });
}

test("actual CLI rejects a foreign snapshot database before any connection or output success", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "orbit-0064-cli-"));
  const filename = path.join(directory, "foreign-source.json");
  writeFileSync(filename, JSON.stringify({ ...repairFixture, database: "orbit_main" }), { flag: "wx" });
  try {
    const result = spawnRepair(["--snapshot", filename]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Repair target/u);
    assert.match(result.stderr, /guard: denied=0/u);
  } finally { rmSync(directory, { recursive: true }); }
});

test("actual CLI rejects a remote URL without trying the network or leaking credentials", () => {
  const result = spawnRepair([], { ORBIT_REGISTRATION_REPAIR_URL: "postgresql://synthetic:never-print-this@invalid.example:5432/orbit_phoneweb_20260916" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Repair connection target/u);
  assert.doesNotMatch(result.stderr, /never-print-this/u);
  assert.match(result.stderr, /guard: denied=0/u);
});

test("the child preload rejects real network attempts instead of only reporting a guard line", () => {
  const script = `
    const net = require("node:net");
    const http = require("node:http");
    const https = require("node:https");
    const outcomes = [];
    function attempt(name, operation) {
      try {
        operation();
        outcomes.push({ name, denied: false });
      } catch (error) {
        outcomes.push({ name, denied: error?.code === "ORBIT_NETWORK_GUARD_DENIED", code: error?.code });
      }
    }
    attempt("net.connect", () => net.connect({ host: "127.0.0.1", port: 9 }));
    attempt("socket.connect", () => new net.Socket().connect({ host: "127.0.0.1", port: 9 }));
    attempt("http.request", () => http.request("http://127.0.0.1:9"));
    attempt("https.request", () => https.request("https://127.0.0.1:9"));
    (async () => {
      try {
        await fetch("http://127.0.0.1:9");
        outcomes.push({ name: "fetch", denied: false });
      } catch (error) {
        outcomes.push({ name: "fetch", denied: error?.code === "ORBIT_NETWORK_GUARD_DENIED", code: error?.code });
      }
      process.stdout.write(JSON.stringify(outcomes));
      if (outcomes.length !== 5 || outcomes.some((outcome) => !outcome.denied)) process.exitCode = 2;
    })();
  `;
  const result = spawnSync(process.execPath, ["--require", networkGuardPreload, "-e", script], {
    encoding: "utf8",
    env: isolatedChildEnvironment(),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    { name: "net.connect", denied: true, code: "ORBIT_NETWORK_GUARD_DENIED" },
    { name: "socket.connect", denied: true, code: "ORBIT_NETWORK_GUARD_DENIED" },
    { name: "http.request", denied: true, code: "ORBIT_NETWORK_GUARD_DENIED" },
    { name: "https.request", denied: true, code: "ORBIT_NETWORK_GUARD_DENIED" },
    { name: "fetch", denied: true, code: "ORBIT_NETWORK_GUARD_DENIED" },
  ]);
  assert.match(result.stderr, /guard: denied=5/u);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENETUNREACH/u);
});
