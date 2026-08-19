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
  assert.match(context, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(context, /useEffect\(\(\) => \{\s*setOpen\(false\);\s*\}, \[pathname\]\)/);
  assert.match(context, /target\.onAsk\(trimmed\);\s*setOpen\(false\)/);
  assert.match(dock, /!isOrbitAskHome\(pathname\)/);
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

test("both recommendation and follow-up queue cards generate an editable draft in place", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(agent, /function AgentPeopleRow[\s\S]*?useAgentInlineDraft/);
  assert.match(agent, /function AgentTodoRow[\s\S]*?useAgentInlineDraft[\s\S]*?Generate follow-up draft/);
  assert.match(agent, /\/app\/contacts\?query=\$\{encodeURIComponent\(item\.contactName\)\}/);
  assert.match(agent, /data-agent-inline-draft/);
  assert.match(agent, /仅生成草稿；未经确认不会发送。/);
  assert.match(agent, /复制草稿/);
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

test("Today only accepts actor-authorized records as schedule truth", () => {
  const appointmentSchedule = source(
    "app/(app)/app/today/compose-app-today-from-agent-ledger/today-appointment-schedule.ts",
  );
  const merged = source(
    "app/(app)/app/today/compose-app-today-from-agent-ledger/today-merged-view-model.ts",
  );
  const page = source("app/(app)/app/today/today-page-content.tsx");

  assert.match(appointmentSchedule, /appointment\.confirmed/);
  assert.match(appointmentSchedule, /appointment\.contactIdsByActor\[input\.actorId\]/);
  assert.match(appointmentSchedule, /listConfiguredOrbitScheduleItems\(actorId\)/);
  assert.match(merged, /loadConfiguredTodaySchedule\(actorId\)/);
  assert.doesNotMatch(merged, /loadAppScheduleRouteViewModel/);
  assert.doesNotMatch(page, /OrbitTodayArrangements/);
});

test("unavailable registration explains the known reason, offers a durable reminder, and shortens samples", () => {
  const detail = source("app/(app)/app/events/[id]/orbit-real-event-detail.tsx");
  const reminder = source("features/events/registration/opening-reminder-service.ts");
  const handler = source("app/api/events/[id]/registration-opening-reminder/handler.ts");

  assert.match(detail, /下一次开放时间尚未公布/);
  assert.match(detail, /开放报名时提醒我/);
  assert.match(detail, /仅绑定当前账号，可随时取消/);
  assert.match(detail, /查看其他可报名活动/);
  assert.match(detail, /SAMPLE_MATCHES\.slice\(0, 1\)/);
  assert.match(detail, /当前无法报名，因此这里只保留一条明确标注的简短预览/);
  assert.match(reminder, /event_registration_opening_reminders/);
  assert.match(reminder, /userId: actorId/);
  assert.match(reminder, /collectionName: "notifications"/);
  assert.match(handler, /availability !== "unavailable"/);
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

test("small Agent and contact status copy use readable foreground tokens", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");
  const contacts = source("app/(app)/app/contacts/orbit-real-contacts.tsx");

  assert.match(agent, /"--text-3": "#687078"/);
  assert.match(agent, /"--text-4": "#687078"/);
  assert.match(contacts, /status === "to_contact" \? "var\(--amber-text\)" : meta\.color/);
});

test("All arrangements keeps machine traces folded and localizes known source labels", () => {
  const allArrangements = source("app/(app)/app/contacts/all-actions/orbit-real-all-actions.tsx");

  assert.match(allArrangements, /iOrbit 对话中的明确请求/);
  assert.match(allArrangements, /保存到智能记忆/);
  assert.doesNotMatch(allArrangements, /\{entry\.workflowKey \? `工作流/);
  assert.match(allArrangements, /Action：\{entry\.entryId\}/);
  assert.match(allArrangements, /Run：\{entry\.runId \?\? "—"\}/);
});
