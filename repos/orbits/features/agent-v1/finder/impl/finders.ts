// @ts-nocheck -- finder/impl/finders.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/finders.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * The four finders. Code gathers candidates (recall); the model only picks among ids later.
 * Shared steps: account isolation and deleted-record exclusion (restore sees only records deleted within 30 days),
 * ordinal / deixis over sessionShown, clue cleaning (cleanClue + removing the settled people's names), people as a
 * filter (their linked records, or records whose text names them), time as a filter (to-dos: planned / due day;
 * schedule: occurrence day and part of day; events: event days, attendance) or a soft signal (memos: written day),
 * IDF-weighted lexical score, top K.
 */
import type { Candidate, Contact, FindInput, Memo, PlatformEvent, PrivateEvent, ScheduleItem, Todo, World } from "../types";
import { cleanClue } from "./clean";
import { buildQuery, idfTable, makeField, Query, Rec, scoreRecord, ScoreOut } from "./match";
import { mentionForms } from "./person";
import { addDays, fmt, localParts, parseYMD } from "./time";
import { detectLang, fold } from "./text";
import { resolveTime } from "./time";
import { SURFACE_INDEX } from "./lexicon";
import plan from "./plan.json";

export interface Scored extends Candidate { coverage: number; content: boolean }

const K = plan.K;
const S = plan.score;

// ---------------------------------------------------------------- world index (cached per world object)
interface Index {
  recs: Map<string, Rec>;
  contactById: Map<string, Contact>;
}
const indexCache = new WeakMap<World, Index>();
function index(world: World): Index {
  const hit = indexCache.get(world);
  if (hit) return hit;
  const recs = new Map<string, Rec>();
  const add = (id: string, fields: (ReturnType<typeof makeField>)[]) => recs.set(id, { id, fields: fields.filter(Boolean) as NonNullable<ReturnType<typeof makeField>>[] });
  const W = S.fieldWeight;
  for (const t of world.todos) add(t.id, [makeField(t.title, W.title, true), makeField(t.notes, W.body)]);
  for (const m of world.memos) add(m.id, [makeField(m.title, W.title, true), makeField(m.body, W.body)]);
  for (const s of world.schedule) add(s.id, [makeField(s.title, W.title, true), makeField(s.location, W.meta)]);
  for (const e of world.platformEvents) add(e.id, [makeField(e.title, W.title, true), makeField(e.location, W.meta), makeField(e.organizer, W.meta), makeField(e.summary, W.body)]);
  for (const e of world.privateEvents) add(e.id, [makeField(e.title, W.title, true), makeField(e.location, W.meta)]);
  for (const c of world.contacts) add(c.id, [
    makeField(c.name, W.contactName, true), ...(c.aliases ?? []).map((a) => makeField(a, W.contactName, true)),
    makeField(c.company, W.contactCompany, true, true), makeField(c.title, W.contactTitle, true), makeField(c.industry, W.contactIndustry),
  ]);
  const idx: Index = { recs, contactById: new Map(world.contacts.map((c) => [c.id, c])) };
  indexCache.set(world, idx);
  return idx;
}

// ---------------------------------------------------------------- common helpers
const nowOf = (world: World) => new Date(world.now).getTime();
function liveFor(r: { account?: string; deletedAt?: string }, input: FindInput, world: World): boolean {
  if (r.account !== undefined && r.account !== input.account) return false;
  const cutoff = nowOf(world) - plan.time.deletedRestoreDays * 86400000;
  if (input.verb === "restore") return !!r.deletedAt && new Date(r.deletedAt).getTime() >= cutoff;
  return !r.deletedAt;
}
const localDay = (iso: string, world: World) => fmt(localParts(iso, world.timeZone).date);
const localHour = (iso: string, world: World) => { const p = localParts(iso, world.timeZone); return p.hour + p.minute / 60; };

const POD_WINDOWS = plan.partOfDayHours as Record<string, [number, number][]>;
const inPod = (h: number, pod?: string) => !pod || (POD_WINDOWS[pod] ?? [[0, 24]]).some(([a, b]) => h >= a && h < b);

/** Ordinal / deixis over the records shown in the last answer. undefined = the clue is not such a pointer. */
export function pointerPick(clue: string, shown: string[] | undefined, contentEmpty: boolean): string[] | undefined {
  if (!shown || !shown.length || !contentEmpty) return undefined;
  const c = clue.normalize("NFKC").toLowerCase();
  const num = (s: string) => { const m: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }; return /^\d+$/.test(s) ? +s : m[s] ?? NaN; };
  let n: number | undefined;
  const m1 = c.match(/第\s*([0-9]+|[一二三四五六七八九十])/) ?? c.match(/([0-9]+|[一二两三四五六七八九十])\s*(?:番目|つ目)/);
  if (m1) n = num(m1[1]);
  const en: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5 };
  for (const [w, v] of Object.entries(en)) if (new RegExp(`\\b${w}\\b`).test(c)) n = v;
  if (/(最后|最後|\blast\b|bottom one|下面那|后面那|後面那|后面的|後の(?:ほう|方)|後者|后者|\blatter\b)/.test(c)) n = shown.length;
  if (/(前面那|前の(?:ほう|方)|前者|\bformer\b)/.test(c) && n === undefined) n = 1;
  if (/(中间|中間|真ん中|\bmiddle\b)/.test(c) && n === undefined) { if (shown.length % 2 === 0) return shown.length === 2 ? [...shown] : shown.slice(shown.length / 2 - 1, shown.length / 2 + 1); n = (shown.length + 1) / 2; }
  if (/(第一个|第一条|\btop one\b|上面那)/.test(c) && n === undefined) n = 1;
  // r10: an ordinal counted from the end (倒数第二条 / 最後から2番目 / 後ろから2つ目 / second-to-last / third from the end)
  const fe = c.match(/(?:倒数|倒數)\s*第?\s*([0-9]+|[一二两三四五六七八九十])/) ?? c.match(/(?:最後|最后|後ろ|うしろ|下)から\s*([0-9]+|[一二两三四五六七八九十])\s*(?:番目|つ目)/);
  const feEn = c.match(/\b(second|third|fourth|2nd|3rd|4th|next)[\s-]+(?:to|from)[\s-]+(?:the[\s-]+)?(?:last|end|bottom)\b/) ?? c.match(/\b(penultimate)\b/);
  if (fe || feEn) {
    const k = fe ? num(fe[1]) : feEn![1] === "next" || feEn![1] === "penultimate" ? 2 : en[feEn![1]];
    n = shown.length - k + 1;
  }
  if (n !== undefined) return isNaN(n) || n < 1 || n > shown.length ? [] : [shown[n - 1]];
  if (/(刚才|刚刚|剛才|上面|那个|这个|那条|这条|那個|這個|那篇|さっき|先ほど|それ|あれ|これ|その|あの|上の|やつ|\bthat\b|\bthis\b|\bit\b|\bthose\b|\bthem\b|\bboth\b)/.test(c)) return [...shown];
  return undefined;
}

const LATIN_PHRASES = [...SURFACE_INDEX.keys()].filter((k) => /^[a-z]+( [a-z]+)+$/.test(k));
/** Chinese function words that glue content inside one run (说可以去看 → 看). */
const FUNCTION_RE = /(可以|能不能|能否|应该|需要|说过|说的|说|讲的|提到的|提到|告诉|去看|就是|去过的|去过|去的|去了|行ってきた|行った|行って|参加した|了|吧|呢|吗|啊|的)/g;
/** Time words of the clue (they may also be part of a title, e.g. a memo titled with a day word or a date range). */
export function clueTimeWords(clue: string): string[] {
  return resolveTime({ text: clue, now: "2026-01-01T12:00:00Z", timeZone: "UTC" }).spans.map(([a, b]) => fold(clue.slice(a, b))).filter((x) => [...x].length >= 2);
}
/** Content words of the clue for searching: cleanClue minus the names of the settled people. */
export function contentWordsFor(input: FindInput, world: World, extraStop: RegExp[] = []): string[] {
  const lang = detectLang(input.sentence || input.clue);
  const cw = cleanClue({ sentence: input.sentence, clue: input.clue, lang: lang === "en" ? "en" : lang }).contentWords;
  const forms: string[] = [];
  const idx = index(world);
  for (const id of input.people ?? []) {
    const c = idx.contactById.get(id);
    if (c) forms.push(...mentionForms(c, world, false));
  }
  forms.sort((a, b) => b.length - a.length);
  const out: string[] = [];
  // multi-word Latin surfaces of the lexicon present in the clue (hand in, meeting notes) survive stop-word removal
  const fc = ` ${fold(input.clue).replace(/[^a-z0-9\s\-]/g, " ")} `;
  for (const ph of LATIN_PHRASES) if (fc.includes(` ${ph} `)) out.push(ph);
  for (const w of cw) {
    let f = fold(w).replace(FUNCTION_RE, " ");
    for (const p of forms) if (p && f.includes(p)) f = f.split(p).join(" ");
    for (const re of extraStop) f = f.replace(re, " ");
    for (const part of f.split(/\s+/).filter(Boolean)) {
      if (/^[a-z]+$/.test(part) && forms.includes(part)) continue;
      if ([...part].length === 1 && /[的のをにはがとで了吧]/.test(part)) continue;
      out.push(part);
    }
  }
  return out;
}

/** Is the record linked to one of the people (contactIds, or its text names them)? */
function linkedPeople(rec: { contactIds?: string[] }, text: string, people: string[], world: World): string[] {
  const idx = index(world);
  const hit: string[] = [];
  for (const id of people) {
    if (rec.contactIds?.includes(id)) { hit.push(id); continue; }
    const c = idx.contactById.get(id);
    if (!c) continue;
    const t = fold(text);
    if (mentionForms(c, world, true).some((f) => f.length >= 2 && t.includes(f))) hit.push(id);
  }
  return hit;
}

interface Item { titleWord?: boolean; id: string; rec: Rec; people: string[]; timeOk: boolean; timeMatched: boolean; extra: number; occurrence?: string; matchedExtra: string[]; sortKey: string }

function rank(items: Item[], q: Query, pool: Rec[], opts: { hasPeople: boolean; hasTimeFilter: boolean; softTime?: boolean }): Scored[] {
  const idf = idfTable(q, pool);
  const hasContent = q.tokens.length > 0;
  const anyNonGeneric = q.tokens.some((t) => !t.generic && t.type !== "uni" && t.type !== "kana");
  const scored: (Scored & { sortKey: string; personLinked: boolean })[] = [];
  for (const it of items) {
    if (!it.timeOk) continue;
    const sc: ScoreOut = hasContent ? scoreRecord(q, idf, it.rec) : { score: 0, coverage: 0, matched: [], nonGeneric: false, strongHit: false };
    const contentHit = anyNonGeneric ? sc.nonGeneric : sc.matched.length > 0;
    const personLinked = it.people.length > 0;
    // a record is a candidate when something ties it to the request
    const tw = !!it.titleWord;
    if (hasContent && !contentHit && !personLinked && !(opts.hasTimeFilter && it.timeMatched) && !tw) continue;
    if (!hasContent && !personLinked && !(opts.hasTimeFilter && it.timeMatched) && !opts.softTime && !tw) continue;
    if (!hasContent && !personLinked && !it.timeMatched && !tw) continue;
    let score = sc.score + it.extra + (tw ? S.titleTimeWordBonus : 0);
    const matched = [...sc.matched, ...it.matchedExtra, ...(tw ? ["title-time-word"] : [])];
    if (personLinked) { score += S.personBonus + S.extraPersonBonus * (it.people.length - 1); matched.push(...it.people.map((p) => `person:${p}`)); }
    if (it.timeMatched) { score += opts.softTime ? S.memoTimeBonus : S.timeBonus; matched.push("time"); }
    scored.push({ id: it.id, score: Math.round(score * 1000) / 1000, matched, coverage: sc.coverage, content: contentHit, sortKey: it.sortKey, personLinked, ...(it.occurrence ? { occurrence: it.occurrence } : {}) });
  }
  // people as a filter: when the settled people have records, keep theirs (and only fall back to others when none of
  // their records matches anything in the content)
  let list = scored;
  if (opts.hasPeople) {
    const mine = scored.filter((x) => x.personLinked);
    const mineContent = mine.filter((x) => x.content);
    if (mine.length && (mineContent.length || !hasContent)) list = mine;
    else if (mine.length) list = [...mine, ...scored.filter((x) => !x.personLinked && x.content).map((x) => ({ ...x, score: Math.round(x.score * S.fallbackFactor * 1000) / 1000 }))];
    else list = scored.filter((x) => x.content).map((x) => ({ ...x, score: Math.round(x.score * S.fallbackFactor * 1000) / 1000 }));
  }
  list.sort((a, b) => b.score - a.score || b.sortKey.localeCompare(a.sortKey));
  return list.slice(0, K).map(({ sortKey: _s, personLinked: _p, ...c }) => c);
}

function ordinalCands(input: FindInput, world: World, prefix: RegExp, contentEmpty: boolean, words: string[] = []): Scored[] | undefined {
  const idx = index(world);
  let picked = pointerPick(input.clue, input.sessionShown, contentEmpty);
  if (!picked && !contentEmpty && input.sessionShown?.length) {
    const explicit = pointerPick(input.clue, input.sessionShown, true);
    const isOrdinal = explicit && explicit.length === 1;
    if (isOrdinal) {
      const q = buildQuery(words);
      const rec = idx.recs.get(explicit[0]);
      const idf = idfTable(q, rec ? [rec] : []);
      if (rec && scoreRecord(q, idf, rec).nonGeneric) picked = explicit;
    }
  }
  if (!picked) return undefined;
  if (input.kinds?.length && prefix.source.includes("TM")) {
    const want = new RegExp(`^[${input.kinds.map((k) => (k === "todo" ? "T" : "M")).join("")}]-`);
    const narrowed = picked.filter((id) => want.test(id));
    if (narrowed.length) picked = narrowed;
  }
  const all = new Map<string, { account?: string; deletedAt?: string }>([
    ...world.todos, ...world.memos, ...world.schedule, ...world.platformEvents, ...world.privateEvents, ...world.contacts,
  ].map((r) => [r.id, r as { account?: string; deletedAt?: string }]));
  return picked.filter((id) => idx.recs.has(id) && prefix.test(id) && liveFor(all.get(id)!, input, world))
    .map((id, i) => ({ id, score: S.ordinalScore - i * 0.01, matched: ["ordinal"], coverage: 1, content: true }));
}

const strip = (xs: Scored[]): Candidate[] => xs.map(({ coverage: _c, content: _t, ...c }) => c);

// ---------------------------------------------------------------- to-dos and memos
export function scoredTodosMemos(input: FindInput, world: World): Scored[] {
  const idx = index(world);
  const kinds = input.kinds ?? ["todo", "memo"];
  const words = contentWordsFor(input, world);
  const ord = ordinalCands(input, world, /^[TM]-/, words.length === 0, words);
  if (ord) return ord;
  const q = buildQuery(words);
  const people = input.people ?? [];
  const status = input.status ?? "any";
  const tm = input.time;
  const day = tm?.day, range = tm?.range;
  const tws = clueTimeWords(input.clue);
  const items: Item[] = [];
  const pool: Rec[] = [];
  if (kinds.includes("todo")) for (const t of world.todos) {
    if (!liveFor(t, input, world)) continue;
    pool.push(idx.recs.get(t.id)!);
    if (status !== "any" && t.status !== status) continue;
    const days = [t.plannedDate, t.dueAt ? localDay(t.dueAt, world) : undefined].filter(Boolean) as string[];
    const timeMatched = !!(day && days.includes(day)) || !!(range && days.some((d) => d >= range.from && d <= range.to));
    const hasFilter = !!(day || range);
    items.push({ id: t.id, rec: idx.recs.get(t.id)!, people: linkedPeople(t, `${t.title} ${t.notes ?? ""}`, people, world), timeOk: !hasFilter || timeMatched, timeMatched, extra: 0, matchedExtra: [], sortKey: t.updatedAt });
  }
  if (kinds.includes("memo")) for (const m of world.memos) {
    if (!liveFor(m, input, world)) continue;
    pool.push(idx.recs.get(m.id)!);
    const timeMatched = !!(day && m.writtenOn === day) || !!(range && m.writtenOn >= range.from && m.writtenOn <= range.to);
    const titleWord = tws.some((x) => fold(m.title).includes(x));
    items.push({ id: m.id, rec: idx.recs.get(m.id)!, people: linkedPeople(m, `${m.title} ${m.body}`, people, world), timeOk: true, timeMatched, titleWord, extra: 0, matchedExtra: [], sortKey: m.updatedAt });
  }
  const todoOnly = kinds.length === 1 && kinds[0] === "todo";
  const hasTimeFilter = !!(day || range);
  return rank(items, q, pool, { hasPeople: people.length > 0, hasTimeFilter, softTime: !todoOnly && hasTimeFilter });
}
export function findTodosMemos(input: FindInput, world: World): Candidate[] { return strip(scoredTodosMemos(input, world)); }

// ---------------------------------------------------------------- schedule
interface Occ { day: string; original: string; startH: number; start: number; end: number; allDayTo?: string }
const occCache = new WeakMap<ScheduleItem, Occ[]>();
export function occurrences(s: ScheduleItem, world: World): { occ: Occ[]; cancelled: string[] } {
  const cancelled = (s.exceptions ?? []).filter((e) => e.cancelled).map((e) => e.day);
  const hit = occCache.get(s);
  if (hit) return { occ: hit, cancelled };
  const tz = world.timeZone;
  const first = localParts(s.startsAt, tz);
  const firstDay = first.date;
  const dur = new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
  const now = parseYMD(localDay(world.now, world));
  const from = addDays(now, -plan.time.seriesWindowPastDays), to = addDays(now, plan.time.seriesWindowFutureDays);
  const out: Occ[] = [];
  const startMsOf = (d: string) => new Date(s.startsAt).getTime() + (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(firstDay.y, firstDay.m - 1, firstDay.d));
  const push = (d: string) => {
    const ex = (s.exceptions ?? []).find((e) => e.day === d);
    if (ex?.cancelled) return;
    if (ex?.startsAt) {
      const st = new Date(ex.startsAt).getTime();
      out.push({ day: localDay(ex.startsAt, world), original: d, startH: localHour(ex.startsAt, world), start: st, end: ex.endsAt ? new Date(ex.endsAt).getTime() : st + dur });
    } else {
      const st = startMsOf(d);
      out.push({ day: d, original: d, startH: first.hour + first.minute / 60, start: st, end: st + dur, allDayTo: s.allDay && !s.recurrence ? localDay(s.endsAt, world) : undefined });
    }
  };
  if (!s.recurrence) push(fmt(firstDay));
  else {
    const until = s.recurrence.until ?? "9999-12-31";
    let d = { ...firstDay };
    const lo = fmt(from) > fmt(firstDay) ? from : firstDay;
    d = s.recurrence.frequency === "monthly" ? d : lo;
    for (let k = 0; k < 800; k++) {
      const ds = fmt(d);
      if (ds > fmt(to) || ds > until) break;
      if (ds >= fmt(firstDay) && ds >= fmt(from)) {
        const wd = ((new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay() + 6) % 7) + 1;
        if (s.recurrence.frequency === "daily") push(ds);
        else if (s.recurrence.frequency === "weekly") { if ((s.recurrence.byWeekday ?? [((new Date(Date.UTC(firstDay.y, firstDay.m - 1, firstDay.d)).getUTCDay() + 6) % 7) + 1]).includes(wd)) push(ds); }
        else if (s.recurrence.frequency === "monthly") { if (d.d === firstDay.d) push(ds); }
      }
      if (s.recurrence.frequency === "monthly") { let y = d.y, m = d.m + 1; if (m > 12) { m = 1; y++; } d = { y, m, d: firstDay.d }; if (firstDay.d > new Date(Date.UTC(y, m, 0)).getUTCDate()) { d = { y, m, d: 1 }; } }
      else d = addDays(d, 1);
    }
  }
  out.sort((a, b) => a.start - b.start);
  occCache.set(s, out);
  return { occ: out, cancelled };
}

/** r07: "the all-day one" (全天 / 終日 / 一日中 / all-day) is an attribute of the item (allDay), not a title word. */
const ALL_DAY_RE = /(一整天|整天|全天|終日|一日中|丸一日|all[- ]day|whole[- ]day|full[- ]day)/i;

export function scoredSchedule(input: FindInput, world: World): Scored[] {
  const idx = index(world);
  const allDayWanted = ALL_DAY_RE.test(input.clue);
  const words = contentWordsFor(input, world, allDayWanted ? [new RegExp(ALL_DAY_RE.source, "gi")] : []);
  const ord = ordinalCands(input, world, /^S-/, words.length === 0, words);
  if (ord) return ord;
  const q = buildQuery(words);
  const people = input.people ?? [];
  const tm = input.time ?? {};
  const now = nowOf(world);
  const items: Item[] = [];
  const pool: Rec[] = [];
  const hasTimeFilter = !!(tm.day || tm.range || tm.partOfDay || tm.went) || allDayWanted;
  for (const s of world.schedule) {
    if (!liveFor(s, input, world)) continue;
    const rec = idx.recs.get(s.id)!;
    pool.push(rec);
    const { occ, cancelled } = occurrences(s, world);
    const onDay = (o: Occ, d: string) => o.day === d || o.original === d || (!!o.allDayTo && d >= o.day && d <= o.allDayTo);
    let pick: Occ | undefined;
    let timeMatched = false, timeOk = true;
    const extra: string[] = [];
    if (tm.day || tm.range) {
      const hits = occ.filter((o) => (tm.day ? onDay(o, tm.day) : (o.day >= tm.range!.from && o.day <= tm.range!.to) || (!!o.allDayTo && o.allDayTo >= tm.range!.from && o.day <= tm.range!.to))
        && (s.allDay ? !tm.partOfDay : inPod(o.startH, tm.partOfDay)) && (!tm.went || o.start < now));
      if (hits.length) { pick = hits.find((o) => o.end >= now) ?? hits[hits.length - 1]; timeMatched = true; }
      else {
        const hitCancelled = cancelled.some((d) => (tm.day ? d === tm.day : d >= tm.range!.from && d <= tm.range!.to));
        if (hitCancelled) { timeMatched = true; extra.push("cancelled"); } else timeOk = false;
      }
    } else if (tm.partOfDay) {
      timeOk = false;
    } else if (tm.went) {
      const past = occ.filter((o) => o.start < now);
      pick = past[past.length - 1];
      timeOk = !!pick; timeMatched = !!pick;
    } else {
      pick = occ.find((o) => o.end >= now && (tm.occurrence !== "next" || o.start >= now)) ?? occ[occ.length - 1];
    }
    if (allDayWanted && !s.allDay) timeOk = false;
    else if (allDayWanted && !tm.day && !tm.range) timeMatched = true;
    // a series names the meant occurrence; a single item pinned by the said day / range names its own day (r04)
    const occurrence = tm.occurrence !== "series" && pick && (s.recurrence || timeMatched) ? pick.day : undefined;
    items.push({ id: s.id, rec, people: linkedPeople(s, s.title, people, world), timeOk, timeMatched, extra: 0, occurrence, matchedExtra: extra, sortKey: String(9e15 - (pick?.start ?? 0)).padStart(20, "0") });
  }
  return rank(items, q, pool, { hasPeople: people.length > 0, hasTimeFilter });
}
export function findSchedule(input: FindInput, world: World): Candidate[] { return strip(scoredSchedule(input, world)); }

// ---------------------------------------------------------------- events
const SIGNUP_RE = /(报名|報名|报了名|報了名|申し込|申込|登録した|エントリー|sign(?:ed)?\s*up|registered|register|rsvp)/i;
const PRIVATE_RE = /(自己记|自己記|我自己|自分で登録|自分で入れ|自分で作|自分の|my own|i added|i saved)/i;
const WENT_WORD_RE = /(去过|去過|去了|去的|行った|参加した|went|attended)/i;

export function scoredEvents(input: FindInput, world: World): Scored[] {
  const idx = index(world);
  const text = `${input.sentence} ${input.clue}`;
  const privateOnly = PRIVATE_RE.test(text);
  const signup = !privateOnly && SIGNUP_RE.test(text);
  const words = contentWordsFor(input, world, [new RegExp(SIGNUP_RE.source, "gi"), new RegExp(PRIVATE_RE.source, "gi")]);
  const ord = ordinalCands(input, world, /^[EP]-/, words.length === 0, words);
  if (ord) return ord;
  const q = buildQuery(words);
  const people = input.people ?? [];
  const tm = input.time ?? {};
  const went = tm.went === true || (WENT_WORD_RE.test(input.clue) && !tm.day && !tm.range);
  const now = nowOf(world);
  const att = world.attendance.filter((a) => a.account === input.account);
  const items: Item[] = [];
  const pool: Rec[] = [];
  const evs: (PlatformEvent | PrivateEvent)[] = [...world.platformEvents, ...(privateOnly ? [] : []), ...world.privateEvents];
  for (const e of evs) {
    const isPrivate = e.id.startsWith("P-") || (e as PrivateEvent).account !== undefined;
    if (isPrivate && !liveFor(e as PrivateEvent, input, world)) continue;
    if (!isPrivate && input.verb === "restore") continue;
    const rec = idx.recs.get(e.id)!;
    pool.push(rec);
    if (privateOnly && !isPrivate) continue;
    const a = att.filter((x) => x.eventId === e.id);
    if (went && !a.some((x) => x.went)) continue;
    if (signup && !a.length) continue;
    const startDay = localDay(e.startsAt, world);
    let endDay = startDay;
    if (e.endsAt) { endDay = localDay(e.endsAt, world); if (!e.allDay && endDay > startDay && localHour(e.endsAt, world) === 0) endDay = fmt(addDays(parseYMD(endDay), -1)); }
    const start = new Date(e.startsAt).getTime();
    let timeOk = true, timeMatched = false;
    if (tm.day || tm.range) {
      const lo = tm.day ?? tm.range!.from, hi = tm.day ?? tm.range!.to;
      const dayOk = startDay <= hi && endDay >= lo;
      const podOk = !tm.partOfDay || (!e.allDay && inPod(localHour(e.startsAt, world), tm.partOfDay));
      timeOk = dayOk && podOk;
      timeMatched = timeOk;
    } else if (tm.partOfDay) timeOk = false;
    if (went && !(tm.day || tm.range)) timeMatched = true;
    // most recent attended first for "上次"; otherwise upcoming before past
    const sortKey = went ? String(start).padStart(16, "0") : String(start >= now ? 9e15 - start : start / 10).padStart(20, "0");
    items.push({ id: e.id, rec, people: linkedPeople({}, e.title, people, world), timeOk, timeMatched, extra: went ? S.attendedRecencyBonus * (start / now) : 0, matchedExtra: signup ? ["signed-up"] : [], sortKey });
  }
  return rank(items, q, pool, { hasPeople: false, hasTimeFilter: !!(tm.day || tm.range) || went });
}
export function findEvents(input: FindInput, world: World): Candidate[] { return strip(scoredEvents(input, world)); }

// ---------------------------------------------------------------- contacts (by description)
const CONTACT_GENERIC = [/(那边的人|那边|那位|那个人|的人|的那位|朋友|知り合い|联系人|联络人|聯絡人|担当者|担当|の方|の人|会社|公司|那家|这家|人|谁|誰|叫什么|名字|名前|电话|電話番号|電話|号码|連絡先)/g,
  /\b(guy|guys|person|people|company|firm|friend|contact|who|name|phone|number|runs?|manages?|handles?|in charge|responsible|works?|head)\b/g,
  /(管|负责|負責|担当|見てる|見ている|やってる|やっている|做|搞|当)/g];

export function scoredContacts(input: FindInput, world: World): Scored[] {
  const idx = index(world);
  const words = contentWordsFor(input, world, CONTACT_GENERIC);
  const ord = ordinalCands(input, world, /^C-/, words.length === 0);
  if (ord) return ord;
  const q = buildQuery(words);
  const people = input.people ?? [];
  const items: Item[] = [];
  const pool: Rec[] = [];
  for (const c of world.contacts) {
    if (!liveFor(c, input, world)) continue;
    const rec = idx.recs.get(c.id)!;
    pool.push(rec);
    items.push({ id: c.id, rec, people: people.includes(c.id) ? [c.id] : [], timeOk: true, timeMatched: false, extra: 0, matchedExtra: [], sortKey: c.lastInteractionAt ?? "" });
  }
  return rank(items, q, pool, { hasPeople: people.length > 0, hasTimeFilter: false });
}
export function findContacts(input: FindInput, world: World): Candidate[] { return strip(scoredContacts(input, world)); }

export { index as worldIndex };
export function recordTextForPeople(id: string, world: World): { contactIds?: string[]; text: string } | undefined {
  const t = world.todos.find((x) => x.id === id) as Todo | undefined;
  if (t) return { contactIds: t.contactIds, text: `${t.title} ${t.notes ?? ""}` };
  const m = world.memos.find((x) => x.id === id) as Memo | undefined;
  if (m) return { contactIds: m.contactIds, text: `${m.title} ${m.body}` };
  const s = world.schedule.find((x) => x.id === id);
  if (s) return { contactIds: s.contactIds, text: s.title };
  const e = [...world.platformEvents, ...world.privateEvents].find((x) => x.id === id);
  if (e) return { text: e.title };
  const c = world.contacts.find((x) => x.id === id);
  if (c) return { contactIds: [c.id], text: "" };
  return undefined;
}
export function isLinked(id: string, people: string[], world: World): boolean {
  const r = recordTextForPeople(id, world);
  if (!r) return false;
  return linkedPeople({ contactIds: r.contactIds }, r.text, people, world).length > 0;
}
