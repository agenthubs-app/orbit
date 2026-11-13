/**
 * R17 申込設定的模板（host/DESIGN.md §2.2「テンプレートから」、§2.7「質問案」）。Owner: 甲 (R17).
 * 问题库来自共享题库（`question-suggest.ts` 按过去回答的分散度挑 3 个，没有过去数据时按题库的建议顺序）；定型お知らせ的显示文取自通知模板（同一份固定文）。
 */
import type { HostNoticeTemplate, HostSetupQuestion } from "../../../shared/contract/host-console";
import { suggestionLibrary } from "../../../shared/domain/host-question-library";
import { renderHostNotice } from "./notices/templates";

/** 「質問案」の候補 = 共有の質問集（`shared/domain/host-question-library.ts`）。サーバーは主催者の言語を知らないので日本語で返し、画面が主催者の言語に直して足す（id が同じ）。 */
export const HOST_QUESTION_LIBRARY: readonly HostSetupQuestion[] = suggestionLibrary("ja");

export function hostNoticeTemplates(eventTitle: string): HostNoticeTemplate[] {
  const kinds = ["admission_approved", "admission_rejected", "admission_waitlisted", "admission_promoted", "matching_published", "profile_incomplete"] as const;
  return kinds.map((kind) => ({ kind, text: renderHostNotice(kind, { eventTitle, organizerName: null }, null).ja.body }));
}
