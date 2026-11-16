/**
 * resolveIntents() (设计稿 §3.2 第 1–3 步; agent-design AG06, PLANNER 易错边界 1–3): from the second layer's
 * intents (codes and offsets) to the card's operations, by code only.
 *
 * 1. Authorized lookup: people and to-dos are found in the authenticated account only (the domain
 *    registry's reads), never elsewhere; nothing from the model widens the scope.
 * 2. Disambiguation: several people of the name → ask once, sharing the question with the other parts of
 *    the message about the same person (AE-XL-002); several matching to-dos → ask which (AE-XL-003); a
 *    to-do with both a planned date and a due time and words that name neither → ask which field
 *    (AE-XL-004); "改" with no matching to-do → say it was not found, never a new to-do (AE-XL-009). A
 *    pronoun is the person named in the same message, else the one the conversation mentioned last
 *    inside the 60-minute window; with nothing to go on, code does not guess.
 * 3. The change: the date from the words, worked out with asOf and the time zone (propose/dates.ts); the
 *    to-do's current values are read for the card; a memo's body is the user's words, its actual contacts
 *    a subset of its links, the kind of contact read from the words where the words say it.
 *
 * Returns one outcome per part; the node turns them into statuses, questions and one card.
 */
import type { NamedRecordRef } from "../context/session-state";
import type { FirstLayerContext } from "../context/build";
import type { DomainScope, RecordView } from "../domains/types";
import { findContacts, clueSearchWords, nameTokens } from "../graph/nodes/resolve";
import type { AgentRecordAccess } from "../graph/deps";
import type { GraphPart } from "../graph/state";
import { emitTrace } from "../observability/trace";
import { isPronounClue } from "../route/decide";
import type { ReplyLanguage } from "../route/handoff-copy";
import { dayText, type CardLocale } from "../../agent/runtime/todo-operations";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import { instantOf, localDayOf, localTimeOf, resolveSaidDate } from "./dates";
import { WRITE_WORDS } from "./copy";
import type { StoredIntent } from "./schema";

export interface PartWrite {
  intents: StoredIntent[];
  /** What the user picked in a question of this request (ids and a field name only). */
  picks: { contact?: string; todo?: string; field?: "plannedDate" | "dueAt" };
  /** This part waits for the question another part asks (the same person), and goes on when it is answered. */
  waitsFor?: string | null;
  /** The operations of this part on the card, once frozen. */
  operationIds?: string[];
}

export type Candidate = NamedRecordRef & { detail?: string };

export type WriteQuestion =
  | { type: "contact"; clue: string; candidates: Candidate[] }
  | { type: "todo"; clue: string; candidates: Candidate[] }
  | { type: "field"; options: { field: "plannedDate" | "dueAt"; current: string }[] };

export type WriteOutcome =
  | { kind: "ready"; ops: (CardOperationIntent & { localId: string })[] }
  | { kind: "ask"; question: WriteQuestion }
  | { kind: "shares"; with: string }
  | { kind: "stop"; reason: string; line: string };

export interface ResolveContext {
  records: AgentRecordAccess | undefined;
  scope: DomainScope | null;
  message: string;
  asOf: string;
  timeZone: string;
  language: ReplyLanguage;
  context: FirstLayerContext | null;
  /** People bound or read in this request (id → name), in message order of the part that bound them. */
  people: { id: string; name: string; at: number }[];
  /** Person questions of this request: part → candidate ids (the read parts' and the earlier write parts'). */
  asked: Map<string, string[]>;
  /** Names known to the run (records read this turn, the context). */
  nameOf(id: string): string | null;
}

const words = (message: string, span: [number, number] | null | undefined) => (span ? message.slice(span[0], span[1]).trim() : "");

const DUE_WORDS = /(截止|期限|締め切り|締切|〆切|\bdue\b|deadline)/iu;
const PLAN_WORDS = /(计划|予定日|\bplanned\b|\bplan\b)/iu;
const ORDINAL = /(第\s*([一二三四五六七八九十\d]+)\s*[条个件项]?|([一二三四五六七八九十\d]+)\s*つ目|\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b)/iu;
const CJK_NUMBERS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const LATIN_ORDINALS: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, fifth: 5, first: 1, fourth: 4, second: 2, third: 3 };

function ordinalOf(text: string): number | null {
  const match = ORDINAL.exec(text);
  if (!match) return null;
  const raw = match[2] ?? match[3] ?? match[4] ?? "";
  if (/^\d+$/u.test(raw)) return Number(raw);
  return CJK_NUMBERS[raw] ?? LATIN_ORDINALS[raw.toLowerCase()] ?? null;
}

/** Instruction words around a memo body ("记一下：", "再记下", "Log that", "記録しておいて"). */
const BODY_LEAD = /^(再|也|还)?(帮我)?(记一下|记下来|记下|记录一下|记录下|记一笔|记个|记)[：:，,\s]*|^(please\s+)?(log|note|record)\s+(that\s+)?|^(メモして|記録して)[：:、\s]*/iu;
const BODY_TAIL = /(ことも|ことを)?(記録しておいて|記録して|メモしておいて|メモして)(ください)?[。.!！]*$|[。.!！]+$/u;

export function memoBodyOf(text: string): string {
  return text.trim().replace(BODY_LEAD, "").replace(BODY_TAIL, "").trim();
}

/** The kind of contact as the words say it (code decides where the words are clear; otherwise the model's code). */
export function contactKindOf(text: string): { channel?: "phone" | "meeting" | "message" | "email"; direction?: "incoming" | "outgoing" | "mutual" } {
  const channel = /(电话|電話|来电|來電|\bcall(ed|s|ing)?\b|\bphoned?\b|\brang\b)/iu.test(text) ? "phone"
    : /(邮件|メール|\be-?mail(ed|s)?\b)/iu.test(text) ? "email"
    : /(消息|微信|短信|メッセージ|LINE|\btext(ed)?\b|\bmessaged?\b)/iu.test(text) ? "message"
    : /(见面|见了|碰面|面谈|会った|会いました|面会|\bmet\b|\bmeeting\b)/iu.test(text) ? "meeting"
    : undefined;
  const outgoing = /(我(给|跟).{0,10}(打|发|写)|我打(给|了)|打给|に電話(した|をかけた)|\bI (called|phoned|rang|e-?mailed|texted|messaged)\b)/iu.test(text);
  const incoming = /(来电|来过电话|来电话|打来|打电话来|给我打|给我发|から(の)?(電話|連絡|メール|メッセージ)|電話があった|電話がありました|\b(called|phoned|rang|e-?mailed|texted|messaged) me\b|\b(he|she|they) (called|phoned|rang)\b|\bcalled\b)/iu.test(text);
  const direction = outgoing ? "outgoing" : incoming ? "incoming" : channel === "meeting" ? "mutual" : undefined;
  return { ...(channel ? { channel } : {}), ...(direction ? { direction } : {}) };
}

type PersonResult = { kind: "found"; id: string; name: string; detail?: string } | { kind: "ask"; clue: string; candidates: Candidate[] } | { kind: "shares"; with: string } | { kind: "none" } | { kind: "missing" } | { kind: "failed" };

async function resolvePerson(ctx: ResolveContext, part: GraphPart, write: PartWrite, clue: { quote: [number, number] | null; text: string }): Promise<PersonResult> {
  // A clue the first layer bound (a handle of the context, an @ reference, a click).
  const bound = part.refs.find((ref) => ref.entity === "contact" && ref.recordId && (!clue.quote || !ref.quote || (ref.quote[0] < clue.quote[1] && clue.quote[0] < ref.quote[1])));
  if (bound?.recordId) return { id: bound.recordId, kind: "found", name: ctx.nameOf(bound.recordId) ?? "" };
  const picked = write.picks.contact ? { id: write.picks.contact, kind: "found" as const, name: ctx.nameOf(write.picks.contact) ?? "" } : null;
  if (isPronounClue(clue.text)) {
    // A pronoun of a part that waited for a question about the person: the person picked.
    if (picked) return picked;
    const at = clue.quote?.[0] ?? part.quote[0];
    const before = ctx.people.filter((person) => person.at <= at).sort((left, right) => right.at - left.at);
    const named = before[0] ?? ctx.people[0];
    if (named) return { id: named.id, kind: "found", name: named.name };
    // The person named in this message is still being asked about: the same question answers this one.
    const asking = [...ctx.asked.keys()][0];
    if (asking) return { kind: "shares", with: asking };
    const last = ctx.context && !ctx.context.idle ? ctx.context.lastMentioned.find((item) => item.type === "contact" && item.accessible !== false) : undefined;
    if (last) return { id: last.id, kind: "found", name: last.name ?? "" };
    return { kind: "missing" };
  }
  if (!ctx.records || !ctx.scope) return { kind: "failed" };
  const { failed, matches } = await findContacts(ctx.records, ctx.scope, clue.text, words(ctx.message, part.quote), ctx.message);
  if (failed) return { kind: "failed" };
  if (!matches.length) return { kind: "none" };
  if (matches.length === 1) return { id: matches[0].id, kind: "found", name: matches[0].name };
  // Several of the name and the user picked one of them in this request's question.
  const chosen = picked ? matches.find((match) => match.id === picked.id) : undefined;
  if (chosen) return { id: chosen.id, kind: "found", name: chosen.name, ...(chosen.detail ? { detail: chosen.detail } : {}) };
  const ids = matches.map((match) => match.id).sort();
  for (const [partId, asked] of ctx.asked) {
    if (partId !== part.localId && asked.length === ids.length && [...asked].sort().every((id, index) => id === ids[index])) return { kind: "shares", with: partId };
  }
  return { candidates: matches.slice(0, 3).map((match) => ({ id: match.id, name: match.name, type: "contact", ...(match.detail ? { detail: match.detail } : {}) })), clue: clue.text, kind: "ask" };
}

interface TodoView { id: string; title: string; plannedDate: string | null; dueAt: string | null }

const todoOf = (view: RecordView): TodoView => ({ dueAt: typeof view.fields.dueAt === "string" ? view.fields.dueAt : null, id: view.id, plannedDate: typeof view.fields.plannedDate === "string" ? view.fields.plannedDate : null, title: String(view.fields.title ?? "") });

function whenText(todo: TodoView, locale: CardLocale, timeZone: string): string | null {
  if (todo.plannedDate) return dayText(todo.plannedDate, locale);
  if (todo.dueAt) return `${dayText(localDayOf(todo.dueAt, timeZone), locale)} ${localTimeOf(todo.dueAt, timeZone)}`;
  return null;
}

type TodoResult = { kind: "found"; todo: TodoView } | { kind: "ask"; clue: string; candidates: Candidate[] } | { kind: "none"; words: string } | { kind: "failed" };

async function resolveTodo(ctx: ResolveContext, part: GraphPart, write: PartWrite, intent: StoredIntent, personId: string | null, personWords: string[], inherited = false): Promise<TodoResult> {
  if (!ctx.records || !ctx.scope) return { kind: "failed" };
  const readOne = async (id: string) => (await ctx.records!.reader.read("todo", ctx.scope!, { id })).items[0] ?? null;
  try {
    const boundId = write.picks.todo ?? part.refs.find((ref) => ref.entity === "todo" && ref.recordId)?.recordId ?? null;
    if (boundId) {
      const view = await readOne(boundId);
      return view ? { kind: "found", todo: todoOf(view) } : { kind: "none", words: "" };
    }
    const clues = [...intent.selector.map((span) => words(ctx.message, span)), ...part.refs.filter((ref) => ref.entity === "todo").map((ref) => words(ctx.message, ref.quote))].filter(Boolean);
    // "第二条", "the second one": the list the conversation showed last (§3.10).
    const ordinal = clues.map(ordinalOf).find((value) => value !== null) ?? null;
    if (ordinal !== null && ctx.context && !ctx.context.idle) {
      const shown = ctx.context.shownList.filter((item) => item.type === "todo");
      const item = shown[ordinal - 1];
      if (item) {
        emitTrace({ ordinal, partId: part.localId, recordId: item.id, type: "propose.ordinal_bound" });
        const view = await readOne(item.id);
        if (view) return { kind: "found", todo: todoOf(view) };
      }
    }
    // Words to look for, in turn: the clue's own words ("约山本吃饭" is a title with the name in it), then the same
    // words without the person's name ("给小林寄合同" → "寄合同", "山本さんに原稿" → "原稿"). The first that finds wins.
    const searches: string[] = [];
    for (const clue of clues) {
      const whole = clueSearchWords(clue);
      let rest = clue;
      for (const name of personWords.flatMap((item) => nameTokens(item))) rest = rest.split(name).join("");
      rest = rest.replace(/^[\s给跟和对向为与のにとへ]+|[\s的のにと]+$/gu, "");
      for (const text of [whole, clueSearchWords(rest)]) if (text && !searches.includes(text)) searches.push(text);
    }
    // What the user called it, for saying it was not found (their words without "那条待办").
    const said = (clues[0] ? clueSearchWords(clues[0]) : undefined) ?? "";
    if (!searches.length && !personId) return { kind: "none", words: said };
    let found: TodoView[] = [];
    let search: string | undefined;
    // A person only inherited from the message narrows the search; when none of theirs matches, the words alone decide.
    const owners = inherited && searches.length ? [personId, null] : [personId];
    for (const owner of owners) {
      for (const text of searches.length ? searches : [undefined]) {
        const result = await ctx.records.reader.read("todo", ctx.scope, { limit: 10, status: "open", ...(owner ? { contactId: owner } : {}), ...(text ? { text } : {}) });
        found = result.items.map(todoOf);
        search = text;
        if (found.length) break;
      }
      if (found.length) break;
    }
    emitTrace({ found: found.map((item) => item.id), partId: part.localId, search: search ?? null, tried: searches, type: "propose.todo_lookup", withPerson: Boolean(personId) });
    if (!found.length) return { kind: "none", words: said || search || "" };
    if (found.length === 1) return { kind: "found", todo: found[0] };
    const exact = found.filter((item) => clues.includes(item.title));
    if (exact.length === 1) return { kind: "found", todo: exact[0] };
    const locale = ctx.language;
    return { candidates: found.slice(0, 3).map((item) => ({ detail: whenText(item, locale, ctx.timeZone) ?? undefined, id: item.id, name: item.title, type: "todo" })), clue: clues[0] ?? "", kind: "ask" };
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "propose.todo_lookup" });
    return { kind: "failed" };
  }
}

/** One part's intents → its card operations, a question, or code's sentence. */
export async function resolvePartIntents(ctx: ResolveContext, part: GraphPart, write: PartWrite): Promise<WriteOutcome> {
  const quote = words(ctx.message, part.quote);
  const language = ctx.language;
  const ops: (CardOperationIntent & { localId: string })[] = [];
  const stop = (reason: string, line: string): WriteOutcome => ({ kind: "stop", line, reason });
  const failedLine = language === "zh" ? `「${quote}」这次没能读到你的记录，所以没有改。并不代表没有这条记录，可以稍后再试。` : language === "ja" ? `「${quote}」は今回記録を読めなかったため、変更していません。記録がないという意味ではありません。少し後でもう一度お試しください。` : `"${quote}": your records could not be read this time, so nothing was changed. That does not mean the record is missing; please try again later.`;
  for (const intent of write.intents) {
    // The people of this item: the model's relations, else the first layer's person clues.
    const relationClues = intent.relations.map((relation) => ({ quote: relation.quote, role: relation.role, text: words(ctx.message, relation.quote) }));
    const refClues = part.refs.filter((ref) => ref.entity === "contact").map((ref) => ({ quote: ref.quote ?? null, role: (intent.capability === "memo.create" ? "actual_contact" : "about") as StoredIntent["relations"][number]["role"], text: words(ctx.message, ref.quote) || (ref.recordId ? ctx.nameOf(ref.recordId) ?? "" : "") }));
    const clues = relationClues.length ? relationClues : refClues.filter((clue) => clue.text || clue.quote === null);
    const people: { id: string; name: string; role: StoredIntent["relations"][number]["role"]; text: string; detail?: string }[] = [];
    for (const clue of clues) {
      const found = await resolvePerson(ctx, part, write, { quote: clue.quote, text: clue.text });
      if (found.kind === "found") {
        if (!people.some((person) => person.id === found.id)) people.push({ id: found.id, name: found.name, role: clue.role, text: clue.text, ...(found.detail ? { detail: found.detail } : {}) });
        continue;
      }
      if (clue.role === "mentioned") continue; // Only mentioned and not found or not certain: not linked, never guessed.
      if (found.kind === "ask") return { kind: "ask", question: { candidates: found.candidates, clue: found.clue, type: "contact" } };
      if (found.kind === "shares") return { kind: "shares", with: found.with };
      if (found.kind === "failed") return stop("read_failed", failedLine);
      if (found.kind === "missing") return stop("object_unclear", WRITE_WORDS.notWho(language, quote));
      return stop("person_not_found", WRITE_WORDS.notFoundPerson(language, quote));
    }
    const dateWords = words(ctx.message, intent.date);
    const date = dateWords ? resolveSaidDate(dateWords, ctx.asOf, ctx.timeZone) : null;
    if (intent.capability === "todo.update") {
      const person = people.find((item) => item.role !== "mentioned") ?? null;
      // No person named for the to-do: the one this message is about (picked in its question, or named before it).
      const inheritedId = person ? null : write.picks.contact ?? [...ctx.people].filter((known) => known.at <= part.quote[0]).sort((left, right) => right.at - left.at)[0]?.id ?? null;
      const todo = await resolveTodo(ctx, part, write, intent, person?.id ?? inheritedId, people.map((item) => item.text), Boolean(inheritedId));
      if (todo.kind === "failed") return stop("read_failed", failedLine);
      if (todo.kind === "ask") return { kind: "ask", question: { candidates: todo.candidates, clue: todo.clue, type: "todo" } };
      if (todo.kind === "none") return stop("object_not_found", WRITE_WORDS.notFoundTodo(language, quote, todo.words || null, person?.name || null));
      const target = todo.todo;
      const title = words(ctx.message, intent.title);
      const set: Record<string, string> = {};
      if (title && title !== target.title) set.title = title;
      if (dateWords || !title) {
        if (!date) return stop("date_unclear", WRITE_WORDS.dateUnclear(language, quote));
        // Which date field: the user's words decide; else the record's shape; both and no word → ask.
        const field = write.picks.field ?? (DUE_WORDS.test(quote) ? "dueAt" : PLAN_WORDS.test(quote) ? "plannedDate" : target.plannedDate && target.dueAt ? null : target.dueAt ? "dueAt" : "plannedDate");
        if (!field) {
          return { kind: "ask", question: { options: [
            { current: dayText(target.plannedDate!, language), field: "plannedDate" },
            { current: `${dayText(localDayOf(target.dueAt!, ctx.timeZone), language)} ${localTimeOf(target.dueAt!, ctx.timeZone)}`, field: "dueAt" },
          ], type: "field" } };
        }
        if (field === "plannedDate") set.plannedDate = date.day;
        else set.dueAt = instantOf(date.day, date.time ?? (target.dueAt ? localTimeOf(target.dueAt, ctx.timeZone) : "23:59"), ctx.timeZone);
      }
      ops.push({ capability: "todo.update", localId: intent.localId, partId: part.localId, set, targetId: target.id });
      ctx.people.push(...people.filter((item) => !ctx.people.some((known) => known.id === item.id)).map((item) => ({ at: part.quote[0], id: item.id, name: item.name })));
      continue;
    }
    if (intent.capability === "todo.create") {
      const title = words(ctx.message, intent.title);
      if (!title) return stop("title_missing", WRITE_WORDS.noTitle(language, quote));
      if (dateWords && !date) return stop("date_unclear", WRITE_WORDS.dateUnclear(language, quote));
      const set: Record<string, string> = { title };
      if (date) {
        if (DUE_WORDS.test(quote)) set.dueAt = instantOf(date.day, date.time ?? "23:59", ctx.timeZone);
        else set.plannedDate = date.day;
      }
      ops.push({ capability: "todo.create", localId: intent.localId, partId: part.localId, set });
      continue;
    }
    // memo.create: the user's words, the people, the day and the kind of contact.
    const body = words(ctx.message, intent.body) || memoBodyOf(quote);
    if (!body) return stop("body_missing", WRITE_WORDS.noTitle(language, quote));
    const said = contactKindOf(`${body} ${quote}`);
    const actual = people.filter((item) => item.role === "actual_contact");
    const actualPeople = actual.length ? actual : people.filter((item) => item.role !== "mentioned").slice(0, 1);
    const day = date?.day ?? resolveSaidDate(body, ctx.asOf, ctx.timeZone)?.day ?? localDayOf(ctx.asOf, ctx.timeZone);
    const contactIds = [...new Set(people.map((item) => item.id))];
    // A person picked among several of the name is named on the card with what told them apart.
    const names = Object.fromEntries(people.map((item) => [item.id, item.detail ? (language === "en" ? `${item.name || item.text} (${item.detail})` : `${item.name || item.text}（${item.detail}）`) : item.name || item.text]));
    const title = body.split(/(?<=[。.!！？?])\s*/u)[0].replace(/[。.!！]+$/u, "").slice(0, 40) || body.slice(0, 40);
    ops.push({
      capability: "memo.create",
      localId: intent.localId,
      partId: part.localId,
      set: {
        body,
        contactIds,
        ...(actualPeople.length ? { interaction: { actualContactIds: actualPeople.map((item) => item.id), channel: said.channel ?? intent.channel ?? "other", direction: said.direction ?? intent.direction ?? "mutual", occurredOn: day, precision: "day" as const } } : {}),
        names,
        title,
      },
    });
    ctx.people.push(...people.filter((item) => !ctx.people.some((known) => known.id === item.id)).map((item) => ({ at: part.quote[0], id: item.id, name: item.name })));
  }
  return { kind: "ready", ops };
}

/** "这条记成功了，再…", "if that works, then …", "できたら…": the user made this item wait for the one before. */
const WAIT_WORDS = /(成功了?(以后|之后|后)?[，,、\s]*(再|才)|记成功|存上了?[，,\s]*再|成功したら|できたら|成功してから|保存できたら|if (that|it) (works|succeeds|goes through)|once (that|it)('s| is| has been) (done|saved|logged)|after (that|it) (succeeds|is saved))/iu;

export function waitsForPrevious(message: string, previousEnd: number, part: GraphPart): boolean {
  return WAIT_WORDS.test(message.slice(previousEnd, part.quote[1]));
}
