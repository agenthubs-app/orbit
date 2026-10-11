/**
 * R25（SC-R25-07）：旧计划页 / 旧策略页 / App 旧人脉匹配与引荐屏、以及它们专用的两个接口删除后，
 * 两端源码里不再出现指向它们的地址。
 *
 * 扫描范围：Web / 服务端 `repos/orbits` 的 app、features、shared、scripts 与根目录的 .ts，
 * App `repos/orbit-app` 的 app、src、scripts。只看代码文件（.ts / .tsx / .js / .mjs / .cjs）；
 * node_modules、构建产物（.next*）、测试与测试 fixture、文档（含 `shared/contract/BREAKING.md`）不在范围内。
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ORBITS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APP = path.resolve(ORBITS, "../orbit-app");

const ROOTS: readonly string[] = [
  ...["app", "features", "shared", "scripts"].map((dir) => path.join(ORBITS, dir)),
  ...["app", "src", "scripts"].map((dir) => path.join(APP, dir)),
];
const ROOT_FILES_DIRS: readonly string[] = [ORBITS, APP];

const CODE = /\.(?:ts|tsx|js|mjs|cjs)$/u;
const SKIP_DIR = /^(?:node_modules|\.next.*|\.expo|dist|build|coverage|__fixtures__|fixtures)$/u;

/** 旧地址：Web 旧计划页与策略页、App 旧屏、两个专用接口。 */
const LEGACY = [
  "/app/agent/plan",
  "/app/agent/strategy",
  "/contacts/matches",
  "/contacts/intros",
  "/api/contacts/needs-matches",
  "/api/contacts/intros/summary",
] as const;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && CODE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) walk(root, files);
  for (const dir of ROOT_FILES_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (CODE.test(name) && statSync(full).isFile()) files.push(full);
    }
  }
  return files;
}

test("both clients' source scans a real tree (the gate is not vacuous)", () => {
  const files = sourceFiles();
  assert.ok(files.some((file) => file.startsWith(path.join(ORBITS, "app"))), "Web app/ scanned");
  assert.ok(files.some((file) => file.startsWith(path.join(APP, "src"))), "App src/ scanned");
  assert.ok(files.length > 500, `expected a full source tree, found ${files.length} files`);
});

test("no source file still points at a deleted plan screen, old App screen or their endpoints", () => {
  const hits: string[] = [];
  for (const file of sourceFiles()) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const legacy of LEGACY) {
        if (line.includes(legacy)) hits.push(`${path.relative(path.resolve(ORBITS, "../.."), file)}:${index + 1} ${legacy}`);
      }
    });
  }
  assert.deepEqual(hits, [], "point these at shared/compute/plan-href.ts (Task › プラン) or the Task tabs instead");
});
