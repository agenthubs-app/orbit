import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Every runtime `pg` pool must be metered, otherwise its reads never reach the
// request read receipt and the coverage figure silently lies. A pool is metered
// when its `new Pool(` is the direct argument of `meterPostgresPool(`, or when it
// lives in one of the two shared clients that run each query through
// `createPostgresReadMetricsRunner` themselves.
// scripts/ is excluded on purpose: CLI tools and diagnostics never serve
// requests and run with receipts disabled; tests build their own pools.
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..", "..");
const SCANNED_DIRECTORIES = ["app", "features", "shared"] as const;
const SCANNED_ROOT_FILES = ["auth.ts", "proxy.ts", "instrumentation.ts"] as const;
const CLIENT_LEVEL_METERING = new Set([
  "shared/storage/postgres-live-record-store.ts",
  "shared/storage/transactional-postgres.ts",
]);
const NEW_POOL = /new\s+Pool\s*\(/g;
const WRAPPED = /meterPostgresPool\(\s*$/;

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(path);
    return /\.(?:ts|tsx|mts|js|mjs)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

export function findUnmeteredPools(root = ROOT): string[] {
  const files = [
    ...SCANNED_DIRECTORIES.flatMap((directory) => sourceFiles(join(root, directory))),
    ...SCANNED_ROOT_FILES.map((file) => join(root, file)).filter((file) => existsSync(file)),
  ];
  const violations: string[] = [];
  for (const file of files) {
    const path = relative(root, file).split("\\").join("/");
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(NEW_POOL)) {
      const line = source.slice(0, match.index).split("\n").length;
      if (WRAPPED.test(source.slice(0, match.index))) continue;
      if (CLIENT_LEVEL_METERING.has(path) && source.includes("createPostgresReadMetricsRunner(")) continue;
      violations.push(`${path}:${line}`);
    }
  }
  return violations;
}

test("every runtime pg pool goes through the read metering entry point", () => {
  assert.deepEqual(findUnmeteredPools(), []);
});

test("the audit bites: an unwrapped pool in a new feature file is reported", () => {
  const root = mkdtempSync(join(tmpdir(), "pool-metering-"));
  try {
    mkdirSync(join(root, "features", "demo"), { recursive: true });
    writeFileSync(join(root, "features", "demo", "wrapped.ts"), "const a = meterPostgresPool(\n  new Pool({ max: 1 }),\n);\n");
    writeFileSync(join(root, "features", "demo", "raw.ts"), "import { Pool } from \"pg\";\n\nconst b = new Pool({ max: 1 });\n");
    mkdirSync(join(root, "shared", "storage"), { recursive: true });
    // An allow-listed path still fails once it stops metering at the client level.
    writeFileSync(join(root, "shared", "storage", "transactional-postgres.ts"), "const c = new Pool({});\n");
    assert.deepEqual(findUnmeteredPools(root).sort(), [
      "features/demo/raw.ts:3",
      "shared/storage/transactional-postgres.ts:1",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
