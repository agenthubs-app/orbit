/**
 * W0047（RN-05）定稿共享契约：关系强度 RelationshipStrength。
 *
 * 强度只由关系时间线（./relationship-timeline）按规则表打分、带衰减推出；不读 stage／tags／status／
 * customTags／networkCategory、不读站内私信、不读 businessRelevanceScore。结果存在可重建的读模型
 * （orbit_records 集合 `relationship_strengths`），W0048a 快照、W0049 健康分布、W0051 洞察、W0052 管线区读它。
 *
 * 本文件随 `npm run sync:contract` 逐字复制进 App（`src/api/contract`），只能 `./` 引用同目录契约。
 */
import type { RelationshipTimelineSource } from "./relationship-timeline";

/** 新认识／有往来／核心。待唤醒（dormant）是独立标记，不是第四档。 */
export type RelationshipTier = "new" | "active" | "core";

/** 管线列与分布分组：dormant 优先归入「待唤醒」。 */
export type RelationshipTierGroup = RelationshipTier | "dormant";

export interface RelationshipStrengthSignal {
  /** = RelationshipTimelineItem.id */
  timelineItemId: string;
  /** 冗余一份类型，方便聚合。 */
  source: RelationshipTimelineSource;
  occurredAt: string;
  /** 衰减前。 */
  basePoints: number;
  /** 衰减后贡献（保留 1 位小数）。 */
  points: number;
}

export interface RelationshipStrength {
  contactId: string;
  /** score ≥ 70 core；≥ 45 active；其余 new（与 shared/compute 70／45 同阈值）。 */
  tier: RelationshipTier;
  /** 曾达 active（峰值 ≥ 45）且最近 60 天无非 capture 记录。 */
  dormant: boolean;
  /** 0–100 整数，min(100, round(Σ points))。 */
  score: number;
  /** 历史峰值（由信号重放得出，不另存历史）。 */
  peakScore: number;
  /** 最近一条非 capture 记录时间（不含未来项）。 */
  lastSignalAt: string | null;
  /** 按 points 降序，最多 12 条。 */
  signals: readonly RelationshipStrengthSignal[];
  /** 计算时刻（now）。 */
  computedAt: string;
  /** 例如 "rs-2026-10-v1"；规则参数变更必须升版本。 */
  rulesVersion: string;
}

/** 某一时间点的档位人数（R-7：由完整去重时间线按时间点算出，不用 signals 回放）。 */
export interface RelationshipTierCounts {
  asOf: string;
  counts: { new: number; active: number; core: number; dormant: number };
  /** 计入的联系人数（capture.occurredAt ≤ asOf）。四组人数之和 = contactCount。 */
  contactCount: number;
}

/** 每 actor 一行的刷新状态（orbit_records 集合 `relationship_strength_state`）。 */
export interface RelationshipStrengthState {
  actorId: string;
  /** 时间线各来源的版本戳；变了才重算。 */
  sourceStamp: string;
  /** 计算时的东京日期 `YYYY-MM-DD`；跨日重算（衰减／待唤醒）。 */
  tokyoDate: string;
  rulesVersion: string;
  computedAt: string;
  /** now − 30 天的档位人数（W0049 的 30 天变化直接读它）。 */
  tierCountsAt30d: RelationshipTierCounts;
  /** 最早一位联系人的建立时间（无联系人为 null）；W0049 据此判断「30 天前是否已有人脉」。 */
  earliestCaptureAt: string | null;
  /** 本次计算覆盖的联系人数（= relationship_strengths 行数）。 */
  contactCount: number;
}
