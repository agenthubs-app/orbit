// R17 申込設定：画面から切り離した純関数（字数・並べ替え・テンプレート・草稿入力の整形・「N分前」）。React なし、テストから直接呼ぶ。
import type { HostQuestionKind, HostSetupDraftInput, HostSetupQuestion, HostSetupResponse } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { HOST_QUESTION_MAX, isLibraryQuestionId, localizeQuestion, templateLibraryQuestions } from "../../../../../shared/domain/host-question-library";
import type { HostT } from "./host-model";

export const DESC_MAX = 2000;
export const DESC_WARN = 1900;
export const NOTE_MAX = 140;
export const QUESTION_MAX = HOST_QUESTION_MAX;

/** 申込設定の編集中の状態（説明文・質問・受付の設定）。 */
export type SetupDraft = Pick<HostSetupDraftInput, "description" | "questions" | "capacity" | "registrationClosesAt" | "admissionMode">;

export const draftOf = (data: HostSetupResponse): SetupDraft => ({
  admissionMode: data.admissionMode,
  capacity: data.capacity,
  description: data.description,
  questions: data.questions,
  registrationClosesAt: data.registrationClosesAt,
});

/** 字数（サロゲートペアを 1 字に数える）。 */
export const charCount = (text: string) => Array.from(text).length;

/** 200 字で硬く切る。 */
export const clampText = (text: string, max: number) => Array.from(text).slice(0, max).join("");

/** 配列の index → index へ移動（範囲外は無視）。 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

let seq = 0;
export const newQuestionId = () => `q-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const blankQuestion = (kind: HostQuestionKind): HostSetupQuestion => ({ id: newQuestionId(), kind, options: kind === "free" ? [] : [""], prompt: "", required: true });

/** 题型切换：单选↔多选保留选项；切到自由記述时选项保留在本地（灰色暂存），保存时不发送。 */
export const switchKind = (question: HostSetupQuestion, kind: HostQuestionKind): HostSetupQuestion => ({ ...question, kind, options: kind !== "free" && question.options.length === 0 ? [""] : question.options });

export type TemplateKey = "mixer" | "study" | "round" | "blank";

/** テンプレートの質問 = 質問集から決まった数問（主催者の画面の言語で入れる）。「空白」は単一選択 1 問。 */
export function templateQuestions(key: TemplateKey, language: OrbitLanguage): HostSetupQuestion[] {
  return key === "blank" ? [blankQuestion("single")] : templateLibraryQuestions(key, language);
}

/** 新規作成のテンプレート id（mixer / study / roundtable、未選択 = 交流会）→ 申込設定のテンプレート。 */
export const templateKeyOf = (templateId: "mixer" | "study" | "roundtable" | null | undefined): TemplateKey => (templateId === "study" ? "study" : templateId === "roundtable" ? "round" : "mixer");

/**
 * 質問案を足す（5 問まで、同じ質問は足さない）。質問集の質問は id をそのまま使い、画面の言語に直す
 * （サーバーは言語を知らないので日本語で来る）。それ以外は新しい id。
 */
export function addSuggested(questions: readonly HostSetupQuestion[], suggested: readonly HostSetupQuestion[], language: OrbitLanguage = "ja"): HostSetupQuestion[] {
  const prompts = new Set(questions.map((question) => question.prompt.trim()));
  const ids = new Set(questions.map((question) => question.id));
  const next = [...questions];
  for (const raw of suggested) {
    if (next.length >= QUESTION_MAX) break;
    const library = isLibraryQuestionId(raw.id);
    const item = library ? localizeQuestion(raw, language) : raw;
    if (ids.has(item.id) && library) continue;
    if (prompts.has(item.prompt.trim()) || prompts.has(raw.prompt.trim())) continue;
    const id = library ? item.id : newQuestionId();
    next.push({ ...item, id });
    ids.add(id);
    prompts.add(item.prompt.trim());
  }
  return next;
}

/** 保存できない内容（空の質問文 / 選択式で有効な選択肢がない）。 */
export function draftProblems(draft: SetupDraft): number {
  return draft.questions.filter((question) => !question.prompt.trim() || (question.kind !== "free" && question.options.filter((option) => option.trim()).length === 0)).length;
}

/** PUT /setup の入力：空の選択肢を落とし、自由記述は選択肢を送らない（暂存は画面側だけ）。 */
export function draftInput(draft: SetupDraft, expectedRevision: number): HostSetupDraftInput {
  return {
    admissionMode: draft.admissionMode,
    capacity: draft.capacity,
    description: clampText(draft.description.trim(), DESC_MAX),
    expectedRevision,
    questions: draft.questions.slice(0, QUESTION_MAX).map((question) => ({ id: question.id, kind: question.kind, options: question.kind === "free" ? [] : question.options.map((option) => option.trim()).filter(Boolean), prompt: question.prompt.trim(), required: question.required })),
    registrationClosesAt: draft.registrationClosesAt,
  };
}

export const sameDraft = (a: SetupDraft, b: SetupDraft) => JSON.stringify(a) === JSON.stringify(b);

/** 「2分前」「たった今」「3時間前」、1 日以上は日付。 */
export function agoText(iso: string | null | undefined, now: Date, t: HostT, dateText: (iso: string) => string): string {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor((now.getTime() - time) / 60_000);
  if (minutes < 1) return t("agoJust");
  if (minutes < 60) return t("agoMin", { n: minutes });
  if (minutes < 24 * 60) return t("agoHour", { n: Math.floor(minutes / 60) });
  return dateText(iso!);
}

/** ひとことにリンク（URL・ドメイン）を入れない（A10）。 */
export const hasLink = (text: string) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|jp|io|app|co|me|link|ly)\b/i.test(text);

/** 申込ページの表示（「orbit.app/e/cfo-night-18」= ホスト + パス）。 */
export const applyLinkText = (host: string, path: string | null) => (path ? `${host}${path}` : null);
