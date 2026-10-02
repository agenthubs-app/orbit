/**
 * W0052 夹具：35 人账号（名单只返回一页 30 位）的分析、快照（有／无／读失败）、计划、6 人 9 条时间线、姓名与全量来源分面。
 * 模型单测（app-network-overview-cockpit-model.test.ts）与概览组件测试（app-network-overview.test.tsx）共用。
 */
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import type { OverviewCockpitParts } from "../../app/(app)/app/contacts/network-0918/network-overview-cockpit-model";
import type { OpportunityPlanView } from "../../features/plans/coverage";
import type { RelationshipTimelineItem, RelationshipTimelineSource } from "../../shared/contract/relationship-timeline";

export const ANALYSIS_35: ContactsAnalysisView = {
  activity: [{ id: "legacy", label: "Contact added to the live relationship database", occurredAt: "2026-09-30T00:00:00.000Z", source: "Live contact source" }],
  analysis: { state: "unavailable" },
  coverage: { state: "unavailable" },
  generatedAt: "2026-10-02T00:00:00.000Z",
  goal: { state: "unavailable" },
  metrics: { contacts: 35, dormant: 99, highValue: 99, newContacts: 4, pendingFollowups: 99 },
  opportunities: { state: "unavailable" },
  state: "ready",
  structure: {
    data: {
      dimensions: {
        industry: [{ count: 20, href: "", id: "technology_internet", label: "科技与互联网", missingData: false, percentage: 57 }, { count: 15, href: "", id: "unclassified", label: "未分类", missingData: true, percentage: 43 }],
        location: [{ count: 25, href: "", id: "location_tokyo", label: "东京", missingData: false, percentage: 71 }, { count: 10, href: "", id: "location_unknown", label: "地区待完善", missingData: true, percentage: 29 }],
        relationship: [],
        role: [],
      },
      health: [
        { count: 8, id: "core", percentage: 23 },
        { count: 10, id: "active", percentage: 29 },
        { count: 12, id: "new", percentage: 34 },
        { count: 5, id: "dormant", percentage: 14 },
      ],
      summary: "",
    },
    state: "ready",
  },
  summary: "",
};

const FRESH = { job: "none" as const, newContactCount: 0, stale: false };

export const SNAPSHOT_READY: OverviewCockpitParts["snapshot"] = {
  blocks: [
    { evidence: { contactIds: ["rec:c1"], recordIds: [] }, key: "diagnosis-1", kind: "diagnosis", text: "人脉集中在科技行业，制造业还很少。" },
    { evidence: { contactIds: ["rec:c1"], recordIds: [] }, key: "insight-1", kind: "insight", text: "洞察一" },
    { evidence: { contactIds: ["rec:c2"], recordIds: [] }, key: "insight-2", kind: "insight", text: "洞察二" },
    { evidence: { contactIds: ["rec:c2"], recordIds: [] }, key: "gap-1", kind: "gap", needId: "need-a", text: "还缺能引荐制造业采购的人。" },
    { evidence: { contactIds: [], recordIds: ["plan:item-1"] }, key: "plan-1", kind: "plan", text: "本周先约王敏聊试用。" },
  ],
  contactCount: 33,
  freshness: { ...FRESH, newContactCount: 2, stale: true },
  generatedAt: "2026-10-01T03:00:00.000Z",
  state: "ready",
};

export const SNAPSHOT_NONE: OverviewCockpitParts["snapshot"] = { blocks: [], contactCount: 0, freshness: FRESH, generatedAt: null, state: "none" };
export const SNAPSHOT_FAILED: OverviewCockpitParts["snapshot"] = { blocks: [], contactCount: 0, freshness: FRESH, generatedAt: null, state: "unavailable" };

const need = (needId: string, have: number, target: number) => ({ criteria: null, have, linkedContactIds: [], missing: Math.max(0, target - have), needId, phaseKey: "p1", phaseTitle: "一", target, title: needId });
export const PLAN: OpportunityPlanView = {
  eventItems: [], goal: "认识制造业采购负责人", linkedContactIds: [],
  needs: [need("need-a", 1, 3), need("need-b", 4, 2)],
  percent: 60, planId: "plan-1",
  weekActions: [{ id: "a1", title: "约王敏", weeksOverdue: 0 }, { id: "a2", title: "发资料", weeksOverdue: 1 }],
};

/** 6 人 9 条时间线（未排序），覆盖全部 7 种来源。 */
const item = (id: string, source: RelationshipTimelineSource, contactId: string, occurredAt: string, extra: Partial<RelationshipTimelineItem> = {}): RelationshipTimelineItem => ({
  contactId, id, occurredAt, occurredAtPrecision: "instant", ref: { recordId: id, store: "contacts" }, source,
  title: { en: `DEBUG backend title for ${source} confirmed by qa@example.invalid`, zh: `DEBUG backend title for ${source}` }, ...extra,
});
export const TIMELINE_9: RelationshipTimelineItem[] = [
  item("capture:1", "capture", "rec:c6", "2026-09-01T00:00:00.000Z", { detail: { captureMethod: "business_card" } }),
  item("memo:1", "memo", "rec:c1", "2026-09-30T09:00:00.000Z", { excerpt: "聊了试用，下周再约" }),
  item("note:1", "note", "rec:c2", "2026-09-29T09:00:00.000Z", { excerpt: "Notes in English" }),
  item("encounter:1", "encounter", "rec:c3", "2026-09-28T09:00:00.000Z", { eventId: "event:1", excerpt: "（会场备注）" }),
  item("plan:1", "plan", "rec:c4", "2026-09-27T09:00:00.000Z", { detail: { planEvent: "contact_established" } }),
  item("schedule:1", "schedule", "rec:c5", "2026-09-26T09:00:00.000Z", { detail: { scheduleKind: "meeting" } }),
  item("followup_done:1", "followup_done", "rec:c1", "2026-09-25T09:00:00.000Z"),
  item("memo:2", "memo", "rec:c2", "2026-09-24T09:00:00.000Z", { excerpt: "旧 memo" }),
  item("capture:2", "capture", "rec:c5", "2026-08-01T00:00:00.000Z"),
];

export const NAMES = new Map([
  ["rec:c1", { contactId: "c1", name: "王敏" }],
  ["rec:c2", { contactId: "c2", name: "佐々木 健" }],
  ["rec:c3", { contactId: "c3", name: "Lin Zhi" }],
  ["rec:c4", { contactId: "c4", name: "陈思" }],
  ["rec:c5", { contactId: "c5", name: "Kato Ryo" }],
  ["rec:c6", { contactId: "c6", name: "张浩" }],
  ["rec:core-new", { contactId: "core-new", name: "核心甲" }],
  ["rec:core-old", { contactId: "core-old", name: "核心乙" }],
  ["rec:active-1", { contactId: "active-1", name: "往来丙" }],
]);

/** 35 人的全量来源分面（名单只有 30 位，分面仍是全量）。 */
export const FACETS_35 = { business_card_ocr: 10, event_import: 8, external_contacts: 5, manual: 4, qr_scan: 3, referral: 5 };

export function parts(overrides: Partial<OverviewCockpitParts> = {}): OverviewCockpitParts {
  return {
    board: {
      active: [{ contactId: "rec:active-1", lastSignalAt: "2026-09-30T00:00:00.000Z" }],
      core: [{ contactId: "rec:core-new", lastSignalAt: "2026-09-29T00:00:00.000Z" }, { contactId: "rec:core-old", lastSignalAt: "2026-08-01T00:00:00.000Z" }],
    },
    names: NAMES,
    pendingMatches: 1,
    plan: PLAN,
    snapshot: SNAPSHOT_READY,
    sourceFacets: FACETS_35,
    timeline: { items: TIMELINE_9, unavailable: false },
    ...overrides,
  };
}


/** 35 人夹具，只换档位分布（review P2：缓存为空／只覆盖部分联系人）。 */
export function analysisWithHealth(health: Array<{ id: "new" | "active" | "core" | "dormant"; count: number }>): ContactsAnalysisView {
  const base = ANALYSIS_35 as Extract<ContactsAnalysisView, { state: "ready" }>;
  const data = (base.structure as Extract<typeof base.structure, { data: unknown }>).data;
  return { ...base, structure: { data: { ...data, health: health.map((row) => ({ ...row, percentage: 0 })) }, state: health.length ? "ready" : "empty" } };
}
