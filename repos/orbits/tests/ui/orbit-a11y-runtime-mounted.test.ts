/**
 * OrbitResponsiveA11y 挂载测试。
 *
 * 13 个页面依赖它给 orbit-desktop-only/orbit-mobile-only 双树打 inert/aria-hidden；
 * 桌面字体 link 也在同一处丢失过。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const layout = readFileSync(
  join(projectRoot, "app/(app)/app/layout.tsx"),
  "utf8",
);

test("the app layout mounts the responsive a11y runtime", () => {
  assert.ok(layout.includes("OrbitResponsiveA11y"));
});

test("the app layout links the desktop font bundle", () => {
  assert.ok(layout.includes("/iorbit-starfield/fonts/desktop.css"));
});

test("the theme system stays mounted", () => {
  assert.ok(layout.includes("OrbitThemeStyles"));
  assert.ok(layout.includes("OrbitThemeToggle"));
});
