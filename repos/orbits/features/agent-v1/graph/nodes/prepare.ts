/**
 * Hotfix 2026-11-20 part 2 (the App's suggested question todayVm.questionPreparation, live site): 「接下来的会面或活动，该准备什么？」
 * was taken as "pick events by the topic 「接下来的会面或活动，该准备什么？」" — one event, 「记录里看不出和这个主题直接相关」; the
 * meetings (schedule items) were not read and nothing was said about preparing.
 *
 * Code's answer, no model call and no ranking: the next schedule items (a repeating one as its occurrence) and the next
 * events the user is registered for that have not started, nearest first, a few; each as its card, and under it what the
 * user's own records hold that bears on it — open to-dos linked to it or to its people, the notes linked to it, each
 * person's latest note — or, plainly, that nothing is linked.
 */
import type { AgentAnswerRecordContract } from "../../../../shared/contract/agent-v1";
import { readSourceOf } from "../../answer/basis";
import { listSortKey, recordOfView, recordsBlock, type AnswerBlock } from "../../answer/blocks";
import { recordLine } from "../../answer/list-answer";
import { readPages } from "../../domains/registry";
import { occurrenceIn } from "../../domains/schedule/read";
import { occurrenceViews } from "../../domains/schedule/occurrences";
import type { DomainScope, RecordView } from "../../domains/types";
import type { Language } from "../../functions/copy";
import { dayWordsOf, localParts } from "../../functions/copy";
import { emitTrace } from "../../observability/trace";
import type { NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";
import { localMidnight } from "./resolve";

const PREPARE = /(准备|準備|用意|\bprepar)/iu;
const MEETINGS = /(会面|见面|会议|开会|约会|活动|日程|安排|面会|打ち合わせ|ミーティング|会議|イベント|予定|\bmeetings?\b|\bevents?\b|\bappointments?\b|\bcalls?\b)/iu;
/** The user's own next ones — not advice on a meeting in general (「下周要第一次拜访一家新客户，要准备什么」 stays a discussion). */
const NEXT = /(接下来|下一个|下一场|下次|即将|近期|最近的|次の|これから|今後|直近|\bupcoming\b|\bnext\b|\bcoming\b|\bmy\b)/iu;

/** What to prepare for the next meetings or events (zh, ja, en). */
export function asksWhatToPrepare(words: string): boolean {
  return PREPARE.test(words) && MEETINGS.test(words) && NEXT.test(words);
}

/** How many meetings and events, and how far ahead. */
export const PREPARE_LIMIT = 4;
const HORIZON_DAYS = 30;

const WORDS = {
  en: {
    lead: (n: number) => `Your next ${n === 1 ? "meeting or event" : `${n} meetings and events`}, each with what your records hold about it:`,
    none: `Nothing is scheduled in the next ${HORIZON_DAYS} days and you are not registered for any upcoming event, so there is nothing to prepare yet.`,
    nothing: "Nothing in your records is linked to it.",
    todos: (items: string[]) => `Open to-dos: ${items.join("; ")}.`,
    notes: (items: string[]) => `Linked notes: ${items.join("; ")}.`,
    latest: (name: string, day: string, said: string) => `Latest note about ${name} (${day}): ${said}`,
    with: (names: string[]) => `With ${names.join(", ")}.`,
  },
  ja: {
    lead: (n: number) => `これからの面会・イベントは${n}件です。それぞれ、記録の中で関係するものを添えます：`,
    none: `この${HORIZON_DAYS}日間に入っている予定も、申し込んだこれからのイベントもないので、今のところ準備することはありません。`,
    nothing: "記録の中で、これに関係するものはありません。",
    todos: (items: string[]) => `未完了のタスク：${items.join("、")}。`,
    notes: (items: string[]) => `関連するメモ：${items.join("、")}。`,
    latest: (name: string, day: string, said: string) => `${name}さんの最新のメモ（${day}）：${said}`,
    with: (names: string[]) => `相手：${names.join("、")}。`,
  },
  zh: {
    lead: (n: number) => `接下来有 ${n} 个会面或活动，每个下面是你记录里和它有关的内容：`,
    none: `接下来 ${HORIZON_DAYS} 天里没有安排的会面，也没有报名的活动，所以现在还没有要准备的事。`,
    nothing: "你的记录里没有和它相关的待办或笔记。",
    todos: (items: string[]) => `还没完成的待办：${items.join("；")}。`,
    notes: (items: string[]) => `关联的笔记：${items.join("；")}。`,
    latest: (name: string, day: string, said: string) => `${name}的最新笔记（${day}）：${said}`,
    with: (names: string[]) => `对方：${names.join("、")}。`,
  },
} as const;

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const strs = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : []);

/** The first sentence of a note, short. */
function said(body: string, language: Language): string {
  const flat = body.replace(/\s+/gu, " ").trim();
  const end = flat.search(/[。！？!?]|\.(?:\s|$)/u);
  const first = end > 0 ? flat.slice(0, end + 1) : flat;
  const max = language === "en" ? 140 : 60;
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

async function quietly<T, F = T>(work: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await work;
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.failed", where: "functions.prepare" });
    return fallback;
  }
}

/**
 * Whether an item is still coming up. A timed item until it starts. An all-day item (AG20a's private events; a schedule
 * item) until the end of its day in the user's time zone — it is stored at that day's midnight, so by its start alone it
 * would be "over" all through its own day (integration of the hotfix and AG20a, 2026-11-20).
 */
export function comesUp(startsAt: string, allDay: boolean | null | undefined, now: string, timeZone: string): boolean {
  if (!allDay) return startsAt >= now;
  const dayAfter = new Date(Date.parse(`${localParts(startsAt, timeZone).day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return Date.parse(now) < Date.parse(localMidnight(dayAfter, timeZone));
}

export async function preparePart(scope: NodeScope, state: AgentGraphState, part: GraphPart): Promise<void> {
  const { deps, input, run } = scope;
  const records = deps.records!;
  const language = state.language as Language;
  const zone = state.timeZone || "Asia/Tokyo";
  const now = state.asOf || deps.now();
  const until = new Date(Date.parse(now) + HORIZON_DAYS * 86_400_000).toISOString();
  const account: DomainScope = records.scope(input.actorId);
  const words = WORDS[language];

  // 1. The next schedule items in the horizon, each as its occurrence.
  const schedulePages = await quietly(readPages(records.reader, "schedule", account, { from: now, to: until }, 1), { complete: true, items: [] as RecordView[], pagesRead: 0, partialReasons: [], total: 0, withheld: 0 });
  const occurrences = new Map<string, string>();
  // An all-day item of today began at midnight, before `now`, and is still to prepare for: the all-day items whose
  // occurrence is today are read apart (from the start of the user's day up to now) and come first.
  const dayStart = localMidnight(localParts(now, zone).day, zone);
  const earlierToday = dayStart < now ? await quietly(readPages(records.reader, "schedule", account, { from: dayStart, to: now }, 1), { complete: true, items: [] as RecordView[], pagesRead: 0, partialReasons: [], total: 0, withheld: 0 }) : { items: [] as RecordView[] };
  const allDayToday = earlierToday.items.filter((view) => {
    if (view.fields.allDay !== true) return false;
    const at = occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, dayStart, now);
    if (at) occurrences.set(view.ref, at);
    return Boolean(at);
  });
  const upcoming = [...allDayToday, ...schedulePages.items.filter((view) => {
    // Today's occurrence of an all-day item that repeats is the one listed, not next week's.
    if (occurrences.has(view.ref)) return false;
    const at = occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, now, until);
    if (at) occurrences.set(view.ref, at);
    return Boolean(at);
  })];
  const meetings = await quietly(occurrenceViews(records.source, account, upcoming, occurrences, zone), upcoming);
  // 2. The events the user is registered for that have not started.
  const ids = records.registeredEventIds ? await quietly(records.registeredEventIds(input.actorId), [] as readonly string[]) : [];
  const events: RecordView[] = [];
  for (const id of ids) {
    const view = (await quietly(records.reader.read("event", account, { id }), { items: [] as RecordView[] })).items[0];
    const startsAt = view ? str(view.fields.startsAt) : undefined;
    if (view && startsAt && startsAt >= now && startsAt < until) events.push(view);
  }
  // Hotfix 1c (coordinator's decision 2): the user's own private events that have not started (AG13's records), read by id
  // through the domain reader like an attached one — the same rules, the same card (🔒 私人) — and sent nowhere new.
  const own = records.privateEvents ? await quietly(records.privateEvents.list(input.actorId), [] as readonly { id: string; startsAt: string; allDay?: boolean }[]) : [];
  for (const item of own) {
    // An all-day one counts until the end of its day (comesUp), not until its midnight start.
    if (!(comesUp(item.startsAt, item.allDay, now, zone) && item.startsAt < until)) continue;
    const view = (await quietly(records.reader.read("event", account, { id: item.id }), { items: [] as RecordView[] })).items[0];
    if (view) events.push(view);
  }
  const items = [...meetings, ...events].sort((left, right) => String(left.fields.startsAt).localeCompare(String(right.fields.startsAt))).slice(0, PREPARE_LIMIT);

  // 3. What the user's records hold about each (each record said once).
  const names = new Map<string, string>();
  const nameOf = async (id: string) => {
    if (!names.has(id)) names.set(id, String((await quietly(records.reader.read("contact", account, { id }), { items: [] as RecordView[] })).items[0]?.fields.displayName ?? ""));
    return names.get(id) ?? "";
  };
  const used = new Set<string>();
  const readViews: RecordView[] = [...items];
  // The open to-dos linked to an event (a to-do read has no event condition): one page of the open ones.
  const openTodos = items.some((item) => item.kind === "event") ? (await quietly(readPages(records.reader, "todo", account, { status: "open" }, 1), { complete: true, items: [] as RecordView[], pagesRead: 0, partialReasons: [], total: 0, withheld: 0 })).items : [];
  const sections: { item: RecordView; lines: string[]; linked: RecordView[] }[] = [];
  for (const item of items) {
    const people = strs(item.fields.contactIds);
    const lines: string[] = [];
    const linked: RecordView[] = [];
    const personNames = (await Promise.all(people.map(nameOf))).filter(Boolean);
    const todos: RecordView[] = [];
    for (const contactId of people) todos.push(...(await quietly(records.reader.read("todo", account, { contactId, limit: 5, status: "open" }), { items: [] as RecordView[] })).items);
    if (item.kind === "event") todos.push(...openTodos.filter((view) => view.fields.eventId === item.id || strs(view.fields.eventRefs).some((ref) => ref === item.id || ref.endsWith(`:${item.id}`))));
    // A private event's linked to-dos and notes are the records that point at it (privateEvents.references, AG13).
    const linkedIds: string[] = [...strs(item.fields.noteIds)];
    if (item.id.startsWith("private_event:") && records.privateEvents) {
      for (const ref of await quietly(records.privateEvents.references(input.actorId, item.id), [] as readonly { id: string; kind: string }[])) {
        if (ref.kind === "memo") linkedIds.push(ref.id);
        if (ref.kind !== "todo") continue;
        const view = (await quietly(records.reader.read("todo", account, { id: ref.id }), { items: [] as RecordView[] })).items[0];
        if (view && view.fields.status !== "completed" && !todos.some((other) => other.ref === view.ref)) todos.push(view);
      }
    }
    const freshTodos = todos.filter((view) => !used.has(view.ref) && used.add(view.ref));
    const notes: RecordView[] = [];
    for (const id of linkedIds) {
      const note = (await quietly(records.reader.read("memo", account, { id }), { items: [] as RecordView[] })).items[0];
      if (note && !used.has(note.ref)) {
        used.add(note.ref);
        notes.push(note);
      }
    }
    const latest: string[] = [];
    for (const contactId of people) {
      const note = (await quietly(records.reader.read("memo", account, { contactId, limit: 1, order: "newest" }), { items: [] as RecordView[] })).items[0];
      if (!note || used.has(note.ref)) continue;
      used.add(note.ref);
      const day = str(note.fields.createdAt) ? localParts(String(note.fields.createdAt), zone).day : null;
      latest.push(words.latest(names.get(contactId) || "", day ? dayWordsOf(day, language) : "", said(String(note.fields.body ?? ""), language)));
      linked.push(note);
    }
    if (personNames.length) lines.push(words.with(personNames));
    if (freshTodos.length) lines.push(words.todos(freshTodos.map((view) => recordLine(recordOfView(view, { language, now, timeZone: zone }), language))));
    if (notes.length) lines.push(words.notes(notes.map((view) => `${language === "en" ? `"${str(view.fields.title) ?? said(String(view.fields.body ?? ""), language)}"` : `「${str(view.fields.title) ?? said(String(view.fields.body ?? ""), language)}」`}`)));
    lines.push(...latest);
    if (!freshTodos.length && !notes.length && !latest.length) lines.push(words.nothing);
    linked.unshift(...freshTodos, ...notes);
    readViews.push(...linked);
    sections.push({ item, lines, linked });
  }

  // 4. The answer: the lead, then each meeting or event as its card with its lines and its linked records as small cards.
  const cardOf = (view: RecordView): AgentAnswerRecordContract => recordOfView(view, { language, nameOf: (id) => names.get(id) || run.readNames.get(id)?.name, now, timeZone: zone });
  const text: string[] = [items.length ? words.lead(items.length) : words.none];
  const blocks: AnswerBlock[] = [{ text: text[0], type: "paragraph" }];
  sections.forEach(({ item, lines, linked }, index) => {
    const card = cardOf(item);
    text.push(`${index + 1}. ${recordLine(card, language)}`, lines.join(language === "en" ? " " : ""));
    const own = recordsBlock([card], language);
    if (own) blocks.push(own);
    blocks.push({ text: lines.join(language === "en" ? " " : ""), type: "paragraph" });
    const small = recordsBlock(linked.map(cardOf), language, { size: "mini" });
    if (small) blocks.push(small);
  });
  for (const view of readViews) {
    run.recordCards.set(view.ref, cardOf(view));
    run.recordSort.set(view.ref, listSortKey(view));
    run.readNames.set(view.id, { name: str(view.fields.title) ?? str(view.fields.displayName) ?? "", type: view.kind });
    const source = readSourceOf(view, zone);
    if (source) run.readSources.set(view.ref, source);
  }
  run.answers.set(part.localId, text.join("\n"));
  run.answerBlocks.set(part.localId, blocks);
  part.route = "read";
  part.status = "answered";
  part.reason = null;
  part.cites = readViews.map((view) => view.ref);
  part.reads = readViews.map((view) => ({ ref: view.ref, version: view.version }));
  part.coverage = [{ complete: schedulePages.complete, kind: "schedule", pagesRead: schedulePages.pagesRead, seen: meetings.length, total: meetings.length }, { complete: true, kind: "event", pagesRead: 1, seen: events.length, total: events.length }];
  part.gaps = items.length ? [] : ["no_record"];
  emitTrace({ events: events.map((view) => view.ref), items: items.map((view) => view.ref), linked: readViews.length - items.length, partId: part.localId, type: "functions.prepared" });
}
