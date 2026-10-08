/**
 * W0051（RN-09）定稿共享契约：每人洞察 ContactInsight。
 *
 * 一条洞察 = 这位联系人与本人关系目标的关系（一句话）+ 依据 + 建议的下一步，中英双语各 ≤120 字。
 * 结果存在按 (actor, contact) 的读模型（Web 端 `contact_insights` 表），只在数据变化时增量生成；
 * 打开页面只读存储，0 次模型调用。`relevance` 由规则计算（0–100），不由模型给。
 * W0052（概览驾驶舱）、W0054（示例）、W0055（回填）只消费本契约，名字不得改。
 *
 * 本文件随 `npm run sync:contract` 逐字复制进 App（`src/api/contract`），只能 `./` 引用同目录契约。
 */
import type { RelationshipTimelineSource } from "./relationship-timeline";

export interface ContactInsightText {
  zh: string;
  en: string;
}

/** 依据来源：W0046 时间线的来源，或计划里的人脉需求条目。 */
export type ContactInsightEvidenceSource = RelationshipTimelineSource | "plan_need";

export interface ContactInsightEvidence {
  source: ContactInsightEvidenceSource;
  /** 时间线条目 id（`${source}:${原记录 id}`）或计划条目 id；只允许属于该联系人的 id。 */
  id: string;
}

export interface ContactInsight {
  contactId: string;
  goalRelation: ContactInsightText;
  evidence: ContactInsightEvidence[];
  nextStep: ContactInsightText;
  /** 0–100，规则计算。 */
  relevance: number;
  sourceDataVersion: string;
  generatedAt: string;
}

/** 只读视图状态：ready 已生成；pending 等生成（含顺延到明天）；no_goal 未设关系目标；failed 生成失败；none 还没有洞察。 */
export type ContactInsightState = "ready" | "pending" | "no_goal" | "failed" | "none";

/** 文字上限：洞察每种语言 ≤120 字，列表一句 ≤60 字（常量在 `features/contacts/insights/limits.ts`，契约只放类型）。 */
