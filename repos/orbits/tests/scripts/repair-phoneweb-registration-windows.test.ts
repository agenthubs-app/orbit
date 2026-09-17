import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { repairFixture } from "../services/fixtures/phoneweb-registration-window-repair-fixture";

test("actual CLI defaults to offline dry-run and leaves the reviewed snapshot unchanged", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "orbit-0064-cli-"));
  const filename = path.join(directory, "synthetic-source.json");
  const bytes = JSON.stringify(repairFixture);
  writeFileSync(filename, bytes, { flag: "wx" });
  try {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", "--snapshot", filename], { encoding: "utf8", env: process.env });
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
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", ...args], { encoding: "utf8", env: process.env });
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
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts", "--snapshot", filename], { encoding: "utf8", env: process.env });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Repair target/u);
    assert.match(result.stderr, /guard: denied=0/u);
  } finally { rmSync(directory, { recursive: true }); }
});

test("actual CLI rejects a remote URL without trying the network or leaking credentials", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/repair-phoneweb-registration-windows.ts"], { encoding: "utf8", env: { ...process.env, ORBIT_REGISTRATION_REPAIR_URL: "postgresql://synthetic:never-print-this@invalid.example:5432/orbit_phoneweb_20260916" } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Repair connection target/u);
  assert.doesNotMatch(result.stderr, /never-print-this/u);
  assert.match(result.stderr, /guard: denied=0/u);
});
