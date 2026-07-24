/**
 * <html lang> 恢复测试。
 *
 * ui 基准在服务端解析语言写入 <html lang>，客户端切换时同步 documentElement.lang；
 * chat-agent 曾把它硬编码为 "en"（EN 衬线字体规则对中/日文永远命中）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { orbitHtmlLang } from "../../app/(app)/app/orbit-language-core";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("orbitHtmlLang maps all three languages", () => {
  assert.equal(orbitHtmlLang("en"), "en");
  assert.equal(orbitHtmlLang("ja"), "ja");
  assert.equal(orbitHtmlLang("zh"), "zh-CN");
});

test("the root layout resolves lang per request instead of hardcoding en", () => {
  const layout = readFileSync(join(projectRoot, "app/layout.tsx"), "utf8");
  assert.ok(layout.includes("orbitHtmlLang"));
  assert.ok(!layout.includes('<html lang="en"'));
  assert.ok(layout.includes("suppressHydrationWarning"), "theme init behavior preserved");
  assert.ok(layout.includes("themeInitScript"), "theme script preserved");
});

test("the language context syncs documentElement.lang on switch", () => {
  const context = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-language-context.tsx"),
    "utf8",
  );
  assert.ok(context.includes("document.documentElement.lang = orbitHtmlLang("));
});
