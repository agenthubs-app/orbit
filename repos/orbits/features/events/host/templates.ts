/**
 * R17 申込設定的模板（host/DESIGN.md §2.2「テンプレートから」、§2.7「質問案」）。Owner: 甲 (R17).
 * 问题库是规则用的候选（`question-suggest.ts` 按过去回答的分散度挑 3 个）；定型お知らせ的显示文取自通知模板（同一份固定文）。
 */
import type { HostNoticeTemplate, HostSetupQuestion } from "../../../shared/contract/host-console";
import { renderHostNotice } from "./notices/templates";

export const HOST_QUESTION_LIBRARY: readonly HostSetupQuestion[] = [
  { id: "standing", kind: "single", options: ["スタートアップの経営者・CFO", "投資家（VC・CVC・エンジェル）", "事業会社", "士業・支援機関"], prompt: "あなたの立場に近いものを選んでください", required: true },
  { id: "topic", kind: "multiple", options: ["資本政策", "投資家との関係づくり", "財務チームの採用", "上場準備"], prompt: "今回いちばん話したいテーマ（2つまで）", required: true },
  { id: "want", kind: "free", options: [], prompt: "会いたい人の条件があれば教えてください", required: false },
  { id: "times", kind: "single", options: ["初めて", "2回目", "3回目以上"], prompt: "このイベントへの参加は何回目ですか？", required: false },
  { id: "level", kind: "single", options: ["これから学びたい", "実務で使っている", "人に教えられる"], prompt: "このテーマの経験レベルを教えてください", required: true },
  { id: "share", kind: "free", options: [], prompt: "事前に共有したい課題があれば教えてください", required: false },
];

export function hostNoticeTemplates(eventTitle: string): HostNoticeTemplate[] {
  const kinds = ["admission_approved", "admission_rejected", "admission_waitlisted", "admission_promoted", "matching_published", "profile_incomplete"] as const;
  return kinds.map((kind) => ({ kind, text: renderHostNotice(kind, { eventTitle, organizerName: null }, null).ja.body }));
}
