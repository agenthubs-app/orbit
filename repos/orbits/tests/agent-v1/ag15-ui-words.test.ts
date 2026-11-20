import assert from "node:assert/strict";
import test from "node:test";

import { prepareRuleOperation, ruleLines, RULE_CREATE, type RuleCreateIntent } from "../../features/agent-v1/domains/rule/ops";
import type { AgentAutomationRunRecord } from "../../features/agent/automations/runs";
import { ruleFromForm } from "../../features/agent/automations/task-form";
import { runInboxTitle, scheduledRunView, scheduledTaskView } from "../../features/agent/automations/task-view";
import { titleOf } from "../../features/agent-v1/graph/nodes/rule";
import { expiredCardNote } from "../../features/agent/runtime/card-view";
import { cardLineOf } from "../../features/agent-v1/propose/copy";
import { cardCountTitle } from "../../features/agent/runtime/card-operations";
import type { AgentActionRecord } from "../../features/agent/runtime/contract";
import { agentCardView } from "../../shared/compute/agent-card-view";
import type { AgentActionPreviewContract } from "../../shared/contract/agent-v1";
import { en } from "../../shared/copy/en";
import { zh } from "../../shared/copy/zh";
import { FRIDAY_9, ruleSpec } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG15 interface (approved visual draft, APPROVAL.md): the new-task card shows three lines — 「什么时候」
 * 「挑什么」「之后」 — grouped from the same facts, which stay separate in the frozen card; its buttons are 「确认，开始运行」
 * and 「不建了」; an expired card says when it was made and that nothing was done (D15-5), or which period replaced it
 * (D15-6). The history and inbox words follow the draft's table (15-4) and list (15-5).
 */

const NOW = "2026-11-15T01:00:00.000Z";
const longBasis = "按笔记「兴趣笔记」的主题：摄影、独立出版、手作市集和东京都内周末举办的小型展览，越近的越优先";
const intent: RuleCreateIntent = { capability: RULE_CREATE, set: { rule: ruleSpec({ rankingBasis: longBasis, references: [{ id: "M36", title: "兴趣笔记", type: "memo" }], scopeText: "那个周末在东京办的公开活动", validUntil: null }), schedule: FRIDAY_9, title: "每周五挑 3 场周末活动" } };

test("the new-task card groups its facts in three lines; every fact is still on the card and still a separate row", () => {
  const op = prepareRuleOperation({ actionId: "a1", index: 0, intent, locale: "zh", now: NOW, revision: 1 });
  const display = op.display!;
  assert.deepEqual(display.lines!.map((line) => [line.label, line.text]), [
    ["什么时候", "每周五 9:00 之后约10分钟内 · 下次 11月20日（周五）"],
    ["挑什么", `那个周末在东京办的公开活动，${longBasis}，最多3场`],
    ["之后", "一直运行，直到你暂停或删除 · 结果放进收件箱"],
  ]);
  assert.equal(display.lines![0].zone?.text, "每周五 9:00 之后约10分钟内（东京时间） · 下次 11月20日（周五）");
  // The seven facts are separate rows of the frozen card, as before (the eval and the history read them).
  assert.deepEqual(display.rows.map((row) => row.field), ["schedule", "scope", "rankingBasis", "maxItems", "validUntil", "notify", "nextRunAt"]);
  // Each fact of the six the design asks for appears in a line.
  const lines = display.lines!.map((line) => line.text).join("\n");
  for (const fact of ["每周五 9:00 之后约10分钟内", "那个周末在东京办的公开活动", longBasis, "最多3场", "一直运行", "收件箱"]) assert.ok(lines.includes(fact), fact);
  assert.ok(!lines.includes("…"), "the basis is never cut short");

  const ended = ruleLines({ rule: ruleSpec({ notify: { inApp: true, push: true }, validUntil: "2026-11-30" }), schedule: FRIDAY_9 }, "zh", NOW);
  assert.equal(ended[2].text, "运行到 11月30日（周一） · 结果放进收件箱，并提醒你");
  const english = ruleLines({ rule: ruleSpec({ locale: "en", rankingBasis: "Start time, earliest first", scopeText: "Events that weekend" }), schedule: FRIDAY_9 }, "en", NOW);
  assert.deepEqual(english.map((line) => line.label), ["When", "What it picks", "After that"]);
  assert.equal(english[1].text, "Events that weekend · Start time, earliest first · up to 3 events");
  // The scope in the user's words only; the code's reading in brackets stays on the row (it made the line run to three).
  const said = ruleLines({ rule: ruleSpec({ rankingBasis: "按笔记「兴趣笔记」的主题", scopeText: "周末活动（那个周末开始的公开活动）" }), schedule: FRIDAY_9 }, "zh", NOW);
  assert.equal(said[1].text, "周末活动，按笔记「兴趣笔记」的主题，最多3场");
  const only = ruleLines({ rule: ruleSpec({ scopeText: "那个周末开始的公开活动" }), schedule: FRIDAY_9 }, "zh", NOW);
  assert.ok(only[1].text.startsWith("那个周末开始的公开活动，"), "a scope with no brackets is kept whole");
});

const preview = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => {
  const op = prepareRuleOperation({ actionId: "a1", index: 0, intent, locale: "zh", now: NOW, revision: 1 });
  return {
    actionId: "a1",
    locale: "zh",
    operations: [{ after: op.after ?? {}, capability: "rule.create", display: op.display, operationId: op.operationId, status: "pending", text: op.preview }],
    payloadHash: "h",
    revision: 1,
    revisions: [],
    status: "awaiting_confirmation",
    summary: op.preview,
    title: "新建 1 条定时任务",
    updatedAt: NOW,
    ...overrides,
  };
};

test("both clients show the three lines, the time zone only on a device in another zone, and the new-task buttons", () => {
  const tokyo = agentCardView(preview(), { online: true, pendingTargets: [], timeZone: "Asia/Tokyo" }, zh.aiCard);
  assert.equal(tokyo.kind, "card");
  if (tokyo.kind !== "card") return;
  assert.deepEqual(tokyo.items[0].rows.map((row) => [row.label, row.after]), [
    ["什么时候", "每周五 9:00 之后约10分钟内 · 下次 11月20日（周五）"],
    ["挑什么", `那个周末在东京办的公开活动，${longBasis}，最多3场`],
    ["之后", "一直运行，直到你暂停或删除 · 结果放进收件箱"],
  ]);
  assert.deepEqual([tokyo.buttons?.confirm, tokyo.buttons?.dismiss, tokyo.hint], ["确认，开始运行", "不建了", "点确认之前，什么都不会运行。"]);
  const away = agentCardView(preview(), { online: true, pendingTargets: [], timeZone: "Europe/London" }, zh.aiCard);
  assert.equal(away.kind === "card" && away.items[0].rows[0].after, "每周五 9:00 之后约10分钟内（东京时间） · 下次 11月20日（周五）");
  // Another card keeps its own buttons.
  const todo = agentCardView(preview({ operations: [{ after: {}, capability: "todo.update", operationId: "o", status: "pending", text: "t" }] }), { online: true, pendingTargets: [] }, zh.aiCard);
  assert.equal(todo.kind === "card" && todo.buttons?.confirm, "确认以上1项");
  // A card frozen before this change (rows only) shows its rows.
  const old = preview();
  const rowsOnly = { ...old, operations: old.operations.map((op) => ({ ...op, display: { ...op.display!, lines: undefined } })) };
  const legacy = agentCardView(rowsOnly, { online: true, pendingTargets: [] }, en.aiCard);
  assert.equal(legacy.kind === "card" && legacy.items[0].rows.length, 7);
});

test("a card that only makes scheduled tasks is titled as such (draft 15-1)", () => {
  assert.equal(cardCountTitle([{ capability: RULE_CREATE }], "zh"), "新建1条定时任务");
  assert.equal(cardCountTitle([{ capability: RULE_CREATE }], "en"), "New scheduled task");
  assert.equal(cardCountTitle([{ capability: RULE_CREATE }, { capability: "todo.update" }], "zh"), "修改1项，新增1项", "a mixed card keeps the count sentence");
});

test("the answer names the new-task card's own button, so the words match what both clients show", () => {
  const line = cardLineOf(preview(), "zh");
  assert.ok(line.endsWith("点卡上的「确认，开始运行」之前，什么都不会运行。"), line);
  assert.ok(cardLineOf(preview(), "en").endsWith("Nothing runs until you press \"Confirm and start\" on the card."));
  const todo = preview({ operations: [{ after: {}, capability: "todo.update", operationId: "o", status: "pending", text: "t" }] });
  assert.ok(cardLineOf(todo, "zh").endsWith("点卡上的「确认以上1项」之前，什么都不会改。"), "other cards keep their words");
});

test("an expired card says when it was made and that nothing was done; a replaced one names the period and offers the new card instead", () => {
  const base = { actionId: "c1", createdAt: "2026-10-01T03:00:00.000Z", expiresAt: "2026-10-08T03:00:00.000Z", locale: "zh", operations: [], status: "expired" } as unknown as AgentActionRecord;
  assert.equal(expiredCardNote(base), "这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。");
  assert.equal(expiredCardNote({ ...base, locale: "en" }), "This card was made on Oct 1 and waited 7 days. Nothing was created or changed.");
  const replaced = { ...base, expiredReason: "superseded", supersededBy: { actionId: "c2", firedAt: "2026-11-27T00:00:00.000Z" } } as AgentActionRecord;
  assert.equal(expiredCardNote(replaced), "11月27日那一期出了新卡，这张不再有效。");
  const timed = agentCardView(preview({ expiredNote: "这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。", status: "expired" }), { online: true, pendingTargets: [] }, zh.aiCard);
  assert.ok(timed.kind === "card" && timed.regenerate && timed.expiredNote && !timed.buttons);
  const superseded = agentCardView(preview({ expiredNote: "x", expiredReason: "superseded", status: "expired", supersededBy: { actionId: "c2", firedAt: "2026-11-27T00:00:00.000Z" } }), { online: true, pendingTargets: [] }, zh.aiCard);
  assert.ok(superseded.kind === "card" && superseded.regenerate === null && superseded.replacedBy === "c2");
});

const run = (overrides: Partial<AgentAutomationRunRecord>): AgentAutomationRunRecord => ({
  automationId: "rule:1",
  computedAt: "2026-10-16T00:05:00.000Z",
  delivery: { inbox: { attempts: 1, state: "delivered" }, push: { attempts: 0, state: "not_requested" } },
  items: [{ id: "E1", kind: "event", line: "E1", ref: "event:E1", title: "E1" }],
  locale: "zh",
  outcome: "delivered",
  ownerId: "user:a",
  runId: "r1",
  scheduledAt: "2026-10-16T00:00:00.000Z",
  skipped: 0,
  text: "x",
  title: "每周五挑 3 场周末活动",
  version: 1,
  ...overrides,
} as AgentAutomationRunRecord);

test("every case of the history table reads as the approved draft writes it", () => {
  const view = (overrides: Partial<AgentAutomationRunRecord>) => scheduledRunView(run(overrides), "zh", "Asia/Tokyo", "event").display;
  assert.deepEqual(view({}), { day: "10月16日（周五）", opens: "result", skippedNote: null, text: "有 1 场新活动", time: "9:05" });
  assert.equal(view({ delivery: { inbox: { attempts: 0, state: "none" }, push: { attempts: 0, state: "not_requested" } }, items: [], outcome: "no_match" })?.text, "没有新的");
  assert.equal(view({ skipped: 2, skippedDays: ["2026-10-23", "2026-10-30"] })?.skippedNote, "中间跳过了 2 期（10月23日、10月30日）。那段时间 Orbit 停过，恢复后只补了最近一期。");
  assert.deepEqual(view({ computeAttempts: 2, delivery: { inbox: { attempts: 0, state: "none" }, push: { attempts: 0, state: "not_requested" } }, items: [], outcome: "no_match" }), { day: "10月16日（周五）", opens: null, skippedNote: null, text: "没跑成，已重试；9:05 跑完：没有新的", time: null });
  assert.equal(view({ attention: { message: "m", reason: "reference_unreadable", reference: { id: "M36", title: "兴趣笔记", type: "memo" } }, items: [], outcome: "needs_attention" })?.text, "需要你处理：笔记「兴趣笔记」打不开了。重新选一篇，或者改成别的挑法。");
  assert.equal(view({ delivery: { inbox: { attempts: 0, cancelReason: "rule_paused", state: "cancelled" }, push: { attempts: 0, state: "not_requested" } }, outcome: "undelivered" })?.text, "已经算好，但你在送出前暂停了，没有送");
  assert.deepEqual(view({ cardId: "card:1", items: [{ id: "T1", kind: "todo", line: "", ref: "todo:T1", title: "" }, { id: "T2", kind: "todo", line: "", ref: "todo:T2", title: "" }] }), { day: "10月16日（周五）", opens: "card", skippedNote: null, text: "有 2 条要改，等你确认", time: "9:05" });
  assert.equal(runInboxTitle(run({ cardId: "card:1", items: [{ id: "T1", kind: "todo", line: "", ref: "todo:T1", title: "" }, { id: "T2", kind: "todo", line: "", ref: "todo:T2", title: "" }] })), "有 2 条要改，等你确认");
  assert.equal(runInboxTitle(run({ items: [{ id: "C1", kind: "contact", line: "", ref: "contact:C1", title: "" }] })), "有 1 位该联系的人");
});

test("one rule has one name: the card's, the form's default and the task page's come from titleOf on the rule alone", () => {
  // The scope line of a conversation-made rule: the user's words, then how code reads them.
  const said = ruleSpec({ scopeText: "周末活动（那个周末开始的公开活动）" });
  assert.equal(titleOf(FRIDAY_9, said, "zh"), "每周五挑3场：周末活动");
  // A form left without a name, for the same rule, gets the same name.
  const form = { basis: { field: "startsAt" as const, kind: "field" as const }, domain: "event" as const, maxItems: 3, push: false, schedule: FRIDAY_9, title: "", validUntil: null, window: "weekend" as const };
  const made = ruleFromForm(form, "zh");
  assert.equal(made.title, titleOf(FRIDAY_9, made.rule, "zh"));
  assert.equal(ruleFromForm(form, "zh", { rule: said, title: "x" } as never).title, "每周五挑3场：周末活动", "a task changed with the form keeps its scope words, so its default name is the card's");
  // The page lists a task under the name it was made with, never a second wording.
  const op = prepareRuleOperation({ actionId: "a1", index: 0, intent: { capability: RULE_CREATE, set: { rule: said, schedule: FRIDAY_9, title: titleOf(FRIDAY_9, said, "zh") } }, locale: "zh", now: NOW, revision: 1 });
  assert.match(String(op.preview), /每周五挑3场：周末活动/u);
  const automation = { automationId: "rule:1", capabilityId: "events.recommend", createdAt: NOW, delivery: "in_app", handledEventIds: [], instruction: "x", lastRun: null, nextRunAt: NOW, revisions: [], rule: said, runCount: 0, status: "active", title: titleOf(FRIDAY_9, said, "zh"), trigger: { kind: "schedule", schedule: FRIDAY_9 }, updatedAt: NOW, version: 1 } as unknown as Parameters<typeof scheduledTaskView>[0];
  assert.equal(scheduledTaskView(automation, null, NOW, "zh").title, "每周五挑3场：周末活动");
});
