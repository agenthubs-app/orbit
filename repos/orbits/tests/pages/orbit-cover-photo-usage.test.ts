/**
 * 封面图使用回归测试：admin 与 register 必须像 events/home/agent 一样
 * 通过 eventCoverPhoto 渲染真实封面，而不是永远的字母占位图。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

// admin.tsx has two Cover call sites (per-event metrics row + portfolio card);
// register.tsx has a single Cover call site (the PassTicket). Minimums below
// match the ui-baseline source of truth for each file.
const files: Array<[string, number]> = [
  ["app/(app)/app/admin/orbit-real-admin.tsx", 2],
  ["app/(app)/app/register/orbit-real-register.tsx", 1],
];

for (const [file, minCoverSites] of files) {
  test(`${file} renders real event covers`, () => {
    const source = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(source.includes("eventCoverPhoto"), "imports/uses eventCoverPhoto");
    assert.ok(
      (source.match(/imageUrl=\{eventCoverPhoto\(/g) ?? []).length >= minCoverSites,
      `all Cover call sites pass imageUrl (expected >= ${minCoverSites})`,
    );
  });
}
