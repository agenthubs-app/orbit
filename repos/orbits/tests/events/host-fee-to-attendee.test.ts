// 2026-11-23 线上：第六期中日创业交流会主办方填了 ¥4,500，参加者端（详情 / 简介栏 / 列表 / 评估）都没有费用。
// 主办方表单存在 source_payload.host.{feeKind, feeAmountYen, feeUrl}；参加者端以前只认旧写法（feeYen / fee / price …）。
import assert from "node:assert/strict";
import test from "node:test";

import { payloadFacts } from "../../features/events/assessment/orbit-event-facts";
import { journeyEventFromCanonical } from "../../features/events/journey/live-mapping";

const hostEvent = (host: Record<string, unknown>) => journeyEventFromCanonical({
  description: null, endsAt: "2026-11-28T08:30:00.000Z", eventId: "evt_fee", organizerActorId: "actor:host", publicCode: "ABC123",
  sourcePayload: { host: { capacity: 60, emoji: null, online: false, templateId: null, venueArea: null, ...host } },
  startsAt: "2026-11-28T05:00:00.000Z", title: "第六期 中日创业交流会", venue: "新橋",
}, { policy: null, registrationCount: 0 });

test("host form feeKind=amount → the attendee side shows the amount", () => {
  assert.equal(hostEvent({ feeAmountYen: 4500, feeKind: "amount", feeUrl: null }).priceYen, 4500);
  assert.equal(payloadFacts({ host: { feeAmountYen: 4500, feeKind: "amount" } }).price, "¥4,500", "the assessment facts (score, budget warning) get the same value");
});

test("host form feeKind=free → 0 (shown as 「免费」)", () => {
  assert.equal(hostEvent({ feeAmountYen: null, feeKind: "free", feeUrl: null }).priceYen, 0);
});

test("host form feeKind=external_link → the amount is unknown (null): shown as no fee, no stale fallback", () => {
  assert.equal(hostEvent({ feeAmountYen: null, feeKind: "external_link", feeUrl: "https://peatix.com/x" }).priceYen, null);
  assert.equal(payloadFacts({ host: { feeKind: "external_link", feeUrl: "https://x.example" }, price: "¥9,999" }).feeYen, null, "the host's choice wins over an old payload field");
});

test("payloads without feeKind keep the old spellings (imported / older events)", () => {
  assert.equal(payloadFacts({ feeYen: 3000 }).feeYen, 3000);
  assert.equal(payloadFacts({ price: "¥5,000" }).feeYen, 5000);
  assert.equal(payloadFacts({ feeKind: "amount", feeAmountYen: 2000 }).feeYen, 2000, "a top-level feeKind is read too");
  assert.equal(payloadFacts({}).feeYen, null);
});
