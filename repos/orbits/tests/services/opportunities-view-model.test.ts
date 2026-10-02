/**
 * W0050 SC-02／SC-04（纯函数层）：
 * - 需求 ↔ 活动：候选来自 `readPublicBookableEvents`（与首页同一套候选规则：已开始、已取消、本人主办、已报名的不出现），
 *   计划点名（同阶段）在前，其余显示真实命中词，每条需求最多 2 场；原 `readPublicUpcomingEvents` 不受影响；
 * - 待唤醒四组筛选：dormant + 关联计划需求 ✓、dormant + 与目标相关 ✓、dormant 但无关 ✗、非 dormant ✗；无记录不出现；
 *   按最近记录倒序、最多 5 人；`why` 中英双语、来自真实记录并带依据；
 * - gap 句子只在依据可见时挂到对应需求；
 * - 「起草邮件」模板：不调模型、不保存、不发送（纯函数，只返回文字）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpportunitiesTabView,
  dormantRows,
  gapEvidenceIds,
  gapNoteFor,
  needEventRows,
  type DormantCandidate,
} from "../../app/(app)/app/contacts/analysis/opportunities-view-model";
import { manualRemaining } from "../../app/(app)/app/contacts/analysis/opportunities-report-card";
import type { PublicEventRecordCatalogueSnapshot } from "../../features/events/core/public-catalogue";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import { readPublicBookableEvents, readPublicUpcomingEvents } from "../../features/events/public-goal-recommendations";
import type { NetworkSnapshotView } from "../../features/network-analysis/contract";
import { draftReconnectEmail } from "../../features/plans/email-draft";

const NOW = new Date("2026-10-03T00:00:00.000Z");
const ME = "account:me";

function event(id: string, input: Partial<EventRecord> = {}): EventRecord {
  const startsAt = input.startsAt ?? "2026-10-20T10:00:00.000Z";
  const endsAt = new Date(Date.parse(startsAt) + 2 * 3600_000).toISOString();
  const sourceMetadata = {
    calendarSyncRequested: false as const, captureMethod: "organizer_feed" as const, externalNetworkRequested: false as const, id: `event-source:${id}`,
    importedAt: NOW.toISOString(), label: "fixture", liveDatabaseWriteExecuted: false, organizerFeedRequested: false as const, provider: "fixture",
    providerRecordId: id, type: "event_import" as const,
  };
  return {
    aiProviderRequested: false, calendarProviderRequested: false, calendarSyncRequested: false, description: "A community meetup.",
    emailProviderRequested: false, endsAt,
    evidence: [{ capturedAt: NOW.toISOString(), createdBy: "test", evidenceId: `evidence:${id}`, excerpt: "x", source: sourceMetadata }],
    externalNetworkRequested: false, id, liveDatabaseWriteExecuted: false, nextAction: "Register.", notificationDelivered: false,
    organizerFeedRequested: false, recommendedPreparation: "Read.", relationshipContext: "Useful.", sourceMetadata,
    startsAt, status: "imported", title: `Event ${id}`, venue: "Room", ...input,
  };
}

function catalogue(records: EventRecord[], organizers: Record<string, string> = {}): PublicEventRecordCatalogueSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    organizerIds: Object.fromEntries(records.map((record) => [record.id, organizers[record.id] ?? "account:organizer"])),
    participantCounts: Object.fromEntries(records.map((record) => [record.id, 0])),
    publicCodes: Object.fromEntries(records.map((record) => [record.id, `code-${record.id}`])),
    records,
  };
}

const NEED: Parameters<typeof needEventRows>[0]["need"] = { criteria: { description: "能拍板采购 SaaS 的人", primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: ["CTO"] }, phaseKey: "p1", title: "SaaS 决策人" };

test("SC-02: bookable events share the upcoming rules (started, cancelled, own-hosted, registered are out); plan-named first, then real matched tokens, ≤2 per need", async () => {
  const records = [
    event("past", { startsAt: "2026-10-01T10:00:00.000Z", title: "SaaS CTO Past" }),
    event("cancelled", { status: "cancelled", title: "SaaS CTO Cancelled" }),
    event("mine", { title: "SaaS CTO Mine" }),
    event("registered", { title: "SaaS CTO Registered" }),
    event("plan-named", { description: "Generic networking.", startsAt: "2026-10-25T10:00:00.000Z", title: "Tokyo Mixer" }),
    event("match-1", { description: "For every CTO in town.", startsAt: "2026-10-05T10:00:00.000Z", title: "Founders Night" }),
    event("match-2", { startsAt: "2026-10-06T10:00:00.000Z", title: "SaaS Growth Talk" }),
    event("match-3", { startsAt: "2026-10-07T10:00:00.000Z", title: "SaaS CTO Roundtable" }),
    event("other", { startsAt: "2026-10-04T10:00:00.000Z", title: "Gardening Club" }),
  ];
  const dependencies = {
    listMemberships: async () => [{ eventId: "registered", status: "rsvped" as const, userId: ME }],
    readPublicCatalogue: async () => catalogue(records, { mine: ME }),
  };
  const bookable = await readPublicBookableEvents(dependencies, ME, NOW);
  assert.deepEqual(bookable.map((value) => value.eventId), ["other", "match-1", "match-2", "match-3", "plan-named"]);
  assert.equal(bookable.find((value) => value.eventId === "match-1")!.description, "For every CTO in town.");
  // 原函数行为不变（同一组候选，不带 description）
  const upcoming = await readPublicUpcomingEvents(dependencies, ME, NOW);
  assert.deepEqual(upcoming.map((value) => value.eventId), bookable.map((value) => value.eventId));
  assert.equal("description" in upcoming[0]!, false);

  const rows = needEventRows({ bookable, need: NEED, now: NOW, planEventItems: [{ eventId: "plan-named", phaseKey: "p1" }, { eventId: "other", phaseKey: "p2" }] });
  assert.deepEqual(rows.map((row) => [row.eventId, row.reason]), [
    ["plan-named", { kind: "plan" }],
    ["match-1", { kind: "match", tokens: ["cto"] }],
  ]);
  assert.equal(rows[0]!.href, "/app/events/code-plan-named");
  // 另一阶段点名的活动不算这条需求的「计划点名」；不命中的不出现
  const otherPhase = needEventRows({ bookable, need: { ...NEED, phaseKey: "p3" }, now: NOW, planEventItems: [{ eventId: "plan-named", phaseKey: "p1" }], limit: 5 });
  assert.deepEqual(otherPhase.map((row) => row.eventId), ["match-1", "match-2", "match-3"]);
  assert.ok(otherPhase.every((row) => row.reason.kind === "match" && row.reason.tokens.length > 0));
});

function dormant(id: string, input: Partial<DormantCandidate> = {}): DormantCandidate {
  return {
    contactId: id, dormant: true, lastSignal: { occurredAt: "2026-07-01T03:00:00.000Z", recordId: `memo:${id}`, source: "memo" },
    linkId: `link:${id}`, name: `Name ${id}`, organization: "Misc KK", primaryIndustryId: "other", role: "Staff", ...input,
  };
}

test("SC-04: dormant filter — linked to a plan need ✓, goal-related ✓, unrelated ✗, not dormant ✗, no record ✗; newest first, ≤5", () => {
  const candidates = [
    dormant("need-linked", { lastSignal: { occurredAt: "2026-06-01T03:00:00.000Z", recordId: "enc:1", source: "encounter" } }),
    dormant("goal-industry", { primaryIndustryId: "finance_investment" }),
    dormant("goal-keyword", { lastSignal: { occurredAt: "2026-07-20T03:00:00.000Z", recordId: "note:9", source: "note" }, role: "Investment Partner" }),
    dormant("unrelated"),
    dormant("awake", { dormant: false, primaryIndustryId: "finance_investment" }),
    dormant("no-record", { lastSignal: null, primaryIndustryId: "finance_investment" }),
  ];
  const rows = dormantRows({ candidates, goal: "拿到天使轮融资", language: "zh", needTitleByContact: new Map([["need-linked", "早期投资人"]]) });
  assert.deepEqual(rows.map((row) => row.contactId), ["link:goal-keyword", "link:goal-industry", "link:need-linked"]);
  assert.equal(rows[2]!.why, "上次往来：2026/6/1 见面；与目标相关：计划需求「早期投资人」");
  assert.equal(rows[1]!.why, "上次往来：2026/7/1 备忘；与目标相关：同属金融与投资");
  assert.match(rows[0]!.why, /^上次往来：2026\/7\/20 笔记；与目标相关：职位相关（(投资|Partner)）$/);
  assert.deepEqual(rows[2]!.evidence, { href: "/app/contacts/link%3Aneed-linked", recordId: "enc:1" });
  const en = dormantRows({ candidates, goal: "拿到天使轮融资", language: "en", needTitleByContact: new Map([["need-linked", "早期投资人"]]) });
  assert.equal(en[2]!.why, "Last contact: Jun 1, 2026 met in person; relevant to your goal: plan need “早期投资人”");
  assert.match(en[1]!.why, /^Last contact: Jul 1, 2026 memo; relevant to your goal: same industry \(Financ/);
  // 无目标、无关联 → 空；超过 5 人截断
  assert.deepEqual(dormantRows({ candidates, goal: null, language: "zh", needTitleByContact: new Map() }), []);
  const many = Array.from({ length: 8 }, (_, index) => dormant(`m${index}`, { lastSignal: { occurredAt: `2026-07-0${index + 1}T00:00:00.000Z`, recordId: `r${index}`, source: "memo" } }));
  const capped = dormantRows({ candidates: many, goal: null, language: "zh", needTitleByContact: new Map(many.map((value) => [value.contactId, "需求"])) });
  assert.deepEqual(capped.map((row) => row.contactId), ["link:m7", "link:m6", "link:m5", "link:m4", "link:m3"]);
});

function snapshot(blocks: NetworkSnapshotView["blocks"]): NetworkSnapshotView {
  return { blocks, contactCount: 10, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: NOW.toISOString(), quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } }, state: "ready" };
}

test("SC-02: a snapshot gap block hangs under its need only when its evidence resolves to the actor's contacts", () => {
  const view = snapshot([
    { evidence: { contactIds: ["r1", "r-other"], recordIds: [] }, key: "g1", kind: "gap", needId: "need-1", text: "还缺能拍板的人" },
    { evidence: { contactIds: ["r-gone"], recordIds: [] }, key: "g2", kind: "gap", needId: "need-2", text: "无据" },
    { evidence: { contactIds: ["r9"], recordIds: [] }, key: "i1", kind: "insight", text: "洞察" },
  ]);
  assert.deepEqual(gapEvidenceIds(view), ["r1", "r-other", "r-gone"]);
  const names = new Map([["r1", { contactId: "c1", name: "王敏" }]]);
  assert.deepEqual(gapNoteFor("need-1", view.blocks, names), { evidence: [{ href: "/app/contacts/c1", id: "c1", name: "王敏" }], text: "还缺能拍板的人" });
  assert.equal(gapNoteFor("need-2", view.blocks, names), undefined);
  assert.equal(gapNoteFor("need-1", view.blocks, null), undefined, "name read failed → no sentence without evidence");
  assert.equal(gapNoteFor("need-3", view.blocks, names), undefined);
});

test("SC-05 helper: remaining manual runs = min(3 − manual, 10 − user), never below 0", () => {
  const view = (manual: number, user: number) => ({ quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: manual }, user: { limit: 10, usedToday: user } } });
  assert.equal(manualRemaining(view(0, 0)), 3);
  assert.equal(manualRemaining(view(1, 9)), 1);
  assert.equal(manualRemaining(view(3, 3)), 0);
  assert.equal(manualRemaining(view(0, 12)), 0);
});

test("buildOpportunitiesTabView: failed reads stay honest (plan unavailable, pending/events/dormant null) and nothing is invented", () => {
  const view = buildOpportunitiesTabView({ bookable: null, dormant: null, gapNames: null, goal: null, pending: null, plan: undefined, report: snapshot([]) }, { language: "zh", now: NOW });
  assert.deepEqual(view.coverage, { state: "unavailable" });
  assert.equal(view.dormant, null);
  assert.deepEqual(view.weekActions, { pendingMatches: null, planActions: null });
});

test("SC-04: the reconnect draft is a template — bilingual, uses only the contact and goal, and never claims to be sent", () => {
  const zh = draftReconnectEmail({ contactName: "周杰", goal: "拿到天使轮融资", language: "zh", organization: "北辰资本", role: "合伙人" });
  assert.equal(zh.provider, "template");
  assert.match(zh.body, /^周杰您好：/);
  assert.match(zh.body, /拿到天使轮融资/);
  assert.match(zh.body, /北辰资本担任合伙人/);
  const en = draftReconnectEmail({ contactName: "Ana", goal: null, language: "en", organization: null, role: null });
  assert.match(en.body, /^Hi Ana,/);
  assert.match(en.subject, /catch up/);
  assert.doesNotMatch(en.body, /undefined|null/);
});
