import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { NetworkFollowModal, buildFollowPatch } from "../../app/(app)/app/contacts/network-0918/network-follow-modal";

test("buildFollowPatch composes note body from the four fields and maps stage to status", () => {
  const patch = buildFollowPatch({ summary: "聊了合作", need: "需要案例", offer: "可给 demo", next: "下周发方案", date: "2026-09-25", remind: "2026-09-24", stage: "keep", tags: ["AI", "日本"], existingTags: ["AI", "旧"] });
  assert.equal(patch.status, "nurture");
  assert.deepEqual(patch.addTags, ["日本"]);
  assert.deepEqual(patch.removeTags, ["旧"]);
  assert.match(patch.note.body, /总结：聊了合作/);
  assert.match(patch.note.body, /下一步：下周发方案（2026-09-25）/);
  assert.match(patch.note.body, /提醒：2026-09-24/);
  assert.equal(patch.lastInteraction.occurredAt, "2026-09-25");
  assert.equal(patch.lastInteraction.channel, "manual_note");
  const minimal = buildFollowPatch({ summary: "x", need: "", offer: "", next: "", date: "", remind: "", stage: "", tags: [], existingTags: [] });
  assert.equal(minimal.status, undefined);
  assert.equal(minimal.addTags, undefined);
  assert.equal(minimal.removeTags, undefined);
  assert.equal(buildFollowPatch({ summary: "x", need: "", offer: "", next: "", date: "", remind: "", stage: "archived", tags: [], existingTags: [] }).status, "archived");
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
  assert.match(html, /提醒日期/);
  assert.equal((html.match(/type="date"/g) ?? []).length, 2);
  assert.match(html, /nw-fu-save"[^>]*disabled/);
  assert.match(html, /保存记录/);
  assert.equal((html.match(/class="btn nw-fu-stage/g) ?? []).length, 4);
  // 当前阶段（active → advance）预选
  assert.equal((html.match(/nw-fu-stage nw-fu-stage-on/g) ?? []).length, 1);
  assert.match(html, /已归档/);
  // 现有标签预填为 chip
  assert.match(html, /nw-fu-tag[^>]*>AI/);
  // 同步到 AI 分析：非交互说明，无假开关
  assert.match(html, /aria-disabled="true"[^>]*>[\s\S]*?同步到 AI 分析/);
  assert.match(html, /分析会在下次生成时读取本次跟进/);
  assert.doesNotMatch(html, /toggleSync/);
});
