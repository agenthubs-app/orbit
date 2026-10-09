import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Sprint 0117 (dashboard D3, design decision 3): orbits/shared/compute is the
// one directory of runtime code the server and the App share. npm run
// sync:contract copies it to src/api/compute byte for byte; the App runs the
// server's own audit of the directory rule (imports only each other, contract
// types and the two synced dictionaries; no IO, network, clock or
// runtime-dependent text outside the text helper), so a file that breaks the
// rule fails here too. The domain dictionary rule (industries + language only)
// is unchanged (tests/domain-sync.test.ts).

const appRoot = new URL("..", import.meta.url).pathname;
const sourceDir = join(appRoot, "..", "orbits", "shared", "compute");
const copyDir = join(appRoot, "src", "api", "compute");

interface Audit {
  auditSharedComputeSources(sources: readonly { name: string; text: string }[]): string[];
  COMPUTE_TEXT_HELPER: string;
}
const loadAudit = () => import(pathToFileURL(join(appRoot, "..", "orbits", "tests", "support", "shared-compute-audit.ts")).href) as Promise<Audit>;

function tsFiles(directory: string): string[] {
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".ts")).sort() : [];
}

test("the shared compute copy has the server's files, byte for byte", () => {
  assert.equal(existsSync(sourceDir), true, `shared compute source is missing: ${sourceDir}`);
  assert.equal(existsSync(copyDir), true, "run npm run sync:contract to copy shared/compute");
  assert.deepEqual(readdirSync(copyDir).sort(), tsFiles(sourceDir), "same files, nothing else");
  const drifted = tsFiles(sourceDir).filter((name) => readFileSync(join(sourceDir, name), "utf8") !== readFileSync(join(copyDir, name), "utf8"));
  assert.deepEqual(drifted, [], "the copy is stale: run npm run sync:contract");
});

test("the App's copy follows the shared-directory rule (the server's own audit)", async () => {
  const { auditSharedComputeSources } = await loadAudit();
  const sources = tsFiles(copyDir).map((name) => ({ name, text: readFileSync(join(copyDir, name), "utf8") }));
  assert.deepEqual(auditSharedComputeSources(sources), []);
});

test("a compute file with a server import, IO, network or a non-relative import fails the audit", async () => {
  const { auditSharedComputeSources, COMPUTE_TEXT_HELPER } = await loadAudit();
  const helper = { name: COMPUTE_TEXT_HELPER, text: "export const compareText = (a: string, b: string) => new Intl.Collator(\"en-US\").compare(a, b);\n" };
  const cases: Record<string, string> = {
    "server.ts": "import { x } from \"../../features/sync/domain-registry\";\nexport const y = x;\n",
    "storage.ts": "import { pool } from \"../storage/postgres-live-record-store\";\nexport const p = pool;\n",
    "package.ts": "import React from \"react\";\nexport const r = React;\n",
    "alias.ts": "import { t } from \"@/api/contract/sync\";\nexport const a = t;\n",
    "io.ts": "import { readFileSync } from \"node:fs\";\nexport const f = readFileSync;\n",
    "network.ts": "export const n = () => fetch(\"https://orbit.local\");\n",
    "clock.ts": "export const n = () => Date.now();\n",
  };
  const problems = auditSharedComputeSources([helper, ...Object.entries(cases).map(([name, text]) => ({ name, text }))]);
  for (const name of Object.keys(cases)) assert.ok(problems.some((problem) => problem.startsWith(name)), `${name}: ${problems.join(" | ")}`);
});

test("the sync script copies shared/compute (and still only the two domain dictionaries), removes stale copies, and copies no other shared directory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "orbit-compute-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, "orbit-app");
  const shared = join(root, "orbits", "shared");
  mkdirSync(join(app, "scripts"), { recursive: true });
  copyFileSync(join(appRoot, "scripts", "sync-contract.mjs"), join(app, "scripts", "sync-contract.mjs"));
  for (const directory of ["contract", "api-schema", "domain", "compute", "design", "storage", "api"]) mkdirSync(join(shared, directory), { recursive: true });
  writeFileSync(join(shared, "contract", "index.ts"), "export type Identifier = string;\n");
  writeFileSync(join(shared, "api-schema", "sample.ts"), "export const version = 1;\n");
  writeFileSync(join(shared, "domain", "industries.ts"), "export const INDUSTRY_IDS = ['other'] as const;\n");
  writeFileSync(join(shared, "domain", "language.ts"), "export const ORBIT_LANGUAGES = ['zh'] as const;\n");
  writeFileSync(join(shared, "domain", "server-only.ts"), "export const privateRuntime = true;\n");
  writeFileSync(join(shared, "compute", "compute-text.ts"), "export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);\n");
  writeFileSync(join(shared, "compute", "dashboard-sample.ts"), "import { compareText } from \"./compute-text\";\nexport const first = (values: string[]) => [...values].sort(compareText)[0];\n");
  writeFileSync(join(shared, "compute", "notes.md"), "not code\n");
  writeFileSync(join(shared, "design", "tokens.ts"), "export const designColors = {} as const;\n");
  writeFileSync(join(shared, "storage", "pool.ts"), "export const pool = 'server-only';\n");
  writeFileSync(join(shared, "api", "envelope.ts"), "export const envelope = 'server-only';\n");
  const target = join(app, "src", "api", "compute");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "stale.ts"), "export const stale = true;\n");

  for (let run = 0; run < 2; run += 1) {
    execFileSync(process.execPath, [join(app, "scripts", "sync-contract.mjs")], { cwd: app });
    assert.deepEqual(readdirSync(target).sort(), ["compute-text.ts", "dashboard-sample.ts"], "every compute .ts file, no stale copy, no non-code file");
    assert.equal(readFileSync(join(target, "dashboard-sample.ts"), "utf8"), readFileSync(join(shared, "compute", "dashboard-sample.ts"), "utf8"));
    assert.deepEqual(readdirSync(join(app, "src", "api", "domain")).sort(), ["industries.ts", "language.ts"], "the domain rule is unchanged");
    assert.deepEqual(readdirSync(join(app, "src", "api")).sort(), ["compute", "contract", "design", "domain", "schema"], "no other shared directory reaches the App");
  }
});
