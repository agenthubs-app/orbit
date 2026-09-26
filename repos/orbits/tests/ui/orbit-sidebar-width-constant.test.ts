/**
 * 侧边栏宽度单一来源与 iOrbit 历史面防回流测试。
 *
 * 人脉左侧栏宽度 212px 只能有一个来源（`ORBIT_LEFT_SIDEBAR_WIDTH`）。
 *
 * iOrbit 任务 4（2026-09-22）：对话域按 Orbit_0918 设计换成历史记录抽屉，常驻历史
 * 侧栏与拖拽宽度不属于在售能力；「the iOrbit history surface has no resizable sidebar」
 * 把这个边界钉住。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../app/(app)/app/orbit-layout-constants";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}


test("the shared sidebar width matches the 人脉 column", () => {
  assert.equal(ORBIT_LEFT_SIDEBAR_WIDTH, 212);
});

// 能力移除（iOrbit 任务 4）：取代原来的「the iOrbit sidebar is still resizable」。
// 现在跑在 /app/agent 上的是 `iorbit-shell.tsx` + `iorbit-history-drawer.tsx`，
// 两者都不得再出现常驻侧栏或拖拽宽度——旧的两处断言只会在 `orbit-real-agent.tsx`
// 上成立，而那个文件已经不再被渲染。
test("the iOrbit history surface has no resizable sidebar", () => {
  const shell = source("app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx");
  const drawerSource = source("app/(app)/app/agent/iorbit-0918/iorbit-history-drawer.tsx");

  for (const [name, text] of [["shell", shell], ["drawer", drawerSource]] as const) {
    for (const marker of [
      "data-orbit-agent-history-resize-handle",
      "data-orbit-agent-history-sidebar",
      "startHistorySidebarResize",
      "resizeHistorySidebarWithKeyboard",
      "historySidebarWidth",
    ]) {
      assert.ok(
        !text.includes(marker),
        `${name} must not reintroduce the removed history sidebar (${marker})`,
      );
    }
  }

  // 抽屉是设计的固定宽度面板，不是可调栏。
  assert.ok(drawerSource.includes('className="ir-drawer"'));
});

test("no contacts surface hardcodes the sidebar column width", () => {
  const contactsDir = join(projectRoot, "app/(app)/app/contacts");
  const offenders = readdirSync(contactsDir)
    .filter((name) => name.endsWith(".tsx"))
    .filter((name) =>
      readFileSync(join(contactsDir, name), "utf8").includes("212px 1fr"),
    );

  assert.deepEqual(offenders, []);
});

// iOrbit 任务 6a：原来这里有一条 "the Today ledger page collapses to one column on
// mobile"，读的是已删除的 `today/today-page-content.tsx`。取代它的 iOrbit 兄弟屏
// 由 `app-agent-iorbit-screens.test.tsx` 的窄屏塌列用例（任务 5 交付清单第 4 项）覆盖。

test("the mobile bar uses a theme token, not hardcoded light glass", () => {
  const shellSource = source("app/(app)/app/orbit-account-shell.tsx");
  assert.ok(shellSource.includes("var(--glass-bar"));
});
