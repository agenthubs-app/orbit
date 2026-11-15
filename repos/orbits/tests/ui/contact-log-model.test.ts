// 「记一笔交流」Web 弹层与「往来」时间线的纯逻辑（docs/designs/contact-log-2026-11 ①–④）。
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContactLogPatch, contactLogBody, contactLogCanSave, contactLogEventsOn, contactLogGroups, sameLine, sortTimeline, timelineWithSystemEntries, timelineDay, timelineOriginOf, tokyoToday,
} from "../../app/(app)/app/orbit-2026/network/contact-log-model";
import { createMemoEventOptionsGetHandler } from "../../app/api/contacts/memo-event-options/handler";

const zh = { bodyPrefix: "聊到：", joiner: "、" };

test("正文：「聊到：A、B」，有补充换行接补充；只有补充时就是补充；chip 去空去重", () => {
  assert.equal(contactLogBody({ topics: ["质量管理体系相关资源", "Orbit 的日本市场落地"], extra: "", copy: zh }), "聊到：质量管理体系相关资源、Orbit 的日本市场落地");
  assert.equal(contactLogBody({ topics: ["A", " A ", "", "B"], extra: "  他说下个月介绍。 ", copy: zh }), "聊到：A、B\n他说下个月介绍。");
  assert.equal(contactLogBody({ topics: [], extra: "只写了字", copy: zh }), "只写了字");
  assert.equal(contactLogBody({ topics: ["A", "B"], extra: "", copy: { bodyPrefix: "Talked about: ", joiner: ", " } }), "Talked about: A, B");
});

test("请求体：kind memo + channel + topics；活动只在「活动上遇到」时带；没点 chip 不带 topics", () => {
  assert.deepEqual(buildContactLogPatch({ channel: "meeting", date: "2026-11-16", topics: ["A"], extra: "补充", eventId: "event:e1", copy: zh }), {
    note: { body: "聊到：A\n补充", authorLabel: "我", occurredAt: "2026-11-16", kind: "memo", channel: "meeting", topics: ["A"] },
  });
  assert.deepEqual(buildContactLogPatch({ channel: "event", date: "2026-11-12", topics: [], extra: "见面", eventId: "event:e1", copy: zh }).note, {
    body: "见面", authorLabel: "我", occurredAt: "2026-11-12", kind: "memo", channel: "event", eventId: "event:e1",
  });
  // 与服务端同一上限：至多 12 个，每个至多 80 字。
  const many = Array.from({ length: 14 }, (_, index) => `t${index}`);
  assert.equal(buildContactLogPatch({ channel: "call", date: "2026-11-16", topics: [...many, "字".repeat(81)], extra: "", copy: zh }).note.topics?.length, 12);
});

test("可保存：有 chip 或有文字，且日期合法", () => {
  assert.equal(contactLogCanSave({ topics: [], extra: " ", date: "2026-11-16" }), false);
  assert.equal(contactLogCanSave({ topics: ["A"], extra: "", date: "2026-11-16" }), true);
  assert.equal(contactLogCanSave({ topics: [], extra: "x", date: "2026-11-16" }), true);
  assert.equal(contactLogCanSave({ topics: ["A"], extra: "", date: "2026-02-30" }), false);
});

test("chip 分组：顺序固定（对方行业→能提供→在找→我能提供→我在找→我想聊的话题），空组隐藏", () => {
  const groups = contactLogGroups({
    myTopics: ["Orbit 的日本市场落地"], theirIndustry: ["制造业 · 质量认证"], theirSeeking: [" ", ""], myOffering: ["中日市场进入咨询", "中日市场进入咨询"], theirOffering: ["质量管理体系相关资源"],
  });
  assert.deepEqual(groups.map((group) => [group.key, group.side, group.chips]), [
    ["theirIndustry", "them", ["制造业 · 质量认证"]],
    ["theirOffering", "them", ["质量管理体系相关资源"]],
    ["myOffering", "me", ["中日市场进入咨询"]],
    ["myTopics", "me", ["Orbit 的日本市场落地"]],
  ]);
  assert.deepEqual(contactLogGroups({}), []);
});

test("当天活动：按所选东京日期筛、同一活动只列一次", () => {
  const options = [
    { eventId: "e1", title: "中日创业交流会", startsAt: "2026-11-12T09:00:00.000Z" },
    { eventId: "e1", title: "中日创业交流会", startsAt: "2026-11-12T10:00:00.000Z" },
    { eventId: "e2", title: "AI × 制造 Meetup", startsAt: "2026-11-11T15:30:00.000Z" }, // 东京 11/12 00:30
    { eventId: "e3", title: "前一天", startsAt: "2026-11-11T14:59:00.000Z" },
  ];
  assert.deepEqual(contactLogEventsOn(options, "2026-11-12").map((item) => item.eventId), ["e1", "e2"]);
  assert.equal(tokyoToday(new Date("2026-11-15T15:00:00.000Z")), "2026-11-16");
});

test("时间线：按交流日期倒序，同一天按记下的时间倒序；没有 occurredAt 用 createdAt 的东京日", () => {
  const notes = [
    { id: "card", createdAt: "2026-10-30T01:00:00.000Z" },
    { id: "old-day-new-write", createdAt: "2026-11-16T05:00:00.000Z", occurredAt: "2026-11-01" },
    { id: "today-early", createdAt: "2026-11-16T01:00:00.000Z", occurredAt: "2026-11-16" },
    { id: "today-late", createdAt: "2026-11-16T03:00:00.000Z", occurredAt: "2026-11-16" },
    { id: "plain-today", createdAt: "2026-11-16T02:00:00.000Z" },
  ];
  assert.deepEqual(sortTimeline(notes).map((note) => note.id), ["today-late", "plain-today", "today-early", "old-day-new-write", "card"]);
  assert.equal(timelineDay({ createdAt: "2026-11-15T16:00:00.000Z" }), "2026-11-16");
});

test("来源：payload 的 origin 优先；没有时按 noteId 前缀与名片来源推", () => {
  assert.equal(timelineOriginOf({ noteId: "note:x", origin: "card" }), "card");
  assert.equal(timelineOriginOf({ noteId: "note:live-contact-detail-update:abc" }), "user");
  assert.equal(timelineOriginOf({ noteId: "note:business-card-notes:c1" }), "card");
  assert.equal(timelineOriginOf({ noteId: "note:relationship-evidence:c1:e1", source: { type: "business_card_ocr" } }), "card");
  assert.equal(timelineOriginOf({ noteId: "note:relationship-evidence:c1:e1", source: { type: "event_import" } }), "system");
  assert.equal(timelineOriginOf({ noteId: "note:live-contact-detail:c1", source: { type: "business_card_ocr" } }), "system");
});

test("GET /api/contacts/memo-event-options：要登录；按本人读；读失败 503", async () => {
  const unauth = await createMemoEventOptionsGetHandler({ resolveActor: async () => null, read: async () => [] })();
  assert.equal(unauth.status, 401);
  const seen: string[] = [];
  const ok = await createMemoEventOptionsGetHandler({ resolveActor: async () => ({ id: "a" }) as never, read: async ({ actorId }) => { seen.push(actorId); return [{ eventId: "e1", title: "T", startsAt: "2026-11-12T09:00:00.000Z" }]; } })();
  assert.equal(ok.status, 200);
  assert.deepEqual(((await ok.json()) as { data: unknown }).data, { options: [{ eventId: "e1", title: "T", startsAt: "2026-11-12T09:00:00.000Z" }] });
  assert.deepEqual(seen, ["a"]);
  const down = await createMemoEventOptionsGetHandler({ resolveActor: async () => ({ id: "a" }) as never, read: async () => { throw new Error("db"); } })();
  assert.equal(down.status, 503);
});

test("时间线系统条目：上次互动与备注同一件事不重复；系统背景说明一直保留并按日期排序", () => {
  const memo = { id: "m", body: "聊到：A\n补充", title: "", createdAt: "2026-11-16T01:00:00.000Z", origin: "user" as const, occurredAt: "2026-11-16" };
  const card = { id: "c", body: "名片原文", title: "", createdAt: "2026-10-03T00:00:00.000Z", origin: "card" as const };
  const rows = timelineWithSystemEntries([card, memo], { occurredAt: "2026-11-16T01:00:00.000Z", summary: "聊到：A" }, { occurredAt: "2026-10-03T00:00:00.000Z", summary: "背景说明。" });
  assert.deepEqual(rows.map((row) => [row.id, row.origin]), [["m", "user"], ["c", "card"], ["system:generated", "system"]]);
  assert.equal(sameLine("聊到：A\n补充", "聊到：A"), true);
  const untouched = timelineWithSystemEntries([], { occurredAt: "2026-10-03T00:00:00.000Z", summary: "背景说明。" }, { occurredAt: "2026-10-03T00:00:00.000Z", summary: "背景说明。" });
  assert.deepEqual(untouched.map((row) => row.id), ["system:last-interaction"]);
});
