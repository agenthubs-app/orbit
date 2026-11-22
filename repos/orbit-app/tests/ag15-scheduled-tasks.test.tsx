import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";

import type { OrbitApiClient } from "../src/api/client";
import type { AgentActionPreviewContract } from "../src/api/contract/agent-v1";
import type { InboxNotificationDTO } from "../src/api/contract/inbox-notifications";
import { notificationInboxData } from "../src/api/inbox-notifications";
import { createTranslator } from "../src/i18n/messages";
import { AgentConfirmationCard } from "../src/screens/ai/cards/AgentConfirmationCard";
import { NotificationInboxList } from "../src/screens/inbox/NotificationInboxList";
import { AccountSettingsContent } from "../src/screens/me/AccountSettingsContent";
import { readScheduledTask, readScheduledTasks, saveScheduledTaskForm, setScheduledTaskRunning } from "../src/screens/me/scheduled-tasks-api";
import { renderedText, renderToHtml } from "./helpers/render";

/**
 * agent-design AG15 on the App (approved visual draft 15-1 to 15-7, APPROVAL.md):
 *   - the new-task card shows the server's three lines (什么时候 / 挑什么 / 之后) and 「确认，开始运行」「不建了」;
 *   - an expired card shows the server's line under it; a replaced one offers 「看新的那张」;
 *   - 我的 › 设置 has 「定时任务」 under the iOrbit row (D15-1); the screens read and write the web's routes;
 *   - the inbox: cards still waiting are their own group on top of 「全部」; agent rows carry their tag and task name.
 */
const lines = [
  { fields: ["schedule", "nextRunAt"], key: "when" as const, label: "什么时候", text: "每周五 9:00 之后约10分钟内 · 下次 11月20日（周五）", zone: { id: "Asia/Tokyo", text: "每周五 9:00 之后约10分钟内（东京时间） · 下次 11月20日（周五）" } },
  { fields: ["scope", "rankingBasis", "maxItems"], key: "pick" as const, label: "挑什么", text: "那个周末在东京办的公开活动，按笔记「兴趣笔记」的主题：摄影、独立出版、手作市集和东京都内周末举办的小型展览，越近的越优先，最多3场" },
  { fields: ["validUntil", "notify"], key: "after" as const, label: "之后", text: "一直运行，直到你暂停或删除 · 结果放进收件箱" },
];
const rows = ["检查时间", "候选范围", "排序依据", "条数", "有效期", "提醒方式", "下次预计运行"].map((label, index) => ({ after: `v${index}`, field: `f${index}`, label }));
const card = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "a1", locale: "zh", operations: [{ after: {}, capability: "rule.create", display: { change: "create", lines, record: "定时任务「每周五挑 3 场周末活动」", rows }, operationId: "a1:op1", status: "pending", text: "t" }],
  payloadHash: "h", revision: 1, revisions: [], status: "awaiting_confirmation", summary: "s", title: "新建 1 条定时任务", updatedAt: "2026-11-15T01:00:00.000Z", ...overrides,
});
const noop = async () => true;

test("the new-task card on the App: three lines, the whole basis, its own buttons; the seven rows are not shown", () => {
  const text = renderedText(<AgentConfirmationCard card={card()} language="zh" online pendingTargets={[]} onDecide={noop} onRegenerate={noop} />);
  for (const words of ["新建 1 条定时任务", "什么时候", "挑什么", "之后", "越近的越优先，最多3场", "一直运行，直到你暂停或删除 · 结果放进收件箱", "确认，开始运行", "不建了", "点确认之前，什么都不会运行。"]) assert.ok(text.includes(words), words);
  for (const hidden of ["检查时间", "候选范围", "排序依据", "提醒方式"]) assert.ok(!text.includes(hidden), hidden);
});

test("an expired card on the App: the server's line; a replaced one offers the new card, not regenerate", () => {
  const timed = renderedText(<AgentConfirmationCard card={card({ expiredNote: "这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。", status: "expired" })} language="zh" online pendingTargets={[]} onDecide={noop} onRegenerate={noop} />);
  assert.ok(timed.includes("这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。") && timed.includes("重新生成"));
  const replaced = renderedText(<AgentConfirmationCard card={card({ expiredNote: "11月27日那一期出了新卡，这张不再有效。", expiredReason: "superseded", status: "expired", supersededBy: { actionId: "a2", firedAt: "2026-11-27T00:00:00.000Z" } })} language="zh" online pendingTargets={[]} onDecide={noop} onRegenerate={noop} onOpenCard={() => {}} />);
  assert.ok(replaced.includes("11月27日那一期出了新卡，这张不再有效。") && replaced.includes("看新的那张") && !replaced.includes("重新生成"), replaced);
});

test("我的 › 设置 lists 「定时任务」 under the iOrbit row and opens /settings/tasks", () => {
  const opened: string[] = [];
  const html = renderToHtml(createElement(AccountSettingsContent, { appearance: "system", development: false, email: "", language: "zh", name: "测试用户丁", onAppearance: () => {}, onLanguage: () => {}, onOpen: (path: string) => opened.push(path), onSignOut: () => {}, permissions: [], t: createTranslator("zh") }));
  const iorbit = html.indexOf("iOrbit 使用的信息");
  const tasks = html.indexOf("定时任务");
  const connections = html.indexOf("关联服务") >= 0 ? html.indexOf("关联服务") : html.indexOf("连接");
  assert.ok(iorbit >= 0 && tasks > iorbit && (connections < 0 || tasks < connections), "between iOrbit and the next row");
});

test("the screens read and write the same routes as the web", async () => {
  const calls: string[] = [];
  const task = { createdAt: "x", id: "t1", lastRun: null, nextRunAt: null, notify: { inApp: true, push: false }, rows: [], status: "active", timeZone: "Asia/Tokyo", title: "每周五挑 3 场周末活动", updatedAt: "x", version: 1 };
  const client = {
    async delete(path: string) { calls.push(`DELETE ${path}`); return { data: null, status: 204, success: true }; },
    async get(path: string) { calls.push(`GET ${path}`); return path.includes("/runs") ? { data: { runs: [], task }, status: 200, success: true } : { data: { tasks: [task] }, status: 200, success: true }; },
    async patch(path: string, options: { body: unknown }) { calls.push(`PATCH ${path} ${JSON.stringify(options.body)}`); return { data: { automation: { automationId: "t1" } }, status: 200, success: true }; },
    async post(path: string, options: { body: unknown }) { calls.push(`POST ${path} ${JSON.stringify(options.body)}`); return { data: { automation: { automationId: "new1" } }, status: 201, success: true }; },
  } as unknown as OrbitApiClient;
  assert.equal((await readScheduledTasks(client, "zh")).kind, "ok");
  assert.equal((await readScheduledTask(client, "t1", "zh")).kind, "ok");
  assert.equal(await setScheduledTaskRunning(client, "t1", false), true);
  const form = { basis: { field: "startsAt" as const, kind: "field" as const }, domain: "event" as const, maxItems: 3, push: false, schedule: { daysOfWeek: [5], kind: "weekly" as const, time: "09:00", timeZone: "Asia/Tokyo" }, title: "", validUntil: null, window: "weekend" as const };
  assert.deepEqual(await saveScheduledTaskForm(client, form, "zh"), { id: "new1", ok: true });
  assert.deepEqual(calls.slice(0, 3), ["GET /api/agent/automations?language=zh", "GET /api/agent/automations/t1/runs?language=zh", "PATCH /api/agent/automations/t1 {\"status\":\"paused\"}"]);
  assert.ok(calls[3]?.startsWith("POST /api/agent/automations {\"form\":"), calls[3]);
});

const at = "2026-11-20T00:04:00.000Z";
const entry = (overrides: Partial<InboxNotificationDTO>): InboxNotificationDTO => ({ actions: ["read"], actorId: "a", disposition: "open", id: "i1", kind: "update", object: { id: "t1", name: "每周五挑 3 场周末活动" }, occurredAt: at, origin: "automation", readAt: null, reason: "r", revision: 1, semanticKey: "k", sources: [{ occurredAt: at, readAt: at, sourceId: "r1", sourceKind: "automation_result", sourceRevision: "v1" }], target: { href: null, id: "t1", kind: "automation", status: "available" }, title: "有 3 场新活动", updatedAt: at, ...overrides });

test("the App inbox: cards still waiting are the top group of 「全部」; agent rows carry their tag and the task's name", () => {
  const waiting = entry({ id: "i2", object: { id: "t2", name: "每周五把过期的待办挪到今天" }, sources: [{ occurredAt: at, readAt: at, sourceId: "c1", sourceKind: "agent_card", sourceRevision: "v1" }], target: { href: null, id: "c1", kind: "card", status: "available" }, title: "有 2 条要改，等你确认" });
  const done = entry({ id: "i3", object: { id: "t2", name: "每周五把过期的待办挪到今天" }, sources: [{ occurredAt: at, readAt: at, sourceId: "c0", sourceKind: "agent_card", sourceRevision: "v1" }], target: { href: null, id: "c0", kind: "card", status: "available" }, title: "有 1 条要改，等你确认" });
  const data = notificationInboxData({ asOf: at, enabled: true, items: [entry({}), waiting, done], nextCursor: null, unreadCount: 3 }, "a");
  assert.ok(data);
  const cardStates = new Map<string, AgentActionPreviewContract | null>([["c1", card({ actionId: "c1" })], ["c0", card({ actionId: "c0", status: "completed" })]]);
  const html = renderToHtml(React.createElement(NotificationInboxList, { busy: false, cardStates, data, error: "", filter: "all", onFilter: () => {}, onMore: () => {}, onOpen: () => {}, onRefresh: () => {} }));
  const text = html.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
  assert.ok(text.includes("等你确认 · 1"), text);
  assert.ok(text.indexOf("有 2 条要改，等你确认") < text.indexOf("有 3 场新活动"), "the waiting card is above the results");
  assert.ok(text.includes("定时任务 每周五挑 3 场周末活动") && text.includes("等你确认 每周五把过期的待办挪到今天"), text);
  assert.ok(text.includes("定时任务 每周五把过期的待办挪到今天"), "a card that is done carries the task tag, not 「等你确认」");
});
