// 「记一笔交流」App 版的纯逻辑（docs/designs/contact-log-2026-11 ⑤）：与 Web 的 contact-log-model 同一组断言，
// 再加上详情读取（detailContactFrom）带出来的来源 / 日期 / 方式 / chip。
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContactLogPatch, contactLogBody, contactLogCanSave, contactLogEventsOn, contactLogGroups, sortTimeline, timelineDay, timelineOriginOf, tokyoToday,
} from "../src/screens/network/contact-log-model";
import { detailContactFrom } from "../src/screens/network/contact-detail-model";

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

test("详情读取：每条记录带 origin；memo 的 occurredAt / channel / topics 读出来；旧 payload（只有 occurredAt、没有 origin）照旧", () => {
  const contact = detailContactFrom({ contact: { id: "c1", displayName: "安川 高宏", publicProfile: { industry: "制造业", offering: ["A"] }, notes: [
    { noteId: "note:live-contact-detail-update:m1", body: "聊到：A\n补充", origin: "user", createdAt: "2026-11-16T05:00:00.000Z", occurredAt: "2026-11-12", channel: "event", topics: ["A"] },
    { noteId: "note:business-card-notes:c1", body: "名片原文", origin: "card", createdAt: "2026-10-30T01:00:00.000Z" },
    { noteId: "note:old", body: "旧备注", kind: "memo", occurredAt: "2026-10-01T00:00:00.000Z" },
    { noteId: "note:bad", body: "非法方式", origin: "user", createdAt: "2026-10-02T00:00:00.000Z", channel: "fax" },
  ] } });
  assert.ok(contact);
  assert.equal(contact.profileIndustry, "制造业");
  assert.deepEqual(contact.notes.map((note) => [note.id, note.origin, note.occurredAt ?? null, note.channel ?? null, note.topics ?? null]), [
    ["note:live-contact-detail-update:m1", "user", "2026-11-12", "event", ["A"]],
    ["note:business-card-notes:c1", "card", null, null, null],
    ["note:old", "system", null, null, null],
    ["note:bad", "user", null, null, null],
  ]);
  assert.equal(contact.notes[2]!.createdAt, "2026-10-01T00:00:00.000Z", "old payload: occurredAt stands in for createdAt");
  assert.equal(contact.notes[2]!.kind, "memo");
});
