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

const agentSource = readProjectFile(
  "app/(app)/app/agent/orbit-real-agent.tsx",
);
const dashboardSource = readProjectFile(
  "app/(app)/app/agent/orbit-agent-dashboard.tsx",
);
const styles = readProjectFile(
  "app/(app)/app/orbit-reference-styles.tsx",
);

// 视觉定稿：docs/designs/journey/home-console-green.html（产品绿工作台）。
test("Orbit agent workspace exposes the console-green composition hooks", () => {
  assert.match(agentSource, /className="orbit-agent-workspace"/);
  assert.match(agentSource, /data-orbit-real-page="agent"/);
  // dashboard ⇄ 对话页骨架
  assert.match(agentSource, /className="ws-body orbit-desktop-only"/);
  assert.match(agentSource, /className="thread-bar"/);
  assert.match(agentSource, /className="msg-user"/);
  assert.match(agentSource, /className="msg-a"/);
  // 悬浮输入框已提取到 layout 级的 orbit-global-ask（全站可用、跨页保留草稿），
  // 这一页只负责把自己的 ask 注册成落点，不再自己渲染小球和输入行。
  assert.doesNotMatch(agentSource, /className=\{`orb-ball/);
  assert.match(agentSource, /useOrbitAskTarget\(/);
  assert.doesNotMatch(agentSource, /orbit-agent-page-wordmark/);
});

test("Orbit agent styles ship the scoped console-green skin", () => {
  // 整页样式由 CONSOLE_STYLES 注入，全部限定在 agent 作用域
  assert.match(agentSource, /const CONSOLE_STYLES = `/);
  assert.match(agentSource, /\[data-orbit-real-page="agent"\] \.brief \{/);
  assert.match(agentSource, /\[data-orbit-real-page="agent"\] \.hub-stats \{/);
  // 悬浮输入框的样式跟着组件搬去 orbit-global-ask-styles，不该再留在这里。
  assert.doesNotMatch(agentSource, /\.orb-overlay \{/);
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

test("Orbit agent dashboard renders the console-green sections", () => {
  assert.match(dashboardSource, /className="hub-head"/);
  assert.match(dashboardSource, /className="hub-stats"/);
  assert.match(dashboardSource, /className="brief"/);
  assert.match(dashboardSource, /className="card journeys"/);
  assert.match(dashboardSource, /className="glass brief-input"/);
});
