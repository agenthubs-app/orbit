/**
 * W0049：「结构」标签的纯函数模型（服务端加载器、结构标签组件与测试共用）。
 *
 * 数据来源（单一事实来源、实时派生，不存统计数字）：
 * - 四维分布（行业两级／地区／角色层级／关系强度档）= ContactsAnalysisView.structure（shared/compute 全量计算，
 *   不来自名单分页），中心人数与百分比分母都用分布本身；
 * - 诊断与洞察 = NetworkSnapshotView 的 `blocks`（已是请求语言；只读 state／blocks／generatedAt／contactCount／
 *   freshness.stale），依据 = `evidence.contactIds` 经本人范围内的姓名解析；
 * - 高亮 = 当前计划未满足（open／linked）的人脉需求的结构化行业条件（只经 PlanService.getCurrent() 读取，W49-2）；
 * - 关系健康四档的 30 天变化 = 当前档位人数 − W0047 state 行的 `tierCountsAt30d`（完整去重时间线算出，R-7）。
 */
import type { NetworkSnapshotView } from "../../../../../features/network-analysis/contract";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { RelationshipStrengthState, RelationshipTierGroup } from "../../../../../shared/contract/relationship-strength";
import type { AnalysisBucket, ContactsAnalysisView } from "./contacts-analysis-view-model";
import { pickCopy } from "./network-copy";

/** W49-4：结构标签只显示新四维；旧 role／relationship 下线（后端旧键保留给 App）。 */
export const STRUCTURE_TAB_DIMENSIONS = ["industry", "region", "seniority", "tier"] as const;
export type StructureTabDimension = (typeof STRUCTURE_TAB_DIMENSIONS)[number];

export const STRUCTURE_TAB_DIMENSION_COPY: Readonly<Record<StructureTabDimension, { zh: string; en: string }>> = {
  industry: { zh: "行业", en: "Industry" },
  region: { zh: "地区", en: "Region" },
  seniority: { zh: "角色层级", en: "Seniority" },
  tier: { zh: "关系强度", en: "Relationship tier" },
};

export const TIER_ORDER: readonly RelationshipTierGroup[] = ["new", "active", "core", "dormant"];

export interface StructureRow {
  id: string;
  label: string;
  count: number;
  percentage: number;
  href: string;
  missingData: boolean;
  /** 与计划人脉需求相关（只按结构化行业条件）。 */
  highlighted: boolean;
  /** 只在行业一级分组上：二级分组（按人数排序）。 */
  children?: StructureRow[];
}

export interface StructureDimensionView {
  dimension: StructureTabDimension;
  /** 分布全量人数（各分组之和），不是名单条数。 */
  total: number;
  /** 按人数从多到少（同数保持后端顺序）。 */
  rows: StructureRow[];
}

export interface PlanNeedHighlights {
  primary: string[];
  secondary: string[];
}

type StructureData = Extract<ContactsAnalysisView, { state: "ready" }>["structure"];

function byCount<T extends { count: number }>(rows: readonly T[]): T[] {
  return rows.map((row, index) => ({ row, index }))
    .sort((left, right) => right.row.count - left.row.count || left.index - right.index)
    .map(({ row }) => row);
}

function toRow(bucket: AnalysisBucket, highlighted: (bucket: AnalysisBucket, child: boolean) => boolean): StructureRow {
  return {
    id: bucket.id,
    label: bucket.label,
    count: bucket.count,
    percentage: bucket.percentage,
    href: bucket.href,
    missingData: bucket.missingData,
    highlighted: highlighted(bucket, false),
    ...(bucket.children ? { children: byCount(bucket.children).map((child) => toRow(child, (value) => highlighted(value, true))) } : {}),
  };
}

/** 结构标签一个维度的视图：全量总数、按人数排序的分组、行业一级／二级高亮。 */
export function structureDimensionView(
  structure: StructureData,
  dimension: StructureTabDimension,
  highlights: PlanNeedHighlights | null,
): StructureDimensionView | null {
  if (structure.state !== "ready" && structure.state !== "empty") return null;
  const buckets = structure.data.dimensions[dimension] ?? [];
  const primary = new Set(highlights?.primary ?? []);
  const secondary = new Set(highlights?.secondary ?? []);
  const highlighted = (bucket: AnalysisBucket, child: boolean) =>
    dimension === "industry" && (child ? secondary.has(bucket.id) : primary.has(bucket.id));
  return {
    dimension,
    total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    rows: byCount(buckets).map((bucket) => toRow(bucket, highlighted)),
  };
}

/**
 * W49-2：只取当前计划里未满足（open／linked）的人脉需求的结构化行业条件；不读关系目标文字、不猜。
 * 输入是 `PlanService.getCurrent()` 的结果（纯投影，不写、不触发阶段进入）。
 */
export function planNeedHighlights(
  snapshot: { items: readonly { kind: string; status: string; criteria: { primaryIndustryId: string | null; secondaryIndustryId: string | null } | null }[] } | null,
): PlanNeedHighlights {
  const primary = new Set<string>();
  const secondary = new Set<string>();
  for (const item of snapshot?.items ?? []) {
    if (item.kind !== "network_need" || (item.status !== "open" && item.status !== "linked") || !item.criteria) continue;
    if (item.criteria.primaryIndustryId) primary.add(item.criteria.primaryIndustryId);
    if (item.criteria.secondaryIndustryId) secondary.add(item.criteria.secondaryIndustryId);
  }
  return { primary: [...primary].sort(), secondary: [...secondary].sort() };
}

export type TierChange =
  | { kind: "delta"; delta: number }
  /** 30 天前账号里确实还没有联系人（earliestCaptureAt 晚于截止）。 */
  | { kind: "insufficient" }
  /** 强度读模型不可用（未配置或刷新失败），不编造变化。 */
  | { kind: "unavailable" };

export interface HealthTile {
  id: RelationshipTierGroup;
  count: number;
  change: TierChange;
}

export type TierHistory = Pick<RelationshipStrengthState, "tierCountsAt30d" | "earliestCaptureAt">;

/**
 * 关系健康四档（固定四行，没有人的档显示 0）与较 30 天前的变化。
 * 当前人数来自全量 relationshipTierDistribution；30 天前人数读 W0047 state 行（不回放缓存信号）。
 */
export function healthTiles(health: readonly { id: RelationshipTierGroup; count: number }[], history: TierHistory | null): HealthTile[] {
  const current = new Map(health.map((item) => [item.id, item.count]));
  const asOf = history ? Date.parse(history.tierCountsAt30d.asOf) : Number.NaN;
  const earliest = history?.earliestCaptureAt ? Date.parse(history.earliestCaptureAt) : Number.NaN;
  const insufficient = Boolean(history) && (!history!.earliestCaptureAt || !Number.isFinite(earliest) || !Number.isFinite(asOf) || earliest > asOf);
  return TIER_ORDER.map((id) => {
    const count = current.get(id) ?? 0;
    if (!history) return { id, count, change: { kind: "unavailable" } };
    if (insufficient) return { id, count, change: { kind: "insufficient" } };
    const past = history.tierCountsAt30d.counts[id];
    return { id, count, change: typeof past === "number" ? { kind: "delta", delta: count - past } : { kind: "unavailable" } };
  });
}

export function tierChangeLabel(change: TierChange, language: OrbitLanguage): string {
  if (change.kind === "insufficient") return pickCopy({ zh: "数据不足", en: "Not enough data" }, language);
  if (change.kind === "unavailable") return "—";
  if (change.delta === 0) return pickCopy({ zh: "持平", en: "No change" }, language);
  return change.delta > 0 ? `+${change.delta}` : `−${Math.abs(change.delta)}`;
}

export interface EvidencePerson {
  id: string;
  name: string;
  href: string;
}

export interface StructureBlockView {
  key: string;
  text: string;
  evidence: EvidencePerson[];
}

export type StructureSnapshotView =
  | { state: "ready"; diagnosis: StructureBlockView | null; insights: StructureBlockView[]; contactCount: number; generatedAt: string | null; outdated: boolean }
  /** 没有快照或不足 3 人：①④不渲染。 */
  | { state: "none" }
  /** 快照读取失败：①④显示「来源暂时不可用」。 */
  | { state: "unavailable" };

export type SnapshotReadView = Pick<NetworkSnapshotView, "state" | "blocks" | "generatedAt" | "contactCount" | "freshness">;

const INSIGHT_LIMIT = 3;

function structureBlocks(view: SnapshotReadView) {
  return {
    diagnosis: view.blocks.find((block) => block.kind === "diagnosis") ?? null,
    insights: view.blocks.filter((block) => block.kind === "insight").slice(0, INSIGHT_LIMIT),
  };
}

/** 诊断与洞察依据里出现的联系人 id（去重，按出现顺序），交给本人范围的姓名读取。 */
export function evidenceContactIds(view: SnapshotReadView | null, limit = 30): string[] {
  if (!view || view.state !== "ready") return [];
  const { diagnosis, insights } = structureBlocks(view);
  const ids = new Set<string>();
  for (const block of [...(diagnosis ? [diagnosis] : []), ...insights]) {
    for (const id of block.evidence.contactIds) if (id) ids.add(id);
  }
  return [...ids].slice(0, limit);
}

/** 快照视图 → 结构标签的诊断／洞察；依据只保留姓名解析得到的（本人范围内、未删除）联系人。 */
export function structureSnapshotView(view: SnapshotReadView | null, names: ReadonlyMap<string, string>): StructureSnapshotView {
  if (!view || view.state === "unavailable") return { state: "unavailable" };
  if (view.state !== "ready") return { state: "none" };
  const { diagnosis, insights } = structureBlocks(view);
  const toBlock = (block: NonNullable<typeof diagnosis>): StructureBlockView => ({
    key: block.key,
    text: block.text,
    evidence: [...new Set(block.evidence.contactIds)].flatMap((id) => {
      const name = names.get(id);
      return name ? [{ id, name, href: `/app/contacts/${encodeURIComponent(id)}` }] : [];
    }),
  });
  if (!diagnosis && insights.length === 0) return { state: "none" };
  return {
    state: "ready",
    diagnosis: diagnosis ? toBlock(diagnosis) : null,
    insights: insights.map(toBlock),
    contactCount: view.contactCount,
    generatedAt: view.generatedAt,
    outdated: view.freshness.stale,
  };
}

/** 服务端加载器交给结构标签组件的全部附加数据（可序列化）。 */
export interface StructureTabExtras {
  snapshot: StructureSnapshotView;
  /** null = 计划读取失败（无高亮，其余照常）；无计划 = 两个空数组。 */
  highlights: PlanNeedHighlights | null;
  /** null = 强度读模型不可用。 */
  tierHistory: TierHistory | null;
}
