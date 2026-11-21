/**
 * agent-design AG20b (TRIAGE R13; 设计稿 §3.11 "一个子目标只问一次", §3.7/§3.10 an answer continues the open item): a part
 * that answers a question goes on with what was asked about. "白山さんの件、片付けておいて" → options → "フォローを完了にして":
 * the follow-up is the one of the person the question was about, not any follow-up.
 */
import { optionNamedIn } from "../clarify/attribution";
import type { FirstLayerContext } from "../context/build";
import type { StoredIntent } from "./schema";
import type { PartWrite } from "./resolve";
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

/**
 * AG21a (R26): what a write question keeps of the part it was asked for, so a typed answer that picks one of its options
 * goes on with that part — its words (the quote), its operations as offsets into those words, its object clues and what
 * was picked already. The user's own words and ids only; no record content.
 */
export interface AskedResume {
  quote: string;
  intents: StoredIntent[];
  refs: { entity: string; quote: [number, number] | null; recordId: string | null }[];
  picks: PartWrite["picks"];
}

type Span = [number, number];

/** A write part that asked a question: its resume, with every offset taken into its own words (none outside them). */
export function resumeOf(part: Pick<GraphPart, "quote" | "refs" | "route" | "write">, message: string): AskedResume | null {
  if (part.route !== "propose_write" || !part.write?.intents.length) return null;
  const [from, to] = part.quote;
  const inside = (span: Span | null | undefined): span is Span => Array.isArray(span) && span[0] >= from && span[1] <= to;
  const local = (span: Span): Span => [span[0] - from, span[1] - from];
  const one = (span: Span | null | undefined) => (inside(span) ? local(span) : undefined);
  const intents = part.write.intents.map((intent) => {
    const out: StoredIntent = { ...intent, relations: intent.relations.filter((relation) => inside(relation.quote)).map((relation) => ({ ...relation, quote: local(relation.quote) })), selector: intent.selector.filter(inside).map(local) };
    for (const key of ["title", "body", "date", "time", "venue", "note", "due", "zone", "duration"] as const) {
      const moved = one(intent[key]);
      if (moved) out[key] = moved;
      else delete out[key];
    }
    if (intent.events) out.events = intent.events.filter(inside).map(local);
    if (intent.values) out.values = Object.fromEntries(Object.entries(intent.values).filter(([, span]) => inside(span)).map(([field, span]) => [field, local(span as Span)]));
    return out;
  });
  return { intents, picks: { ...part.write.picks }, quote: message.slice(from, to), refs: part.refs.map((ref) => ({ entity: ref.entity, quote: ref.quote && inside(ref.quote) ? local(ref.quote) : null, recordId: ref.recordId ?? null })) };
}

const PLAN_PICK = /(计划|予定日|予定|\bplanned\b|\bplan\b)/iu;
const DUE_PICK = /(截止|到期|期限|締め切り|締切|〆切|\bdue\b|\bdeadline\b)/iu;

/**
 * AG21a (R26): the option of a write question a typed answer picks — a person by the words that tell them apart (R13's
 * rule), a to-do by its title, or a date field by its own word ("计划日", "截止", "期限", "due"). Null when it names none
 * or more than one (code does not guess).
 */
export function optionPickedIn(item: Pick<SessionOpenItem, "options" | "resume"> | null | undefined, words: string): { id: string; type: string } | null {
  if (!item?.resume || !item.options?.length || !words.trim()) return null;
  // AG21c (R26): the delete-plan question is answered by what to do (delete / move / keep / unlink), not by a label's name.
  if (item.options.every((option) => option.type === "event_plan")) {
    const id = deletePlanPickIn(item.options.map((option) => option.id), words);
    return id ? { id, type: "event_plan" } : null;
  }
  const named = optionNamedIn(item, words);
  if (named) return named;
  const fields = item.options.filter((option) => option.type === "field");
  const plan = PLAN_PICK.test(words);
  const due = DUE_PICK.test(words);
  if (fields.length && plan !== due) return fields.find((option) => option.id === (due ? "dueAt" : "plannedDate")) ?? null;
  return null;
}

/** "先不删了", "やめておく", "don't delete it": the event is kept (said with a negation, so read before the delete words). */
const PLAN_KEEP = /(先不删了?|不删了?|别删|不要删|不用删|算了|やめて?お?く|やめます|やめる|やめて|削除しない|消さない|\bdon'?t delete\b|\bdo not delete\b|\bnever ?mind\b|\bcancel\b|\bkeep (?:the |this |that )?event\b|\bleave it\b)/giu;
const PLAN_MOVE = /(转到|转去|移到|移去|挪到|换到|改到另一场|改挂到|別のイベントに|に移す|に移して|移動|\bmove\b|\bshift\b)/iu;
const PLAN_DELETE = /(删|刪|削除|消して|消す|\bdelete\b|\bremove\b|\berase\b)/iu;
const PLAN_UNLINK = /(解除|解绑|解綁|取消关联|不再关联|去掉关联|断开|紐付けを外|紐づけを外|紐付けだけ外|外す|外して|\bunlink\b|\bdetach\b|\bdisconnect\b)/iu;

/**
 * AG21c (R26): the option of the delete-plan question ("「我去过」一起删 / 转到另一场 / 先不删了", or "只解除关联 / 先不删了") a
 * typed answer takes, by what it says to do — exactly as a click on that option. Null when it says none, or two that
 * disagree (code does not guess; the question stays).
 */
export function deletePlanPickIn(ids: readonly string[], words: string): string | null {
  const keep = new RegExp(PLAN_KEEP.source, "iu").test(words);
  const rest = words.replace(PLAN_KEEP, " ");
  const move = PLAN_MOVE.test(rest);
  const remove = PLAN_DELETE.test(rest);
  const unlink = PLAN_UNLINK.test(rest);
  const offered = (id: string) => (ids.includes(id) ? id : null);
  if (ids.includes("delete_attendance") || ids.includes("move_attendance")) {
    if (move && !remove) return offered("move_attendance");
    if (remove && !move) return offered("delete_attendance");
    if (keep && !move && !remove && !unlink) return offered("keep");
    return null;
  }
  if ((unlink || remove) && !keep) return offered("unlink");
  if (keep && !unlink && !remove) return offered("keep");
  return null;
}

/**
 * AG21a (R26): the asked part as the resolver needs it — its own words as the message, its clues where they were — and the
 * picks: what the asked part had, what this answer named, what a later click adds. The part keeps its own id (the card's
 * items are this part's).
 */
export function resumedResolution<C extends { message: string; people: unknown[]; asked: Map<string, string[]> }>(ctx: C, part: GraphPart, resume: AskedResume, picks: PartWrite["picks"]): { ctx: C; part: GraphPart; write: PartWrite } {
  return {
    ctx: { ...ctx, asked: new Map(), message: resume.quote, people: [] },
    part: { ...part, continues: null, quote: [0, resume.quote.length], refs: resume.refs.map((ref) => ({ entity: ref.entity as GraphPart["refs"][number]["entity"], quote: ref.quote, recordId: ref.recordId })) },
    write: { intents: resume.intents, picks: { ...resume.picks, ...picks } },
  };
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
