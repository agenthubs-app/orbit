/**
 * 2026-11-22 三语：发布结果里 AI 文字的语言选择。
 *
 * 原有字符串字段 = zh（旧读者照旧）；`i18n` 存在时，按查看者语言把同一形状里的文字换掉。
 * 没有 `i18n` 的旧发布结果原样返回（旧活动没有授权补三语，不在读取时现翻）。
 */
import type {
  EventOperationsParticipantRecommendations,
  EventOperationsRecommendation,
  EventOperationsTable,
  EventOperationsTextLanguage,
} from "./contract";
import { requestLanguageTag } from "../../../shared/compute/request-language";

/** 界面语言（ja / zh / en，或带地区的写法）→ 文字语言。未知一律按 ja（产品默认语言）。 */
export function eventOperationsTextLanguage(language: string | null | undefined): EventOperationsTextLanguage {
  const value = (language ?? "").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  return "ja";
}

export function recommendationIn(row: EventOperationsRecommendation, language: EventOperationsTextLanguage): EventOperationsRecommendation {
  const text = row.i18n?.[language];
  return text ? { ...row, icebreakers: text.icebreakers, memberHint: text.memberHint, reasons: text.reasons } : row;
}

export function participantRecommendationsIn(row: EventOperationsParticipantRecommendations, language: EventOperationsTextLanguage): EventOperationsParticipantRecommendations {
  const noMatch = row.noMatchReason !== null ? row.noMatchReasonI18n?.[language] ?? row.noMatchReason : null;
  return { ...row, noMatchReason: noMatch, recommendations: row.recommendations.map((item) => recommendationIn(item, language)) };
}

export function tableIn(table: EventOperationsTable, language: EventOperationsTextLanguage): EventOperationsTable {
  const text = table.i18n?.[language];
  return text ? { ...table, icebreakers: text.icebreakers, memberPrompts: text.memberPrompts, memberRationales: text.memberRationales, rationale: text.rationale, theme: text.theme } : table;
}

/** 主办方手动安排到某桌的人的理由（三语；旧字段沿用原来的日文）。 */
export const HOST_PLACED_REASON_I18N: Readonly<Record<EventOperationsTextLanguage, string>> = {
  ja: "主催者が配置",
  zh: "由主办方安排",
  en: "Placed by the host",
};

/** 查看者语言：`?lang=` → App 的 `x-orbit-lang` → Web 的 `orbit-lang` cookie → ja。 */
export function eventOperationsRequestLanguage(request: Request): EventOperationsTextLanguage {
  return eventOperationsTextLanguage(requestLanguageTag(request));
}
