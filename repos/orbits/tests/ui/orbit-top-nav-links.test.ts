/**
 * 顶部导航链接完整性测试。
 *
 * 「真实导航」是硬性产品决定：导航里的每个 href 都必须解析到一个真实存在的
 * App Router 页面。这条测试是防止死链回归的闸门。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { productHref } from "../../app/(app)/app/orbit-public-shell";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const shellSource = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
  "utf8",
);

function navHrefs(): readonly string[] {
  const block = shellSource.slice(
    shellSource.indexOf("const links = ["),
    shellSource.indexOf("] as const;", shellSource.indexOf("const links = [")),
  );

  return [...block.matchAll(/\["(\/[^"]*)"/g)].map((match) => match[1]);
}

test("the nav exposes Today plus events, schedule, and contacts", () => {
  assert.deepEqual(navHrefs(), ["/today", "/events", "/schedule", "/contacts"]);
});

test("every nav href resolves to a real App Router page", () => {
  for (const href of navHrefs()) {
    const resolved = productHref(href);
    const pagePath = join(
      projectRoot,
      "app/(app)/app",
      resolved.replace(/^\/app\/?/, ""),
      "page.tsx",
    );

    assert.ok(
      existsSync(pagePath),
      `nav href ${href} resolves to ${resolved} but ${pagePath} does not exist`,
    );
  }
});

test("the retired prototype hrefs are gone", () => {
  for (const dead of ["/explore", "/home/schedule", "/home/cards"]) {
    assert.ok(
      !navHrefs().includes(dead),
      `${dead} is a known 404 and must not return to the nav`,
    );
  }
});

test("today is a valid nav active key", () => {
  assert.ok(shellSource.includes('"today"'));
});
