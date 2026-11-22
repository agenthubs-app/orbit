/**
 * agent-design AG15 interface (web; approved visual draft 15-1 to 15-7, APPROVAL.md):
 *   - the new-task card shows three lines (什么时候 / 挑什么 / 之后), never cut short, with 「确认，开始运行」「不建了」;
 *   - an expired card says when it was made and that nothing was done; a replaced one offers 「看新的那张」;
 *   - 「定时任务」: the list (running, needs attention, paused, ended; and none yet), one task with the seven facts and
 *     every history wording the server wrote, and the form;
 *   - the inbox: cards still waiting are their own group (a card done, expired or replaced is not), agent rows carry
 *     their tag and the task's name.
 * Nothing internal on screen.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { ConfirmationCard } from "../../app/(app)/app/orbit-2026/iorbit/confirmation-card";
import { ScheduledTaskDetail, ScheduledTaskForm, ScheduledTaskList } from "../../app/(app)/app/orbit-2026/account/ScheduledTasks";
import { ToastProvider } from "../../app/(app)/app/orbit-2026/ui";
import { agentEntryKind, AgentEntryLine, waitsForClick } from "../../app/(app)/app/inbox/agent-inbox-entries";
import { resetLastAnswersForTests } from "../../app/(app)/app/orbit-last-answer";
import { prepareRuleOperation, RULE_CREATE } from "../../features/agent-v1/domains/rule/ops";
import type { AgentActionPreviewContract, AgentScheduledTaskContract, AgentScheduledTaskHistoryContract } from "../../shared/contract/agent-v1";
import type { InboxNotificationDTO } from "../../shared/contract/inbox-notifications";
import { FRIDAY_9, ruleSpec } from "../capabilities/agent-automation-kit";

// next/link prefetches on idle and reads the browser's `self` (as r18a-account-profile-interaction does).
(globalThis as { self?: unknown }).self ??= globalThis;

type Node = ReactTestRenderer["root"];
const textIn = (node: Node | string): string => (typeof node === "string" ? node : node.children.map((child) => textIn(child as Node | string)).join(""));
const buttonWith = (renderer: ReactTestRenderer, words: string) => renderer.root.findAll((node) => node.type === "button" && textIn(node).includes(words))[0]!;

const INTERNAL = /来源|证据|授权|引用|范围|规则|派发|payload|revision|CARD_[A-Z_]+|automation|undefined|null/u;
const textOf = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/&quot;/gu, "\"").replace(/\s+/gu, " ").trim();
const noop = async () => true;

const longBasis = "按笔记「兴趣笔记」的主题：摄影、独立出版、手作市集和东京都内周末举办的小型展览，越近的越优先";
function ruleCard(overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract {
  const op = prepareRuleOperation({ actionId: "a1", index: 0, intent: { capability: RULE_CREATE, set: { rule: ruleSpec({ rankingBasis: longBasis, scopeText: "那个周末在东京办的公开活动" }), schedule: FRIDAY_9, title: "每周五挑 3 场周末活动" } }, locale: "zh", now: "2026-11-15T01:00:00.000Z", revision: 1 });
  return { actionId: "a1", locale: "zh", operations: [{ after: op.after ?? {}, capability: "rule.create", display: op.display, operationId: op.operationId, status: "pending", text: op.preview }], payloadHash: "h", revision: 1, revisions: [], status: "awaiting_confirmation", summary: op.preview, title: "新建 1 条定时任务", updatedAt: "2026-11-15T01:00:00.000Z", ...overrides };
}

test("the new-task card: three lines, the whole basis, its own buttons; the seven separate rows are not shown", () => {
  const html = renderToStaticMarkup(<ConfirmationCard card={ruleCard()} language="zh" online onDecide={noop} onRegenerate={noop} />);
  const text = textOf(html);
  for (const words of ["等你确认", "新建 1 条定时任务", "新增", "定时任务「每周五挑 3 场周末活动」", "什么时候", "每周五 9:00 之后约10分钟内 · 下次 11月20日（周五）", "挑什么", `那个周末在东京办的公开活动，${longBasis}，最多3场`, "之后", "一直运行，直到你暂停或删除 · 结果放进收件箱", "确认，开始运行", "不建了", "点确认之前，什么都不会运行。"]) assert.ok(text.includes(words), words);
  for (const hidden of ["检查时间", "候选范围", "排序依据", "提醒方式", "下次预计运行"]) assert.ok(!text.includes(hidden), hidden);
  assert.equal((html.match(/data-orbit-agent-card-item/gu) ?? []).length, 1);
  assert.ok(!text.includes("…"));
});

test("an expired card: the server's line under it; a replaced one offers the new card instead of regenerating", () => {
  const timed = textOf(renderToStaticMarkup(<ConfirmationCard card={ruleCard({ expiredNote: "这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。", status: "expired" })} language="zh" online onDecide={noop} onRegenerate={noop} />));
  assert.ok(timed.includes("放太久已失效") && timed.includes("这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。") && timed.includes("重新生成"), timed);
  assert.ok(!timed.includes("确认，开始运行"));
  const opened: string[] = [];
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<ConfirmationCard card={ruleCard({ expiredNote: "11月27日那一期出了新卡，这张不再有效。", expiredReason: "superseded", status: "expired", supersededBy: { actionId: "a2", firedAt: "2026-11-27T00:00:00.000Z" } })} language="zh" online onDecide={noop} onRegenerate={noop} onOpenCard={(id) => opened.push(id)} />); });
  const button = renderer.root.findAll((node) => node.type === "button" && node.props["data-orbit-agent-card-replaced-by"] === "a2")[0];
  assert.ok(button, "「看新的那张」");
  act(() => button.props.onClick());
  assert.deepEqual(opened, ["a2"]);
  assert.equal(renderer.root.findAll((node) => node.type === "button" && textIn(node).includes("重新生成")).length, 0, "no regenerate on a replaced card");
});

/* ── 定时任务 ─────────────────────────────────────────────────────────── */

const task = (overrides: Partial<AgentScheduledTaskContract> = {}): AgentScheduledTaskContract => ({
  createdAt: "2026-10-01T03:00:00.000Z", domain: "event", id: "t1", last: { opens: "result", runId: "r1", text: "有 2 场新活动", when: "今天 9:04" }, lastRun: null, needsAttention: false,
  next: { day: "11月27日（周五）", time: "9:00 之后约10分钟内" }, nextRunAt: "2026-11-27T00:00:00.000Z", notify: { inApp: true, push: false },
  rows: [
    { field: "schedule", label: "什么时候查", note: "东京时间。不保证整点开始。", value: "每周五 9:00 之后约10分钟内" }, { field: "scope", label: "从哪里挑", value: "那个周末在东京办的公开活动" },
    { field: "rankingBasis", label: "按什么挑", note: "每次运行读它当时的内容", value: "按笔记「兴趣笔记」的主题" }, { field: "maxItems", label: "挑几条", value: "最多3场" },
    { field: "validUntil", label: "跑到哪天", value: "一直跑，直到你暂停或删除" }, { field: "notify", label: "怎么通知你", note: "没有新的就不打扰", value: "放进收件箱" }, { field: "nextRunAt", label: "下次运行", value: "11月27日（周五） 9:00 之后约10分钟内" },
  ],
  status: "active", summary: { attention: null, schedule: "每周五 9:00 之后约10分钟内", status: "下次 11月27日（周五） · 上次 今天 9:04：有 2 场新活动" }, timeZone: "Asia/Tokyo", title: "每周五挑 3 场周末活动", updatedAt: "2026-11-20T00:04:00.000Z", version: 1,
  ...overrides,
});
const run = (runId: string, display: NonNullable<AgentScheduledTaskHistoryContract["runs"][number]["display"]>, outcome: AgentScheduledTaskHistoryContract["runs"][number]["outcome"] = "no_match") => ({ computeAttempts: 1, computedAt: "2026-11-20T00:04:00.000Z", delivery: { attempts: 1, state: "delivered" as const }, display, items: [], line: "x", outcome, push: { attempts: 0, state: "not_requested" as const }, runId, scheduledAt: "2026-11-20T00:00:00.000Z", skipped: 0, skippedDays: [], taskId: "t1", text: "" });

const router = { back() {}, forward() {}, prefetch() {}, push() {}, refresh() {}, replace() {} } as unknown as AppRouterInstance;
async function mount(node: React.ReactNode, responses: Record<string, unknown>): Promise<{ renderer: ReactTestRenderer; calls: string[] }> {
  resetLastAnswersForTests();
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const key = Object.keys(responses).find((prefix) => url.startsWith(prefix));
    return new Response(JSON.stringify(key ? responses[key] : { error: { code: "NOT_FOUND" } }), { status: key ? 200 : 404 });
  }) as typeof fetch;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<AppRouterContext.Provider value={router}><ToastProvider>{node}</ToastProvider></AppRouterContext.Provider>); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return { calls, renderer };
}
const rendered = (renderer: ReactTestRenderer) => textIn(renderer.root);

test("the list: running, needs attention (with the yellow line), paused, ended (no switch); and the empty page", async () => {
  const tasks = [
    task(),
    task({ id: "t2", needsAttention: true, summary: { attention: "需要你处理：笔记「重点客户」打不开了。重新选一篇，或者改成别的挑法。", schedule: "每周一 9:00 之后约10分钟内", status: "上次 11月16日（周一）：没跑成" }, title: "每周一列出 5 位该联系的人" }),
    task({ id: "t3", status: "paused", summary: { attention: null, schedule: "每天 8:00 之后约10分钟内", status: "已暂停，不会再运行 · 上次 11月12日（周四）：没有新的" }, title: "每天看东京有没有新的摄影展" }),
    task({ id: "t4", status: "completed", summary: { attention: null, schedule: "跑到 10月31日（周六）为止", status: "已结束 · 一共跑了 4 期" }, title: "10 月每周三挑一场读书会" }),
  ];
  const { calls, renderer } = await mount(<ScheduledTaskList />, { "/api/agent/automations?language=zh": { data: { tasks } } });
  const text = rendered(renderer);
  for (const words of ["4 条 · 2 条在运行", "运行中", "需要处理", "已暂停", "已结束", "需要你处理：笔记「重点客户」打不开了。重新选一篇，或者改成别的挑法。", "已结束 · 一共跑了 4 期", "11月27日（周五）", "新建"]) assert.ok(text.includes(words), words);
  assert.equal(renderer.root.findAll((node) => node.props.role === "switch").length, 3, "an ended task has no switch");
  assert.deepEqual(calls, ["GET /api/agent/automations?language=zh"]);
  // The switch pauses with one PATCH and reads the list again.
  const firstSwitch = renderer.root.findAll((node) => node.props.role === "switch")[0];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`); return new Response(JSON.stringify(String(input).includes("?language") ? { data: { tasks } } : { data: {} }), { status: 200 }); }) as typeof fetch;
  await act(async () => { firstSwitch.props.onClick(); await new Promise((resolve) => setTimeout(resolve, 10)); });
  assert.ok(calls.includes("PATCH /api/agent/automations/t1 {\"status\":\"paused\"}"), calls.join("\n"));

  const empty = await mount(<ScheduledTaskList />, { "/api/agent/automations?language=zh": { data: { tasks: [] } } });
  const emptyText = rendered(empty.renderer);
  for (const words of ["还没有定时任务", "去 iOrbit 说一句", "用表单新建"]) assert.ok(emptyText.includes(words), words);
  assert.doesNotMatch(emptyText, INTERNAL);
});

test("one task: the seven facts in full, next and last, every history wording as written, skipped periods on their own line", async () => {
  const runs = [
    run("r1", { day: "11月20日（周五）", opens: "result", skippedNote: null, text: "有 2 场新活动", time: "9:04" }, "delivered"),
    run("r2", { day: "11月13日（周五）", opens: null, skippedNote: null, text: "没有新的", time: "9:07" }),
    run("r3", { day: "11月6日（周五）", opens: "result", skippedNote: "中间跳过了 2 期（10月23日、10月30日）。那段时间 Orbit 停过，恢复后只补了最近一期。", text: "有 3 场新活动", time: "9:03" }, "delivered"),
    run("r4", { day: "10月9日（周五）", opens: null, skippedNote: null, text: "没跑成，已重试；9:12 跑完：没有新的", time: null }),
    run("r5", { day: "10月2日（周五）", opens: null, skippedNote: null, text: "已经算好，但你在送出前暂停了，没有送", time: "9:04" }),
    run("r6", { day: "9月25日（周五）", opens: null, skippedNote: null, text: "需要你处理：笔记「兴趣笔记」打不开了。重新选一篇，或者改成别的挑法。", time: "9:04" }),
    run("r7", { day: "9月18日（周五）", opens: "card", skippedNote: null, text: "有 2 条要改，等你确认", time: "8:36" }, "delivered"),
  ];
  let title: string | null = null;
  const { renderer } = await mount(<ScheduledTaskDetail id="t1" onTitle={(value) => { title = value; }} />, { "/api/agent/automations/t1/runs": { data: { runs, task: task() } } });
  const text = rendered(renderer);
  assert.equal(title, "每周五挑 3 场周末活动");
  for (const words of ["开着", "下次运行", "11月27日（周五）", "上次结果", "今天 9:04：有 2 场新活动", "在收件箱里看", "这条任务怎么跑", "什么时候查", "东京时间。不保证整点开始。", "从哪里挑", "按什么挑", "每次运行读它当时的内容", "挑几条", "跑到哪天", "怎么通知你", "没有新的就不打扰", "历史", "每期一行", "9:04 · 有 2 场新活动", "看结果", "9:07 · 没有新的", "中间跳过了 2 期（10月23日、10月30日）", "没跑成，已重试；9:12 跑完：没有新的", "已经算好，但你在送出前暂停了，没有送", "更早的", "暂停", "删除这条任务"]) assert.ok(text.includes(words), words);
  assert.ok(!text.includes("有 2 条要改，等你确认"), "the seventh period waits behind 「更早的」");
  const earlier = buttonWith(renderer, "更早的");
  await act(async () => { earlier.props.onClick(); });
  assert.ok(rendered(renderer).includes("有 2 条要改，等你确认") && rendered(renderer).includes("去确认"));
  const links = renderer.root.findAll((node) => typeof node.props.href === "string" && node.props.href.startsWith("/app/inbox")).map((node) => node.props.href as string);
  assert.ok(links.includes("/app/inbox?tab=notifications&open=r1"), links.join(","));
});

test("the form: 「用表单新建」 sends the form, and a note must be chosen before it saves", async () => {
  const saved: string[] = [];
  const { calls, renderer } = await mount(<ScheduledTaskForm onCancel={() => undefined} onSaved={(id) => saved.push(id)} />, { "/api/agent/automations": { data: { automation: { automationId: "new1" } } } });
  const text = rendered(renderer);
  for (const words of ["新建定时任务", "做什么", "什么时候查", "每周", "周五", "到点后约 10 分钟内运行。", "从哪里挑", "那个周末的公开活动", "按什么挑", "笔记", "开始早的在前", "和这些话相关", "挑几条", "跑到哪天", "一直跑", "保存后，下一次按新的时间算", "保存", "取消"]) assert.ok(text.includes(words), words);
  // A note chosen as the basis but not picked yet: nothing is sent.
  const noteRadio = renderer.root.findAll((node) => node.type === "input" && node.props.type === "radio" && node.props.name === "basis")[0]!;
  await act(async () => { noteRadio.props.onChange(); });
  const save = () => buttonWith(renderer, "保存");
  await act(async () => { save().props.onClick(); await new Promise((resolve) => setTimeout(resolve, 10)); });
  assert.ok(rendered(renderer).includes("还有没填好的地方。"));
  assert.equal(calls.filter((call) => call.startsWith("POST")).length, 0);
  // Back to 「开始早的在前」: saved with the form.
  const fieldRadio = renderer.root.findAll((node) => node.type === "input" && node.props.type === "radio" && node.props.name === "basis")[1]!;
  await act(async () => { fieldRadio.props.onChange(); });
  await act(async () => { save().props.onClick(); await new Promise((resolve) => setTimeout(resolve, 10)); });
  assert.deepEqual(saved, ["new1"]);
  assert.ok(calls.some((call) => call === "POST /api/agent/automations"), calls.join("\n"));
});

/* ── 收件箱 ─────────────────────────────────────────────────────────── */

const entry = (overrides: Partial<InboxNotificationDTO>): InboxNotificationDTO => ({ actions: ["read"], actorId: "a", disposition: "open", id: "i1", kind: "update", object: { id: "t1", name: "每周五挑 3 场周末活动" }, occurredAt: "2026-11-20T00:04:00.000Z", origin: "automation", readAt: null, reason: "r", revision: 1, semanticKey: "k", sources: [{ occurredAt: "2026-11-20T00:00:00.000Z", readAt: "2026-11-20T00:04:00.000Z", sourceId: "r1", sourceKind: "automation_result", sourceRevision: "v1" }], target: { href: null, id: "t1", kind: "automation", status: "available" }, title: "有 2 场新活动", updatedAt: "2026-11-20T00:04:00.000Z", ...overrides });

test("the inbox: only cards still waiting form the top group; each agent row has its tag and the task's name", () => {
  const result = entry({});
  const waiting = entry({ id: "i2", sources: [{ ...result.sources[0]!, sourceId: "c1", sourceKind: "agent_card" }], target: { href: null, id: "c1", kind: "card", status: "available" }, title: "有 2 条要改，等你确认" });
  const replaced = entry({ id: "i3", sources: [{ ...result.sources[0]!, sourceId: "c0", sourceKind: "agent_card" }], target: { href: null, id: "c0", kind: "card", status: "available" }, title: "有 1 条要改，等你确认" });
  const proposal = entry({ expiresAt: "2026-11-20T13:04:00.000Z", id: "i4", object: { id: "x", name: "Claude" }, sources: [{ ...result.sources[0]!, sourceId: "c9", sourceKind: "external_proposal" }], target: { href: null, id: "c9", kind: "card", status: "available" }, title: "Claude 想改 2 项，等你确认" });
  assert.deepEqual([result, waiting, proposal].map(agentEntryKind), ["result", "card", "proposal"]);
  const cards = new Map<string, AgentActionPreviewContract | null>([["c1", ruleCard({ actionId: "c1" })], ["c0", ruleCard({ actionId: "c0", expiredReason: "superseded", status: "expired" })]]);
  assert.deepEqual([result, waiting, replaced, proposal].map((n) => waitsForClick(n, cards)), [false, true, false, true], "a proposal not read yet waits; a replaced card does not");
  const resultLine = textOf(renderToStaticMarkup(<AgentEntryLine n={result} now="2026-11-20T00:10:00.000Z" waiting={false} />));
  assert.equal(resultLine, "定时任务 每周五挑 3 场周末活动");
  const cardLine = textOf(renderToStaticMarkup(<AgentEntryLine n={waiting} now="2026-11-20T00:10:00.000Z" waiting />));
  assert.equal(cardLine, "等你确认 每周五挑 3 场周末活动");
  const proposalLine = textOf(renderToStaticMarkup(<AgentEntryLine n={proposal} now="2026-11-20T00:04:00.000Z" waiting />));
  assert.equal(proposalLine, "等你确认 Claude 提的修改 · 还有 13 小时有效");
});
