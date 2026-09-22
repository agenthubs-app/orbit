/**
 * 侧边栏宽度单一来源测试。
 *
 * 人脉左侧栏宽度 212px 只能有一个来源（`ORBIT_LEFT_SIDEBAR_WIDTH`）。
 *
 * iOrbit 任务 4（2026-09-22）：对话域按 Orbit_0918 设计换成历史记录抽屉，**常驻历史
 * 侧栏与它的拖拽宽度是本计划唯一的一处能力移除**（设计 786–804 没有侧栏，历史、新
 * 对话、分组、置顶、重命名、移动、删除全部改从抽屉进入）。`HISTORY_SIDEBAR_*` 三个
 * 常量与拖拽 state 只剩尚未删除的 `orbit-real-agent.tsx` 在用（它已不再被渲染，任务
 * 6a 连同这几条用例一起删），下面两条因此标注为遗留；新屏这一侧由
 * 「the iOrbit history surface has no resizable sidebar」把「不得回流」钉住。
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

// iOrbit 任务 1b：三个 HISTORY_SIDEBAR_* 常量与 clampHistorySidebarWidth 搬到了
// `iorbit-0918/iorbit-model.ts`（拖拽 JSX 仍在 `orbit-real-agent.tsx`）。
// iOrbit 任务 1c：拖拽宽度 state 与 clampHistorySidebarWidth 的调用点搬到了
// `iorbit-0918/use-agent-history.ts`；`orbit-real-agent.tsx` 只剩 resize handle
// 的 JSX（aria-valuemin/max/now 与两个 handler 的传入）。
const IORBIT_MODEL_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-model.ts";
const IORBIT_HISTORY_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-history.ts";

test("the shared sidebar width matches the 人脉 column", () => {
  assert.equal(ORBIT_LEFT_SIDEBAR_WIDTH, 212);
});

test("[legacy, deleted in task 6a] the iOrbit sidebar derives its default width from the shared constant", () => {
  const agent = source(IORBIT_MODEL_PATH);

  assert.ok(agent.includes("ORBIT_LEFT_SIDEBAR_WIDTH"));
  assert.ok(
    agent.includes("const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH"),
  );
});

test("[legacy, deleted in task 6a] the iOrbit drag lower bound does not exceed the initial width", () => {
  const agent = source(IORBIT_MODEL_PATH);
  const min = Number(
    /const HISTORY_SIDEBAR_MIN_WIDTH = (\d+)/.exec(agent)?.[1] ?? "0",
  );

  assert.ok(min > 0, "HISTORY_SIDEBAR_MIN_WIDTH must be a number literal");
  assert.ok(
    min <= ORBIT_LEFT_SIDEBAR_WIDTH,
    `min ${min} would clamp the ${ORBIT_LEFT_SIDEBAR_WIDTH}px initial width upward`,
  );
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

test("the Today ledger page collapses to one column on mobile", () => {
  for (const file of [
    "app/(app)/app/today/today-page-content.tsx",
  ]) {
    const pageSource = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(pageSource.includes("@media (max-width: 760px)"), file);
  }
});

test("the mobile bar uses a theme token, not hardcoded light glass", () => {
  const shellSource = source("app/(app)/app/orbit-account-shell.tsx");
  assert.ok(shellSource.includes("var(--glass-bar"));
});
