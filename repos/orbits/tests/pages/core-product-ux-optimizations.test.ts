import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { iorbitChatSurfaceSource } from "./iorbit-chat-surface-source";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("starfield examples fill the prompt and disclose scope without auto-running", () => {
  const binding = source("app/(app)/app/orbit-starfield-agent-prompt.ts");

  assert.match(binding, /const fillFromExample/);
  assert.match(binding, /input\.value = candidate\.trim\(\)/);
  assert.match(binding, /const onHostClick/);
  assert.match(binding, /closest<HTMLButtonElement>\("\.sk-chip"\)/);
  assert.match(binding, /host\.addEventListener\("click", onHostClick\)/);
  assert.match(binding, /点击发送后才开始/);

  for (const variant of ["desktop", "mobile"]) {
    const component = source(`app/(app)/app/orbit-starfield-${variant}.tsx`);
    const runtime = source(`app/(app)/app/orbit-starfield-${variant}-logic.ts`);

    assert.match(component, /id="skPromptScope"/);
    assert.match(component, /aria-describedby="skPromptScope"/);
    assert.match(component, /示例预览 · 导入后换成真实数据/);
    assert.doesNotMatch(component, /已报名 826 人/);
    assert.match(component, /"zIndex":"20"/);
    assert.match(runtime, /找出现在/);
    assert.match(runtime, /示例预览 · 导入后换成真实数据/);
    assert.doesNotMatch(runtime, /已报名 826 人/);
  }
});

test("the global composer collapses after explicit send and suggestion chips only fill", () => {
  const dock = source("app/(app)/app/orbit-global-ask/orbit-global-ask.tsx");
  const context = source("app/(app)/app/orbit-global-ask/orbit-ask-context.tsx");

  assert.match(dock, /setDraft\?\.\(chip\.query\)/);
  assert.doesNotMatch(dock, /onClick=\{\(\) => send\(chip\.query\)\}/);
  assert.match(context, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(context, /useEffect\(\(\) => \{\s*setOpen\(false\);\s*\}, \[pathname\]\)/);
  assert.match(context, /target\.onAsk\(trimmed\);\s*setOpen\(false\)/);
  assert.match(dock, /!isOrbitAskHome\(pathname\)/);
});

test("Agent waiting, timeout recovery, and trust summaries state their real boundaries", () => {
  // iOrbit 任务 1b：等待文案与超时常量在 `iorbit-model.ts`，重试/未确认文案由
  // `use-agent-chat.ts` 的 ask() 产出，JSX 留在 `orbit-real-agent.tsx`。
  const agent = iorbitChatSurfaceSource();
  const model = source("app/(app)/app/agent/iorbit-0918/iorbit-model.ts");
  const chatHook = source("app/(app)/app/agent/iorbit-0918/use-agent-chat.ts");
  const historyHook = source("app/(app)/app/agent/iorbit-0918/use-agent-history.ts");

  assert.match(agent, /Usually under a minute/);
  assert.match(model, /AGENT_REQUEST_TIMEOUT_MS = 60_000/);
  assert.match(model, /controller\.abort\(\)/);
  assert.match(chatHook, /retryRequest: query/);
  assert.match(chatHook, /服务器结果尚未确认/);
  assert.match(chatHook, /不会重复生成/);
  for (const checked of [agent, model, chatHook, historyHook]) {
    assert.doesNotMatch(checked, /本次请求已停止/);
    assert.doesNotMatch(checked, /The request took over .* and was stopped/);
    assert.doesNotMatch(checked, /依据 \$\{totalItems\} 条 · 未执行外部动作/);
    assert.doesNotMatch(checked, /查看完整处理过程/);
  }
  assert.match(chatHook, /不会把泛化回答展示成真实推荐/);
});

test("both recommendation and follow-up queue cards generate an editable draft in place", () => {
  const agent = iorbitChatSurfaceSource();

  assert.match(agent, /function AgentPeopleRow[\s\S]*?useAgentInlineDraft/);
  assert.match(agent, /function AgentTodoRow[\s\S]*?useAgentInlineDraft[\s\S]*?Generate follow-up draft/);
  assert.match(agent, /\/app\/contacts\?query=\$\{encodeURIComponent\(group\.contactName\)\}/);
  assert.match(agent, /data-agent-inline-draft/);
  // 「邮件止于草稿」这条承诺从左下角的灰色脚注升级成了和按钮同级的状态条，
  // 断言跟着改成新文案，同时钉住它是 .draft-guard 而不是又退回脚注。
  assert.match(agent, /className="draft-guard"/);
  assert.match(agent, /仅草稿 · 未发送/);
  assert.match(agent, /Orbit 不会代你发送，发送由你在草稿箱确认。/);
  assert.match(agent, /复制草稿/);
});

// iOrbit 任务 6a：原来这里有一条 "an empty account gets an honest non-persistent
// example before import"，断的是批次 4a dashboard（`orbit-agent-dashboard.tsx`）在
// `home.stats.people === 0` 时渲染的「示例不会冒充真实联系人或账号数据」样例块。
// Orbit_0918 概览屏（设计 46–253）没有这个块，任务 2 重建时按「无来源不伪造」走了
// 空态文案，该样例块因此在任务 2 就已经不在售；本任务只是删掉最后一份源码。
// **这是一条能力损失**，已记进 6a 报告的关注点，留给任务 7 决定是否按设计补回。

test("secondary contact views are grouped behind one reversible disclosure", () => {
  const sidebar = source("app/(app)/app/contacts/orbit-crm-sidebar.tsx");

  assert.match(sidebar, /item\.key === "list"/);
  assert.match(sidebar, /item\.key === "pipeline"/);
  assert.match(sidebar, /const currentActive = active === "graph" \? "dashboard" : active/);
  assert.match(sidebar, /item\.key === currentActive/);
  assert.match(sidebar, /更多分析与记录/);
  assert.match(sidebar, /setExpanded\(\(value\) => !value\)/);
});

// iOrbit 任务 6a：原来这里有两条 Today 用例（"Today limits and groups decisions while
// keeping overflow traceable" / "Today only accepts actor-authorized records as schedule
// truth"），断的是 `/app/today` 路由的 view model 与页面。该路由已随路由归并删除
// （取代者：`/app/agent/actions` 账本三档 + `/app/agent/plan` 本周日程），两条用例
// 的全部主语都不存在了，随路由一并删除；取代屏的同类断言在
// `app-agent-iorbit-screens.test.tsx` 与三个 `*-route-view-model.test.ts` 里。

test("event registration display respects the same published window as backend writes", () => {
  const detail = source("app/(app)/app/events/events-0918/event-detail.tsx");
  const windowProvider = source("features/events/registration/storage/event-operations-window-provider.ts");
  const registrationRepository = source("features/events/event-operations/storage/canonical-registration-repository.ts");

  assert.match(detail, /event\.status !== "upcoming"/);
  assert.match(detail, /报名已结束/);
  assert.match(detail, /eventRegistrationIsOpen\(registrationAvailability\)/);
  assert.doesNotMatch(detail, /开放报名时提醒我/);
  assert.doesNotMatch(detail, /查看其他可报名活动/);
  assert.doesNotMatch(detail, /SAMPLE_MATCHES/);
  assert.match(windowProvider, /admission_policy\.registration_closes_at/);
  assert.match(windowProvider, /configuration\.registration_cutoff_at/);
  assert.match(registrationRepository, /admission_policy\.registration_closes_at/);
  assert.match(registrationRepository, /configuration\.registration_cutoff_at/);
});

test("long result surfaces expose list semantics for keyboard and screen-reader navigation", () => {
  // The contacts list surface moved to network-0918/network-all.tsx (Orbit_0918);
  // its skip-link / role="list" semantics are not part of the design spec and
  // are tracked as an a11y follow-up rather than asserted here.
  // iOrbit 任务 6a：历史列表这一侧从删除的常驻侧栏搬到了 `iorbit-history-drawer.tsx`，
  // 列表语义跟着搬（设计是 `<div>` 栅格，所以显式写 role）。
  const history = iorbitChatSurfaceSource();

  assert.match(history, /role="list"/);
  assert.match(history, /role="listitem"/);
});

test("small Agent status copy uses readable foreground tokens", () => {
  const agent = iorbitChatSurfaceSource();

  // Orbit_0918 批次 4c：可读性规则不变（小字状态文案仍走 --text-3/--text-4 前景 token），
  // 色值随 0918 设计更新为 #6B6F99/#9FA3C4（对比度不低于旧值）。
  assert.match(agent, /"--text-3": "#6B6F99"/);
  assert.match(agent, /"--text-4": "#9FA3C4"/);
});
