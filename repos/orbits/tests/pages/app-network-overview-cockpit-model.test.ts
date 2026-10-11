/**
 * W0052（RN-10）主证据：概览驾驶舱 4 卡、关系档位、最近动态、全量人数口径的纯函数模型。
 * 35 人夹具：分析全量 35 人（档位 12／10／8／5），名单只有一页 30 位——任何人数都不得来自名单。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  activitySummary,
  buildNetworkOverviewData,
  overviewNameIds,
  overviewSourceCounts,
} from "../../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import { ANALYSIS_35, NAMES, analysisWithHealth, PLAN, SNAPSHOT_FAILED, SNAPSHOT_NONE, SNAPSHOT_READY, TIMELINE_9, parts } from "../fixtures/network-overview-cockpit";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("SC-W0052-01 main: with a snapshot and a plan the 4 cards are snapshot sentences + rule numbers and link to the agreed addresses", () => {
  const data = buildNetworkOverviewData(parts(), ANALYSIS_35);
  assert.deepEqual(data.cards.map((card) => [card.id, card.n, card.value?.zh ?? null, card.sentence?.zh ?? null, card.href]), [
    ["structure", 35, "35 位联系人", "人脉集中在科技行业，制造业还很少。", "/app/contacts/dashboard?tab=structure"],
    // 覆盖 = Σmin(a,t)／Σt：min(1,3) + min(4,2) = 3，共 5（W0050 planNeedCoverage 同一口径，超额不抵其他需求）。
    ["gap", 3, "已有 3／共 5", "还缺能引荐制造业采购的人。", "/app/contacts/dashboard?tab=opportunities"],
    // 本周建议动作 = 计划本周行动 2 + 待确认匹配 1。
    ["week", 3, "3 项建议动作", "本周先约王敏聊试用。", "/app/tasks?tab=plan"],
    ["dormant", 5, "5 位待唤醒", "5 位曾有往来、60 天没有新记录", "/app/contacts/dashboard?tab=opportunities"],
  ]);
  assert.deepEqual(data.cards.map((card) => card.value?.en), ["35 contacts", "3 of 5 covered", "3 suggested actions", "5 to re-engage"]);
  assert.equal(data.cards[3]!.sentence!.en, "5 contacts you were in touch with have had no new records for 60 days");
  assert.deepEqual(data.meta, { contactCount: 33, generatedAt: "2026-10-01T03:00:00.000Z", kind: "snapshot" });
  // 快照 stale 不在概览提示（报告卡与「新增 M 人未纳入」在机会标签）。
  assert.doesNotMatch(JSON.stringify(data), /stale|newContactCount/);
});

test("SC-W0052-01: sentences follow the tabs' evidence rule — a diagnosis or gap whose evidence no longer resolves is not shown", () => {
  const data = buildNetworkOverviewData(parts({ names: new Map([["rec:c1", { contactId: "c1", name: "王敏" }]]) }), ANALYSIS_35);
  assert.equal(data.cards[0]!.sentence?.zh, "人脉集中在科技行业，制造业还很少。");
  assert.equal(data.cards[1]!.sentence, null, "gap evidence rec:c2 is gone → no gap sentence");
  const failedNames = buildNetworkOverviewData(parts({ names: null }), ANALYSIS_35);
  assert.equal(failedNames.cards[0]!.sentence, null);
  assert.equal(failedNames.cards[1]!.sentence, null);
  assert.equal(failedNames.cards[0]!.n, 35, "numbers stay");
});

test("SC-W0052-01: no snapshot → 4 cards have only titles and numbers (no sentence, no placeholder) and meta uses the full count", () => {
  const data = buildNetworkOverviewData(parts({ snapshot: SNAPSHOT_NONE }), ANALYSIS_35);
  assert.deepEqual(data.cards.map((card) => card.sentence), [null, null, null, null]);
  assert.deepEqual(data.cards.map((card) => card.n), [35, 3, 3, 5]);
  assert.deepEqual(data.meta, { kind: "total", total: 35 });
});

test("SC-W0052-01: snapshot read failure → numbers as usual, no sentences, meta says AI analysis is unavailable", () => {
  const data = buildNetworkOverviewData(parts({ snapshot: SNAPSHOT_FAILED }), ANALYSIS_35);
  assert.deepEqual(data.cards.map((card) => card.sentence), [null, null, null, null]);
  assert.deepEqual(data.cards.map((card) => card.n), [35, 3, 3, 5]);
  assert.deepEqual(data.meta, { kind: "ai_unavailable" });
});

test("SC-W0052-01: no plan → card ② becomes the 「生成计划」 entry, card ③ counts only pending matches", () => {
  const data = buildNetworkOverviewData(parts({ pendingMatches: 0, plan: null }), ANALYSIS_35);
  const [, gap, week] = data.cards;
  assert.deepEqual([gap!.cta, gap!.n, gap!.value, gap!.href, gap!.sentence], [true, null, { en: "Create a plan →", zh: "生成计划 →" }, "/app/tasks?tab=plan", null]);
  assert.deepEqual([week!.n, week!.value?.zh], [0, "0 项建议动作"]);
  // 计划读取失败：②③ 数字位为「—」，其余卡照常。
  const failed = buildNetworkOverviewData(parts({ pendingMatches: null, plan: undefined }), ANALYSIS_35);
  assert.deepEqual(failed.cards.map((card) => card.value?.zh ?? null), ["35 位联系人", null, null, "5 位待唤醒"]);
  assert.equal(failed.cards[1]!.cta, false);
});

test("SC-W0052-01 (R-6, R-12): the overview reads plans only via getCurrent + pure projection and reads only the agreed snapshot fields", () => {
  const files = [
    "app/(app)/app/contacts/analysis/overview-cockpit-loader.ts",
    "app/(app)/app/contacts/network-0918/network-overview-cockpit-model.ts",
    "app/(app)/app/contacts/network-0918/network-overview.tsx",
    "app/(app)/app/contacts/dashboard/page.tsx",
  ].map((file) => [file, readFileSync(join(projectRoot, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")] as const);
  for (const [file, source] of files) {
    assert.doesNotMatch(source, /getCurrentView|enterCurrentPhase/, `${file} must not reach the plan read path that writes at phase boundaries`);
    assert.doesNotMatch(source, /language\.(zh|en)\b|\.stale\b|generateSnapshotNow|recompute/, `${file} must only read state/blocks/generatedAt/contactCount/freshness.stale`);
  }
  const loader = files[0]![1];
  assert.match(loader, /readCurrentPlanForSnapshot/);
  assert.match(loader, /toOpportunityPlanView/);
  assert.match(loader, /enqueue: false/);
});

test("SC-W0052-02 main: 35-person fixture (the list returns 30) → tier bar 12/10/8/5 summing to 35, each segment links to its tier list", () => {
  const data = buildNetworkOverviewData(parts(), ANALYSIS_35);
  assert.deepEqual(data.tiers.map((tier) => [tier.id, tier.count, tier.href]), [
    ["new", 12, "/app/contacts/analysis/tier/new"],
    ["active", 10, "/app/contacts/analysis/tier/active"],
    ["core", 8, "/app/contacts/analysis/tier/core"],
    ["dormant", 5, "/app/contacts/analysis/tier/dormant"],
  ]);
  assert.equal(data.tiers.reduce((sum, tier) => sum + (tier.count ?? 0), 0), 35);
  assert.deepEqual(buildNetworkOverviewData(parts(), { state: "pending" }).tiers.map((tier) => tier.count), [null, null, null, null]);
});

test("SC-W0052-02 (review P2): a missing or partial tier cache is not shown as zeros — known tiers plus 「N 人待统计」, dashes when none is known", () => {
  const withHealth = analysisWithHealth;
  const empty = buildNetworkOverviewData(parts(), withHealth([]));
  assert.deepEqual(empty.tiers.map((tier) => tier.count), [null, null, null, null]);
  assert.equal(empty.tierPending, 35);
  assert.equal(empty.cards[3]!.n, null, "dormant card shows a dash, not 0");
  const partial = buildNetworkOverviewData(parts(), withHealth([{ count: 8, id: "core" }, { count: 2, id: "new" }]));
  assert.deepEqual(partial.tiers.map((tier) => [tier.id, tier.count]), [["new", 2], ["active", 0], ["core", 8], ["dormant", 0]]);
  assert.equal(partial.tierPending, 25);
  assert.equal(partial.total, 35, "the centre stays the full count");
  assert.equal(buildNetworkOverviewData(parts(), ANALYSIS_35).tierPending, null, "complete cache → no note");
  const none = buildNetworkOverviewData(parts(), { ...analysisWithHealth([]), metrics: { ...(ANALYSIS_35 as Extract<typeof ANALYSIS_35, { state: "ready" }>).metrics, contacts: 0 } } as typeof ANALYSIS_35);
  assert.deepEqual([none.tiers.map((tier) => tier.count), none.tierPending], [[0, 0, 0, 0], null], "an account with no contacts really has 0 in every tier");
});

test("SC-W0052-02: highlights = the two core contacts with the latest signal (core first, then active), with their tier", () => {
  const data = buildNetworkOverviewData(parts(), ANALYSIS_35);
  assert.deepEqual(data.highlights?.map((row) => [row.name, row.tier, row.href, row.lastSignalAt]), [
    ["核心甲", "core", "/app/contacts/core-new", "2026-09-29T00:00:00.000Z"],
    ["核心乙", "core", "/app/contacts/core-old", "2026-08-01T00:00:00.000Z"],
  ]);
  // 只有 1 位核心时补有往来；姓名解析不到的人略过（少显示，不另读）。
  const fill = buildNetworkOverviewData(parts({ board: { active: [{ contactId: "rec:active-1", lastSignalAt: null }], core: [{ contactId: "rec:gone", lastSignalAt: null }, { contactId: "rec:core-new", lastSignalAt: null }] } }), ANALYSIS_35);
  assert.deepEqual(fill.highlights?.map((row) => [row.name, row.tier]), [["核心甲", "core"], ["往来丙", "active"]]);
  assert.equal(buildNetworkOverviewData(parts({ board: null }), ANALYSIS_35).highlights, null);
});

test("SC-W0052-03 main: 6 people / 9 records → the latest 5 in time order with name link, source, summary and time", () => {
  const data = buildNetworkOverviewData(parts(), ANALYSIS_35);
  assert.equal(data.activity.state, "ready");
  if (data.activity.state !== "ready") return;
  assert.deepEqual(data.activity.rows.map((row) => [row.id, row.name, row.href, row.source, row.summary.zh, row.summary.en]), [
    ["memo:1", "王敏", "/app/contacts/c1", "memo", "聊了试用，下周再约", "聊了试用，下周再约"],
    ["note:1", "佐々木 健", "/app/contacts/c2", "note", "Notes in English", "Notes in English"],
    ["encounter:1", "Lin Zhi", "/app/contacts/c3", "encounter", "在活动上见面", "Met at an event"],
    ["plan:1", "陈思", "/app/contacts/c4", "plan", "计划：确认已建立联系", "Plan: connection confirmed"],
    ["schedule:1", "Kato Ryo", "/app/contacts/c5", "schedule", "会面", "Meeting"],
  ]);
  assert.equal(data.activity.rows[0]!.occurredAt, "2026-09-30T09:00:00.000Z");
});

test("SC-W0052-03 (review P2): summaries come from the closed template set per source + structured detail; the item title is never rendered", () => {
  assert.deepEqual(activitySummary({ excerpt: "原文", source: "memo" }), { en: "原文", zh: "原文" });
  assert.deepEqual(activitySummary({ source: "memo" }), { en: "Wrote a memo", zh: "写了 memo" });
  assert.deepEqual(activitySummary({ excerpt: "（会场备注）", source: "capture", detail: { captureMethod: "qr" } }), { en: "Connected by QR code", zh: "扫码交换，建立联系" });
  assert.deepEqual(activitySummary({ source: "encounter" }), { en: "Logged a meeting", zh: "记录了一次见面" });
  assert.deepEqual(activitySummary({ source: "plan", detail: { planEvent: "something_new" } }), { en: "Plan: updated", zh: "计划：更新" });
  assert.deepEqual(activitySummary({ source: "schedule", detail: { scheduleKind: "event" } }), { en: "Attended an event", zh: "参加了活动" });
  assert.deepEqual(activitySummary({ source: "followup_done" }), { en: "Completed a follow-up", zh: "完成了一次跟进" });
  // 白名单：每条的后端 title 都是英文调试句（夹具），组装结果里 0 命中。
  const data = buildNetworkOverviewData(parts(), ANALYSIS_35);
  const json = JSON.stringify(data);
  assert.doesNotMatch(json, /DEBUG|backend title|confirmed by|example\.invalid/);
  assert.doesNotMatch(json, /live relationship database|Live contact source|Live task source/);
});

test("SC-W0052-03: empty timeline → ready with no rows; read failure (or every source down) → unavailable for this block only", () => {
  assert.deepEqual(buildNetworkOverviewData(parts({ timeline: { items: [], unavailable: false } }), ANALYSIS_35).activity, { rows: [], state: "ready" });
  // review P2：部分来源失败（还有条目）也按失败降级，不把残缺列表当完整结果。
  for (const timeline of [null, { items: [], unavailable: true }, { items: TIMELINE_9, unavailable: true }]) {
    const data = buildNetworkOverviewData(parts({ timeline }), ANALYSIS_35);
    assert.deepEqual(data.activity, { state: "unavailable" });
    assert.deepEqual(data.cards.map((card) => card.n), [35, 3, 3, 5], "cockpit unaffected");
    assert.equal(data.tiers[0]!.count, 12, "tiers unaffected");
  }
});

test("SC-W0052-04: donut centre and 「按来源」 are full counts (35), never the 30-row list", () => {
  const data = buildNetworkOverviewData(parts(), ANALYSIS_35);
  assert.equal(data.total, 35);
  assert.deepEqual(data.sources, { contact: 5, event: 8, other: 7, referral: 5, scan: 10 });
  assert.equal(Object.values(data.sources!).reduce((a, b) => a + b, 0), 35);
  // 分面外的来源类型（chat_summary 等）按全量差额并入「其他」。
  assert.deepEqual(overviewSourceCounts({ business_card_ocr: 2 }, 5), { contact: 0, event: 0, other: 3, referral: 0, scan: 2 });
  assert.equal(buildNetworkOverviewData(parts({ sourceFacets: null }), ANALYSIS_35).sources, null);
});

test("one name read covers timeline people and highlight candidates first, then the shown diagnosis and first valid gap evidence", () => {
  assert.deepEqual(overviewNameIds({ board: parts().board, plan: PLAN, snapshot: SNAPSHOT_READY, timeline: { items: TIMELINE_9.slice(0, 2), unavailable: false } }), [
    "rec:c6", "rec:c1", "rec:core-new", "rec:core-old", "rec:active-1", "rec:c2",
  ]);
  // 快照没有、计划没有：只解析动态与重点联系人；缺口块对应的需求不在当前计划里不解析。
  assert.deepEqual(overviewNameIds({ board: null, plan: null, snapshot: SNAPSHOT_NONE, timeline: null }), []);
});

test("review P2: evidence for 40 people cannot crowd out names — all 5 activity rows keep a name link", () => {
  const many = Array.from({ length: 40 }, (_, index) => `rec:e${index}`);
  const snapshot = { ...SNAPSHOT_READY, blocks: SNAPSHOT_READY.blocks.map((block) => (block.kind === "diagnosis" || block.kind === "gap" ? { ...block, evidence: { contactIds: many, recordIds: [] } } : block)) };
  const timeline = { items: TIMELINE_9, unavailable: false };
  const ids = overviewNameIds({ board: parts().board, plan: PLAN, snapshot, timeline: { items: [...TIMELINE_9].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, 5), unavailable: false } });
  assert.equal(ids.length, 30);
  // 读取器只返回请求的 id：按 ids 过滤 NAMES 与 40 位依据的姓名。
  const names = new Map([...NAMES, ...many.map((id) => [id, { contactId: id.slice(4), name: id }] as const)].filter(([id]) => ids.includes(id)));
  const data = buildNetworkOverviewData(parts({ names, snapshot, timeline }), ANALYSIS_35);
  assert.equal(data.activity.state, "ready");
  if (data.activity.state !== "ready") return;
  assert.equal(data.activity.rows.length, 5);
  assert.ok(data.activity.rows.every((row) => row.name && row.href), JSON.stringify(data.activity.rows));
  assert.equal(data.highlights?.length, 2);
});
