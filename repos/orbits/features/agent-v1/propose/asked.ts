/**
 * agent-design AG20b (TRIAGE R13; 设计稿 §3.11 "一个子目标只问一次", §3.7/§3.10 an answer continues the open item): a part
 * that answers a question goes on with what was asked about. "白山さんの件、片付けておいて" → options → "フォローを完了にして":
 * the follow-up is the one of the person the question was about, not any follow-up.
 */
import type { FirstLayerContext } from "../context/build";
import type { SessionOpenItem } from "../context/session-state";
import type { DomainScope } from "../domains/types";
import type { AgentRecordAccess } from "../graph/deps";
import { findContacts } from "../graph/nodes/resolve";
import type { GraphPart } from "../graph/state";
import { emitTrace } from "../observability/trace";
import { isPronounClue } from "../route/decide";

interface AskedContext {
  records: AgentRecordAccess | undefined;
  scope: DomainScope | null;
  context: FirstLayerContext | null;
}

/** The open question this part answers, when it continues one. */
export function continuedItem(ctx: Pick<AskedContext, "context">, part: Pick<GraphPart, "continues">): SessionOpenItem | null {
  return part.continues?.kind === "clarification" ? ctx.context?.openItems.find((item) => item.ref === part.continues!.ref) ?? null : null;
}

/**
 * The person of the question this part answers: the asked part's person clue, found again in the account — only when it
 * names exactly one person by name (never a guess, never one found only by company).
 */
export async function askedPerson(ctx: AskedContext, part: Pick<GraphPart, "continues" | "localId">): Promise<string | null> {
  const item = continuedItem(ctx, part);
  const said = item?.clues?.find((clue) => clue.entity === "contact" && !isPronounClue(clue.text))?.text;
  if (!said || !ctx.records || !ctx.scope) return null;
  const found = await findContacts(ctx.records, ctx.scope, said, item?.quote ?? said, item?.quote ?? said).catch(() => null);
  const only = found && !found.failed && found.matches.length === 1 && !found.matches[0].partial && !found.matches[0].byCompany ? found.matches[0] : null;
  if (only) emitTrace({ partId: part.localId, recordId: only.id, type: "propose.asked_person_inherited" });
  return only?.id ?? null;
}
