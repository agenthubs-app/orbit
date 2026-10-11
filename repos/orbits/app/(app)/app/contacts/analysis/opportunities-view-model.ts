/**
 * W0050（RN-08）：「机会」标签的视图类型与纯函数（服务端加载器、机会标签组件与测试共用）。不 import React，不读时钟。
 *
 * 五块与数据来源（单一事实来源、处处有据）：
 * 1. 规则覆盖度 = 计划人脉需求的 `contact_links` 与 `targetCount`（`features/plans/coverage.ts`），快照内容不改变任何数字；
 * 2. 缺口补法 = 每条还缺人的需求下最多 2 场活动（计划点名在前，其余显示真实命中词）+「待确认 N」（同一张候选表）；
 * 3. 本周建议动作 = 计划本周（含拖期）未完成的行动，链到 Task › プラン（R25 起不再带行锚点）；不新生成、不调 AI；
 * 4. 待唤醒 = dormant 且与目标相关的联系人，`why` 由规则拼句（最近一条真实记录 + 与目标的关系），依据 = 那条记录；
 * 5. 报告卡 = W0048a `NetworkSnapshotView`（只读），按钮走 `POST /api/network/snapshot/recompute`（用户主动池）。
 *
 * 文案：network-copy 的双语模板 × 结构化字段；后端句子字段不进 ContactsAnalysisView 的规则不变（W0043）。
 * 快照 gap 块的文字来自共享快照（与结构标签同一来源），只在依据可见时显示。
 */
import type { AnalysisGateView } from "../../../../../features/network-analysis/analysis-threshold";
import type { NetworkSnapshotView, NetworkSnapshotViewBlock } from "../../../../../features/network-analysis/contract";
import type { EvidenceContactName } from "../../../../../features/network-analysis/evidence-contacts";
import type { PublicBookableEvent } from "../../../../../features/events/public-goal-recommendations";
import { matchedTokensForText } from "../../../../../features/events/event-recommendation-tool";
import { buildHomeEventPool } from "../../../../../features/agent/home-event-pool";
import type { OpportunityPlanNeed, OpportunityPlanView } from "../../../../../features/plans/coverage";
import { goalArchetype, isGoalRelatedContact } from "../../../../../features/plans/goal-signals";
import type { PlanMatchCandidateView } from "../../../../../features/plans/matching-service";
import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../../../../shared/domain/industries";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { RelationshipTimelineSource } from "../../../../../shared/contract/relationship-timeline";
import type { ContactInsightState, ContactInsightText } from "../../../../../shared/contract/contact-insight";
import { pickCopy, type NetworkCopy } from "./network-copy";
import { PLAN_HREF } from "./opportunities-report-card";
import type { EvidencePerson } from "./structure-tab-model";

/** W50-6：每条需求最多 2 场活动、确认弹层最多 3 位候选；待唤醒最多 5 人。 */
export const NEED_EVENT_LIMIT = 2;
export const NEED_CANDIDATE_LIMIT = 3;
export const DORMANT_LIMIT = 5;

export interface NeedEventRow {
  eventId: string;
  title: string;
  startsAt: string;
  href: string;
  reason: { kind: "plan" } | { kind: "match"; tokens: string[] };
}

export interface NeedGapNote {
  text: string;
  evidence: EvidencePerson[];
}

export interface NeedCoverageRow {
  needId: string;
  title: string;
  phaseTitle: string | null;
  have: number;
  target: number;
  missing: number;
  /** 该需求的待确认候选数（null = 候选读取失败，不显示入口）。 */
  pendingCount: number | null;
  /** 确认弹层里的候选（≤3 位，同 `PlanMatchSheet` 的形状）。 */
  candidates: PlanMatchCandidateView[];
  events: NeedEventRow[];
  gapNote?: NeedGapNote;
}

export type OpportunityCoverageView =
  | { state: "no_plan" }
  /** 计划读取失败：覆盖区如实「暂时读不到」，其余四块照常。 */
  | { state: "unavailable" }
  /** `percent` 为 null = 计划里还没有人脉需求。 */
  | { state: "ready"; percent: number | null; needs: NeedCoverageRow[] };

export interface OpportunityWeekAction {
  id: string;
  title: string;
  weeksOverdue: number;
  href: string;
}

export interface DormantRow {
  contactId: string;
  name: string;
  /** 规则拼句（当前界面语言）。 */
  why: string;
  /** 那条真实记录（关系时间线 id）与联系人详情链接。 */
  evidence: { recordId: string; href: string };
  draftAvailable: boolean;
  /** W0051（W50-3 后半）：`why` 来自该联系人洞察的下一步（ready 时）；否则为规则拼句。 */
  whySource?: "insight" | "rule";
  /** W0051：联系人记录 id（洞察、强度、计划关联同一 id 域；`contactId` 是详情链接用的领域 id）。 */
  recordId?: string;
}

/** W0051：待唤醒改读洞察时需要的最小字段（视图状态 + 下一步双语）。 */
export interface DormantInsight {
  state: ContactInsightState;
  nextStep: ContactInsightText | null;
}

/**
 * W0051（R-8）：洞察 `ready` 时「为什么现在联系」= 洞察的 `nextStep`（按界面语言）；
 * `none`／`pending`／`failed`／`no_goal` 保留 W0050 规则拼句。纯函数：只换文字，不改顺序与依据。
 */
export function applyDormantInsights(rows: readonly DormantRow[], insights: ReadonlyMap<string, DormantInsight>, language: OrbitLanguage): DormantRow[] {
  return rows.map((row) => {
    const insight = insights.get(row.recordId ?? row.contactId);
    if (insight?.state === "ready" && insight.nextStep) return { ...row, why: pickCopy(insight.nextStep, language), whySource: "insight" };
    return { ...row, whySource: "rule" };
  });
}

export interface OpportunitiesTabView {
  coverage: OpportunityCoverageView;
  weekActions: {
    /** null = 计划读取失败。 */
    planActions: OpportunityWeekAction[] | null;
    /** 有待确认候选的联系人数（null = 读取失败或无计划，不显示入口）。 */
    pendingMatches: number | null;
  };
  /** null = 待唤醒读取失败。 */
  dormant: DormantRow[] | null;
  report: NetworkSnapshotView;
  /** W0054：报告卡位置的替换卡（门槛未达／正在更新／明天更新）；null／缺省 = 照常显示报告卡。 */
  gate?: AnalysisGateView | null;
}

// ---------------------------------------------------------------------------
// 需求 ↔ 活动
// ---------------------------------------------------------------------------

function eventHref(publicCode: string): string {
  return `/app/events/${encodeURIComponent(publicCode)}`;
}

/** 需求的匹配查询：标题 + 职位关键词 + 行业中英名 + 描述（只来自计划条目的结构化字段与用户/计划文字）。 */
export function needEventQuery(need: Pick<OpportunityPlanNeed, "title" | "criteria">): string {
  const criteria = need.criteria;
  const parts = [need.title, ...(criteria?.titleKeywords ?? [])];
  if (criteria?.primaryIndustryId && isIndustryIdCode(criteria.primaryIndustryId)) {
    parts.push(industryLabel(criteria.primaryIndustryId, "zh"), industryLabel(criteria.primaryIndustryId, "en"));
  }
  if (criteria?.secondaryIndustryId) {
    parts.push(secondaryIndustryLabel(criteria.secondaryIndustryId, "zh"), secondaryIndustryLabel(criteria.secondaryIndustryId, "en"));
  }
  if (criteria?.description) parts.push(criteria.description);
  return parts.filter(Boolean).join(" ");
}

/**
 * 某条需求的活动（W50-6 最多 2 场）：候选 = 可报名活动（已排除已开始、已取消、本人主办、已报名）按首页活动池排序
 * （计划点名 → 近期）；先放该需求所在阶段的计划活动条目（理由「计划点名」），再放标题 + 简介命中需求查询的（理由显示命中词）。
 */
export function needEventRows(input: {
  need: Pick<OpportunityPlanNeed, "title" | "criteria" | "phaseKey">;
  planEventItems: OpportunityPlanView["eventItems"];
  bookable: readonly PublicBookableEvent[];
  now: Date;
  limit?: number;
}): NeedEventRow[] {
  const limit = input.limit ?? NEED_EVENT_LIMIT;
  const byId = new Map(input.bookable.map((event) => [event.eventId, event]));
  const pool = buildHomeEventPool({
    goalMatches: [],
    limit: Number.MAX_SAFE_INTEGER,
    now: input.now,
    planEventIds: input.planEventItems.map((item) => item.eventId),
    registeredEventIds: new Set(),
    upcoming: input.bookable.map((event) => ({ endsAt: event.endsAt, eventId: event.eventId, publicCode: event.publicCode, startsAt: event.startsAt, title: event.title, venue: event.venue })),
  });
  const phaseEvents = new Set(
    input.planEventItems.filter((item) => input.need.phaseKey !== null && item.phaseKey === input.need.phaseKey).map((item) => item.eventId),
  );
  const query = needEventQuery(input.need);
  const rows: NeedEventRow[] = [];
  const add = (eventId: string, reason: NeedEventRow["reason"]) => {
    if (rows.length >= limit || rows.some((row) => row.eventId === eventId)) return;
    const pooled = pool.find((item) => item.eventId === eventId);
    if (!pooled) return;
    rows.push({ eventId, href: eventHref(pooled.publicCode), reason, startsAt: pooled.startsAt, title: pooled.title });
  };
  for (const item of pool) if (item.reason.kind === "plan" && phaseEvents.has(item.eventId)) add(item.eventId, { kind: "plan" });
  for (const item of pool) {
    const event = byId.get(item.eventId);
    if (!event) continue;
    const tokens = matchedTokensForText(`${event.title} ${event.description}`, query);
    if (tokens.length > 0) add(item.eventId, { kind: "match", tokens: [...tokens] });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 快照 gap 块 → 需求行
// ---------------------------------------------------------------------------

/** gap 块依据里的联系人记录 id（去重，≤30），交给本人范围的姓名读取。 */
export function gapEvidenceIds(view: Pick<NetworkSnapshotView, "state" | "blocks"> | null, limit = 30): string[] {
  if (!view || view.state !== "ready") return [];
  const ids = new Set<string>();
  for (const block of view.blocks) {
    if (block.kind !== "gap" || !block.needId) continue;
    for (const id of block.evidence.contactIds) if (id) ids.add(id);
  }
  return [...ids].slice(0, limit);
}

/** 按 needId 找 gap 块；依据只保留本人范围内解析得到的人，一位都没有就不显示（处处有据）。 */
export function gapNoteFor(
  needId: string,
  blocks: readonly NetworkSnapshotViewBlock[],
  names: ReadonlyMap<string, EvidenceContactName> | null,
): NeedGapNote | undefined {
  if (!names) return undefined;
  const block = blocks.find((candidate) => candidate.kind === "gap" && candidate.needId === needId);
  if (!block) return undefined;
  const evidence = [...new Set(block.evidence.contactIds)].flatMap((id) => {
    const person = names.get(id);
    return person ? [{ href: `/app/contacts/${encodeURIComponent(person.contactId)}`, id: person.contactId, name: person.name }] : [];
  });
  return evidence.length > 0 ? { evidence, text: block.text } : undefined;
}

// ---------------------------------------------------------------------------
// 待唤醒
// ---------------------------------------------------------------------------

/** 待唤醒候选（服务端一次读取：dormant 强度行 × 本人联系人）。`contactId` 为记录 id（与计划关联、强度同一 id 域）。 */
export interface DormantCandidate {
  contactId: string;
  /** 详情链接用的联系人领域 id（payload.id，缺省同 contactId）。 */
  linkId: string;
  name: string;
  organization: string | null;
  role: string | null;
  primaryIndustryId: string | null;
  dormant: boolean;
  /** 最近一条信号（关系时间线记录）；没有就不出现在待唤醒（无据）。 */
  lastSignal: { recordId: string; source: RelationshipTimelineSource; occurredAt: string } | null;
}

const SOURCE_COPY: Readonly<Record<RelationshipTimelineSource, NetworkCopy>> = {
  capture: { en: "added as a contact", zh: "添加为联系人" },
  encounter: { en: "met in person", zh: "见面" },
  followup_done: { en: "follow-up completed", zh: "完成跟进" },
  memo: { en: "memo", zh: "备忘" },
  note: { en: "note", zh: "笔记" },
  plan: { en: "plan record", zh: "计划记录" },
  schedule: { en: "meeting", zh: "日程" },
};

export function timelineSourceLabel(source: RelationshipTimelineSource, language: OrbitLanguage): string {
  return pickCopy(SOURCE_COPY[source] ?? { en: "record", zh: "记录" }, language);
}

export function formatDormantDate(iso: string, language: OrbitLanguage): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", { day: "numeric", month: language === "zh" ? "numeric" : "short", timeZone: "Asia/Tokyo", year: "numeric" }).format(date);
}

type Relevance = { kind: "need"; title: string } | { kind: "industry"; industryId: string } | { kind: "keyword"; keyword: string };

function relevanceCopy(relevance: Relevance, language: OrbitLanguage): string {
  if (relevance.kind === "need") return pickCopy({ en: `plan need “${relevance.title}”`, zh: `计划需求「${relevance.title}」` }, language);
  if (relevance.kind === "industry") {
    const label = isIndustryIdCode(relevance.industryId) ? industryLabel(relevance.industryId, language === "zh" ? "zh" : "en") : relevance.industryId;
    return pickCopy({ en: `same industry (${label})`, zh: `同属${label}` }, language);
  }
  return pickCopy({ en: `role matches “${relevance.keyword}”`, zh: `职位相关（${relevance.keyword}）` }, language);
}

export function dormantWhy(input: { lastSignal: NonNullable<DormantCandidate["lastSignal"]>; relevance: Relevance }, language: OrbitLanguage): string {
  const date = formatDormantDate(input.lastSignal.occurredAt, language);
  const type = timelineSourceLabel(input.lastSignal.source, language);
  return pickCopy(
    {
      en: `Last contact: ${date} ${type}; relevant to your goal: ${relevanceCopy(input.relevance, "en")}`,
      zh: `上次往来：${date} ${type}；与目标相关：${relevanceCopy(input.relevance, "zh")}`,
    },
    language,
  );
}

/**
 * W50-3：`dormant === true` 且（关联在任一计划人脉需求上，或 `isGoalRelatedContact(联系人, goalArchetype(目标))`）；
 * 没有最近记录的不出现（无据）；按最近一条记录时间倒序，最多 5 人。
 */
export function dormantRows(input: {
  candidates: readonly DormantCandidate[];
  /** 联系人记录 id → 第一条关联它的计划需求标题。 */
  needTitleByContact: ReadonlyMap<string, string>;
  goal: string | null;
  language: OrbitLanguage;
  limit?: number;
}): DormantRow[] {
  const goal = input.goal?.trim() ?? "";
  const archetype = goal ? goalArchetype(goal) : null;
  const rows: { row: DormantRow; at: number }[] = [];
  for (const candidate of input.candidates) {
    if (!candidate.dormant || !candidate.lastSignal) continue;
    let relevance: Relevance | null = null;
    const needTitle = input.needTitleByContact.get(candidate.contactId);
    if (needTitle) relevance = { kind: "need", title: needTitle };
    else if (archetype) {
      const contact = { organization: candidate.organization, primaryIndustryId: candidate.primaryIndustryId as never, role: candidate.role };
      if (isGoalRelatedContact(contact, archetype)) {
        if (archetype.primaryIndustryId && candidate.primaryIndustryId === archetype.primaryIndustryId) {
          relevance = { industryId: archetype.primaryIndustryId, kind: "industry" };
        } else {
          const haystack = `${candidate.role ?? ""} ${candidate.organization ?? ""}`.toLowerCase();
          const keyword = archetype.titleKeywords.find((value) => haystack.includes(value.toLowerCase()));
          if (keyword) relevance = { keyword, kind: "keyword" };
        }
      }
    }
    if (!relevance) continue;
    rows.push({
      at: Date.parse(candidate.lastSignal.occurredAt) || 0,
      row: {
        contactId: candidate.linkId,
        draftAvailable: true,
        evidence: { href: `/app/contacts/${encodeURIComponent(candidate.linkId)}`, recordId: candidate.lastSignal.recordId },
        name: candidate.name,
        recordId: candidate.contactId,
        why: dormantWhy({ lastSignal: candidate.lastSignal, relevance }, input.language),
      },
    });
  }
  return rows
    .sort((left, right) => right.at - left.at || left.row.contactId.localeCompare(right.row.contactId))
    .slice(0, input.limit ?? DORMANT_LIMIT)
    .map(({ row }) => row);
}

// ---------------------------------------------------------------------------
// 组装
// ---------------------------------------------------------------------------

export interface OpportunitiesTabParts {
  /** undefined = 计划读取失败；null = 没有生效计划。 */
  plan: OpportunityPlanView | null | undefined;
  /** null = 读取失败或无计划。 */
  pending: { candidates: PlanMatchCandidateView[]; contactCount: number } | null;
  /** null = 活动读取失败（需求行不显示活动）。 */
  bookable: readonly PublicBookableEvent[] | null;
  /** null = 读取失败。 */
  dormant: readonly DormantCandidate[] | null;
  /** gap 块依据的姓名（null = 读取失败 → 不显示 gap 文字）。 */
  gapNames: ReadonlyMap<string, EvidenceContactName> | null;
  report: NetworkSnapshotView;
  goal: string | null;
}

export function buildOpportunitiesTabView(parts: OpportunitiesTabParts, input: { language: OrbitLanguage; now: Date }): OpportunitiesTabView {
  const plan = parts.plan;
  let coverage: OpportunityCoverageView;
  if (plan === undefined) coverage = { state: "unavailable" };
  else if (plan === null) coverage = { state: "no_plan" };
  else {
    const blocks = parts.report.state === "ready" ? parts.report.blocks : [];
    coverage = {
      needs: plan.needs.map((need) => {
        const candidates = parts.pending ? parts.pending.candidates.filter((candidate) => candidate.needId === need.needId) : null;
        const gapNote = gapNoteFor(need.needId, blocks, parts.gapNames);
        return {
          candidates: (candidates ?? []).slice(0, NEED_CANDIDATE_LIMIT),
          events: need.missing > 0 && parts.bookable ? needEventRows({ bookable: parts.bookable, need, now: input.now, planEventItems: plan.eventItems }) : [],
          have: need.have,
          missing: need.missing,
          needId: need.needId,
          pendingCount: candidates ? candidates.length : null,
          phaseTitle: need.phaseTitle,
          target: need.target,
          title: need.title,
          ...(gapNote ? { gapNote } : {}),
        };
      }),
      percent: plan.percent,
      state: "ready",
    };
  }
  const needTitleByContact = new Map<string, string>();
  for (const need of plan?.needs ?? []) for (const id of need.linkedContactIds) if (!needTitleByContact.has(id)) needTitleByContact.set(id, need.title);
  return {
    coverage,
    dormant: parts.dormant ? dormantRows({ candidates: parts.dormant, goal: plan?.goal || parts.goal, language: input.language, needTitleByContact }) : null,
    report: parts.report,
    weekActions: {
      pendingMatches: plan && parts.pending ? parts.pending.contactCount : null,
      planActions: plan === undefined ? null : (plan?.weekActions ?? []).map((action) => ({ ...action, href: PLAN_HREF })),
    },
  };
}
