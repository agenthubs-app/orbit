import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FOLLOW_PATCH_LABELS, NetworkFollowModal, buildFollowPatch, followOccurredAt } from "../../app/(app)/app/contacts/network-0918/network-follow-modal";

test("buildFollowPatch composes note body from the four fields and never writes status", () => {
  const patch = buildFollowPatch({ summary: "聊了合作", need: "需要案例", offer: "可给 demo", next: "下周发方案", date: "2026-09-25", tags: ["AI", "日本"], existingTags: ["AI", "旧"] });
  // 阶段由关系生命周期任务推进：详情 PATCH 带 status 会被 409 拒绝，跟进记录永远不带 status
  assert.equal("status" in patch, false);
  assert.deepEqual(patch.addTags, ["日本"]);
  assert.deepEqual(patch.removeTags, ["旧"]);
  assert.match(patch.note.body, /总结：聊了合作/);
  // 日期只进 lastInteraction.occurredAt：下一步行不再追加「（date）」，也没有「提醒：」行
  assert.equal(patch.note.body, "总结：聊了合作\n对方需求：需要案例\n我能提供：可给 demo\n下一步：下周发方案");
  assert.doesNotMatch(patch.note.body, /提醒|2026-09-25/);
  // occurredAt 是完整 ISO 时间戳（与 contact-interaction-editor 一致）：选了日期 → 该本地日期 + 当前时刻
  assert.match(patch.lastInteraction.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(new Date(patch.lastInteraction.occurredAt).getDate(), 25);
  assert.equal(patch.lastInteraction.channel, "manual_note");
  const minimal = buildFollowPatch({ summary: "x", need: "", offer: "", next: "", date: "", tags: [], existingTags: [] });
  assert.equal(minimal.addTags, undefined);
  assert.equal(minimal.removeTags, undefined);
  assert.equal(minimal.note.body, "总结：x");
  assert.match(minimal.lastInteraction.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("buildFollowPatch prefixes follow the UI language labels passed by the caller", () => {
  const en = buildFollowPatch({ summary: "Talked", need: "Cases", offer: "Demo", next: "Send deck", date: "", tags: [], existingTags: [] }, FOLLOW_PATCH_LABELS.en);
  assert.equal(en.note.body, "Summary: Talked\nTheir needs: Cases\nI can offer: Demo\nNext step: Send deck");
  assert.doesNotMatch(en.note.body, /总结|对方需求|我能提供|下一步/);
});

test("followOccurredAt keeps the chosen local date with the current time of day, or now when empty", () => {
  const now = new Date(2026, 8, 21, 14, 5, 9, 0);
  assert.equal(followOccurredAt("", now), now.toISOString());
  const chosen = new Date(followOccurredAt("2026-09-25", now));
  assert.deepEqual([chosen.getFullYear(), chosen.getMonth(), chosen.getDate(), chosen.getHours(), chosen.getMinutes()], [2026, 8, 25, 14, 5]);
  assert.equal(followOccurredAt("nope", now), now.toISOString());
});

test("follow modal renders the design form with save disabled until summary is filled", () => {
  const contact = { id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa", title: "PM", valueTags: [], editableTags: [{ value: "ai", label: "AI" }], stage: "Active", relationshipStatus: "active", pipelineStatus: "in_progress" } as never;
  const html = renderToStaticMarkup(<NetworkFollowModal contact={contact} onClose={() => {}} onSaved={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /记录跟进/);
  assert.match(html, /Nexa · PM/);
  // 设计稿 811–818：三个 textarea + 一个 input
  for (const label of ["本次沟通摘要", "对方当前需求", "我可提供的帮助", "下一步动作"]) assert.match(html, new RegExp(label));
  assert.equal((html.match(/<textarea/g) ?? []).length, 3);
  assert.match(html, /更新时间/);
  // 提醒日期已移除（无提醒接口）：只剩更新时间一个日期输入，两列网格保留
  assert.doesNotMatch(html, /提醒日期|nw-fu-input-muted/);
  assert.equal((html.match(/type="date"/g) ?? []).length, 1);
  assert.match(html, /class="nw-fu-dates"/);
  assert.match(html, /nw-fu-save"[^>]*disabled/);
  assert.match(html, /<textarea id="nw-fu-summary"[^>]*autofocus/);
  assert.match(html, /保存记录/);
  // 四段阶段箭头只读：span + aria-disabled，不是按钮；当前阶段（active → advance）高亮
  assert.equal((html.match(/<span class="nw-fu-stage/g) ?? []).length, 4);
  assert.equal((html.match(/<button[^>]*nw-fu-stage/g) ?? []).length, 0);
  assert.equal((html.match(/nw-fu-stage nw-fu-stage-on" aria-disabled="true" aria-current="true"/g) ?? []).length, 1);
  assert.match(html, /nw-fu-stage-on[^>]*>正在推进/);
  assert.match(html, /已归档/);
  assert.match(html, /阶段由关系生命周期任务推进/);
  // 现有标签预填为 chip
  assert.match(html, /nw-fu-tag[^>]*>AI/);
  // 同步到 AI 分析：非交互说明，无假开关
  assert.match(html, /aria-disabled="true"[^>]*>[\s\S]*?同步到 AI 分析/);
  assert.match(html, /分析会在下次生成时读取本次跟进/);
  assert.doesNotMatch(html, /toggleSync/);
});
