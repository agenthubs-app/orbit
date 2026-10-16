// R17 申込設定：画面から切り離した純関数（字数・並べ替え・テンプレート・草稿入力の整形・「N分前」）。React なし、テストから直接呼ぶ。
import type { HostQuestionKind, HostSetupDraftInput, HostSetupQuestion, HostSetupResponse } from "../../../../../shared/contract/host-console";
import type { HostT } from "./host-model";

export const DESC_MAX = 200;
export const DESC_WARN = 180;
export const NOTE_MAX = 140;
export const QUESTION_MAX = 5;

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

const opts = (text: string) => text.split("|").map((item) => item.trim()).filter(Boolean);

/** テンプレートの質問（文案は copy 表；UI の言語で作る）。 */
export function templateQuestions(key: TemplateKey, t: HostT): HostSetupQuestion[] {
  const q = (prompt: string, kind: HostQuestionKind, options: string[], required: boolean): HostSetupQuestion => ({ id: newQuestionId(), kind, options, prompt, required });
  switch (key) {
    case "mixer": return [q(t("tqRole"), "single", opts(t("tqRoleOpts")), true), q(t("tqTopic"), "multiple", opts(t("tqTopicOpts")), true), q(t("tqMeet"), "free", [], false)];
    case "study": return [q(t("tqLevel"), "single", opts(t("tqLevelOpts")), true), q(t("tqInterest"), "multiple", opts(t("tqInterestOpts")), true)];
    case "round": return [q(t("tqIssue"), "free", [], true), q(t("tqShare"), "free", [], false)];
    case "blank": return [blankQuestion("single")];
  }
}

/** 質問案を足す（5 問まで、同じ文の質問は足さない）。 */
export function addSuggested(questions: readonly HostSetupQuestion[], suggested: readonly HostSetupQuestion[]): HostSetupQuestion[] {
  const have = new Set(questions.map((question) => question.prompt.trim()));
  const next = [...questions];
  for (const item of suggested) {
    if (next.length >= QUESTION_MAX) break;
    if (have.has(item.prompt.trim())) continue;
    next.push({ ...item, id: newQuestionId() });
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
