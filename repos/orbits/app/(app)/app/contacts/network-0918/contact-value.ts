/**
 * W0060：联系人详情「为什么是 TA」与三栏的纯函数（W0061 复用 `contactWhyNow` 与 `contactNextStep`）。
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
