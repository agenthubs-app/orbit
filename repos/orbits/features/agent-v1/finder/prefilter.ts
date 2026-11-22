/**
 * The candidate prefilter: what a lookup asks the store for, so that only plausible rows are read (never a whole
 * collection — every row the store returns is a read of the user's records, and the eval counts each one). The terms
 * come from the finder's own logic: the cleaned content words (finder/impl/finders.ts contentWordsFor, the settled
 * people's names taken out), the tokens and synonym surfaces of the query (match.ts buildQuery) with the forms a store
 * search cannot fold (katakana for hiragana, traditional / Japanese forms of simplified Han), the settled people's linked
 * rows, the records the last answer showed, and — for schedule items and events — the time window. Person lookups query
 * contacts by name variants (the mention, without titles and 小/老/阿, Latin tokens and their nicknames).
 *
 * `planFind` / `personTerms` are pure; the agent runs the plan against the store (finder/world.ts), the lab runs the same
 * plan against its World with the store's text semantics (`worldSubset`, used by the lab's adapters/agent-port.ts) to
 * measure what the prefilter costs.
 */
import { contentWordsFor } from "./impl/finders";
import { cleanClue } from "./impl/clean";
import { buildQuery } from "./impl/match";
import { detectLang, fold, foldChar } from "./impl/text";
import { EN_NICKNAMES, EN_TITLES, JA_TITLES, ZH_EN_NAMES, ZH_TITLES } from "./impl/lexicon";
import type { FindInput, World } from "./types";

export const TERMS_MAX = 40;
export const ROWS_PER_QUERY = 30;

/** The store's text match (domains/source.ts matchText): NFKC, lower case, spaces / 的 / の / punctuation ignored, substring. */
const MATCH_IGNORED_JS = /[\s的の、。・,.!?「」『』"“”'’()【】:;]/gu;
export const matchText = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(MATCH_IGNORED_JS, "");
export function storeHas(text: string | undefined, term: string): boolean {
  if (!text) return false;
  const folded = matchText(term);
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase()) || (Boolean(folded) && matchText(text).includes(folded));
}

// ---------------- forms a store search cannot fold ----------------
let unfold: Map<string, string[]> | null = null;
/** Simplified Han → the other forms the finder folds into it (資 for 资, 発 for 发 …), built once from foldChar. */
function variantsOf(ch: string): string[] {
  if (!unfold) {
    unfold = new Map();
    for (let code = 0x3400; code <= 0x9fff; code += 1) {
      const c = String.fromCodePoint(code);
      const f = foldChar(c);
      if (f !== c && [...f].length === 1) unfold.set(f, [...(unfold.get(f) ?? []), c]);
    }
  }
  return unfold.get(ch) ?? [];
}
const toKata = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCodePoint(c.codePointAt(0)! + 0x60));

/** A term and the spellings of it a stored text may use (at most 4 Han variant spellings). */
function spellings(term: string): string[] {
  const out = new Set<string>([term]);
  // the simplified form first (張 → 张), then every form of it
  const simplified = [...term].map((ch) => (/\p{Script=Han}/u.test(ch) ? foldChar(ch) || ch : ch)).join("");
  if (simplified !== term) { out.add(simplified); term = simplified; }
  if (/[ぁ-ゖ]/.test(term)) out.add(toKata(term));
  let forms = [""];
  for (const ch of term) {
    const alts = [ch, ...variantsOf(ch)];
    forms = forms.flatMap((head) => alts.map((alt) => head + alt)).slice(0, 6);
  }
  for (const form of forms) out.add(form);
  return [...out];
}

const longEnough = (term: string) => (/^[\x20-\x7e]+$/.test(term) ? term.replace(/\s+/g, "").length >= 3 : [...term].length >= 2);

/** Search terms of a lookup (the settled people's contacts must be in `peopleWorld` so their names are taken out). */
export function searchTerms(input: FindInput, peopleWorld: World): string[] {
  const words = contentWordsFor(input, peopleWorld);
  const lang = detectLang(input.sentence || input.clue);
  const raw = cleanClue({ clue: input.clue, lang: lang === "en" ? "en" : lang, sentence: input.sentence }).contentWords;
  const q = buildQuery(words);
  const strong = q.tokens.filter((t) => t.type !== "uni" && !(t.type === "kana" && [...t.label].length < 2) && !t.generic);
  const tokens = strong.length ? strong : q.tokens.filter((t) => t.type !== "uni");
  const terms = new Set<string>();
  for (const word of [...raw, ...words]) if (longEnough(word)) terms.add(word);
  for (const token of tokens) for (const surface of [token.label, ...token.surfaces]) if (longEnough(surface)) terms.add(surface);
  const out = new Set<string>();
  for (const term of terms) for (const form of spellings(term)) out.add(form);
  return [...out].slice(0, TERMS_MAX);
}

/** The settled people's names as words a record's text may hold (the finder links a record to a person by its text too). */
export function peopleNameTerms(people: readonly { name: string; aliases?: string[] }[]): string[] {
  const out = new Set<string>();
  for (const person of people) {
    for (const name of [person.name, ...(person.aliases ?? [])]) {
      const parts = name.normalize("NFKC").split(/[\s　·・]+/u).filter(Boolean);
      if (longEnough(parts.join(""))) out.add(parts.join(""));
      for (const part of parts) if (longEnough(part)) out.add(part);
    }
  }
  return [...out];
}

/** What one lookup reads. */
export interface FindPlan {
  terms: string[];
  /** Agent contact ids whose linked rows are read. */
  people: string[];
  /** Lab ids the last answer showed (read by id). */
  shown: string[];
  /** The time said (local days, inclusive): rows dated in it are read too (to-dos by planned / due day, memos by the day written, schedule items occurring then). */
  window?: { from: string; to: string };
  /** Events: «我去过» / registrations are read only when the words speak of them. */
  attendance: boolean;
}

const WENT_OR_SIGNUP = /(去过|去過|去了|去的|行った|参加した|went|attended|报名|報名|报了名|報了名|申し込|申込|登録した|エントリー|sign(?:ed)?\s*up|registered|register|rsvp)/i;

export function planFind(input: FindInput, peopleWorld: World): FindPlan {
  const terms = [...new Set([...searchTerms(input, peopleWorld), ...peopleNameTerms(peopleWorld.contacts.filter((c) => (input.people ?? []).includes(c.id)))])];
  const tm = input.time;
  const window = tm?.day ? { from: tm.day, to: tm.day } : tm?.range ? { ...tm.range } : undefined;
  return {
    attendance: tm?.went === true || WENT_OR_SIGNUP.test(`${input.sentence} ${input.clue}`),
    people: input.people ?? [],
    shown: input.sessionShown ?? [],
    terms,
    ...(window ? { window } : {}),
  };
}

// ---------------- person lookups ----------------
const TITLES = [...ZH_TITLES, ...JA_TITLES, ...EN_TITLES].filter(Boolean).map((title) => ({ folded: fold(title), title })).sort((x, y) => y.folded.length - x.folded.length);
/** Words that only point at someone of a company (海桐那边的人, 東都の方, the Pacific Bridge guy). */
const SIDE = /(那边的人|那边那位|那边|那位|这位|那个人|那个|的人|的|の人|の方々|の方|の担当者|の担当|担当者|担当さん|担当|側|さん側|の|\bguy\b|\bperson\b|\bpeople\b|\bfolks\b|\bteam\b|\bthe\b)/giu;

/** The mention without titles at either end (folded comparison: 社长 = 社長), without 小/老/阿 before a Han name. */
function coreOf(said: string): string {
  let core = said;
  for (let changed = true; changed; ) {
    changed = false;
    const f = fold(core);
    for (const { folded } of TITLES) {
      if (!folded || f.length <= folded.length) continue;
      if (f.endsWith(folded)) { core = [...core].slice(0, [...core].length - [...folded].length).join("").replace(/[\s.\-]+$/u, ""); changed = true; break; }
      if (f.startsWith(`${folded} `) || (folded.endsWith(".") && f.startsWith(folded))) { core = core.slice(folded.length).trim(); changed = true; break; }
    }
  }
  return core.replace(/[的の]$/u, "").trim();
}

/**
 * Stage 1 of a person lookup: name variants to query contacts by (displayName contains the term) — the mention, without
 * titles, without 小/老/阿, the name part after a company qualifier, Latin tokens and their nicknames / Chinese forms.
 */
export function personTerms(mention: string): string[] {
  const said = mention.replace(/^@/u, "").normalize("NFKC").trim();
  const out = new Set<string>();
  const add = (term: string) => {
    const t = term.trim();
    if (t && !/^[\x20-\x7e]{1,2}$/.test(t)) for (const form of spellings(t)) out.add(form);
  };
  add(said);
  const core = coreOf(said);
  add(core);
  // 云帆的王总 / 三和精機の田中さん: the name after the company words
  const tail = said.split(/[的の]/u).pop() ?? "";
  if (tail && tail !== said) { add(tail); add(coreOf(tail)); }
  for (const part of [core, coreOf(tail)]) {
    const bare = part.replace(/^(小|老|阿|大)(?=\p{Script=Han})/u, "");
    if (bare !== part) add(bare);
  }
  const latin = core.toLowerCase().match(/[a-z][a-z'’-]+/g) ?? [];
  for (const token of latin) {
    add(token);
    for (const group of EN_NICKNAMES) if (group.includes(token)) group.forEach(add);
    for (const [zh, en] of ZH_EN_NAMES) if (en === token) add(zh);
  }
  for (const [zh, en] of ZH_EN_NAMES) if (core.includes(zh)) add(en);
  return [...out].slice(0, TERMS_MAX);
}

/**
 * Stage 2, only when stage 1 names no one: the company words of the mention (contacts at a company holding them), each
 * character of a Han name of three or more (a name one character off, 齋藤 / 斉藤), and — for a name written in Latin
 * letters, kana or initials, which a text search cannot compare with Han names — the account's contacts (capped), as the
 * old lookup's romanised pass read them.
 */
export function personFallback(mention: string): { company: string[]; chars: string[]; all: boolean } {
  const said = mention.replace(/^@/u, "").normalize("NFKC").trim();
  const core = coreOf(said);
  const company = new Set<string>();
  for (const piece of said.replace(SIDE, " ").split(/\s+/u)) {
    const p = coreOf(piece);
    if (longEnough(p)) for (const form of spellings(p)) company.add(form);
    // 东都物流 → 东都: the start of a company name
    if (/\p{Script=Han}/u.test(p) && [...p].length >= 3) company.add([...p].slice(0, 2).join(""));
  }
  const han = [...coreOf(said.split(/[的の]/u).pop() ?? core)].filter((c) => /\p{Script=Han}/u.test(c));
  const chars = han.length >= 2 ? [...new Set(han.flatMap((c) => [c, ...variantsOf(c)]))] : [];
  const all = /[A-Za-z\u3041-\u30ff]/u.test(core) && !/\p{Script=Han}/u.test(core);
  return { all, chars, company: [...company].slice(0, TERMS_MAX) };
}

// ---------------- the lab's executor: the same plan over a World, with the store's semantics ----------------
const people = (rec: { contactIds?: string[] }, ids: string[]) => (rec.contactIds ?? []).some((id) => ids.includes(id));
const localDay = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(new Date(iso));

/**
 * The World a store would return for this lookup: what the plan's queries match (to-dos: title + notes; memos: title +
 * body; schedule: title + location; contacts: name), the people's linked rows, the shown ids, the window; deleted rows only for a
 * restore. Platform and private events are kept whole (the agent lists them as the old lookups did; the directory is
 * not a private read), attendance only when the plan asks for it.
 */
export function worldSubset(world: World, fn: "findTodosMemos" | "findSchedule" | "findEvents" | "findContacts", input: FindInput): World {
  const peopleWorld: World = { ...world, contacts: world.contacts.filter((c) => (input.people ?? []).includes(c.id)) };
  const plan = planFind(input, peopleWorld);
  const hit = (texts: (string | undefined)[]) => plan.terms.some((term) => texts.some((text) => storeHas(text, term)));
  const keep = <T extends { id: string; contactIds?: string[] }>(rows: T[], texts: (r: T) => (string | undefined)[]) => rows.filter((r) => plan.shown.includes(r.id) || people(r, plan.people) || hit(texts(r)));
  const out: World = { ...world, aliases: world.aliases, attendance: [], contacts: peopleWorld.contacts, memos: [], platformEvents: [], privateEvents: [], schedule: [], todos: [] };
  const inWindow = (day: string | undefined) => Boolean(plan.window && day && day >= plan.window.from && day <= plan.window.to);
  if (fn === "findTodosMemos") {
    const kinds = input.kinds ?? ["todo", "memo"];
    const status = (t: World["todos"][number]) => (input.status === "open" ? t.status === "open" : input.status === "done" ? t.status === "done" : true);
    if (kinds.includes("todo")) out.todos = world.todos.filter((t) => status(t) && (keep([t], (x) => [x.title, x.notes]).length > 0 || inWindow(t.plannedDate) || inWindow(t.dueAt && localDay(t.dueAt, world.timeZone))));
    if (kinds.includes("memo")) out.memos = world.memos.filter((m) => keep([m], (x) => [x.title, x.body]).length > 0 || inWindow(m.writtenOn));
  } else if (fn === "findSchedule") {
    const overlaps = (s: World["schedule"][number]) => Boolean(plan.window) && localDay(s.startsAt, world.timeZone) <= plan.window!.to && localDay(s.endsAt || s.startsAt, world.timeZone) >= plan.window!.from;
    out.schedule = world.schedule.filter((s) => keep([s], (x) => [x.title, x.location]).length > 0 || (plan.window && (Boolean(s.recurrence) || overlaps(s))));
  } else if (fn === "findEvents") {
    out.platformEvents = world.platformEvents;
    out.privateEvents = world.privateEvents;
    if (plan.attendance) out.attendance = world.attendance;
  } else {
    const terms = plan.terms;
    out.contacts = [...new Map([...peopleWorld.contacts, ...world.contacts.filter((c) => terms.some((term) => storeHas(c.name, term) || storeHas(c.company, term) || storeHas(c.title, term)))].map((c) => [c.id, c])).values()];
  }
  return out;
}

/** The contacts a store returns for a person lookup's stage 1 (name contains a variant, or the mention contains the name). */
export function personSubset(world: World, mention: string): World {
  const terms = personTerms(mention);
  const said = matchText(mention);
  const contacts = world.contacts.filter((c) => terms.some((term) => storeHas(c.name, term)) || (c.name.length >= 2 && said.includes(matchText(c.name))) || (c.aliases ?? []).some((alias) => terms.some((term) => storeHas(alias, term))));
  return { ...world, contacts };
}

/** Stage 2's contacts (lab executor, see personFallback); capped like the agent's. */
export function personFallbackSubset(world: World, mention: string, cap = 500): World {
  const plan = personFallback(mention);
  const contacts = plan.all ? world.contacts.slice(0, cap) : world.contacts.filter((c) => plan.company.some((term) => storeHas(c.company, term)) || plan.chars.some((ch) => c.name.includes(ch)));
  return { ...world, contacts };
}
