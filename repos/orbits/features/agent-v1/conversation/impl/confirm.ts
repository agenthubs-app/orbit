// @ts-nocheck -- conversation/impl/confirm.ts: copied byte for byte from lab-conv repos/orbits/lab/conversation/rsi/archive/r11-maintenance/impl/confirm.ts
// (lab commit ce0b76fe4, r11 = r10 + when to ask round 2: exact @ / quoted picks on reads, typed confirmations while a card waits, 他们 for a company). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * r10: writes a careful person confirms before carrying them out (SPEC R34, R35, R37), computed from the world passed
 * in at runtime. Nothing here knows this world's records: duplicates are found by comparing what the user says with the
 * account's own records (same kind, same person, shared content), links by the records that point at the target,
 * recurring items by their recurrence rule and exceptions.
 */
import type { Slots, TimeWindow } from "../types";
import { chunks, containsTerm, fold, isCjk } from "./text";
import { addDays, isoWeekday, localDay, parseClock, parseTime } from "./time";
import { conceptsOf } from "./concepts";
import type { WorldIx } from "./world";
import { PARAMS } from "./params";

/**
 * Everyday action words (prefix a) and object words (prefix o) of to-dos in zh / ja / en, each group one unit, so a
 * request in one language can meet a record written in another (general vocabulary, nothing of this world).
 */
const ACTION_GROUPS: string[][] = [
  ["确认", "確認", "对一下", "核对", "confirm", "check"],
  ["订", "预订", "預約", "予約", "取る", "手配", "book", "reserve"],
  ["退", "退回", "返送", "返品", "return"],
  ["取件", "受け取", "领取", "pick up", "collect"],
  ["寄", "发送", "送る", "発送", "send", "mail"],
  ["打电话", "回电", "電話", "call", "phone"],
  ["见面", "面談", "会う", "拜访", "訪問", "meet", "visit"],
  ["准备", "準備", "用意", "まとめ", "prepare"],
  ["问", "聞く", "尋ね", "ask"],
];
const OBJECT_GROUPS: string[][] = [
  ["机票", "航空券", "航班", "飞机", "フライト", "flight", "flights", "plane ticket"],
  ["快递", "宅配", "宅配便", "荷物", "包裹", "parcel", "package", "delivery"],
  ["数据", "データ", "data"],
  ["吃饭", "会食", "食事", "饭局", "dinner", "lunch"],
];
const ACTION_FORMS = ACTION_GROUPS.map((g) => g.map((w) => fold(w)));
const OBJECT_FORMS = OBJECT_GROUPS.map((g) => g.map((w) => fold(w)));
/** CJK bigrams that are part of an action word (确认 / 核对 / 电话): they say what is done, not about what. */
const ACTION_BIGRAMS = new Set(ACTION_FORMS.flat().filter((w) => [...w].every(isCjk) && w.length >= 2).flatMap((w) => [...w].slice(0, -1).map((c, i) => c + w[i + 1])));
export const isObjectUnit = (u: string) => !u.startsWith("a") && !ACTION_BIGRAMS.has(u);

/** Words that say "one more of the same, on purpose" (R34: 再建一条同样的 / 同じ…もう一つ / another one → no confirmation). */
const ANOTHER_ON_PURPOSE = /(再|另|多)(建|加|来|做|开|记)?一(条|个|份|篇|件)一样|一样的|同样的|同じ.{0,12}(もう(一|1|ひと)つ|もう(一|1)件)|もう(一|1|ひと)つ.{0,6}同じ|\banother (one|copy)\b|\bone more of the same\b|\bthe same one again\b|\bduplicate\b/u;

const LATIN_STOP = new Set(["the", "and", "for", "with", "add", "todo", "task", "note", "memo", "make", "create", "new", "put", "please", "can", "you", "set", "remind", "about", "from", "this", "that", "into", "onto", "calendar", "schedule", "event", "one", "more", "next", "week", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "tomorrow", "my", "her", "his", "him", "them", "their", "our"]);

/** The content units of a folded text: CJK bigrams, Latin words, concept groups and action groups. */
const UNITS_CACHE = new Map<string, Set<string>>();
export function contentUnits(folded: string): Set<string> {
  const hit = UNITS_CACHE.get(folded);
  if (hit) return hit;
  const out = new Set<string>();
  if (UNITS_CACHE.size > 20000) UNITS_CACHE.clear();
  UNITS_CACHE.set(folded, out);
  for (const c of chunks(folded)) {
    if (/^[a-z][a-z0-9-]{2,}$/.test(c) && !LATIN_STOP.has(c)) out.add(c);
    const han = [...c];
    for (let k = 0; k + 2 <= han.length; k++) if (isCjk(han[k]) && isCjk(han[k + 1])) out.add(han[k] + han[k + 1]);
  }
  for (const g of conceptsOf(folded)) out.add(`c${g}`);
  const has = (f: string) => (/^[a-z ]+$/.test(f) ? containsTerm(folded, f) : folded.replace(/\s+/g, "").includes(f));
  ACTION_FORMS.forEach((forms, i) => { if (forms.some(has)) out.add(`a${i}`); });
  OBJECT_FORMS.forEach((forms, i) => { if (forms.some(has)) out.add(`o${i}`); });
  return out;
}

/** Units both texts have (a unit of b counted once). */
export function sharedUnits(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((u) => b.has(u));
}

export const anotherOnPurpose = (pf: string) => ANOTHER_ON_PURPOSE.test(pf);

/** The local days a to-do is about: planned / due day, and days written in its notes. */
function todoDays(ix: WorldIx, id: string): string[] {
  const t = ix.world.todos.find((x) => x.id === id);
  if (!t) return [];
  const days: string[] = [];
  if (t.plannedDate) days.push(t.plannedDate);
  if (t.dueAt) days.push(localDay(t.dueAt));
  if (t.notes) {
    const w = parseTime(fold(t.notes), localDay(t.createdAt)).win;
    if (w && w.from === w.to) days.push(w.from);
  }
  return days;
}

export interface DupInput {
  kind: "todo" | "memo" | "schedule";
  units: Set<string>;          // content units of the message (people masked)
  people: string[];            // contact ids of the request
  day?: string;                // the day of the request (one-day window)
  clock?: string | null;       // HH:MM the message gives
  title?: string;              // a title the message quotes for the new record
  vis: (id: string) => boolean;
}

/**
 * R34: the account's records the new one would duplicate. A to-do: an open one of the same person (when the request
 * names one) sharing content beyond the person, or with no person sharing two units; a done one only when it is about
 * the same day. A memo: the same title, or the same person and two shared units. A schedule item: the same day and the
 * same start time, and the same person or shared title content.
 */
export function duplicatesOf(ix: WorldIx, d: DupInput): string[] {
  const out: string[] = [];
  for (const r of ix.recs.values()) {
    if (r.kind !== d.kind || !d.vis(r.id)) continue;
    const tu = contentUnits(r.titleF);
    const shared = sharedUnits(d.units, tu);
    const samePerson = d.people.length > 0 && d.people.every((p) => r.contactIds.includes(p));
    const otherPerson = d.people.length > 0 && !samePerson;
    if (otherPerson) continue;
    if (d.kind === "todo") {
      if (r.status === "done" && !(d.day && todoDays(ix, r.id).includes(d.day))) continue;
      // the same thing: the person and something of what is done, or (no person) most of the title
      // (a title that is only an action — a call — meets the same action for the same person)
      const objects = shared.filter(isObjectUnit);
      const titleHasObject = [...tu].some(isObjectUnit);
      const enough = samePerson ? objects.length >= 1 || (!titleHasObject && shared.length >= 1) : objects.length >= 1 && shared.length >= PARAMS.dupMinShared && shared.length * 2 >= Math.min(tu.size, PARAMS.dupTitleUnitsCap);
      if (enough) out.push(r.id);
    } else if (d.kind === "memo") {
      const sameTitle = !!d.title && fold(d.title).replace(/\s+/g, "") === r.titleF.replace(/\s+/g, "");
      if (sameTitle || (samePerson && shared.filter(isObjectUnit).length >= 2)) out.push(r.id);
    } else {
      if (!d.day) continue;
      const s = ix.world.schedule.find((x) => x.id === r.id);
      if (!s || s.recurrence) continue;
      if (localDay(s.startsAt) !== d.day) continue;
      if (d.clock && s.startsAt.slice(11, 16) !== d.clock) continue;
      if (samePerson || shared.some(isObjectUnit)) out.push(r.id);
    }
  }
  return out;
}

/** R35: the account's records still linked to a contact or an event (to-dos, notes, schedule items, attendance). */
export function linksOf(ix: WorldIx, id: string, vis: (id: string) => boolean): string[] {
  const w = ix.world;
  const out: string[] = [];
  if (id.startsWith("C-")) {
    for (const r of ix.recs.values()) if (r.kind !== "contact" && r.id !== id && vis(r.id) && r.contactIds.includes(id)) out.push(r.id);
  } else if (/^[EP]-/.test(id)) {
    for (const a of w.attendance) if (a.account === ix.account && a.eventId === id) out.push(a.id);
    for (const t of w.todos) if (t.account === ix.account && !t.deletedAt && (t.eventIds ?? []).includes(id) && vis(t.id)) out.push(t.id);
    for (const m of w.memos) if (m.account === ix.account && !m.deletedAt && (m.eventIds ?? []).includes(id) && vis(m.id)) out.push(m.id);
  }
  return out;
}

export function isRecurring(ix: WorldIx, id: string): boolean {
  return !!ix.world.schedule.find((x) => x.id === id)?.recurrence;
}

/**
 * The occurrences of a schedule item that fall in a window: its regular days (by the recurrence rule) and the days
 * exceptions moved them to; a cancelled one is reported as cancelled.
 */
export function occurrencesIn(ix: WorldIx, id: string, win: TimeWindow): { day: string; cancelled: boolean }[] {
  const s = ix.world.schedule.find((x) => x.id === id);
  if (!s) return [];
  const first = localDay(s.startsAt);
  const out: { day: string; cancelled: boolean }[] = [];
  const inWin = (d: string) => d >= win.from && d <= win.to;
  if (!s.recurrence) {
    if (inWin(first)) out.push({ day: first, cancelled: false });
    return out;
  }
  const rec = s.recurrence;
  const until = rec.until ? localDay(rec.until) : "9999-12-31";
  const regular: string[] = [];
  // scan the window and a week around it (an exception may move an occurrence across the window's edge)
  for (let d = addDays(win.from, -7); d <= addDays(win.to, 7); d = addDays(d, 1)) {
    if (d < first || d > until) continue;
    const ok = rec.frequency === "daily" || (rec.frequency === "weekly" && (rec.byWeekday?.length ? rec.byWeekday.includes(isoWeekday(d)) : isoWeekday(d) === isoWeekday(first))) || (rec.frequency === "monthly" && d.slice(8) === first.slice(8));
    if (ok) regular.push(d);
  }
  for (const d of regular) {
    const ex = (s.exceptions ?? []).find((x) => x.day === d);
    if (ex?.cancelled) { if (inWin(d)) out.push({ day: d, cancelled: true }); continue; }
    const moved = ex?.startsAt ? localDay(ex.startsAt) : d;
    if (inWin(moved) || inWin(d)) out.push({ day: moved, cancelled: false });
  }
  return out;
}

/** The start time a message gives (HH:MM), if any. */
export const clockOf = (folded: string): string | null => parseClock(folded);

export type { Slots };
