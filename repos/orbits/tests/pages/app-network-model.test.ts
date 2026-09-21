import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitContactView } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { donut, matchesQuery, sourceCounts, sourceOf, stageClip, stageCounts, stageOf, toPerson } from "../../app/(app)/app/contacts/network-0918/network-model";

function contact(overrides: Partial<OrbitContactView> = {}): OrbitContactView {
  return {
    company: "Nexa AI", encounters: [], displayName: "田中惠子", email: "", g: "g-violet", id: "contact:1", industry: "科技与互联网",
    initial: "田", lineId: "", location: "日本 东京", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "",
    pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "下周约产品演示", source: "event", stage: "Active", title: "合作伙伴负责人", wechat: "",
    strength: "medium", valueTags: ["AI"], nextAction: { text: "下周约产品演示", reason: "" }, lastInteraction: "昨天", dormant: false,
    ...overrides,
  };
}

test("stageOf maps the four real statuses onto the four design columns", () => {
  assert.equal(stageOf({ pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up" }), "explore");
  assert.equal(stageOf({ pipelineStatus: "in_progress", relationshipStatus: "nurture" }), "keep");
  assert.equal(stageOf({ pipelineStatus: "in_progress", relationshipStatus: "active" }), "advance");
  assert.equal(stageOf({ pipelineStatus: "archived", relationshipStatus: "archived" }), "archived");
  assert.equal(stageOf({ pipelineStatus: "pending_initialization", relationshipStatus: "needs_follow_up" }), "explore");
  // 旧数据没有 relationshipStatus 时退化到 pipelineStatus
  assert.equal(stageOf({ pipelineStatus: "in_progress" }), "advance");
  // 两者矛盾时 relationshipStatus 优先
  assert.equal(stageOf({ pipelineStatus: "archived", relationshipStatus: "active" }), "advance");
});

test("sourceOf folds exchange/qr/manual into other", () => {
  assert.equal(sourceOf({ source: "event" }), "event");
  assert.equal(sourceOf({ source: "referral" }), "referral");
  assert.equal(sourceOf({ source: "contact" }), "contact");
  assert.equal(sourceOf({ source: "scan" }), "scan");
  for (const s of ["exchange", "qr", "manual"] as const) assert.equal(sourceOf({ source: s }), "other");
});

test("toPerson keeps display fields and links to the detail route", () => {
  const p = toPerson(contact());
  assert.equal(p.orgTitle, "Nexa AI · 合作伙伴负责人");
  assert.equal(p.initial, "田");
  assert.equal(p.href, "/app/contacts/contact%3A1");
  assert.equal(p.pendingInit, false);
  assert.equal(toPerson(contact({ pipelineStatus: "pending_initialization" })).pendingInit, true);
});

test("matchesQuery searches name, org, title and industry", () => {
  const p = toPerson(contact());
  assert.ok(matchesQuery(p, "Nexa"));
  assert.ok(matchesQuery(p, "科技"));
  assert.ok(!matchesQuery(p, "腾讯"));
  assert.ok(matchesQuery(p, "  "));
});

test("counts are real and include the all bucket", () => {
  const people = [toPerson(contact()), toPerson(contact({ id: "contact:2", source: "manual", relationshipStatus: "archived", pipelineStatus: "archived" }))];
  assert.deepEqual(sourceCounts(people), { all: 2, event: 1, referral: 0, contact: 0, scan: 0, other: 1 });
  assert.deepEqual(stageCounts(people), { explore: 0, keep: 0, advance: 1, archived: 1 });
});

test("donut reproduces the design conic-gradient math and colour order", () => {
  const d = donut([["科技与互联网", 21], ["其他", 79]]);
  assert.equal(d.rows[0].color, "#4B4FC7");
  assert.equal(d.rows[0].pct, "21%");
  assert.equal(d.bg, "conic-gradient(#4B4FC7 0deg 75.6deg, #5B8C7A 75.6deg 360deg)");
});

test("stageClip returns the three arrow polygons", () => {
  assert.equal(stageClip(0), "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)");
  assert.equal(stageClip(3), "polygon(0 0,100% 0,100% 100%,0 100%,14px 50%)");
  assert.equal(stageClip(1), "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%)");
});
