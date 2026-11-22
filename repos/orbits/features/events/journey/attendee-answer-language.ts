/**
 * 参加者の詳細の一问一答按查看者语言显示（2026-11-21 语言混杂审计）。纯函数，服务与示例共用。
 */
import { localizeLibraryAnswerText, localizeLibraryPrompt } from "../../../shared/domain/host-question-library";
import type { JourneyLanguage } from "./prep-core";

/** 回答的问题文：有快照用快照的问题；旧数据只有字段名时用固定的日文标签（显示时按查看者语言换成 ATTENDEE_FIELD_LABEL）。 */
export const FIELD_LABEL_JA: Readonly<Record<string, string>> = {
  desiredOutcome: "参加の目的",
  energyStyle: "話し方",
  experienceHighlight: "話せるトピック",
  followUpPreference: "連絡の希望",
  industry: "業界",
  positioning: "会社・役職",
  targetAttendees: "会いたい人",
  valueOffered: "提供できること",
};

/** 申込の項目名（界面文案，三语）。 */
export const ATTENDEE_FIELD_LABEL: Readonly<Record<string, Readonly<Record<JourneyLanguage, string>>>> = {
  desiredOutcome: { en: "Why I'm here", ja: "参加の目的", zh: "参加目的" },
  energyStyle: { en: "Conversation style", ja: "話し方", zh: "交流方式" },
  experienceHighlight: { en: "Topics I can talk about", ja: "話せるトピック", zh: "能聊的话题" },
  followUpPreference: { en: "How to follow up", ja: "連絡の希望", zh: "联系方式偏好" },
  industry: { en: "Industry", ja: "業界", zh: "行业" },
  positioning: { en: "Company · role", ja: "会社・役職", zh: "公司 · 职位" },
  targetAttendees: { en: "Wants to meet", ja: "会いたい人", zh: "想认识的人" },
  valueOffered: { en: "Can offer", ja: "提供できること", zh: "能提供的" },
};

/**
 * 参加者の詳細の一问一答 → 查看者语言：项目名是界面文案（按语言）；主办方自己写的问题保持原文；回答里与题库选项一致的部分
 * 按语言显示，本人写的内容与主办方自定义选项保持原文。
 */
export function attendeeAnswerInLanguage(answer: { q: string; a: string; field?: string }, language: JourneyLanguage): { q: string; a: string } {
  // 没带 field 的旧数据：问题文正好是固定日文标签时也认得出是哪一项。
  const field = answer.field ?? Object.keys(FIELD_LABEL_JA).find((key) => FIELD_LABEL_JA[key] === answer.q);
  const label = field ? ATTENDEE_FIELD_LABEL[field] : undefined;
  const generic = Boolean(field) && answer.q === FIELD_LABEL_JA[field!];
  const q = label && (generic || !answer.q) ? label[language] : localizeLibraryPrompt(answer.q, language);
  return { a: localizeLibraryAnswerText(answer.a, language), q };
}
