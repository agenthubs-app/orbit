/**
 * W0060：联系人详情「为什么是 TA」与三栏的纯函数（W0061 复用 `contactWhyNow` 与 `contactNextStep`）。
 * W0061：文件末尾加「TA 能帮你」一句话的显示模型 `contactValueLine` 与「为什么现在」取值 `contactValueWhyNow`。
 *
 * - 下一步只显示一条（D56）：洞察 ready 时用洞察的 `nextStep`（按界面语言），否则 `contact.nextAction.text`，
 *   都没有不显示。
 * - 「为什么现在」（rev 2，与 D61／W0061 同一顺序）：该联系人本周未完成的计划行动自身的理由文字 `detail`，
 *   前缀阶段名；没有这样的行动（或行动没写理由）不显示。不自算「还差 k 个」，不调用 AI。
 * - 三栏（W60-1）：只显示 publicProfile 的真实值；来自关系回退（connection 的 valueTypes／suggestedActions／
 *   sharedTopics）的字段一律当空，显示空态。来源为 `card_inference` 的字段标为推测（决定 (a)：浅色＋角标）。
 */
import type { ContactInsightText } from "../../../../../shared/contract/contact-insight";
import type { OrbitContactPublicProfileView } from "../../orbit-contacts-route-view-model";
import {
  insightEvidenceLabelText,
  tokyoDayOf,
  type InsightEvidenceFacts,
  type InsightEvidenceLabel,
} from "../../../../../features/contacts/insights/evidence-labels";
import type { RelationshipTimelineItem } from "../../../../../shared/contract/relationship-timeline";
import type { ContactValueInsight } from "../../../../../features/contacts/insights/value-lines";

type Copy = { en: string; zh: string };

export interface InsightNextStepInput {
  state: string;
  nextStep: ContactInsightText | null;
}

export function contactNextStep(input: {
  insight: InsightNextStepInput | null | undefined;
  nextAction: { text: string } | null | undefined;
  language: "zh" | "en" | "ja";
}): string | null {
  const insight = input.insight;
  if (insight && insight.state === "ready" && insight.nextStep) {
    const text = (input.language === "zh" ? insight.nextStep.zh : insight.nextStep.en).trim();
    if (text) return text;
  }
  const fallback = input.nextAction?.text?.trim() ?? "";
  return fallback || null;
}

export interface ContactWhyNowAction {
  detail: string | null;
  phaseNo: number | null;
  phaseTitle: string | null;
}

/** 「为什么现在：…」的正文（不含前缀标签）；不该显示时返回 null。 */
export function contactWhyNow(weekAction: ContactWhyNowAction | null | undefined, t: (copy: Copy) => string): string | null {
  const detail = weekAction?.detail?.trim();
  if (!weekAction || !detail) return null;
  const phaseTitle = weekAction.phaseTitle?.trim();
  if (weekAction.phaseNo !== null && phaseTitle) {
    return `${t({ en: `Phase ${weekAction.phaseNo} · ${phaseTitle}`, zh: `阶段 ${weekAction.phaseNo} · ${phaseTitle}` })}${t({ en: ": ", zh: "：" })}${detail}`;
  }
  return detail;
}

export type ProfileColumn = "offering" | "seeking" | "topics";

export interface ProfileColumnView {
  items: string[];
  /** 整个字段来自名片推测（`card_inference`）：浅色 + 「据名片推测」角标。 */
  inferred: boolean;
}

/** 三栏某一栏的真实值：回退值当空；推测字段打标记。 */
export function profileColumn(profile: OrbitContactPublicProfileView | null | undefined, field: ProfileColumn): ProfileColumnView {
  if (!profile || profile.fallbackFields?.includes(field)) return { inferred: false, items: [] };
  const items = (profile[field] ?? []).map((item) => item.trim()).filter(Boolean);
  return { inferred: items.length > 0 && profile.fieldSources?.[field] === "card_inference", items };
}

/* ── W0061：「TA 能帮你」一句话（D61，三处共用） ─────────────────────────── */

export type { ContactValueInsight, InsightEvidenceLabel };

/** 洞察没写文字时「设置关系目标」的去处（与详情面板同一入口）。 */
export const VALUE_LINE_GOAL_HREF = "/app/contacts/dashboard?tab=insight";

export interface ContactValueLineInput {
  /** 洞察部分（单语言）；null／undefined = 还没有任何洞察数据（按「生成中」退化）。 */
  insight: ContactValueInsight | null | undefined;
  /** 退化用：姓名与「公司 · 职位」。 */
  name: string;
  subtitle: string | null;
  /** 退化用：可能对应的计划需求标题（候选卡的需求、首页计划行动关联的需求）。 */
  needTitle?: string | null;
  /** 退化用：行业规则命中的行业（候选卡规则层）。 */
  industry?: string | null;
  /** 「为什么现在：」正文（`contactValueWhyNow`）；null 不显示。 */
  whyNow?: string | null;
}

export interface ContactValueLineEvidence {
  label: InsightEvidenceLabel;
  text: string;
}

export type ContactValueLineModel =
  | { kind: "ready"; relation: string; evidence: ContactValueLineEvidence[]; whyNow: string | null }
  | {
      kind: "fallback";
      state: "pending" | "none" | "failed" | "no_goal";
      /** 「公司 · 职位」；都空时用姓名占位（永不空行）。 */
      who: string;
      /** 「可能对应：计划需求『…』 · 同属 {行业}」；两者都没有为 null。 */
      context: string | null;
      tail: string;
      tailHref: string | null;
      whyNow: string | null;
    };

/**
 * 纯函数（SC-01／SC-02）：一句话的显示模型。ready 且有文字 →「TA 能帮你：{relation}」+ 依据小签；
 * 其余状态退化为「{公司 · 职位｜姓名}」+（有则）「可能对应：计划需求『…』」「同属 {行业}」+ 状态尾巴。
 */
export function contactValueLine(input: ContactValueLineInput, t: (copy: Copy) => string): ContactValueLineModel {
  const insight = input.insight;
  const whyNow = input.whyNow?.trim() || null;
  const relation = insight?.state === "ready" ? insight.relation?.trim() ?? "" : "";
  if (insight && relation) {
    return {
      evidence: (insight.evidence ?? []).map((label) => ({ label, text: insightEvidenceLabelText(label, t) })),
      kind: "ready",
      relation,
      whyNow,
    };
  }
  const state = insight?.state === "failed" || insight?.state === "no_goal" || insight?.state === "none" ? insight.state : "pending";
  const who = input.subtitle?.trim() || input.name.trim() || "—";
  const parts: string[] = [];
  const needTitle = input.needTitle?.trim();
  if (needTitle) parts.push(t({ en: `May fit: plan need “${needTitle}”`, zh: `可能对应：计划需求『${needTitle}』` }));
  const industry = input.industry?.trim();
  if (industry) parts.push(t({ en: `Same industry: ${industry}`, zh: `同属 ${industry}` }));
  const tail =
    state === "failed"
      ? t({ en: "“How they can help” couldn't be generated for now", zh: "「TA 能帮你」暂时没生成出来" })
      : state === "no_goal"
        ? t({ en: "Set a relationship goal to see how they can help", zh: "设置关系目标后生成「TA 能帮你」" })
        : t({ en: "“How they can help” is being generated — usually within a minute", zh: "「TA 能帮你」生成中，通常 1 分钟内出现" });
  return {
    context: parts.length ? parts.join(" · ") : null,
    kind: "fallback",
    state,
    tail,
    tailHref: state === "no_goal" ? VALUE_LINE_GOAL_HREF : null,
    who,
    whyNow,
  };
}

/**
 * 「为什么现在」（rev 2 G-17）：只给恰好指向一位联系人的计划行动——①计划条目自身理由（`contactWhyNow`，前缀阶段名）；
 * ②没有则 ready 洞察的下一步；③都没有不显示。跟进、信号等事项不调用它。
 */
export function contactValueWhyNow(
  action: ContactWhyNowAction | null | undefined,
  insight: { state: string; nextStep?: string | null } | null | undefined,
  t: (copy: Copy) => string,
): string | null {
  const own = contactWhyNow(action, t);
  if (own) return own;
  if (!action) return null;
  return insight?.state === "ready" ? insight.nextStep?.trim() || null : null;
}

/**
 * 详情（0 次新增读取）：用已读到的时间线（capture 的采集方式、memo 的日期）与已关联计划需求喂依据解析器——
 * 与首页、候选卡的服务端解析同一纯函数 `insightEvidenceLabels`。时间线只带最近 20 条，更早的 memo 依据解析不到时丢弃。
 */
export function evidenceFactsFromDetail(
  contactId: string,
  timelineItems: readonly Pick<RelationshipTimelineItem, "id" | "source" | "occurredAt" | "detail">[] | null | undefined,
  linkedNeeds: readonly { needId: string; title: string }[] | null | undefined,
  /** review P2：「建立联系」那条被挤出最近 20 条时，用联系人自己的来源（名片扫描 = scan）兜底。 */
  sourceIsCard?: boolean,
): InsightEvidenceFacts {
  const captureIsCard = new Map<string, boolean>();
  const memoDays = new Map<string, string>();
  for (const item of timelineItems ?? []) {
    if (item.source === "capture" && item.id === `capture:${contactId}`) captureIsCard.set(contactId, item.detail?.captureMethod === "business_card");
    else if (item.source === "memo") {
      const day = tokyoDayOf(item.occurredAt);
      if (day) memoDays.set(item.id, day);
    }
  }
  if (!captureIsCard.has(contactId) && sourceIsCard !== undefined) captureIsCard.set(contactId, sourceIsCard);
  return { captureIsCard, memoDays, needTitles: new Map((linkedNeeds ?? []).map((need) => [need.needId, need.title])) };
}
