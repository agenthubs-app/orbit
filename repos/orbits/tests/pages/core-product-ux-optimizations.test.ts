import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
  assert.match(context, /target\.onAsk\(trimmed\);\s*setOpen\(false\)/);
});

test("Agent waiting, timeout recovery, and trust summaries state their real boundaries", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(agent, /Usually 10–20 seconds/);
  assert.match(agent, /AGENT_REQUEST_TIMEOUT_MS = 30_000/);
  assert.match(agent, /controller\.abort\(\)/);
  assert.match(agent, /retryRequest: query/);
  assert.match(agent, /依据 \$\{totalItems\} 条 · 未执行外部动作/);
  assert.match(agent, /不会把泛化回答展示成真实推荐/);
});

test("an empty account gets an honest non-persistent example before import", () => {
  const dashboard = source("app/(app)/app/agent/orbit-agent-dashboard.tsx");

  assert.match(dashboard, /home\.stats\.people === 0/);
  assert.match(dashboard, /不会冒充真实联系人或账号数据/);
  assert.match(dashboard, /导入联系人后/);
  assert.match(dashboard, /\/app\/contacts\/new/);
});

test("secondary contact views are grouped behind one reversible disclosure", () => {
  const sidebar = source("app/(app)/app/contacts/orbit-crm-sidebar.tsx");

  assert.match(sidebar, /item\.key === "list"/);
  assert.match(sidebar, /item\.key === "pipeline"/);
  assert.match(sidebar, /item\.key === active/);
  assert.match(sidebar, /更多分析与记录/);
  assert.match(sidebar, /setExpanded\(\(value\) => !value\)/);
});

test("Today limits and groups decisions while keeping overflow traceable", () => {
  const route = source("app/(app)/app/today/compose-app-today-from-agent-ledger/today-route-view-model.ts");
  const today = source("app/(app)/app/today/orbit-real-today.tsx");

  assert.match(route, /TODAY_DECISION_LIMIT = 5/);
  assert.match(route, /decisionContactKey/);
  assert.match(route, /operationDueAt/);
  assert.match(route, /OPERATION_STAGE_WEIGHT/);
  assert.match(route, /hasExplicitGoal/);
  assert.match(today, /href="\/app\/contacts\/all-actions"/);
});

test("unavailable registration explains the known reason and shortens samples", () => {
  const detail = source("app/(app)/app/events/[id]/orbit-real-event-detail.tsx");

  assert.match(detail, /下一次开放时间未公布，也没有创建开放提醒/);
  assert.match(detail, /查看其他可报名活动/);
  assert.match(detail, /SAMPLE_MATCHES\.slice\(0, 1\)/);
  assert.match(detail, /当前无法报名，因此这里只保留一条明确标注的简短预览/);
});

test("long result surfaces expose skip and list semantics for keyboard and screen-reader navigation", () => {
  const contacts = source("app/(app)/app/contacts/orbit-real-contacts.tsx");
  const history = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(contacts, /跳到联系人结果/);
  assert.match(contacts, /id="contact-results-desktop"/);
  assert.match(contacts, /role="list"/);
  assert.match(contacts, /role="listitem"/);
  assert.match(history, /role="list"/);
  assert.match(history, /role="listitem"/);
});
