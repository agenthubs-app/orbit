/**
 * W0052（RN-10）：人脉概览的纯函数模型——驾驶舱 4 卡、关系档位条与重点联系人、最近动态、「按来源」全量计数。
 * 服务端加载器（`analysis/overview-cockpit-loader.ts`）读好各部分后交给 `buildNetworkOverviewData`，结果作为
 * `NetworkOverview` 的 `overview` prop（可序列化）；示例期由 `_demo/demo-network.ts` 直接给同一形态。
 *
 * 规则（易错边界，见 PLANNER）：
 * - 任何人数都不来自名单（名单默认只有一页 30 位）：总数 = 分析的 `metrics.contacts`，档位 = 分析的全量档位分布，
 *   来源 = 联系人列表 SQL 的全量分面（`facet_sources` → `availableFilters.sources`）；
 * - 句子只来自快照 `blocks`（已是请求语言）或由数字拼出的双语模板；没有快照就没有句子（不放占位句）；
 *   诊断句与缺口句和结构／机会标签同一规则（依据解析不到本人联系人就不显示，`structureSnapshotView`／`gapNoteFor`）；
 * - 数字与分析页同一函数：覆盖「已有 a／共 b」= W0050 `planNeedCoverage` 的 Σmin(a,t)／Σt；本周建议动作 = 计划本周行动
 *   （`toOpportunityPlanView`）+ 待确认匹配人数（`listPending` 的 contactCount）；
 * - 只读快照视图的 `state／blocks／generatedAt／contactCount／freshness`（R-12）。
 * 不 import React，不读时钟。
 */
import type { NetworkSnapshotView } from "../../../../../features/network-analysis/contract";
import type { EvidenceContactName } from "../../../../../features/network-analysis/evidence-contacts";
import type { OpportunityPlanView } from "../../../../../features/plans/coverage";
import type { RelationshipTimelineItem, RelationshipTimelineSource } from "../../../../../shared/contract/relationship-timeline";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { timelineSummaryCopy, type NetworkCopy } from "../analysis/network-copy";
import { gapNoteFor } from "../analysis/opportunities-view-model";
import { PLAN_HREF } from "../analysis/opportunities-report-card";
import { structureSnapshotView } from "../analysis/structure-tab-model";
import { NETWORK_TIER_GROUPS, type NetworkSource, type NetworkTierGroup } from "./network-model";

export const OVERVIEW_ACTIVITY_LIMIT = 5;
export const OVERVIEW_HIGHLIGHT_LIMIT = 2;

export const STRUCTURE_TAB_HREF = "/app/contacts/dashboard?tab=structure";
export const OPPORTUNITIES_TAB_HREF = "/app/contacts/dashboard?tab=opportunities";

/** 档位段与重点联系人档位标的链接：W0049 的按档位名单（与结构标签「关系健康」同一地址）。 */
export function tierHref(tier: NetworkTierGroup): string {
  return `/app/contacts/analysis/tier/${tier}`;
}

export function contactHref(contactId: string): string {
  return `/app/contacts/${encodeURIComponent(contactId)}`;
}

/** 英文单复数（中文不变）。 */
export function countCopy(n: number, zhUnit: string, enOne: string, enMany: string): NetworkCopy {
  return { zh: `${n} ${zhUnit}`, en: `${n} ${n === 1 ? enOne : enMany}` };
}

// ---------------------------------------------------------------------------
// 视图形态（client 组件只 import 类型）
// ---------------------------------------------------------------------------

export type OverviewCardId = "structure" | "gap" | "week" | "dormant";

export interface OverviewCockpitCard {
  id: OverviewCardId;
  icon: string;
  title: NetworkCopy;
  /** 规则数字；null = 读不到（显示「—」）。「生成计划」入口时为 null。 */
  n: number | null;
  /** 数字位的显示文字（含单位）；null = 显示「—」。 */
  value: NetworkCopy | null;
  /** 没有计划时②卡的数字位换成「生成计划」入口。 */
  cta: boolean;
  /** 快照句子（请求语言）或数字模板；null = 不渲染句子容器。 */
  sentence: NetworkCopy | null;
  href: string;
}

export type OverviewMeta =
  | { kind: "snapshot"; generatedAt: string; contactCount: number }
  | { kind: "total"; total: number }
  | { kind: "ai_unavailable" }
  | { kind: "pending" }
  | { kind: "error" };

export interface OverviewTierSegment {
  id: NetworkTierGroup;
  /** null = 分析读不到（显示「—」）。 */
  count: number | null;
  href: string;
}

export interface OverviewHighlight {
  contactId: string;
  name: string;
  href: string;
  tier: "core" | "active";
  lastSignalAt: string | null;
}

export interface OverviewActivityRow {
  id: string;
  /** 联系人姓名（用户数据）；解析不到为 null（只显示「—」、不挂链接）。 */
  name: string | null;
  href: string | null;
  source: RelationshipTimelineSource;
  /** memo／笔记 = 用户原文（zh、en 相同）；系统类来源 = 结构化字段的双语模板。 */
  summary: NetworkCopy;
  occurredAt: string;
  occurredAtPrecision: RelationshipTimelineItem["occurredAtPrecision"];
}

export type OverviewActivity = { state: "ready"; rows: OverviewActivityRow[] } | { state: "unavailable" };

export interface NetworkOverviewData {
  meta: OverviewMeta;
  cards: OverviewCockpitCard[];
  /** 全量联系人数（环形图中心、结构卡）；null = 分析读不到。 */
  total: number | null;
  tiers: OverviewTierSegment[];
  /**
   * 档位缓存还没覆盖到的人数（全量总数 − 四档之和，> 0 才有值；W0052 review P2）。概览只读档位缓存、不刷新，
   * 缓存为空或只覆盖部分联系人时，不把没统计到的人算成 0：已知档位照常显示并标明「N 人待统计」，一档都没有时各段显示「—」。
   */
  tierPending: number | null;
  /** null = 档位看板读不到（不显示重点联系人区）。 */
  highlights: OverviewHighlight[] | null;
  activity: OverviewActivity;
  /** 「按来源」全量计数；null = 读不到。 */
  sources: Record<NetworkSource, number> | null;
}

// ---------------------------------------------------------------------------
// 输入
// ---------------------------------------------------------------------------

export interface OverviewTierBoardColumns {
  core: readonly { contactId: string; lastSignalAt: string | null }[];
  active: readonly { contactId: string; lastSignalAt: string | null }[];
}

export interface OverviewCockpitParts {
  /** 快照视图；读失败或服务不可用 = `state: "unavailable"`。 */
  snapshot: Pick<NetworkSnapshotView, "state" | "blocks" | "generatedAt" | "contactCount" | "freshness">;
  /** undefined = 计划读取失败；null = 没有生效计划。 */
  plan: OpportunityPlanView | null | undefined;
  /** 有待确认候选的联系人数；null = 读取失败（无计划或无需求时为 0，不读）。 */
  pendingMatches: number | null;
  /** null = 时间线读取失败。 */
  timeline: { items: readonly RelationshipTimelineItem[]; unavailable: boolean } | null;
  /** null = 档位看板读取失败。 */
  board: OverviewTierBoardColumns | null;
  /** 记录 id → 姓名与详情 id（依据、动态、重点联系人共用一次读取）；null = 读取失败。 */
  names: ReadonlyMap<string, EvidenceContactName> | null;
  /** 「按来源」全量分面（`CONTACT_SOURCE_FILTERS` 值 → 人数）；null = 读不到。 */
  sourceFacets: Readonly<Record<string, number>> | null;
}

/** 联系人列表来源分面（8 个过滤值）→ 概览的 5 个来源组；其余（手动、扫码、邮件、日程信号……）并入「其他」。 */
const FACET_TO_SOURCE: Readonly<Record<string, NetworkSource>> = {
  business_card_ocr: "scan",
  event_import: "event",
  external_contacts: "contact",
  referral: "referral",
};

export function overviewSourceCounts(facets: Readonly<Record<string, number>>, total: number | null): Record<NetworkSource, number> {
  const out: Record<NetworkSource, number> = { contact: 0, event: 0, other: 0, referral: 0, scan: 0 };
  let sum = 0;
  for (const [value, count] of Object.entries(facets)) {
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    out[FACET_TO_SOURCE[value] ?? "other"] += n;
    sum += n;
  }
  // 分面只统计 8 个过滤值；不在其中的来源类型（chat_summary 等）按全量差额并入「其他」，各段之和 = 全量。
  if (total !== null && total > sum) out.other += total - sum;
  return out;
}

/** 依据、缺口、动态、重点联系人要解析姓名的记录 id（去重；诊断与缺口在前）。 */
/**
 * 一次姓名读取要解析的记录 id（去重、有上限；W0052 review P2）。先给一定会显示的最近动态（≤5 人）与重点联系人候选
 * （≤4 人）预留，再放实际展示的诊断依据与「按计划需求顺序第一条有据的 gap」依据——依据再多也不会挤掉动态的姓名。
 */
export function overviewNameIds(input: Pick<OverviewCockpitParts, "snapshot" | "plan" | "timeline" | "board">, limit = 30): string[] {
  const ids = new Set<string>();
  const add = (id: string | undefined) => { if (id && ids.size < limit) ids.add(id); };
  for (const item of (input.timeline?.items ?? []).slice(0, OVERVIEW_ACTIVITY_LIMIT)) add(item.contactId);
  for (const row of [...(input.board?.core ?? []).slice(0, OVERVIEW_HIGHLIGHT_LIMIT), ...(input.board?.active ?? []).slice(0, OVERVIEW_HIGHLIGHT_LIMIT)]) add(row.contactId);
  if (input.snapshot.state === "ready") {
    const diagnosis = input.snapshot.blocks.find((block) => block.kind === "diagnosis");
    for (const id of diagnosis?.evidence.contactIds ?? []) add(id);
    for (const need of input.plan?.needs ?? []) {
      const gap = input.snapshot.blocks.find((block) => block.kind === "gap" && block.needId === need.needId && block.evidence.contactIds.length > 0);
      if (!gap) continue;
      for (const id of gap.evidence.contactIds) add(id);
      break;
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// 组装
// ---------------------------------------------------------------------------

const same = (text: string): NetworkCopy => ({ en: text, zh: text });

function cards(parts: OverviewCockpitParts, total: number | null, dormant: number | null): OverviewCockpitCard[] {
  const snapshotReady = parts.snapshot.state === "ready";
  const plan = parts.plan;

  // ① 结构：诊断句（与结构标签同一规则：依据解析不到就不显示）+ 全量人数。
  const structure = snapshotReady ? structureSnapshotView(parts.snapshot, parts.names) : null;
  const diagnosis = structure?.state === "ready" ? structure.diagnosis?.text ?? null : null;

  // ② 目标缺口：缺口叙述（按计划需求顺序取第一条有据的 gap，与机会标签同一规则）+ 覆盖「已有 a／共 b」。
  let gapSentence: string | null = null;
  if (snapshotReady && plan) {
    for (const need of plan.needs) {
      const note = gapNoteFor(need.needId, parts.snapshot.blocks, parts.names);
      if (note) { gapSentence = note.text; break; }
    }
  }
  const covered = plan ? plan.needs.reduce((sum, need) => sum + Math.min(need.have, need.target), 0) : 0;
  const target = plan ? plan.needs.reduce((sum, need) => sum + need.target, 0) : 0;
  const gapValue: NetworkCopy | null = plan === undefined ? null
    : plan === null ? { zh: "生成计划 →", en: "Create a plan →" }
    : target === 0 ? { zh: "计划里还没有人脉需求", en: "No network needs in the plan yet" }
    : { zh: `已有 ${covered}／共 ${target}`, en: `${covered} of ${target} covered` };

  // ③ 本周行动：计划引用句 + 本周建议动作数（计划本周行动 + 待确认匹配；无计划时只含待确认匹配）。
  const planBlock = snapshotReady ? parts.snapshot.blocks.find((block) => block.kind === "plan")?.text ?? null : null;
  const week = plan === undefined || parts.pendingMatches === null ? null : (plan?.weekActions.length ?? 0) + parts.pendingMatches;

  // ④ 待唤醒：全量 dormant 人数 + 数字模板句（只在有快照时渲染句子，无快照时 4 卡只有标题与数字）。
  const dormantSentence: NetworkCopy | null = snapshotReady && dormant !== null && dormant > 0
    ? { zh: `${dormant} 位曾有往来、60 天没有新记录`, en: `${dormant} ${dormant === 1 ? "contact you were in touch with has" : "contacts you were in touch with have"} had no new records for 60 days` }
    : null;

  return [
    {
      cta: false, href: STRUCTURE_TAB_HREF, icon: "◎", id: "structure", n: total,
      sentence: diagnosis ? same(diagnosis) : null,
      title: { zh: "人脉结构", en: "Network structure" },
      value: total === null ? null : countCopy(total, "位联系人", "contact", "contacts"),
    },
    {
      cta: plan === null, href: plan === null ? PLAN_HREF : OPPORTUNITIES_TAB_HREF, icon: "➶", id: "gap",
      n: plan ? covered : null,
      sentence: gapSentence ? same(gapSentence) : null,
      title: { zh: "目标缺口", en: "Goal gaps" },
      value: gapValue,
    },
    {
      cta: false, href: PLAN_HREF, icon: "▦", id: "week", n: week,
      sentence: planBlock ? same(planBlock) : null,
      title: { zh: "本周行动", en: "This week" },
      value: week === null ? null : countCopy(week, "项建议动作", "suggested action", "suggested actions"),
    },
    {
      cta: false, href: OPPORTUNITIES_TAB_HREF, icon: "◷", id: "dormant", n: dormant,
      sentence: dormantSentence,
      title: { zh: "待唤醒", en: "To re-engage" },
      value: dormant === null ? null : countCopy(dormant, "位待唤醒", "to re-engage", "to re-engage"),
    },
  ];
}

function meta(parts: OverviewCockpitParts, analysis: ContactsAnalysisView, total: number | null): OverviewMeta {
  if (parts.snapshot.state === "ready" && parts.snapshot.generatedAt) {
    return { contactCount: parts.snapshot.contactCount, generatedAt: parts.snapshot.generatedAt, kind: "snapshot" };
  }
  if (parts.snapshot.state === "unavailable") return { kind: "ai_unavailable" };
  if (total !== null) return { kind: "total", total };
  return analysis.state === "pending" ? { kind: "pending" } : { kind: "error" };
}

/** 动态摘要：用户写的 memo／笔记原文照出；其余来源用结构化字段的双语模板（时间线构建器给的 title），不渲染后端句子。 */
/** 动态摘要：按来源走 `network-copy.ts` 的封闭模板（`timelineSummaryCopy`），不读条目里拼好的 `title`。 */
export function activitySummary(item: Pick<RelationshipTimelineItem, "source" | "excerpt" | "eventId" | "detail">): NetworkCopy {
  return timelineSummaryCopy(item);
}

function activity(parts: OverviewCockpitParts): OverviewActivity {
  // 任一来源读失败（列表不完整）也按失败降级，不把残缺列表当完整结果（W0052 review P2）。
  if (!parts.timeline || parts.timeline.unavailable) return { state: "unavailable" };
  const rows = [...parts.timeline.items]
    .sort((left, right) => (left.occurredAt === right.occurredAt ? (left.id < right.id ? -1 : 1) : left.occurredAt < right.occurredAt ? 1 : -1))
    .slice(0, OVERVIEW_ACTIVITY_LIMIT)
    .map((item) => {
      const person = parts.names?.get(item.contactId);
      return {
        href: person ? contactHref(person.contactId) : null,
        id: item.id,
        name: person?.name ?? null,
        occurredAt: item.occurredAt,
        occurredAtPrecision: item.occurredAtPrecision,
        source: item.source,
        summary: activitySummary(item),
      };
    });
  return { rows, state: "ready" };
}

function highlights(parts: OverviewCockpitParts): OverviewHighlight[] | null {
  if (!parts.board) return null;
  // 核心优先、其次有往来；各列已按最近信号倒序（W0047 看板口径）。姓名解析不到的人略过（少显示，不另读）。
  const ordered = [
    ...parts.board.core.map((row) => ({ ...row, tier: "core" as const })),
    ...parts.board.active.map((row) => ({ ...row, tier: "active" as const })),
  ];
  const out: OverviewHighlight[] = [];
  for (const row of ordered) {
    const person = parts.names?.get(row.contactId);
    if (!person) continue;
    out.push({ contactId: person.contactId, href: contactHref(person.contactId), lastSignalAt: row.lastSignalAt, name: person.name, tier: row.tier });
    if (out.length >= OVERVIEW_HIGHLIGHT_LIMIT) break;
  }
  return out;
}

export function buildNetworkOverviewData(parts: OverviewCockpitParts, analysis: ContactsAnalysisView): NetworkOverviewData {
  const ready = analysis.state === "ready";
  const total = ready ? analysis.metrics.contacts : null;
  const structure = ready ? analysis.structure : null;
  const health = structure && (structure.state === "ready" || structure.state === "empty") ? structure.data.health : null;
  const known = health ? health.reduce((sum, row) => sum + row.count, 0) : 0;
  // 一档都没统计到（缓存为空）而账号其实有联系人时各段显示「—」，不显示成 0；没有联系人的账号如实是 0。
  const tierCount = (id: NetworkTierGroup) => (health && (known > 0 || total === 0) ? health.find((row) => row.id === id)?.count ?? 0 : null);
  const tierPending = total !== null && health && total > known ? total - known : null;
  return {
    activity: activity(parts),
    cards: cards(parts, total, tierCount("dormant")),
    highlights: highlights(parts),
    meta: meta(parts, analysis, total),
    sources: parts.sourceFacets ? overviewSourceCounts(parts.sourceFacets, total) : null,
    tierPending,
    tiers: NETWORK_TIER_GROUPS.map((id) => ({ count: tierCount(id), href: tierHref(id), id })),
    total,
  };
}
