import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalTestDatabases } from "./assert-local-test-databases.mjs";

try {
  assertLocalTestDatabases();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const defaultTestPatterns = ["tests/**/*.test.{ts,tsx}"];
const testTargets = process.argv.slice(2);
const paidAiBoundary = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-paid-ai-boundary.mjs");
const cssStub = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-css-stub.mjs");
const ledgerDir = mkdtempSync(path.join(os.tmpdir(), "orbits-paid-ai-"));
const ledger = path.join(ledgerDir, "blocked.txt");

const result = spawnSync(
  process.execPath,
  ["--test", "--import", "tsx", "--import", paidAiBoundary, "--import", cssStub, ...(testTargets.length > 0 ? testTargets : defaultTestPatterns)],
  {
    // ORBIT_LEGACY_TEST_LANGUAGE: the pre-R03 Chinese default the old page tests assume
    // (app/(app)/app/orbit-language-core.ts). New tests that check Japanese clear it.
    env: { ...process.env, ORBIT_TEST_PAID_AI_LEDGER: ledger, ORBIT_LEGACY_TEST_LANGUAGE: "zh" },
    stdio: "inherit",
  },
);

let blocked = [];
try {
  blocked = readFileSync(ledger, "utf8").split("\n").filter(Boolean);
} catch {
  // no attempt recorded
}
rmSync(ledgerDir, { force: true, recursive: true });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (blocked.length > 0) {
  const counts = new Map();
  for (const line of blocked) counts.set(line, (counts.get(line) ?? 0) + 1);
  console.error(`\n${blocked.length} paid AI request(s) refused by the test boundary; tests must stub the provider (see scripts/test-paid-ai-boundary.mjs):`);
  for (const [line, count] of counts) console.error(`  ${count}x ${line}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
