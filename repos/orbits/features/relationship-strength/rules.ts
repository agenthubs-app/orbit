/**
 * W0047：关系强度规则表（W47-3 定稿：半衰期 90 天、待唤醒 60 天、核心 ≥70／有往来 ≥45）。
 * 参数集中在这一张表；任何取值变化都必须升 `version`（读模型据此整体重算，W0048a 快照 sourceDataVersion 覆盖它）。
 */
import type { RelationshipTimelineCaptureMethod } from "../../shared/contract/relationship-timeline";

export const RELATIONSHIP_STRENGTH_RULES_VERSION = "rs-2026-10-v1";

export interface RelationshipStrengthRules {
  version: string;
  /** 衰减：points = basePoints × 0.5^(ageDays / halfLifeDays)，ageDays 为东京日差。 */
  halfLifeDays: number;
  /** 待唤醒：峰值 ≥ activeThreshold 且最近一条非 capture 记录距今 ≥ dormantAfterDays 天。 */
  dormantAfterDays: number;
  coreThreshold: number;
  activeThreshold: number;
  /** 缓存里保留的依据条数。 */
  maxSignals: number;
  points: {
    capture: Record<RelationshipTimelineCaptureMethod, number>;
    memo: { default: number; metOrIntroduced: number; collaborated: number };
    encounter: number;
    schedule: { pastMeeting: number; pastEvent: number; futureMeeting: number; personal: number };
    followupDone: number;
    plan: { contactEstablished: number; contactLinked: number; other: number };
    note: number;
  };
}

export const RELATIONSHIP_STRENGTH_RULES: RelationshipStrengthRules = {
  version: RELATIONSHIP_STRENGTH_RULES_VERSION,
  halfLifeDays: 90,
  dormantAfterDays: 60,
  coreThreshold: 70,
  activeThreshold: 45,
  maxSignals: 12,
  points: {
    // 名片／扫码／活动交换 10；手动添加 5；其他来源（推荐、邮件信号等无当面交换）按手动 5 计。
    capture: { business_card: 10, qr: 10, event_exchange: 10, manual: 5, other: 5 },
    memo: { default: 15, metOrIntroduced: 20, collaborated: 30 },
    encounter: 20,
    // 未来的约见（已约）5 分、不衰减；发生后按已发生的 meeting 重算。个人日程不计分。
    schedule: { pastMeeting: 25, pastEvent: 10, futureMeeting: 5, personal: 0 },
    followupDone: 10,
    plan: { contactEstablished: 20, contactLinked: 5, other: 0 },
    // 笔记提及只进时间线，不计分。
    note: 0,
  },
};
