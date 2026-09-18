import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Ratchet: every unbounded listRecords read is spelled `limit: "unbounded"` and counted here.
// The frozen baseline may only go down. A new unbounded read in a new or existing file turns this red.
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..", "..");
const SCANNED = ["features", "app", "shared", "scripts"] as const;
const BASELINE_PATH = join(HERE, "unbounded-list-reads.baseline.json");
const MARKER = /limit: "unbounded"/g;

export type UnboundedReadCounts = Record<string, number>;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" || entry === "tests" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

export function countUnboundedReads(root = ROOT): UnboundedReadCounts {
  const counts: UnboundedReadCounts = {};
  for (const directory of SCANNED) {
    for (const file of sourceFiles(join(root, directory))) {
      const hits = readFileSync(file, "utf8").match(MARKER)?.length ?? 0;
      if (hits > 0) counts[relative(root, file)] = hits;
    }
  }
  return counts;
}

export function assertRatchet(actual: UnboundedReadCounts, baseline: UnboundedReadCounts): void {
  const violations: string[] = [];
  for (const [file, count] of Object.entries(actual)) {
    const allowed = baseline[file];
    if (allowed === undefined) violations.push(`${file}: ${count} unbounded read(s) in a file with no baseline entry`);
    else if (count > allowed) violations.push(`${file}: ${count} > baseline ${allowed}`);
  }
  const total = Object.values(actual).reduce((sum, count) => sum + count, 0);
  const allowedTotal = Object.values(baseline).reduce((sum, count) => sum + count, 0);
  if (total > allowedTotal) violations.push(`total: ${total} > baseline ${allowedTotal}`);
  if (violations.length > 0) throw new Error(`Unbounded listRecords reads exceed the ratchet:\n${violations.join("\n")}`);
}

test("unbounded listRecords reads never exceed the frozen ratchet", () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { files: UnboundedReadCounts };
  const actual = countUnboundedReads();
  assert.ok(Object.keys(actual).length > 0, "the scan must find the spelled-out unbounded reads");
  assertRatchet(actual, baseline.files);
  const stale = Object.keys(baseline.files).filter((file) => !(file in actual));
  assert.deepEqual(stale, [], "baseline entries whose reads are gone must be removed so the ratchet keeps tightening");
});

test("the ratchet bites when the baseline is one below the actual count", () => {
  const actual: UnboundedReadCounts = { "features/x/a.ts": 2, "features/y/b.ts": 1 };
  assertRatchet(actual, { ...actual });
  assert.throws(() => assertRatchet(actual, { "features/x/a.ts": 1, "features/y/b.ts": 1 }), /a\.ts: 2 > baseline 1/);
  assert.throws(() => assertRatchet(actual, { "features/x/a.ts": 2 }), /b\.ts: 1 unbounded read\(s\) in a file with no baseline entry/);
});
