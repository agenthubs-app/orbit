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

// Known overage, classified instead of raising the frozen baseline (0123).
// fc0569649 (Li-QY, 2026-09-26) added one unbounded read on the non-Postgres
// fallback of listSessionSummariesPage; the Postgres path pages. The baseline may
// only go down, so this file is held to its baseline by a separate TODO test that
// keeps reporting until the read is bounded. Any further growth still fails.
// Sprint 0112 bounded that read (and the file's other four), so the list is empty again.
export const PENDING_RATCHET_OVERAGES: Readonly<Record<string, { actual: number; reason: string }>> = {};

function readBaseline(): UnboundedReadCounts {
  return (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { files: UnboundedReadCounts }).files;
}

test("unbounded listRecords reads never exceed the frozen ratchet", () => {
  const baseline = readBaseline();
  const actual = countUnboundedReads();
  assert.ok(Object.keys(actual).length > 0, "the scan must find the spelled-out unbounded reads");
  const tolerated = { ...baseline };
  for (const [file, overage] of Object.entries(PENDING_RATCHET_OVERAGES)) {
    assert.ok(file in baseline, `${file}: a pending overage needs an existing baseline entry`);
    tolerated[file] = overage.actual;
  }
  assertRatchet(actual, tolerated);
  const stale = Object.keys(baseline).filter((file) => !(file in actual));
  assert.deepEqual(stale, [], "baseline entries whose reads are gone must be removed so the ratchet keeps tightening");
});

for (const [file, overage] of Object.entries(PENDING_RATCHET_OVERAGES)) {
  test(`pending ratchet overage returns to baseline: ${file}`, { todo: overage.reason }, () => {
    const actual = countUnboundedReads()[file] ?? 0;
    assert.ok(actual <= readBaseline()[file], `${file}: ${actual} > baseline ${readBaseline()[file]}`);
  });
}

test("a pending overage tolerates only its recorded count", () => {
  const baseline: UnboundedReadCounts = { "features/x/a.ts": 4 };
  assertRatchet({ "features/x/a.ts": 5 }, { ...baseline, "features/x/a.ts": 5 });
  assert.throws(() => assertRatchet({ "features/x/a.ts": 6 }, { ...baseline, "features/x/a.ts": 5 }), /a\.ts: 6 > baseline 5/);
});

test("the ratchet bites when the baseline is one below the actual count", () => {
  const actual: UnboundedReadCounts = { "features/x/a.ts": 2, "features/y/b.ts": 1 };
  assertRatchet(actual, { ...actual });
  assert.throws(() => assertRatchet(actual, { "features/x/a.ts": 1, "features/y/b.ts": 1 }), /a\.ts: 2 > baseline 1/);
  assert.throws(() => assertRatchet(actual, { "features/x/a.ts": 2 }), /b\.ts: 1 unbounded read\(s\) in a file with no baseline entry/);
});
