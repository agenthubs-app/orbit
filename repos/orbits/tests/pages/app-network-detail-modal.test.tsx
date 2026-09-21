import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NetworkDetailModal, formatNoteTime } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";

const contact = {
  id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa AI", title: "合作伙伴负责人", industry: "科技与互联网", source: "event", stage: "Active", pipelineStatus: "in_progress", relationshipStatus: "active", location: "日本 东京", met: "东京 AI 峰会",
  lastInteraction: "昨天", nextAction: { text: "下周约产品演示", reason: "对方对知识库方案有兴趣" }, valueTags: ["AI"], editableTags: [{ value: "ai", label: "AI" }],
  notes: [
    { id: "n0", body: "较早的备注", createdAt: "2026-09-10T02:00:00Z" },
    { id: "n1", body: "讨论合作模式", createdAt: "2026-09-18T07:30:00Z" },
  ],
  encounters: [{ id: "e", eventId: "", createdAt: "", context: { metAt: "", reason: "", score: 0, tableNo: 1, publicProfile: { bio: "", intro: "", industry: "", topics: ["生成式 AI"], offering: ["企业级 AI 知识库"], seeking: ["日本市场 AI 方案"], conversationPrompts: [] } } }],
} as never;

test("detail modal renders overview rows, timeline from notes, and next steps", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /联系人详情/);
  assert.match(html, /Nexa AI · 合作伙伴负责人/);
  assert.match(html, /◎ 日本 东京/);
  assert.match(html, /⇢ 来自 活动认识/);
  for (const s of ["关系阶段", "上次互动", "下次计划", "来源", "生成式 AI", "企业级 AI 知识库", "日本市场 AI 方案", "讨论合作模式", "下周约产品演示", "对方对知识库方案有兴趣"]) assert.match(html, new RegExp(s));
  // 联系频率无数据源 → 不渲染；四条概览
  assert.doesNotMatch(html, /联系频率/);
  assert.equal((html.match(/class="nw-ov"/g) ?? []).length, 4);
  // 时间线倒序：最新备注在前，首点 #4B4FC7
  assert.ok(html.indexOf("讨论合作模式") < html.indexOf("较早的备注"));
  assert.match(html, /background:#4B4FC7[^>]*><\/span>[\s\S]*?9月18日/);
  assert.match(html, /备注/);
  // 按钮：关闭（链接）、记录互动、更新状态
  assert.match(html, /class="btn nw-detail-close" href="\/app\/contacts"/);
  assert.match(html, /class="btn nw-modal-close" href="\/app\/contacts"/);
  assert.match(html, /class="btn nw-detail-follow"[^>]*>▤ 记录互动/);
  assert.match(html, /class="btn nw-detail-status"[^>]*>⇢ 更新状态/);
  assert.doesNotMatch(html, /平均 2–3 周一次|1 周后（9月25日）|编辑资料|约时间|查看全部/);
});

test("detail modal falls back to dashes and renders extra above the timeline", () => {
  const bare = { ...(contact as object), location: "", nextAction: null, lastInteraction: "", notes: [], encounters: [] } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={bare} closeHref="/app/contacts" onFollow={() => {}} extra={<p data-extra>memo</p>} />);
  assert.doesNotMatch(html, /◎ /);
  assert.match(html, /nw-ov-v">—</);
  assert.ok(html.indexOf("data-extra") < html.indexOf("最近互动"));
  assert.match(html, /nw-tl-empty/);
});

test("formatNoteTime renders M月D日 HH:mm and dashes on garbage", () => {
  assert.match(formatNoteTime("2026-09-18T07:30:00Z"), /^\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/);
  assert.equal(formatNoteTime("nope"), "—");
});
