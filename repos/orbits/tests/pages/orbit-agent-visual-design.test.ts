import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

// iOrbit 任务 6a（计划「已知陷阱」3）：`orbit-real-agent.tsx` /
// `orbit-agent-dashboard.tsx` / `orbit-agent-today-workspace.tsx` 三个融合态文件
// 已删除。这一套断的是**旧绿色控制台皮肤**——那套皮肤今天仍然在（`console-styles.ts`
// 的 `CONSOLE_STYLES`，外层 `[data-orbit-real-page="agent"]` 作用域，供回合内既有富
// 组件与概览屏的「建议与行动」行用），所以整套用例迁到在售的文件上，而不是打补丁：
//   · 壳与对话屏的组合钩子 → `iorbit-shell.tsx` / `iorbit-chat.tsx`
//   · 皮肤本体 → `console-styles.ts`
//   · 「建议与行动」编号行 → `iorbit-home.tsx`（旧 today-workspace 的写能力落点）
// 旧 dashboard 的 `hub-head` / `journeys` / `glass brief-input` / desktop+mobile 两棵树
// 在 Orbit_0918 概览屏里没有对应物（设计 46–253），由 `app-agent-iorbit-home.test.tsx`
// 按设计断言；这里不再为它们保留断言。
const shellSource = readProjectFile("app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx");
const chatSource = readProjectFile("app/(app)/app/agent/iorbit-0918/iorbit-chat.tsx");
const consoleStylesSource = readProjectFile(
  "app/(app)/app/agent/iorbit-0918/console-styles.ts",
);
const homeSource = readProjectFile("app/(app)/app/agent/iorbit-0918/iorbit-home.tsx");
const styles = readProjectFile(
  "app/(app)/app/orbit-reference-styles.tsx",
);

// 视觉定稿：docs/designs/journey/home-console-green.html（产品绿工作台）。
test("the agent shell exposes the scoped composition hooks the console skin needs", () => {
  // 外层作用域是皮肤的挂点（「审阅修订」2 的作用域双层）。
  assert.match(shellSource, /data-orbit-real-page="agent"/);
  assert.match(shellSource, /data-orbit-real-page="iorbit-0918"/);
  assert.match(shellSource, /<style>\{CONSOLE_STYLES\}<\/style>/);
  // 概览 ⇄ 对话骨架（Orbit_0918 对话屏 272–298）
  assert.match(chatSource, /className="ir-thread"/);
  assert.match(chatSource, /className="ir-user-bubble"/);
  assert.match(chatSource, /className="ir-a-row"/);
  // 悬浮输入框已提取到 layout 级的 orbit-global-ask（全站可用、跨页保留草稿），
  // 这一页只负责把自己的 ask 注册成落点，不再自己渲染小球和输入行。
  for (const checked of [shellSource, chatSource]) {
    assert.doesNotMatch(checked, /className=\{`orb-ball/);
    assert.doesNotMatch(checked, /orbit-agent-page-wordmark/);
  }
  // iOrbit 任务 1b：全局提问落点的注册搬进 `use-agent-chat.ts`。
  assert.match(
    readProjectFile("app/(app)/app/agent/iorbit-0918/use-agent-chat.ts"),
    /useOrbitAskTarget\(/,
  );
});

test("Orbit agent styles ship the scoped console-green skin", () => {
  // 整页样式由 CONSOLE_STYLES 注入，全部限定在 agent 作用域
  assert.match(consoleStylesSource, /export const CONSOLE_STYLES = `/);
  assert.match(consoleStylesSource, /\[data-orbit-real-page="agent"\] \.brief \{/);
  assert.match(consoleStylesSource, /\[data-orbit-real-page="agent"\] \.hub-stats \{/);
  // 悬浮输入框的样式跟着组件搬去 orbit-global-ask-styles，不该再留在这里。
  assert.doesNotMatch(consoleStylesSource, /\.orb-overlay \{/);
  // 旧 Conversation+ 聊天皮肤不允许回流
  assert.doesNotMatch(styles, /\.orbit-agent-assistant-turn/);
  assert.doesNotMatch(styles, /\.orbit-agent-composer\b/);
});

test("Orbit agent light presentation keeps the readable token layer", () => {
  assert.match(styles, /\[data-orbit-real-page="agent"\]\s*\{/);
  assert.match(styles, /--agent-canvas:\s*#FFFFFF/i);
  assert.match(styles, /--agent-body-size:\s*15px/);
  assert.match(styles, /--agent-meta-size:\s*12px/);
  assert.match(styles, /body:has\(\[data-orbit-real-page="agent"\]\)/);
});

// iOrbit 任务 6a：旧 `orbit-agent-today-workspace.tsx` 的「建议与行动」是绿色控制台
// 皮肤的 `brief-action-*` 编号行；Orbit_0918 概览屏（设计 196–233）把它重画成
// `ir-signal` 行。两条旧用例（编号行结构 + `.brief-action-row` 栅格对齐）断的是那套
// 皮肤，皮肤本体仍在 `CONSOLE_STYLES` 里但已无消费者，因此改成断**在售的那一套**，
// 并保住「审阅修订」10 / 28 点名不得丢的写能力与 data-* 标记。
test("the iOrbit brief keeps the signal rows, their write controls and the refresh control", () => {
  assert.match(homeSource, /className="ir-signal"/);
  assert.match(homeSource, /data-orbit-agent-signal=\{row\.signal\.signalId\}/);
  assert.match(homeSource, /className="ir-action-icon"/);
  assert.match(homeSource, /className="ir-action-copy"/);
  assert.match(homeSource, /className="ir-signal-ops"/);
  assert.match(homeSource, /updateSignal\(row\.signal\.signalId, "dismissed"\)/);
  assert.match(homeSource, /updateSignal\(row\.signal\.signalId, "snoozed"\)/);
  assert.match(homeSource, /data-orbit-agent-signals-refresh/);
  assert.match(homeSource, /agentSignalsToNextActionRows/);
  assert.match(homeSource, /signals\?view=home/);
});
