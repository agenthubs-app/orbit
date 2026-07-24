/**
 * productHref 单一实现测试。
 *
 * 历史上 shell 内联版与共享模块版语义分裂（"/" 与 /app* 透传）。
 * 本测试锁定统一后的语义，并确认 shell 只 re-export 不再自带实现。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { productHref } from "../../app/(app)/app/orbit-product-href";
import { productHref as shellProductHref } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("app-prefixed hrefs pass through untouched", () => {
  assert.equal(productHref("/app"), "/app");
  assert.equal(productHref("/app/agent"), "/app/agent");
  assert.equal(productHref("/app?x=1"), "/app?x=1");
});

test("root stays root (the starfield home lives at /)", () => {
  assert.equal(productHref("/"), "/");
});

test("prototype mappings survive the unification", () => {
  assert.equal(productHref("/explore"), "/app/events");
  assert.equal(productHref("/home/cards"), "/app/contacts");
  assert.equal(productHref("/home/schedule"), "/app/followups");
  assert.equal(productHref("/today"), "/app/today");
});

test("the shell re-exports the shared implementation", () => {
  assert.equal(shellProductHref, productHref);
  const shellSource = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
    "utf8",
  );
  assert.ok(shellSource.includes('export { productHref } from "./orbit-product-href"'));
  assert.ok(!/export function productHref/.test(shellSource));
});
