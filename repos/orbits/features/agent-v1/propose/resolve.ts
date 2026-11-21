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
import { findContacts, clueSearchWords, nameTokens, partialContacts } from "../graph/nodes/resolve";
import type { AgentRecordAccess } from "../graph/deps";
import type { GraphPart } from "../graph/state";
import { emitTrace } from "../observability/trace";
import { isPronounClue } from "../route/decide";
import { optionNamedIn } from "../clarify/attribution";
import { askedPerson, continuedItem, type AskedResume } from "./asked";
import { todosByMeaning } from "./meaning";
import type { JudgmentAccess, JudgmentBudget } from "../judgment/ask";
import type { ReplyLanguage } from "../route/handoff-copy";
import { dayText, type CardLocale } from "../../agent/runtime/todo-operations";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import { instantOf, localDayOf, localTimeOf, resolveSaidDate } from "./dates";
import { resolveSaidTimes } from "./times";
import { WRITE_WORDS } from "./copy";
import type { StoredIntent } from "./schema";
import { CONTACT_WORDS } from "../domains/contact/copy";
import { importTableOf, ImportTableRejected, previewImport, withHeader } from "../domains/contact/import-preview";
import { isEventIntent, resolveEventIntent, type EventResolveExtras } from "./events-resolve";
import type { ContactEffect, ContactFieldName } from "../domains/contact/types";

export interface PartWrite {
  intents: StoredIntent[];
  /** What the user picked in a question of this request (ids and a field name only). */
  picks: { contact?: string; todo?: string; field?: "plannedDate" | "dueAt"; /** AG08: the answer to "is it the same occasion": "new", or the existing memo's id. */ duplicate?: string; /** AG13: the event picked ("platform:<id>" / "private:<id>"), and what to do with a private event's links before deleting it. */ event?: string; eventPlan?: string };
  /** This part waits for the question another part asks (the same person), and goes on when it is answered. */
  waitsFor?: string | null;
  /** The operations of this part on the card, once frozen. */
  operationIds?: string[];
  /** AG21a (R26): this part answers a write question by naming an option: the asked part, resolved again with the pick. */
  resume?: AskedResume;
}

export type Candidate = NamedRecordRef & { detail?: string };

export type WriteQuestion =
  | { type: "contact"; clue: string; candidates: Candidate[] }
  | { type: "todo"; clue: string; candidates: Candidate[]; /** AG06 repair 1: none matched the words; these are the person's. */ notFound?: string }
  | { type: "field"; options: { field: "plannedDate" | "dueAt"; current: string }[] }
  /** AG13: which event the words mean. */
  | { type: "event"; clue: string; candidates: Candidate[] }
  /** AG13 (D7): a private event still linked to — list the links, offer what to do. */
  | { type: "event_plan"; line: string; hasAttendance: boolean; options: { id: string; label: string }[] };

export type WriteOutcome =
  | { kind: "ready"; ops: (CardOperationIntent & { localId: string })[] }
  | { kind: "ask"; question: WriteQuestion }
  | { kind: "shares"; with: string }
  | { kind: "stop"; reason: string; line: string }
  /** AG13: an item of this part is made by another part's plan (deleting a private event): nothing of its own. */
  | { kind: "covered" };

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
  /** AG13: the extras of the event resolver (propose/events-resolve.ts). */
  names?: EventResolveExtras["names"];
  createdEvents?: EventResolveExtras["createdEvents"];
  deleting?: boolean;
  /** AG14 (AG11 交接): the events picked with @ in this turn, looked at before the whole directory. */
  pickedEvents?: EventResolveExtras["pickedEvents"];
  /** AG20b (owner decision 6): the judgment step and this round's budget, for to-dos named in another language. */
  judgment?: JudgmentAccess | null;
  judgmentBudget?: JudgmentBudget;
  requestId?: string;
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

const squashed = (text: string) => text.toLowerCase().replace(/[\s，,。.、；;：:！!？?「」『』"“”'’()（）]/gu, "");

/**
 * AG21c (R55): the note's body — the model's span when it holds every clause of the user's own words (their sentence without
 * "记一下："), else those words themselves. "她今天来电话，说一月要调去东京办公室" never becomes "She called me today."
 */
export function memoBodyKeepingClauses(modelBody: string, said: string): string {
  if (!said) return modelBody;
  // A clause that asks for another write ("再建个待办", "remind me Friday") is that write's, not the note's.
  const pieces = said.split(/(?<=[，,；;。.!！？?\n])/u).filter((piece) => !INSTRUCTION_CLAUSE.test(piece));
  const own = pieces.join("").replace(/[，,；;]+$/u, "").trim() || said;
  if (!modelBody) return own;
  const clauses = pieces.map(squashed).filter((clause) => [...clause].length >= 2);
  const body = squashed(modelBody);
  return clauses.every((clause) => body.includes(clause)) ? modelBody : own;
}

const INSTRUCTION_CLAUSE = /(待办|提醒我|建个|建一个|加个|加一个|改到|改成|删掉|删了|ToDo|TODO|タスク|リマインド|\bremind me\b|\bto-?dos?\b|\bcreate\b|\badd (?:a|an)\b|\bschedule\b)/iu;

const RELATIVE_DAY = /(今天上午|今天下午|今天晚上|今天|昨天|前天|今早|今晚|昨晚|刚才|刚刚|今日の?|昨日の?|一昨日の?|今朝|さっき|\btoday\b|\byesterday\b|\btonight\b|\bthis (?:morning|afternoon|evening)\b|\bjust now\b)/giu;

/** AG21c (R55): a title without its relative day words ("小林健今天来过电话" → "小林健来过电话"); the day is the date field. */
export function withoutRelativeDay(title: string): string {
  return title.replace(RELATIVE_DAY, " ").replace(/\s{2,}/gu, " ").replace(/\s+([，,。.、])/gu, "$1").replace(/^[\s，,、]+|[\s，,、]+$/gu, "").replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "").trim();
}

/** AG21c (R55): the first pronoun of the clue replaced by the contact's name ("她今天来电话" → "林美咲今天来电话", "She called" → "Emily called"). */
export function replacePronoun(text: string, pronoun: string, name: string): string {
  const clean = pronoun.replace(/^@/u, "").trim();
  if (!clean) return text;
  if (/^[\x20-\x7e]+$/u.test(clean)) return text.replace(new RegExp(`\\b${clean.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "iu"), name);
  return text.includes(clean) ? text.replace(clean, name) : text;
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

/** The people a pronoun may mean after a pause: the contact mentioned last (first), then the people of the to-dos named. */
async function pronounCandidates(ctx: ResolveContext, part: GraphPart): Promise<Candidate[]> {
  if (!ctx.context?.idle || !ctx.records || !ctx.scope) return [];
  const out: Candidate[] = [];
  const add = (id: string, name: string) => {
    if (id && name && !out.some((item) => item.id === id)) out.push({ id, name, type: "contact" });
  };
  for (const item of ctx.context.lastMentionedForCode.filter((entry) => entry.type === "contact")) add(item.id, item.name);
  const todoWords = part.refs.filter((ref) => ref.entity === "todo").map((ref) => words(ctx.message, ref.quote)).map((text) => text.replace(/^(?:his|her|their|my|the)\s+/iu, "").replace(/^[他她]的/u, "")).filter((text) => text.length >= 3);
  for (const text of todoWords.slice(0, 2)) {
    const found = await ctx.records.reader.read("todo", ctx.scope, { limit: 10, status: "open", text }).catch(() => null);
    for (const view of found?.items ?? []) {
      const ids = Array.isArray(view.fields.contactIds) ? (view.fields.contactIds as string[]) : typeof view.fields.contactId === "string" ? [view.fields.contactId] : [];
      const first = ids[0];
      if (!first || out.some((item) => item.id === first)) continue;
      const contact = (await ctx.records.reader.read("contact", ctx.scope, { id: first }).catch(() => null))?.items[0];
      if (contact) add(first, String(contact.fields.displayName ?? ""));
    }
  }
  if (out.length) emitTrace({ candidates: out.map((item) => item.id), partId: part.localId, type: "propose.pronoun_candidates" });
  return out.slice(0, 3);
}

type PersonResult = { kind: "found"; id: string; name: string; detail?: string } | { kind: "ask"; clue: string; candidates: Candidate[] } | { kind: "shares"; with: string } | { kind: "none" } | { kind: "missing" } | { kind: "failed" };

export async function resolvePerson(ctx: ResolveContext, part: GraphPart, write: PartWrite, clue: { quote: [number, number] | null; text: string }): Promise<PersonResult> {
  // A clue the first layer bound (a handle of the context, an @ reference, a click).
  const bound = part.refs.find((ref) => ref.entity === "contact" && ref.recordId && (!clue.quote || !ref.quote || (ref.quote[0] < clue.quote[1] && clue.quote[0] < ref.quote[1])));
  if (bound?.recordId) return { id: bound.recordId, kind: "found", name: ctx.nameOf(bound.recordId) ?? "" };
  const picked = write.picks.contact ? { id: write.picks.contact, kind: "found" as const, name: ctx.nameOf(write.picks.contact) ?? "" } : null;
  // AG20b (TRIAGE R13): a typed answer to "which one" that names an offered person by what tells them apart ("蒲公英那个").
  const asked = continuedItem(ctx, part);
  const named = asked ? optionNamedIn(asked, clue.text, "contact") ?? (isPronounClue(clue.text) || !clue.text.trim() ? optionNamedIn(asked, words(ctx.message, part.quote), "contact") : null) : null;
  if (named) {
    emitTrace({ partId: part.localId, recordId: named.id, type: "propose.option_named" });
    return { id: named.id, kind: "found", name: ctx.nameOf(named.id) ?? named.label.replace(/[（(].*$/u, "").trim() };
  }
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
    // AG13 (AE-SCL-012, §3.10): after a long pause the person mentioned last is not taken — but offered first, with the
    // people of the to-dos the words name ("his reference check"), in one question. Never picked by code.
    const offered = await pronounCandidates(ctx, part);
    if (offered.length) return { candidates: offered, clue: clue.text, kind: "ask" };
    return { kind: "missing" };
  }
  if (!ctx.records || !ctx.scope) return { kind: "failed" };
  const { failed, matches } = await findContacts(ctx.records, ctx.scope, clue.text, words(ctx.message, part.quote), ctx.message);
  if (failed) return { kind: "failed" };
  // AG06 repair 1 (AE-XL-010): a nickname matching contacts only partially is a question, never a guess or a "not found".
  if (!matches.length) matches.push(...(await partialContacts(ctx.records, ctx.scope, clue.text)));
  if (!matches.length) return { kind: "none" };
  // AG20b (R10): one found only by the company the words name is offered in a question, never written on by a guess.
  if (matches.length === 1 && !matches[0].partial && !matches[0].byCompany) return { id: matches[0].id, kind: "found", name: matches[0].name };
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

/**
 * AG07: the user's words are the title's characters in order with only a few left out ("回复田中询价" in
 * 「回复田中的询价」): at least four characters said, and at most a quarter of the title missing.
 */
export function fitsInOrder(words: string, title: string): boolean {
  const said = [...words.replace(/[\s、，。・,.!?！？「」『』"“”]/gu, "")];
  const chars = [...title.replace(/\s+/gu, "")];
  if (said.length < 4 || said.length > chars.length || chars.length - said.length > Math.max(1, Math.floor(chars.length / 4))) return false;
  let at = 0;
  for (const char of chars) if (at < said.length && char === said[at]) at += 1;
  return at === said.length;
}

type Script = "latin" | "kana" | "han";

function scriptOf(text: string): Script | null {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "kana";
  if (/\p{Script=Han}/u.test(text)) return "han";
  return /[A-Za-z]/u.test(text) ? "latin" : null;
}

/**
 * AG13 gate run-02 (AE-EVT-012): the second layer wrote a new to-do as a create plus an update of that same to-do
 * ("给王强回电话": create, then link 王强). A to-do update in the same part whose words are the new to-do's title, and
 * that only adds people, is folded into the create (its people go on the new to-do); the rest stay as written.
 */
export function foldIntoCreates(intents: readonly StoredIntent[], message: string, partId?: string): StoredIntent[] {
  const text = (span: [number, number] | undefined) => (span ? message.slice(span[0], span[1]).trim() : "");
  const out = intents.map((intent) => ({ ...intent, relations: [...intent.relations] }));
  const dropped = new Set<StoredIntent>();
  for (const update of out) {
    if (update.capability !== "todo.update" || update.date || update.title || update.events?.length || !update.relations.length) continue;
    const create = out.find((other) => other.capability === "todo.create" && !dropped.has(other) && text(other.title) && update.selector.some((span) => text(span) === text(other.title)));
    if (!create) continue;
    for (const relation of update.relations) if (!create.relations.some((known) => known.quote[0] === relation.quote[0] && known.quote[1] === relation.quote[1])) create.relations.push(relation);
    dropped.add(update);
    emitTrace({ into: create.localId, localId: update.localId, partId: partId ?? null, type: "propose.update_folded_into_create" });
  }
  return out.filter((intent) => !dropped.has(intent));
}

/**
 * AG13 (AE-SCL-010): Japanese words that leave out the kana of a title ("益子陶器市搬入手配" for 「益子陶器市の搬入を手配する」):
 * the title's kanji and katakana hold the words' kanji and katakana in order (at least four of them).
 */
export function fitsWithoutKana(words: string, title: string): boolean {
  const strip = (text: string) => text.replace(/[\p{Script=Hiragana}\s、，。・,.!?！？「」『』（）()"“”]/gu, "");
  const said = strip(words);
  if ([...said].length < 4 || !/[\p{Script=Hiragana}]/u.test(title)) return false;
  return strip(title).includes(said);
}

/** AG07: words and a title written in different scripts (English or Japanese words, a Chinese title …). */
export function otherScript(words: string, title: string): boolean {
  const left = scriptOf(words);
  const right = scriptOf(title);
  return Boolean(left && right && left !== right);
}

type TodoResult ={ kind: "found"; todo: TodoView } | { kind: "ask"; clue: string; candidates: Candidate[]; notFound?: string } | { kind: "none"; words: string } | { kind: "failed" };

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
      // AG20b (R2): the words as said come first, so a title said exactly is always found (the search folds spaces,
      // 的/の, width and case on both sides); then the words without pointers and kind words, then without the name.
      const said = clue.replace(/^@/u, "").trim();
      // Only words that name something ("她的待办" names no title: the person's to-dos are read instead).
      for (const text of [whole && [...said].length >= 2 ? said : undefined, whole, clueSearchWords(rest)]) if (text && !searches.includes(text)) searches.push(text);
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
    // AG07 stab2 (AE-UIX-002): the words are a title with a few characters left out ("回复田中询价" for 「回复田中的询价」),
    // whether or not a person was given: the open to-dos that start like the words are checked character by character,
    // and only a single one that fits is taken.
    if (!found.length) {
      const fitting = new Map<string, TodoView>();
      for (const text of searches) {
        const head = [...text].slice(0, 2).join("");
        if ([...text].length < 4 || !head) continue;
        const near = (await ctx.records.reader.read("todo", ctx.scope, { limit: 10, status: "open", text: head })).items.map(todoOf);
        // AG13 (AE-SCL-010): several fit without their kana ("益子陶器市搬入手配" fits both 搬入 to-dos): ask which.
        const kanaFits = near.filter((item) => fitsWithoutKana(text, item.title));
        if (kanaFits.length > 1) {
          emitTrace({ found: kanaFits.map((item) => item.id), partId: part.localId, rule: "title_without_kana", type: "propose.todo_lookup" });
          return { candidates: kanaFits.slice(0, 3).map((item) => ({ detail: whenText(item, ctx.language, ctx.timeZone) ?? undefined, id: item.id, name: item.title, type: "todo" })), clue: clues[0] ?? "", kind: "ask" };
        }
        for (const item of near) if (fitsInOrder(text, item.title) || fitsWithoutKana(text, item.title)) fitting.set(item.id, item);
      }
      if (fitting.size === 1) {
        const [only] = fitting.values();
        emitTrace({ partId: part.localId, recordId: only.id, rule: "title_in_order", type: "propose.todo_matched" });
        return { kind: "found", todo: only };
      }
    }
    if (!found.length && personId && searches.length) {
      // AG06 repair 1 (AE-CTX-005, AE-XL-009 "可以问是不是指这一条"): the words match none of the person's open to-dos
      // (a title written in another language, other words): their to-dos are offered in a question, never picked.
      const theirs = (await ctx.records.reader.read("todo", ctx.scope, { contactId: personId, limit: 10, status: "open" })).items.map(todoOf);
      // AG07 (AE-UIX-002): the words are the title with a few characters left out ("回复田中询价" → 「回复田中的询价」).
      const inOrder = theirs.filter((item) => searches.some((text) => fitsInOrder(text, item.title)));
      if (inOrder.length === 1) {
        emitTrace({ partId: part.localId, recordId: inOrder[0].id, rule: "title_in_order", type: "propose.todo_matched" });
        return { kind: "found", todo: inOrder[0] };
      }
      // AG07 (AE-UIX-007, AE-UIX-008): words in another script than the title cannot be compared with it; the person's
      // one open to-do is the one meant (the card names it by its title and still needs a click).
      const names = personWords.flatMap((item) => nameTokens(item));
      // AG08 repair 2 (AE-UIX-008): a clue that is only the person's name ("Li Wei") says nothing about which to-do; the
      // clues that are left decide.
      const about = clues.map((clue) => names.reduce((rest, name) => rest.split(name).join(""), clue).trim()).filter((rest) => /[\p{L}\p{N}]/u.test(rest));
      if (theirs.length === 1 && about.length && about.every((rest) => otherScript(rest, theirs[0].title))) {
        emitTrace({ partId: part.localId, recordId: theirs[0].id, rule: "only_open_todo_other_script", type: "propose.todo_matched" });
        return { kind: "found", todo: theirs[0] };
      }
      emitTrace({ offered: theirs.map((item) => item.id), partId: part.localId, type: "propose.todo_offered" });
      if (theirs.length) return { candidates: theirs.slice(0, 3).map((item) => ({ detail: whenText(item, ctx.language, ctx.timeZone) ?? undefined, id: item.id, name: item.title, type: "todo" })), clue: clues[0] ?? "", kind: "ask", notFound: said || search || "" };
    }
    if (!found.length) {
      // AG20b (owner decision 6): words in another language than the titles — the to-dos whose meaning matches, to click.
      const meant = searches[0] ? await todosByMeaning(ctx, clues[0] ?? searches[0], ["open", "completed"], part.localId) : [];
      if (meant.length) return { candidates: meant, clue: clues[0] ?? "", kind: "ask", notFound: said || search || "" };
      return { kind: "none", words: said || search || "" };
    }
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
  let covered = false;
  for (const given of foldIntoCreates(write.intents, ctx.message, part.localId)) {
    let intent = given;
    // AG13: private events, «我去过», schedule items, the other to-do verbs and to-do links (propose/events-resolve.ts).
    if (isEventIntent(intent, quote)) {
      const outcome = await resolveEventIntent(ctx, part, write, intent);
      if (outcome.kind === "covered") {
        covered = true;
        continue;
      }
      // AG13 (AE-SCL-012): "move his reference check to Thursday" read as a schedule item: none is named so, so it is the
      // to-do the words name (a to-do's date), never "not in your schedule" when a to-do is meant.
      if (outcome.kind === "stop" && outcome.reason === "object_not_found" && intent.capability === "schedule.update" && intent.date) {
        emitTrace({ partId: part.localId, type: "propose.schedule_as_todo" });
        intent = { ...intent, capability: "todo.update" };
      } else {
        if (outcome.kind !== "ready") return outcome;
        ops.push(...outcome.ops);
        continue;
      }
    }
    // AG12: contact writes (create, update, delete, restore, import).
    if (intent.capability.startsWith("contact.")) {
      const outcome = await resolveContactIntent(ctx, part, write, intent, failedLine);
      if (outcome.kind !== "ready") return outcome;
      ops.push(...outcome.ops);
      continue;
    }
    // The people of this item: the model's relations, else the first layer's person clues.
    const relationClues = intent.relations.map((relation) => ({ quote: relation.quote, role: relation.role, text: words(ctx.message, relation.quote) }));
    const refClues = part.refs.filter((ref) => ref.entity === "contact").map((ref) => ({ quote: ref.quote ?? null, role: (intent.capability === "memo.create" ? "actual_contact" : "about") as StoredIntent["relations"][number]["role"], text: words(ctx.message, ref.quote) || (ref.recordId ? ctx.nameOf(ref.recordId) ?? "" : "") }));
    const clues = relationClues.length ? relationClues : refClues.filter((clue) => clue.text || clue.quote === null);
    const people: { id: string; name: string; role: StoredIntent["relations"][number]["role"]; text: string; detail?: string }[] = [];
    const nameOfContact = async (id: string, known: string) => known || ctx.nameOf(id) || (ctx.records && ctx.scope ? String((await ctx.records.reader.read("contact", ctx.scope, { id }).catch(() => null))?.items[0]?.fields.displayName ?? "") : "");
    for (const clue of clues) {
      const found = await resolvePerson(ctx, part, write, { quote: clue.quote, text: clue.text });
      if (found.kind === "found") {
        // AG06 repair 1 (AE-XL-003): the name is the contact's own; a pronoun is never written on a card.
        if (!people.some((person) => person.id === found.id)) people.push({ id: found.id, name: await nameOfContact(found.id, found.name), role: clue.role, text: clue.text, ...(found.detail ? { detail: found.detail } : {}) });
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
      let person: (typeof people)[number] | null = people.find((item) => item.role !== "mentioned") ?? null;
      // AG13 regression rerun (AE-UIX-008): the first layer left out the contact clue, but the to-do words name a person
      // in Latin letters ("the to-do about sending Li Wei the sample prints"): a name that is surely a contact is the person.
      if (!person && !people.length) {
        for (const span of intent.selector) {
          const clue = words(ctx.message, span);
          const name = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/u.exec(clue)?.[0];
          if (!name || !span) continue;
          const at = ctx.message.indexOf(name, span[0]);
          const found = await resolvePerson(ctx, part, write, { quote: at >= 0 ? [at, at + name.length] : null, text: name });
          if (found.kind !== "found") continue;
          emitTrace({ name, partId: part.localId, recordId: found.id, type: "propose.person_in_todo_words" });
          person = { id: found.id, name: await nameOfContact(found.id, found.name), role: "about", text: name };
          people.push(person);
          break;
        }
      }
      // No person named for the to-do: the one this message is about (picked in its question, or named before it).
      // AG20b (R13): a part that answers a question goes on with the asked part's person.
      const inheritedId = person ? null : write.picks.contact ?? [...ctx.people].filter((known) => known.at <= part.quote[0]).sort((left, right) => right.at - left.at)[0]?.id ?? (await askedPerson(ctx, part));
      const todo = await resolveTodo(ctx, part, write, intent, person?.id ?? inheritedId, people.map((item) => item.text), Boolean(inheritedId));
      if (todo.kind === "failed") return stop("read_failed", failedLine);
      if (todo.kind === "ask") return { kind: "ask", question: { candidates: todo.candidates, clue: todo.clue, type: "todo", ...(todo.notFound !== undefined ? { notFound: todo.notFound } : {}) } };
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
      // AG20a R7 (§3.5 "'周五给'与'最迟周五给'保留计划日与截止日的差异"): a day to do it and a deadline, each kept.
      const when = plannedAndDue(quote, dateWords, words(ctx.message, intent.due), ctx);
      if (when.plannedDate) set.plannedDate = when.plannedDate;
      if (when.dueAt) set.dueAt = when.dueAt;
      if (!when.plannedDate && !when.dueAt && date) {
        if (DUE_WORDS.test(quote)) set.dueAt = instantOf(date.day, date.time ?? "23:59", ctx.timeZone);
        else set.plannedDate = date.day;
      }
      if (when.plannedDate && when.dueAt) emitTrace({ partId: part.localId, type: "propose.todo_planned_and_due" });
      // AG13: a new to-do linked to the people it is about ("关联王强"), named on the card.
      const about = people.filter((item) => item.role !== "mentioned");
      const shown = { ...(about.length ? { names: Object.fromEntries(about.map((item) => [item.id, item.name])) } : {}), ...(when.dueDayOnly ? { dueDayOnly: true } : {}) };
      ops.push({ capability: "todo.create", localId: intent.localId, partId: part.localId, set: { ...set, ...(about.length ? { relatedContactIds: about.map((item) => item.id) } : {}) }, ...(Object.keys(shown).length ? { shown } : {}) } as CardOperationIntent & { localId: string });
      continue;
    }
    // memo.create: the user's words, the people, the day and the kind of contact.
    // AG21c (R55): the body keeps every clause of the user's own words — the model's span is used only when it holds them all.
    const body = memoBodyKeepingClauses(words(ctx.message, intent.body), memoBodyOf(quote));
    if (!body) return stop("body_missing", WRITE_WORDS.noTitle(language, quote));
    const said = contactKindOf(`${body} ${quote}`);
    const actual = people.filter((item) => item.role === "actual_contact");
    const actualPeople = actual.length ? actual : people.filter((item) => item.role !== "mentioned").slice(0, 1);
    const day = date?.day ?? resolveSaidDate(body, ctx.asOf, ctx.timeZone)?.day ?? localDayOf(ctx.asOf, ctx.timeZone);
    const contactIds = [...new Set(people.map((item) => item.id))];
    // A person picked among several of the name is named on the card with what told them apart.
    if (people.some((item) => !item.name)) return stop("read_failed", failedLine);
    const names = Object.fromEntries(people.map((item) => [item.id, item.detail ? (language === "en" ? `${item.name} (${item.detail})` : `${item.name}（${item.detail}）`) : item.name]));
    // The body stays the user's words; the title is code's and names the person where the words used a pronoun.
    // AG21c (R55): in both, a pronoun becomes the linked contact's name; the title drops the relative day (it is the date).
    const named = (text: string) => { let out = text; for (const person of people) if (person.text && isPronounClue(person.text) && person.name) out = replacePronoun(out, person.text, person.name); return out; };
    const noteBody = named(body);
    let title = noteBody.split(/(?<=[。.!！？?])\s*/u)[0].replace(/[。.!！]+$/u, "").slice(0, 40) || noteBody.slice(0, 40);
    title = withoutRelativeDay(title) || title;
    ops.push({
      capability: "memo.create",
      localId: intent.localId,
      partId: part.localId,
      set: {
        body: noteBody,
        contactIds,
        ...(actualPeople.length ? { interaction: { actualContactIds: actualPeople.map((item) => item.id), channel: said.channel ?? intent.channel ?? "other", direction: said.direction ?? intent.direction ?? "mutual", occurredOn: day, precision: "day" as const } } : {}),
        names,
        title,
      },
    });
    ctx.people.push(...people.filter((item) => !ctx.people.some((known) => known.id === item.id)).map((item) => ({ at: part.quote[0], id: item.id, name: item.name })));
  }
  if (covered && !ops.length) return { kind: "covered" };
  return { kind: "ready", ops };
}

/** AG20a R7: words that make a day a deadline — before the day ("最迟周五", "due Friday") or after it ("11 月 20 日之前", "金曜までに"). */
const DEADLINE_BEFORE = /(最迟|最晚|截止到?|截至|不晚于|期限は?|締め切りは?|締切は?|\bdue\b|\bdeadline\b|\bno later than\b|\bby\b)/iu;
const DEADLINE_AFTER = /(?:之前|以前|までに|まで|(?<=[日号])前)/u;

/**
 * AG20a R7 (TP-TDN-002): "周四做，最迟周五中午" — the day to do it and the deadline, each from its own words. The model's
 * deadline words are used when it gave them; otherwise each clause is read (a deadline word before the day splits a
 * clause). Returns nothing when the words hold no deadline (the caller keeps the one date as it did).
 */
export function plannedAndDue(quote: string, dateWords: string, dueWords: string, ctx: Pick<ResolveContext, "asOf" | "timeZone">): { plannedDate?: string; dueAt?: string; dueDayOnly?: boolean } {
  const dateOf = (text: string) => (text.trim() ? resolveSaidDate(text, ctx.asOf, ctx.timeZone) : null);
  const timeOf = (text: string) => {
    const at = /(\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*(?:点|點|時|时)|\d{1,2}\s*(?:am|pm)|[一二两三四五六七八九十]{1,3}\s*(?:点|點|時|时))/iu.exec(text);
    if (at) return resolveSaidTimes(text.slice(Math.max(0, at.index - 3)))?.start ?? null;
    return /(中午|正午|昼|\bnoon\b|\bmidday\b)/iu.test(text) ? "12:00" : null;
  };
  let planned: string | null = null;
  let due: { day: string; time: string | null } | null = null;
  const fromModel = dateOf(dueWords);
  if (fromModel) due = { day: fromModel.day, time: timeOf(dueWords) };
  for (const clause of quote.split(/[，,。；;、！!？?\n—]+/u).map((item) => item.trim()).filter(Boolean)) {
    const mark = DEADLINE_BEFORE.exec(clause);
    const before = mark ? clause.slice(0, mark.index) : clause;
    const after = mark ? clause.slice(mark.index) : "";
    if (mark) {
      const day = dateOf(after);
      if (day && !due) due = { day: day.day, time: timeOf(after) };
      const own = dateOf(before);
      if (own && !planned) planned = own.day;
      continue;
    }
    const day = dateOf(clause);
    if (!day) continue;
    if (DEADLINE_AFTER.test(clause)) {
      if (!due) due = { day: day.day, time: timeOf(clause) };
    } else if (!planned && (!due || day.day !== due.day)) planned = day.day;
  }
  if (!due) return {};
  // The model's date words that are the deadline's own are not a planned day too.
  if (planned === due.day && dateOf(dateWords)?.day === due.day) planned = null;
  return { ...(planned ? { plannedDate: planned } : {}), dueAt: instantOf(due.day, due.time ?? "23:59", ctx.timeZone), ...(due.time ? {} : { dueDayOnly: true }) };
}

/** "这条记成功了，再…", "if that works, then …", "できたら…": the user made this item wait for the one before. */
const WAIT_WORDS = /(成功了?(以后|之后|后)?[，,、\s]*(再|才)|记成功|存上了?[，,\s]*再|成功したら|できたら|成功してから|保存できたら|if (that|it) (works|succeeds|goes through)|once (that|it)('s| is| has been) (done|saved|logged)|after (that|it) (succeeds|is saved))/iu;

export function waitsForPrevious(message: string, previousEnd: number, part: GraphPart): boolean {
  return WAIT_WORDS.test(message.slice(previousEnd, part.quote[1]));
}

const CONTACT_FIELD_OF: Record<string, ContactFieldName> = { company: "organization", email: "email", name: "displayName", phone: "phone", role: "role" };

/**
 * AG12 (设计稿附录 B「联系人」; PLANNER 易错边界 1–7): a contact intent of the second layer, by code. The person to change,
 * delete or restore is found in the account only (restore: among those deleted within 30 days); several of the name
 * is one question. A new contact's possible duplicates are checked by the propose node (a question before the card).
 * A pasted table is parsed by code; nothing is written here.
 */
async function resolveContactIntent(ctx: ResolveContext, part: GraphPart, write: PartWrite, intent: StoredIntent, failedLine: string): Promise<WriteOutcome> {
  const language = ctx.language;
  const quote = words(ctx.message, part.quote);
  const stop = (reason: string, line: string): WriteOutcome => ({ kind: "stop", line, reason });
  const values: Partial<Record<ContactFieldName, string>> = {};
  for (const [name, span] of Object.entries(intent.values ?? {})) {
    const field = CONTACT_FIELD_OF[name];
    const value = words(ctx.message, span);
    if (field && value) values[field] = value;
  }
  const base = { localId: intent.localId, partId: part.localId };
  if (intent.capability === "contact.create") {
    if (!values.displayName) return stop("name_missing", CONTACT_WORDS.noName(language, quote));
    return { kind: "ready", ops: [{ ...base, capability: "contact.create", set: { ...values, displayName: values.displayName } }] };
  }
  if (intent.capability === "contact.import") {
    const pasted = importTableOf(ctx.message);
    if (!pasted || !ctx.records?.contacts || !ctx.scope) return pasted ? stop("read_failed", failedLine) : stop("table_missing", CONTACT_WORDS.noTable(language));
    let text: string;
    try {
      // AG20b (R12): a list with no header row gets code's header (one person per line); the card, its revisions and the
      // import after the click all read the same text.
      text = withHeader(pasted);
      previewImport(text, [], ctx.scope.accountId);
    } catch (error) {
      if (error instanceof ImportTableRejected) return stop("table_missing", CONTACT_WORDS.noTable(language));
      throw error;
    }
    return { kind: "ready", ops: [{ ...base, capability: "contact.import", overrides: {}, text }] };
  }
  // The person: the selector's words, the model's relation, or the first layer's person clue.
  const clueSpan = intent.selector[0] ?? intent.relations[0]?.quote ?? part.refs.find((ref) => ref.entity === "contact")?.quote ?? null;
  const boundRef = part.refs.find((ref) => ref.entity === "contact" && ref.recordId);
  const clueText = clueSpan ? words(ctx.message, clueSpan) : boundRef?.recordId ? ctx.nameOf(boundRef.recordId) ?? "" : "";
  if (intent.capability === "contact.restore") {
    if (!ctx.records?.contacts || !ctx.scope) return stop("read_failed", failedLine);
    // AG20a R15 (§3.10, TP-CON-004): "还是把他恢复吧" — the pronoun is the contact this conversation mentioned last (one a card
    // just deleted cannot be opened now, so it is looked up among the deleted by that id), never a name to search for.
    const meant = boundRef?.recordId ?? (isPronounClue(clueText) && ctx.context && !ctx.context.idle ? ctx.context.lastMentionedForCode.find((item) => item.type === "contact")?.id ?? null : null);
    if (meant) {
      const known = await ctx.records.contacts.read(ctx.scope.accountId, meant, { includeDeleted: true }).catch(() => null);
      const among = known ? await ctx.records.contacts.findDeleted(ctx.scope.accountId, known.displayName).catch(() => null) : null;
      const same = among?.find((item) => item.id === meant);
      if (same) {
        emitTrace({ partId: part.localId, recordId: meant, type: "propose.restore_last_mentioned" });
        return { kind: "ready", ops: [{ ...base, capability: "contact.restore", targetId: same.id }] };
      }
    }
    if (!clueText) return stop("object_unclear", WRITE_WORDS.notWho(language, quote));
    const deleted = await ctx.records.contacts.findDeleted(ctx.scope.accountId, clueText).catch(() => null);
    if (!deleted) return stop("read_failed", failedLine);
    const picked = write.picks.contact ? deleted.find((item) => item.id === write.picks.contact) : undefined;
    if (picked || deleted.length === 1) return { kind: "ready", ops: [{ ...base, capability: "contact.restore", targetId: (picked ?? deleted[0]).id }] };
    if (deleted.length > 1) {
      return { kind: "ask", question: { candidates: deleted.slice(0, 3).map((item) => ({ id: item.id, name: item.displayName, type: "contact", ...([item.organization, item.role].some(Boolean) ? { detail: [item.organization, item.role].filter(Boolean).join(" · ") } : {}) })), clue: clueText, type: "contact" } };
    }
    const active = await findContacts(ctx.records, ctx.scope, clueText, quote, ctx.message).catch(() => null);
    if (active?.matches.length) return stop("not_deleted", CONTACT_WORDS.stillThere(language, active.matches[0].name));
    return stop("object_not_found", CONTACT_WORDS.noDeleted(language, clueText));
  }
  const found = await resolvePerson(ctx, part, write, { quote: clueSpan, text: clueText });
  if (found.kind === "ask") return { kind: "ask", question: { candidates: found.candidates, clue: found.clue, type: "contact" } };
  if (found.kind === "shares") return { kind: "shares", with: found.with };
  if (found.kind === "failed") return stop("read_failed", failedLine);
  if (found.kind === "missing") return stop("object_unclear", WRITE_WORDS.notWho(language, quote));
  if (found.kind === "none") return stop("person_not_found", WRITE_WORDS.notFoundPerson(language, quote));
  ctx.people.push(...(ctx.people.some((known) => known.id === found.id) ? [] : [{ at: part.quote[0], id: found.id, name: found.name }]));
  if (intent.capability === "contact.update") {
    // AG20a (owner's decision 2): "那把她的资料也更新了" right after an answer said which of her fields are out of date — those
    // fields, with the values the answer took from the user's record (read again now; the value must still be in it).
    if (!Object.keys(values).length) {
      const stale = (ctx.context?.staleProfiles ?? []).filter((item) => item.contactId === found.id);
      for (const item of stale) {
        if (!ctx.records || !ctx.scope || !["memo", "todo", "event", "schedule", "attendance"].includes(item.sourceType)) continue;
        const source = (await ctx.records.reader.read(item.sourceType as "memo", ctx.scope, { id: item.sourceId }).catch(() => null))?.items[0];
        if (source && JSON.stringify(source.fields).includes(item.value)) values[item.field] = item.value;
      }
      if (Object.keys(values).length) emitTrace({ fields: Object.keys(values), partId: part.localId, recordId: found.id, type: "propose.contact_update_from_answer" });
    }
    if (!Object.keys(values).length) return stop("field_missing", CONTACT_WORDS.noFields(language, quote));
    const current = ctx.records?.contacts && ctx.scope ? await ctx.records.contacts.read(ctx.scope.accountId, found.id).catch(() => null) : null;
    if (current) {
      const same = (Object.entries(values) as [ContactFieldName, string][]).every(([field, value]) => (field === "displayName" ? current.displayName : current[field]) === value);
      if (same) return stop("no_change", CONTACT_WORDS.noChange(language, current.displayName));
    }
    return { kind: "ready", ops: [{ ...base, capability: "contact.update", set: { ...values }, targetId: found.id }] };
  }
  // delete: the notes and to-dos linked to the person are listed as kept.
  if (!ctx.records || !ctx.scope) return stop("read_failed", failedLine);
  const effects: ContactEffect[] = [];
  let more = 0;
  for (const kind of ["memo", "todo"] as const) {
    const read = await ctx.records.reader.read(kind, ctx.scope, { contactId: found.id, limit: 10 }).catch(() => null);
    if (!read) return stop("read_failed", failedLine);
    for (const item of read.items) {
      const title = String(item.fields.title ?? "").trim() || String(item.fields.body ?? "").slice(0, 30);
      effects.push({ kind, ref: item.id, title });
    }
    if (read.nextCursor) more += Math.max(0, (read.total ?? read.items.length + 1) - read.items.length);
  }
  return { kind: "ready", ops: [{ ...base, capability: "contact.delete", effects, ...(more ? { moreEffects: more } : {}), targetId: found.id }] };
}
