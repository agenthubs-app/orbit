/**
 * W0049「结构」标签的纯函数模型与同源计算（不连数据库）。
 *
 * - SC-02：35 位联系人夹具（名单只返回 30）走 shared/compute 图路径 → 移动端 schema → 视图模型 → 结构标签模型：
 *   四个维度人数之和都 = 35；职级 6 档 + 空值派生 4 组；行业一级 + 二级（无二级值归「未细分」）；
 *   每个维度任选分组，名单下钻人数 = 图上人数；新键经 schema 解析不丢失。
 * - SC-03：高亮只来自计划里未满足（open／linked）人脉需求的结构化行业条件；无计划／读取失败无高亮。
 * - SC-04：关系健康四档与较 30 天前的变化；30 天前确无联系人显示「数据不足」，不显示 0；
 *   30 天前人数来自完整去重时间线（单人 >12 条信号，与全量回放一致）。
 * - SC-01：快照块 → 诊断／洞察，依据只留本人范围内解析到的联系人；源码不读 language.zh/en、顶层 stale、getCurrentView。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { loadContactsStructureDetail } from "../../app/(app)/app/contacts/analysis/contacts-structure-route-service";
import {
  evidenceContactIds,
  healthTiles,
  planNeedHighlights,
  STRUCTURE_TAB_DIMENSIONS,
  structureDimensionView,
  structureSnapshotView,
  tierChangeLabel,
} from "../../app/(app)/app/contacts/analysis/structure-tab-model";
import { computeActorRelationshipStrengths } from "../../features/relationship-strength/read-model";
import { computeRelationshipTierCountsAt } from "../../features/relationship-strength/compute";
import { mobileContactsDashboardPayloadSchema } from "../../shared/api-schema/mobile-contacts-dashboard";
import type { RelationshipTimelineItem } from "../../shared/contract/relationship-timeline";
import { analysisView, evidenceNames, NOW, snapshotFixture } from "../support/structure-tab-fixture";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function structureOf(view: ContactsAnalysisView) {
  assert.equal(view.state, "ready");
  if (view.state !== "ready") throw new Error("not ready");
  return view.structure;
}

test("SC-02 main: four dimensions over 35 contacts each sum to 35 (not the 30-row list) and every group drills down to the same count", async () => {
  const { service, view } = await analysisView();
  const structure = structureOf(view);
  for (const dimension of STRUCTURE_TAB_DIMENSIONS) {
    const model = structureDimensionView(structure, dimension, null);
    assert.ok(model);
    assert.equal(model.total, 35, `${dimension} total`);
    assert.equal(model.rows.reduce((sum, row) => sum + row.percentage, 0), 100, `${dimension} percentages (denominator 35)`);
    assert.deepEqual(model.rows.map((row) => row.count), [...model.rows.map((row) => row.count)].sort((left, right) => right - left), `${dimension} sorted by count`);
    for (const row of model.rows) {
      const [, , , , dimensionInHref, bucketId] = row.href.split("/");
      const detail = await loadContactsStructureDetail({ actorId: "actor:one", dimension: dimensionInHref!, bucketId: decodeURIComponent(bucketId!), language: "zh", service });
      assert.equal(detail.state, "ready", `${dimension}/${row.id}`);
      if (detail.state !== "ready") continue;
      assert.equal(detail.count, row.count, `${dimension}/${row.id} count`);
      assert.equal(detail.contacts.length, row.count, `${dimension}/${row.id} list`);
      assert.equal(detail.label, row.label, `${dimension}/${row.id} label`);
      for (const child of row.children ?? []) {
        const childDetail = await loadContactsStructureDetail({ actorId: "actor:one", dimension: "industry_secondary", bucketId: child.id, language: "zh", service });
        assert.equal(childDetail.state, "ready");
        if (childDetail.state === "ready") assert.equal(childDetail.contacts.length, child.count, `secondary ${child.id}`);
      }
    }
  }
});

test("SC-02: seniority derives 4 groups from the 6 levels plus empty; industry has a secondary Top list with 「未细分」; region and tier are bilingual", async () => {
  const zh = structureOf((await analysisView("zh")).view);
  const seniority = structureDimensionView(zh, "seniority", null)!;
  // 每档 5 人：director／vp／c_level／founder → 决策层 20，manager 5，individual_contributor 5，空 5。
  assert.deepEqual(seniority.rows.map((row) => [row.id, row.label, row.count, row.missingData]), [
    ["seniority_decision", "决策层", 20, false], ["seniority_manager", "管理层", 5, false], ["seniority_staff", "执行层", 5, false], ["seniority_other", "其他", 5, true],
  ]);
  const industry = structureDimensionView(zh, "industry", null)!;
  assert.deepEqual(industry.rows.map((row) => [row.id, row.count]), [["technology_internet", 15], ["finance_investment", 10], ["unclassified", 10]]);
  assert.deepEqual(industry.rows[0]!.children!.map((child) => [child.label, child.count, child.percentage, child.href]), [
    ["企业软件与 SaaS", 8, 53, "/app/contacts/analysis/industry_secondary/technology_internet.enterprise_software"],
    ["人工智能与数据", 4, 27, "/app/contacts/analysis/industry_secondary/technology_internet.ai_data"],
    ["未细分", 3, 20, "/app/contacts/analysis/industry_secondary/technology_internet.unspecified"],
  ]);
  assert.deepEqual(industry.rows[1]!.children!.map((child) => [child.label, child.count]), [["未细分", 10]]);
  assert.equal(industry.rows[2]!.children, undefined);
  assert.deepEqual(structureDimensionView(zh, "region", null)!.rows.map((row) => [row.label, row.count]), [["日本 · 东京", 12], ["地区待完善", 10], ["日本 · 大阪", 8], ["新加坡", 5]]);
  assert.deepEqual(structureDimensionView(zh, "tier", null)!.rows.map((row) => [row.id, row.label, row.count, row.href]), [
    ["new", "新认识", 15, "/app/contacts/analysis/tier/new"], ["active", "有往来", 10, "/app/contacts/analysis/tier/active"],
    ["core", "核心", 5, "/app/contacts/analysis/tier/core"], ["dormant", "待唤醒", 5, "/app/contacts/analysis/tier/dormant"],
  ]);
  const en = structureOf((await analysisView("en")).view);
  assert.deepEqual(structureDimensionView(en, "region", null)!.rows.map((row) => row.label), ["Japan · Tokyo", "Region missing", "Japan · Osaka", "Singapore"]);
  assert.deepEqual(structureDimensionView(en, "seniority", null)!.rows.map((row) => row.label), ["Decision makers", "Managers", "Individual contributors", "Other"]);
  assert.equal(structureDimensionView(en, "industry", null)!.rows[1]!.children![0]!.label, "Unspecified");
});

test("SC-02: the new keys survive mobileContactsDashboardPayloadSchema (no silent strip)", async () => {
  const { payload } = await analysisView();
  const parsed = mobileContactsDashboardPayloadSchema.safeParse(payload);
  assert.ok(parsed.success);
  const structure = parsed.data.distributions!.structureDistributions;
  assert.equal(structure.seniority?.length, 4);
  assert.equal(structure.region?.length, 4);
  assert.equal(structure.industry[0]!.secondary?.length, 3);
  // 旧四键仍在。
  for (const key of ["industry", "location", "role", "relationship"] as const) assert.ok(Array.isArray(structure[key]));
});

// ---- SC-03 高亮 ----

type PlanItemLike = Parameters<typeof planNeedHighlights>[0] extends infer T ? T extends { items: readonly (infer I)[] } ? I : never : never;
const need = (status: string, primaryIndustryId: string | null, secondaryIndustryId: string | null = null): PlanItemLike => ({
  kind: "network_need", status, criteria: { primaryIndustryId, secondaryIndustryId },
});

test("SC-03: only open/linked network needs' structured industry criteria highlight A (primary) and B1 (secondary); established C does not", async () => {
  const plan = {
    items: [
      need("open", "technology_internet"),
      need("linked", "finance_investment", "finance_investment.banking"),
      need("established", "retail_consumer", "retail_consumer.ecommerce"),
      { kind: "action", status: "in_progress", criteria: null },
      { kind: "network_need", status: "open", criteria: null },
    ],
  };
  const highlights = planNeedHighlights(plan);
  assert.deepEqual(highlights, { primary: ["finance_investment", "technology_internet"], secondary: ["finance_investment.banking"] });
  const zh = structureOf((await analysisView()).view);
  const industry = structureDimensionView(zh, "industry", highlights)!;
  assert.deepEqual(industry.rows.map((row) => [row.id, row.highlighted]), [["technology_internet", true], ["finance_investment", true], ["unclassified", false]]);
  assert.deepEqual(industry.rows[0]!.children!.map((child) => child.highlighted), [false, false, false]);
  // 地区与职级不高亮（当前人脉需求只有行业条件，W49-2 不从文字猜）。
  for (const dimension of ["region", "seniority", "tier"] as const) {
    assert.ok(structureDimensionView(zh, dimension, highlights)!.rows.every((row) => !row.highlighted), dimension);
  }
  // 二级高亮：B1 命中的二级子分组。
  const withSecondary = structureDimensionView(zh, "industry", { primary: [], secondary: ["technology_internet.ai_data"] })!;
  assert.deepEqual(withSecondary.rows[0]!.children!.map((child) => [child.id, child.highlighted]), [
    ["technology_internet.enterprise_software", false], ["technology_internet.ai_data", true], ["technology_internet.unspecified", false],
  ]);
  assert.equal(withSecondary.rows[0]!.highlighted, false);
  // 无计划 → 空高亮；读取失败（null）→ 无高亮，其余照常。
  assert.deepEqual(planNeedHighlights(null), { primary: [], secondary: [] });
  const failed = structureDimensionView(zh, "industry", null)!;
  assert.ok(failed.rows.every((row) => !row.highlighted));
  assert.equal(failed.total, 35);
});

// ---- SC-04 关系健康与 30 天变化 ----

const history = (counts: { new: number; active: number; core: number; dormant: number }, earliestCaptureAt: string | null = "2026-01-01T00:00:00.000Z") => ({
  tierCountsAt30d: { asOf: "2026-09-02T03:00:00.000Z", counts, contactCount: counts.new + counts.active + counts.core + counts.dormant },
  earliestCaptureAt,
});

test("SC-04 main: current 3/2/1/1 vs 30 days ago 2/2/0/0 → +1, no change, +1, +1", () => {
  const health = [{ id: "new" as const, count: 3 }, { id: "active" as const, count: 2 }, { id: "core" as const, count: 1 }, { id: "dormant" as const, count: 1 }];
  const tiles = healthTiles(health, history({ new: 2, active: 2, core: 0, dormant: 0 }));
  assert.deepEqual(tiles.map((tile) => [tile.id, tile.count, tierChangeLabel(tile.change, "zh")]), [
    ["new", 3, "+1"], ["active", 2, "持平"], ["core", 1, "+1"], ["dormant", 1, "+1"],
  ]);
  assert.deepEqual(tiles.map((tile) => tierChangeLabel(tile.change, "en")), ["+1", "No change", "+1", "+1"]);
  // 减少用「−」；没有人的档仍是一行（0），不省略。
  const fewer = healthTiles([{ id: "new", count: 1 }], history({ new: 3, active: 1, core: 0, dormant: 0 }));
  assert.deepEqual(fewer.map((tile) => [tile.id, tile.count, tierChangeLabel(tile.change, "zh")]), [["new", 1, "−2"], ["active", 0, "−1"], ["core", 0, "持平"], ["dormant", 0, "持平"]]);
});

test("SC-04: no contacts 30 days ago → every tier says 「数据不足」/「Not enough data」, never 0 and never omitted; unavailable read model → 「—」", () => {
  const health = [{ id: "new" as const, count: 4 }];
  for (const earliest of ["2026-09-20T00:00:00.000Z", null]) {
    const tiles = healthTiles(health, history({ new: 0, active: 0, core: 0, dormant: 0 }, earliest));
    assert.equal(tiles.length, 4);
    assert.deepEqual(tiles.map((tile) => tierChangeLabel(tile.change, "zh")), ["数据不足", "数据不足", "数据不足", "数据不足"]);
    assert.deepEqual(tiles.map((tile) => tierChangeLabel(tile.change, "en")), Array(4).fill("Not enough data"));
    assert.ok(tiles.every((tile) => !/^[+−]?0$/.test(tierChangeLabel(tile.change, "zh"))));
  }
  assert.deepEqual(healthTiles(health, null).map((tile) => tierChangeLabel(tile.change, "zh")), ["—", "—", "—", "—"]);
});

test("SC-04 R-7: the 30-days-ago counts come from the full deduped timeline (one contact with >12 signals) and the shown change equals a full replay", () => {
  const DAY = 86_400_000;
  const now = new Date(NOW);
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  let seq = 0;
  const item = (contactId: string, source: RelationshipTimelineItem["source"], occurredAt: string, extra: Partial<RelationshipTimelineItem> = {}): RelationshipTimelineItem => {
    seq += 1;
    return { id: `${source}:r${seq}`, source, contactId, occurredAt, occurredAtPrecision: "instant", title: { zh: source, en: source }, ref: { store: "notes", recordId: `r${seq}` }, ...extra };
  };
  const capture = (contactId: string, at: string) => item(contactId, "capture", at, { id: `capture:${contactId}`, ref: { store: "contacts", recordId: contactId }, detail: { captureMethod: "business_card" } });
  // c1：一年前起每 20 天一次完成跟进（18 条 > 12 条缓存信号）；c2：两个月前认识、近期有会面；c3：10 天前才认识（30 天前不计）。
  const c1 = [capture("c1", daysAgo(400)), ...Array.from({ length: 18 }, (_, index) => item("c1", "followup_done", daysAgo(380 - index * 20)))];
  const c2 = [capture("c2", daysAgo(60)), item("c2", "schedule", daysAgo(5), { detail: { scheduleKind: "meeting" } }), item("c2", "memo", daysAgo(3), { detail: { memoEventTypes: ["collaborated"] } })];
  const c3 = [capture("c3", daysAgo(10))];
  const timelines = new Map([["c1", c1], ["c2", c2], ["c3", c3]]);
  const computed = computeActorRelationshipStrengths("actor:w49", { timelines, earliestCaptureAt: daysAgo(400), truncatedSources: [] }, { now, sourceStamp: "stamp" });
  assert.equal(c1.length, 19);
  assert.equal(computed.strengths.find((row) => row.contactId === "c1")!.signals.length, 12, "only 12 signals are cached");
  const replay = computeRelationshipTierCountsAt(timelines, new Date(now.getTime() - 30 * DAY));
  assert.deepEqual(computed.state.tierCountsAt30d, replay, "state row = full replay");
  const current = new Map<string, number>();
  for (const row of computed.strengths) {
    const group = row.dormant ? "dormant" : row.tier;
    current.set(group, (current.get(group) ?? 0) + 1);
  }
  const health = [...current.entries()].map(([id, count]) => ({ id: id as "new" | "active" | "core" | "dormant", count }));
  const tiles = healthTiles(health, { tierCountsAt30d: computed.state.tierCountsAt30d, earliestCaptureAt: computed.state.earliestCaptureAt });
  for (const tile of tiles) {
    assert.deepEqual(tile.change, { kind: "delta", delta: (current.get(tile.id) ?? 0) - replay.counts[tile.id] }, tile.id);
  }
});

// ---- SC-01 快照块 ----

test("SC-01: blocks map to diagnosis + up to 3 insights; evidence keeps only names resolved in the actor's scope, linked to /app/contacts/{id}", () => {
  const view = snapshotFixture();
  assert.deepEqual(evidenceContactIds(view), ["c00", "c15", "c01", "bob:c99", "deleted:c50", "c02", "c03"]);
  const names = evidenceNames([["c00", "王敏"], ["c15", "李雷"], ["c01", "佐藤"], ["c02", "Ana"], ["c03", "Émile"]]);
  const result = structureSnapshotView(view, names);
  assert.equal(result.state, "ready");
  if (result.state !== "ready") return;
  assert.equal(result.diagnosis?.text, "科技行业占比高，金融决策层偏少。");
  assert.equal(result.contactCount, 35);
  assert.deepEqual(result.insights.map((insight) => insight.key), ["insight-1", "insight-2", "insight-3"]);
  assert.deepEqual(result.insights.map((insight) => insight.evidence.map((person) => person.id)), [["c00", "c01"], ["c15"], ["c02", "c03"]]);
  assert.deepEqual(result.insights[0]!.evidence[0], { id: "c00", name: "王敏", href: "/app/contacts/c00" });
  assert.equal(JSON.stringify(result).includes("bob:c99"), false, "another actor's id never reaches the view");
  assert.equal(JSON.stringify(result).includes("deleted:c50"), false, "a deleted contact never reaches the view");
});

test("SC-01: no snapshot / insufficient → none (①④ hidden); read failure → unavailable", () => {
  assert.deepEqual(structureSnapshotView(snapshotFixture("none"), new Map()), { state: "none" });
  assert.deepEqual(structureSnapshotView(snapshotFixture("insufficient"), new Map()), { state: "none" });
  assert.deepEqual(structureSnapshotView(snapshotFixture("unavailable"), new Map()), { state: "unavailable" });
  assert.deepEqual(structureSnapshotView(null, new Map()), { state: "unavailable" });
  assert.deepEqual(evidenceContactIds(snapshotFixture("none")), []);
});

test("SC-01 R-12 / SC-03 R-6 source scan: no language.zh/en or top-level stale reads; plans only via getCurrent()", () => {
  const files = [
    "app/(app)/app/contacts/analysis/structure-tab-model.ts",
    "app/(app)/app/contacts/analysis/structure-tab-loader.ts",
    "app/(app)/app/contacts/network-0918/network-analysis-structure.tsx",
    "app/(app)/app/contacts/dashboard/page.tsx",
    "features/network-analysis/evidence-contacts.ts",
  ];
  for (const file of files) {
    const code = readFileSync(join(PROJECT_ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /language\.(zh|en)\b/, `${file}: language.zh/en`);
    assert.doesNotMatch(code, /(?<!freshness)\.stale\b/, `${file}: top-level stale`);
    assert.doesNotMatch(code, /getCurrentView|enterCurrentPhase/, `${file}: plan write paths`);
  }
  const loader = readFileSync(join(PROJECT_ROOT, "app/(app)/app/contacts/analysis/structure-tab-loader.ts"), "utf8");
  assert.match(loader, /readCurrentPlanForSnapshot/);
  assert.match(readFileSync(join(PROJECT_ROOT, "features/network-analysis/runtime.ts"), "utf8"), /resolution\.service\.getCurrent\(\)/);
});

test("review P2-3: tier percentages shown in the structure tab always add up to 100 (largest remainder), the shared field stays as is", async () => {
  const { view } = await analysisView();
  if (view.state !== "ready" || view.structure.state !== "ready") throw new Error("structure");
  const three = { ...view.structure, data: { ...view.structure.data, dimensions: { ...view.structure.data.dimensions, tier: (["new", "active", "core"] as const).map((id) => ({ id, label: id, count: 1, percentage: 33, missingData: false, href: `/app/contacts/analysis/tier/${id}` })) } } };
  const model = structureDimensionView(three, "tier", null)!;
  assert.deepEqual(model.rows.map((row) => row.percentage), [34, 33, 33]);
  assert.equal(three.data.dimensions.tier.reduce((sum, row) => sum + row.percentage, 0), 99, "the shared rounding is untouched");
});

test("review P2-2: blocks without a visible contact are hidden (recordIds only, every id dropped); a failed name read makes ①④ unavailable", () => {
  const view = snapshotFixture();
  view.blocks = [
    { key: "diagnosis", kind: "diagnosis", text: "只有记录依据", evidence: { contactIds: [], recordIds: ["memo:1"] } },
    { key: "insight-1", kind: "insight", text: "依据都不在本人范围", evidence: { contactIds: ["bob:c99", "deleted:c50"], recordIds: [] } },
    { key: "insight-2", kind: "insight", text: "有据的洞察", evidence: { contactIds: ["c00", "bob:c99"], recordIds: [] } },
  ];
  const names = evidenceNames([["c00", "王敏"]]);
  const result = structureSnapshotView(view, names);
  assert.equal(result.state, "ready");
  if (result.state !== "ready") return;
  assert.equal(result.diagnosis, null);
  assert.deepEqual(result.insights.map((block) => [block.key, block.evidence.map((person) => person.name)]), [["insight-2", ["王敏"]]]);
  // 全部被剔除 → 整块不显示（none），不是空依据的句子。
  assert.deepEqual(structureSnapshotView(view, evidenceNames([])), { state: "none" });
  // 姓名读取失败 → unavailable。
  assert.deepEqual(structureSnapshotView(view, null), { state: "unavailable" });
});
