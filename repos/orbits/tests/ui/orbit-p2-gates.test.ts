/**
 * T9 P2 门测试。
 *
 * 锁住六个 P2 修复项的可观察结果：sun/moon 图标注册、主题切换按钮去 emoji、
 * --ff-serif token 存在、schedule 两个 route 文件变薄壳、dashboard 命名澄清。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function lineCount(path: string): number {
  const text = source(path);
  return text.length === 0 ? 0 : text.split("\n").length;
}

test("P2-2: Icon registry defines sun and moon stroke paths", () => {
  const primitivesSource = source(
    "app/(app)/app/orbit-reference-primitives.tsx",
  );

  assert.match(primitivesSource, /\bsun:\s*</);
  assert.match(primitivesSource, /\bmoon:\s*</);
});

test("P2-2: theme toggle renders icons, not emoji glyphs", () => {
  const themeSource = source("app/(app)/app/orbit-theme.tsx");

  assert.doesNotMatch(themeSource, /[☀\u{1F31C}☾\u{1F319}]/u);
  assert.match(themeSource, /<Icon name=\{isLight \? "moon" : "sun"\}/);
});

test("P2-3: --ff-serif token is defined", () => {
  const stylesSource = source("app/(app)/app/orbit-reference-styles.tsx");

  assert.match(stylesSource, /--ff-serif:\s*'Noto Serif SC'/);
});

test("P2-1: schedule/page.tsx is a thin route adapter (<80 lines)", () => {
  const lines = lineCount("app/(app)/app/schedule/page.tsx");

  assert.ok(
    lines < 80,
    `expected schedule/page.tsx to have fewer than 80 lines, got ${lines}`,
  );
});

test("P2-1: schedule/events/[id]/page.tsx is a thin route adapter (<80 lines)", () => {
  const lines = lineCount(
    "app/(app)/app/schedule/events/[id]/page.tsx",
  );

  assert.ok(
    lines < 80,
    `expected schedule/events/[id]/page.tsx to have fewer than 80 lines, got ${lines}`,
  );
});

test("P2-5: dashboard/page.tsx names the component it renders OrbitRealDashboard", () => {
  const pageSource = source("app/(app)/app/dashboard/page.tsx");

  assert.match(pageSource, /OrbitRealDashboard/);
});
