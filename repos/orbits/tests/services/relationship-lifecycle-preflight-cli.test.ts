import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const now = "2026-08-21T01:00:00.000Z";
const records = [
  { collectionName: "contacts", recordId: "contact:a", payload: { id: "contact:a", version: 1 } },
  { collectionName: "connections", recordId: "connection:a", payload: { id: "connection:a", accountId: "actor:a", contactId: "contact:a", stage: "active", activeGoal: "PRIVATE GOAL", version: 1, createdAt: now, updatedAt: now } },
].map((record) => ({ workspaceId: "workspace:test", userId: "actor:a", sourceType: "manual", sourceId: "test", evidenceIds: [], createdAt: now, updatedAt: now, lifecycleState: "active", ...record }));

async function command(input: string, argumentsFor: (path: string) => string[]) {
  const directory = await mkdtemp(join(tmpdir(), "orbit-lifecycle-preflight-"));
  const path = join(directory, "input.json");
  try {
    await writeFile(path, input);
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-relationship-lifecycle.ts", ...argumentsFor(path)], {
      cwd: process.cwd(), encoding: "utf8", timeout: 5000,
      env: { ...process.env, ORBIT_LIVE_DATABASE_URL: "postgresql://must-not-contact.invalid/db" },
    });
    assert.equal(result.error, undefined);
    assert.equal(await readFile(path, "utf8"), input);
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const args = (path: string) => ["--input", path, "--actor", "actor:a", "--workspace", "workspace:test"];

test("offline preflight prints a report without mutating input or using database configuration", async () => {
  const result = await command(JSON.stringify(records), args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).readyForCutover, true);
  assert.equal(result.stdout.includes("PRIVATE GOAL"), false);
});

test("offline preflight exits two for review cases and still emits structured diagnostics", async () => {
  const result = await command(JSON.stringify(records.slice(0, 1)), args);
  assert.equal(result.status, 2, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).issues, [{ code: "MISSING_CONNECTION", collectionName: "contacts", recordId: "contact:a" }]);
  assert.equal(result.stderr, "");
});

test("offline preflight rejects missing, unknown and repeated parameters including apply", async () => {
  for (const argumentsFor of [() => [], (path: string) => ["--input", path], (path: string) => [...args(path), "--apply"], (path: string) => [...args(path), "--actor", "actor:a"], (path: string) => [...args(path), "--unknown", "value"]]) {
    const result = await command(JSON.stringify(records), argumentsFor);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /arguments/i);
  }
});

test("offline preflight reports malformed JSON and envelopes without exposing input text", async () => {
  for (const input of ['{"PRIVATE_SECRET":', '{"PRIVATE_SECRET":"value"}', '[null]', '[{"payload":"PRIVATE_SECRET"}]', JSON.stringify([{ ...records[0], lifecycleState: ["active"] }])]) {
    const result = await command(input, args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes("PRIVATE_SECRET"), false);
    assert.match(result.stderr, /input/i);
  }
});

test("offline preflight reports unreadable input paths without a partial success report", async () => {
  const result = await command(JSON.stringify(records), (path) => args(`${path}.missing`));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /input/i);
});
