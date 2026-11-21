/**
 * agent-design AG18-1 — old answers and withdrawn access (设计稿 §7「旧回答与撤权」).
 *
 * Reading a conversation's history (any client, the old App included) checks again, online, that every record an
 * answer was made from can still be read by this account. An answer made from a record that was deleted or can no longer
 * be read is not returned: its words are replaced by one plain sentence, and a result document loses its answer text,
 * its blocks and its basis line. What an offline client has already shown cannot be taken back (a known limit, §7).
 */
import type { AgentResultDocument } from "../../../shared/contract/agent-v1";
import { emitTrace } from "../observability/trace";

export type VisibleRefs = (refs: readonly string[]) => Promise<Set<string>>;

type Language = "zh" | "ja" | "en";
const WITHHELD: Record<Language, string> = {
  en: "This answer was made from a record that has been deleted or can no longer be opened, so it is no longer shown.",
  ja: "この回答のもとになった記録は削除されたか、開けなくなったため、表示しません。",
  zh: "这条回答用到的记录已经删除或不能再打开，内容不再显示。",
};
export const withheldAnswerText = (locale: unknown): string => WITHHELD[locale === "ja" || locale === "en" ? locale : "zh"];

/** The kinds of record the visibility check knows (a web page or another kind of ref is not a record of the account). */
const CHECKED_REF = /^(contact|memo|todo|schedule|event):[^:]+:/u;

interface HistoryMessage {
  role: string;
  text: string;
  recordRefs?: unknown;
}

const refsOf = (message: HistoryMessage): string[] => (Array.isArray(message.recordRefs) ? message.recordRefs.filter((ref): ref is string => typeof ref === "string" && CHECKED_REF.test(ref)) : []);

/** The session with every answer whose records cannot all be read now replaced by the plain sentence. */
export async function withholdRevokedAnswers<T extends { messages: readonly HistoryMessage[] }>(session: T, visible: VisibleRefs, locale?: unknown): Promise<{ session: T; withheld: number }> {
  const refs = [...new Set(session.messages.flatMap(refsOf))];
  if (!refs.length) return { session, withheld: 0 };
  const open = await visible(refs);
  let withheld = 0;
  const messages = session.messages.map((message) => {
    const own = refsOf(message);
    if (message.role !== "assistant" || !own.length || own.every((ref) => open.has(ref))) return message;
    withheld += 1;
    const { recordRefs: _dropped, ...rest } = message as HistoryMessage & Record<string, unknown>;
    return { ...rest, text: withheldAnswerText(locale) };
  });
  if (withheld) emitTrace({ type: "history.withheld", withheld });
  return { session: { ...session, messages } as T, withheld };
}

/** A result document whose answer cites a record that cannot be read now: no text, no blocks, no basis. */
export async function withholdRevokedDocument(document: AgentResultDocument, visible: VisibleRefs, locale?: unknown): Promise<AgentResultDocument> {
  const refs = (document.answer?.sourceRefs ?? []).filter((ref) => CHECKED_REF.test(ref));
  if (!document.answer || !refs.length) return document;
  const open = await visible(refs);
  if (refs.every((ref) => open.has(ref))) return document;
  emitTrace({ requestId: document.requestId, type: "history.withheld", withheld: 1 });
  return { ...document, answer: { sourceRefs: [], text: withheldAnswerText(locale) } };
}
