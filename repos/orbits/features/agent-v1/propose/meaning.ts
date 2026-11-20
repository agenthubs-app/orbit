/**
 * agent-design AG20b (owner decision 6, 2026-11-20; TP-TDN-007 shape "nda" against 「寄回签好的保密协议」): a to-do named in
 * another language than its title. When nothing matches by the words, the account's to-dos whose titles are in another
 * script are given to the judgment model's calibrated `match.level` (设计稿 §3.8, one request) with the user's words as the
 * basis; those it rates "match" are offered as candidates to click, open and completed alike, with their state — a
 * candidate, never a match: nothing is changed until the user picks one and confirms the card. No key, not sure, below the
 * threshold: no candidates (the not-found line stays).
 */
import type { JudgmentAccess, JudgmentBudget } from "../judgment/ask";
import { askJudgment } from "../judgment/ask";
import { rankJudgmentInput } from "../judgment/funnel";
import type { DomainScope, RecordView } from "../domains/types";
import type { AgentRecordAccess } from "../graph/deps";
import { emitTrace } from "../observability/trace";
import type { ReplyLanguage } from "../route/handoff-copy";

export interface MeaningContext {
  records: AgentRecordAccess | undefined;
  scope: DomainScope | null;
  language: ReplyLanguage;
  judgment?: JudgmentAccess | null;
  judgmentBudget?: JudgmentBudget;
  requestId?: string;
}

type Script = "latin" | "kana" | "han";
function scriptOf(text: string): Script | null {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "kana";
  if (/\p{Script=Han}/u.test(text)) return "han";
  return /[A-Za-z]/u.test(text) ? "latin" : null;
}

const STATE_WORDS: Record<ReplyLanguage, Record<"open" | "completed", string>> = {
  en: { completed: "done", open: "not done" },
  ja: { completed: "完了", open: "未完了" },
  zh: { completed: "已完成", open: "没做完" },
};

/** Up to three to-dos whose meaning matches the words, as question candidates ({ id, name, detail: state }). */
export async function todosByMeaning(ctx: MeaningContext, clue: string, statuses: readonly ("open" | "completed")[], partId: string): Promise<{ id: string; name: string; type: "todo"; detail: string }[]> {
  // Latin words inside Chinese or Japanese pointer words ("supplier NDA 那条", "NDAのToDo") are what names the to-do.
  const latin = (clue.match(/[A-Za-z][A-Za-z0-9 .'’&-]*/gu) ?? []).join(" ").replace(/\s+/gu, " ").trim();
  const words = latin && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(clue) ? latin : clue.trim();
  const said = scriptOf(words);
  if (!said || !ctx.records || !ctx.scope || !ctx.judgment || !ctx.judgmentBudget || [...words.trim()].length < 2) return [];
  const views: RecordView[] = [];
  try {
    for (const status of statuses) views.push(...(await ctx.records.reader.read("todo", ctx.scope, { limit: 10, order: "newest", status })).items);
  } catch {
    return [];
  }
  const other = views.filter((view) => {
    const script = scriptOf(String(view.fields.title ?? ""));
    return script && script !== said;
  });
  if (!other.length) return [];
  const keyed = other.map((view, index) => ({ key: `t${index + 1}`, view }));
  const outcome = await askJudgment(ctx.judgment, ctx.judgmentBudget, {
    input: rankJudgmentInput(ctx.language, words, keyed.map(({ key, view }) => ({ key, text: `to-do "${String(view.fields.title ?? "")}" (${String(view.fields.status ?? "open")})` }))),
    items: keyed.map(({ key }) => ({ key, question: "match.level" as const, subject: key })),
    language: ctx.language,
    purpose: "rank",
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
  });
  const matched = keyed.filter(({ key }) => {
    const verdict = outcome.verdicts.get(key);
    return verdict?.answer === "match" && !verdict.fallback;
  });
  emitTrace({ judged: keyed.length, matched: matched.map(({ view }) => view.id), partId, type: "propose.todo_by_meaning" });
  return matched.slice(0, 3).map(({ view }) => ({ detail: STATE_WORDS[ctx.language][view.fields.status === "completed" ? "completed" : "open"], id: view.id, name: String(view.fields.title ?? ""), type: "todo" as const }));
}
