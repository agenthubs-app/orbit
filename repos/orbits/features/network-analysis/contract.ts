/**
 * W0048a：共享人脉分析快照的契约（W0048b、W0049～W0055 共用；REPORT 交接最终名）。
 *
 * - 快照只存 AI 叙述与依据，**不存任何统计数字**（分布、档位人数、覆盖度、分数一律实时规则算）；
 * - 文字按语言分列存（zh／en），依据语言无关只存一份；页面视图只带请求语言；
 * - `includedContactIds` 只在写入与阈值比较时读，页面读取路径不取。
 */
export type SnapshotBlockKind = "diagnosis" | "insight" | "gap" | "plan";
export const SNAPSHOT_BLOCK_KINDS: readonly SnapshotBlockKind[] = ["diagnosis", "insight", "gap", "plan"];

/** recordIds = RelationshipTimelineItem.id。 */
export interface SnapshotEvidence {
  contactIds: string[];
  recordIds: string[];
}

export interface SnapshotBlock {
  key: string;
  kind: SnapshotBlockKind;
  text: { zh: string; en: string };
  evidence: SnapshotEvidence;
  needId?: string;
}

export type SnapshotOrigin = "plan" | "standalone";
export type SnapshotTrigger = "first" | "threshold" | "goal_changed" | "manual" | "plan";

export interface NetworkAnalysisSnapshot {
  id: string;
  actorId: string;
  version: number;
  origin: SnapshotOrigin;
  planId: string | null;
  trigger: SnapshotTrigger;
  /** 64 hex。 */
  sourceDataVersion: string;
  /** 生成时目标原文的 sha256，只作来历，不是目标的副本。 */
  goalDigest: string;
  generatedAt: string;
  /** = includedContactIds.length（库里 CHECK 保证）。 */
  contactCount: number;
  includedContactIds: string[];
  blocks: SnapshotBlock[];
  generator: { provider: "deepseek" | "mock"; model: string; promptVersion: string };
}

export type SnapshotLanguage = "zh" | "en";

export interface NetworkSnapshotViewBlock {
  key: string;
  kind: SnapshotBlockKind;
  text: string;
  evidence: SnapshotEvidence;
  needId?: string;
}

export type NetworkSnapshotJobState = "none" | "queued" | "running" | "deferred";

export interface NetworkSnapshotQuotaView {
  manual: { usedToday: number; limit: number };
  user: { usedToday: number; limit: number };
  background: { usedToday: number; limit: number; retryOn?: string };
}

export interface NetworkSnapshotView {
  state: "ready" | "none" | "insufficient" | "unavailable";
  generatedAt: string | null;
  contactCount: number;
  /** 只带请求语言的文字与依据；非 ready 时为空数组。 */
  blocks: NetworkSnapshotViewBlock[];
  freshness: {
    stale: boolean;
    newContactCount: number;
    job: NetworkSnapshotJobState;
    retryOn?: string;
  };
  quota: NetworkSnapshotQuotaView;
}

/** 已确认联系人少于这个数不生成快照（W48-5）。 */
export const SNAPSHOT_MIN_CONTACTS = 3;
/** 新增达到这个人数即自动重算。 */
export const SNAPSHOT_THRESHOLD_NEW_CONTACTS = 3;
/** 或新增达到上次纳入人数的这个比例（向上取整）。 */
export const SNAPSHOT_THRESHOLD_RATIO = 0.2;
/** 每人保留最近 12 版（含 current，W48-4）。 */
export const SNAPSHOT_RETAINED_VERSIONS = 12;
/** 模型输入的联系人上限（与计划输入同一口径）。 */
export const SNAPSHOT_INPUT_CONTACT_LIMIT = 200;
/** 每人带最近几条关系记录给模型。 */
export const SNAPSHOT_INPUT_RECORDS_PER_CONTACT = 2;
export const SNAPSHOT_INPUT_EXCERPT_LIMIT = 80;
/** 解析器保留的块数上限。 */
export const SNAPSHOT_BLOCK_LIMITS: Readonly<Record<SnapshotBlockKind, number>> = { diagnosis: 1, insight: 3, gap: 6, plan: 1 };
export const SNAPSHOT_MIN_INSIGHTS = 2;
export const SNAPSHOT_TEXT_LIMIT = 600;
export const SNAPSHOT_EVIDENCE_LIMIT = 12;

/** 当前提示词版本：变了即视为来源变化（sourceDataVersion 覆盖）。 */
export const SNAPSHOT_PROMPT_VERSION = "network-snapshot-2026-10-v3";
