/**
 * resolve (code): the read of every part routed to `read` (设计稿 §3.2 第 1、2 步, §4; agent-design AG05).
 * No model is called: the read request is compiled from the first layer's capabilities, object clues,
 * bound handles and readFilter (PLANNER 易错边界 9).
 *
 * - The scope is the authenticated account and the deployment's workspace; nothing from the model
 *   widens it (易错边界 1). A person named in words is looked for in the account only.
 * - A part that points at a record that cannot be opened (an @ reference, or a record of the
 *   conversation that is no longer readable) reads nothing else: it says so and asks to choose again
 *   (§3.6, 易错边界 6).
 * - Several people of that name: narrowed by the company the user named; still several, it asks
 *   which one (§3.11, AG04 clarify) instead of guessing.
 * - Kinds read: memos, to-dos, schedule items, events by id, the contact's profile, the "recent
 *   interaction" view; at most 10 a page, more pages only for lists, with coverage (易错边界 3).
 * - What did not come back is a gap decided here (易错边界 5): nothing found (no_record, the part is
 *   still answered), a part withheld (partial), a failed read (service_error, never "no record"), a
 *   record that cannot be opened (unreadable).
 *
 * Record content stays in the run (the answer step's materials); the checkpoint gets refs, versions,
 * gaps and counts only.
 */
import { addLinkNames } from "../../answer/link-names";
import { pinyin } from "pinyin-pro";

import { readSourceOf } from "../../answer/basis";
import { listSortKey, recordOfView } from "../../answer/blocks";
import { gapWords } from "../../answer/gap-copy";
import { materialOf } from "../../answer/materials";
import type { GapReason, Material } from "../../answer/schema";
import { recordKindOf } from "../../clarify/default-readings";
import { optionNamedIn } from "../../clarify/attribution";
import { emptyKindsLine } from "../../answer/empty-kinds-copy";
import type { NamedRecordRef } from "../../context/session-state";
import { gapOfReadError, readPages } from "../../domains/registry";
import { matchText } from "../../domains/source";
import { occurrenceIn } from "../../domains/schedule/read";
import type { DomainKind, DomainScope, RecordView } from "../../domains/types";
import { emitTrace } from "../../observability/trace";
import { capabilityKind, type Capability } from "../../route/capabilities";
import { isPronounClue, settleDependencies } from "../../route/decide";
import { localDay, readRecentInteraction } from "../../views/recent-interaction";
import type { AgentRecordAccess, GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, PartCoverage } from "../state";
import { clueWords } from "./clarify";
import { webPartReads } from "./probe";
import { SIMILAR_TITLE, similarity } from "../../functions/link-back";
import { localDayOf, resolveSaidDate } from "../../propose/dates";
import { asksTodaysPlate, isPlateFilter, onlyWindowWords, swapsPeriod } from "../../understand/read-window";
import { widerThanAsked, type AskedRead, type Widened } from "./wider-read";
import { occurrenceViews } from "../../domains/schedule/occurrences";
import { comesUp } from "./prepare";

type ReadKind = "memo" | "todo" | "schedule" | "event" | "contact" | "interaction" | "attendance";

/**
 * AG21a (R35): words saying the user went to events ("我上个月去过哪些活动", "行ったイベント", "events I went to") — their
 * own «我去过» records, not the event directory.
 */
const WENT_WORDS = /(去过|参加过|我去了的|我参加了的|行った|参加した|\bwent to\b|\battended\b|\bbeen to\b)/iu;
export function asksWhereIWent(words: string): boolean {
  return WENT_WORDS.test(words);
}

const LIST_DELIVERABLES = new Set(["list", "ranked_list", "comparison"]);

const PERSON_PRONOUN = /^(?:他|她|TA|对方|彼女|彼|あの人|その人|him|her|he|she)$/iu;

/**
 * AG11 run-02 (AE-AMB-009): a clue that is a person pronoun once the user's own words around it are taken off
 * (「我和他」「我跟她」「她和我」「彼と私」"me and him"). Only used in a turn that answers an open question, where it means
 * that question's person.
 */
export function personPronounInReply(said: string): boolean {
  const rest = said.replace(/^@/u, "").trim()
    .replace(/^(?:我们|我)\s*(?:和|跟|与|同)\s*/u, "").replace(/\s*(?:和|跟|与|同)\s*(?:我们|我)$/u, "")
    .replace(/^(?:私|僕|俺)\s*と\s*/u, "").replace(/\s*と\s*(?:私|僕|俺)$/u, "")
    .replace(/^(?:me|i)\s+and\s+/iu, "").replace(/\s+and\s+(?:me|i)$/iu, "")
    .trim();
  return PERSON_PRONOUN.test(rest);
}

/** The kinds a part's capabilities read (functions work over memos). */
export function readKindsOf(capabilities: readonly Capability[]): Set<ReadKind> {
  const kinds = new Set<ReadKind>();
  for (const capability of capabilities) {
    switch (capability) {
      case "memo.read":
        kinds.add("memo");
        break;
      case "todo.read":
        kinds.add("todo");
        break;
      case "schedule.read":
        kinds.add("schedule");
        break;
      case "event.read":
        kinds.add("event");
        break;
      // AG21a (R35): the user's own «我去过» records (the list the write path uses), never a directory search.
      case "attendance.read":
        kinds.add("attendance");
        break;
      case "contact.read":
      case "profile.read":
        kinds.add("contact");
        break;
      case "view.recentInteraction":
        kinds.add("interaction");
        break;
      case "view.context":
        kinds.add("memo").add("todo");
        break;
      case "view.timeline":
        // The timeline is everything about the person over time: their notes, by date (the interaction view is "the last one").
        kinds.add("memo");
        break;
      default:
        if (capabilityKind(capability) === "function") kinds.add("memo");
    }
  }
  return kinds;
}

const HONORIFIC = /(さん|さま|様|くん|君|ちゃん|先生|氏|老师|女士|总监|经理|总)$/u;
const LATIN_TITLE = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/iu;

/** The words a person may be stored under: the clue as said, without honorifics, the last of "<org>の<name>". */
export function nameTokens(words: string): string[] {
  const clean = words.replace(/^@/u, "").replace(LATIN_TITLE, "").trim();
  const out: string[] = [];
  const push = (value: string) => {
    const token = value.replace(HONORIFIC, "").replace(/[\s,，、。]+$/u, "").trim();
    if (token && (token.length >= 2 || /^[A-Za-z]{3,}$/u.test(token)) && !out.includes(token)) out.push(token);
  };
  push(clean);
  const segments = clean.split(/[の的之]|'s\s+|\s+(?:from|at)\s+/u).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length > 1) push(segments[segments.length - 1]);
  return out;
}

/**
 * AG05 run-02: what a record clue says to look for, when the first layer gave no search words — the
 * clue's own words without pronouns, back-references, counts, ordinals, "my" and the words for a kind of
 * record ("那三份竞品笔记" → 竞品, "灰釉のメモ" → 灰釉, "the competitor notes" → competitor). Undefined when
 * nothing is left ("那篇笔记", "第二个", "this note"): the clue names no words to search by.
 */
const CJK_NOISE = [
  // run-02 repair 1: words for a time, a state or recency narrow by dates or status, never by words.
  "まだ終わっていない", "終わっていない", "期限を過ぎている", "期限切れ", "完了した", "没做完的", "没做完", "未完成的", "未完成", "未完了", "已完成的", "已完成", "过期的", "过期",
  "最近的", "最近", "最新的", "最新", "上次", "前回", "这个星期", "这个月", "上个月", "下个月", "今天", "明天", "昨天", "后天", "明後日", "今日", "明日", "昨日", "本周", "这周", "上周", "下周", "本月", "今週", "来週", "先週", "今月", "来月", "先月",
  "我记过的", "我记的", "我写的", "我的", "私が書いた", "私の", "关于", "有关", "について",
  "刚才", "刚刚", "上面", "前面", "之前", "先前", "さっき", "先ほど",
  "这些", "那些", "这个", "那个", "这条", "那条", "这篇", "那篇", "这件", "那件", "这份", "那份", "这次", "那次", "他们", "她们", "它们", "彼女", "あの人", "その人", "例の", "それ", "これ", "あれ", "その", "この", "あの",
  // Hotfix 2026-11-20: 代办 is the common mistyping of 待办; 所有、全部 name the whole set, never words to look for.
  "所有的", "所有", "全部的", "全部", "一共", "总共", "全都", "すべての", "全ての", "全部の",
  "笔记", "记录", "备忘", "待办", "代办", "任务", "日程", "活动", "联系人", "事情", "东西", "内容", "要点", "话题", "話", "メモ", "ノート", "タスク", "ToDo", "予定", "イベント", "もの", "こと",
  "他", "她", "它", "这", "那", "该", "彼", "我", "私", "件", "的", "の",
];
const LATIN_NOISE = new Set(["the", "a", "an", "this", "that", "these", "those", "it", "its", "my", "mine", "our", "your", "his", "her", "their", "him", "them", "me", "i", "about", "of", "on", "for", "in", "at", "to", "note", "notes", "memo", "memos", "record", "records", "todo", "todos", "to-do", "to-dos", "task", "tasks", "schedule", "event", "events", "item", "items", "one", "ones", "first", "second", "third", "last", "earlier", "above", "previous", "wrote", "written",
  "today", "tomorrow", "yesterday", "week", "month", "year", "next", "latest", "recent", "open", "done", "completed", "finished", "overdue", "pending", "upcoming", "all", "every"]);

/** run-02 repair 1: words that point at one record ("那篇", "第二个", "it") — as opposed to naming a kind ("タスク", "notes"). */
const POINTER = /(这|那|该|此|它|他|她|彼|それ|これ|あれ|その|この|あの|例の|刚才|刚刚|上面|前面|之前|さっき|先ほど|第[一二三四五六七八九十\d]|\b(this|that|these|those|it|its)\b)/iu;

export function cluePointsAtOne(words: string): boolean {
  return POINTER.test(words);
}

/** AG06 repair 1 (AE-SCL-008): the to-do status the user's words say (open before done: "没做完" holds "做完"). */
const FIRST_TIME = /(第一次|头一次|初次|最初|最早|初めて|最初に|\bfirst (time|met|meet|meeting)\b|\bwhen (I|we) first\b|\bearliest\b)/iu;
const OPEN_WORDS = /(まだ終わっていない|終わっていない|終わってない|未完了|未完成|没做完|没完成|还没做|未处理|还没处理|残っている|\bopen\b|\bnot (yet )?done\b|\bunfinished\b|\boutstanding\b|\bpending\b|\bstill to do\b)/iu;
const DONE_WORDS = /(已完成|做完了的|做完的|完了した|終わった|済んだ|\bcompleted\b|\bfinished\b|\bdone ones\b)/iu;

/** AG07 run-03 (AE-SCL-008): an overdue to-do is an open one, so "the overdue ones" counts the same to-dos as "the open ones". */
const OVERDUE_WORDS = /(期限を過ぎ|期限切れ|期限超過|过期|逾期|超期|\boverdue\b|\bpast due\b)/iu;

export function statusSaidIn(words: string): "open" | "completed" | undefined {
  if (OPEN_WORDS.test(words) || OVERDUE_WORDS.test(words)) return "open";
  if (DONE_WORDS.test(words)) return "completed";
  return undefined;
}

/**
 * AG06 repair 1 (AE-XL-010): a nickname ("小陈", "老王", "阿强") names no contact by itself; its family name may
 * match contacts partially. Those are offered as candidates, never taken, and never "not found".
 */
export async function partialContacts(records: AgentRecordAccess, scope: DomainScope, words: string): Promise<ContactMatch[]> {
  const clean = words.replace(/^@/u, "").replace(HONORIFIC, "").trim();
  const core = clean.replace(/^(小|老|阿|大)/u, "");
  // AG20b (owner decision 4, 2026-11-20): a name one character off ("贺兰清" between 贺兰青 and 贺岚清) offers the close ones.
  if (core === clean) return nearNames(records, scope, clean);
  if (core.length < 1 || core.length > 2) return [];
  try {
    const found = (await records.reader.read("contact", scope, { limit: 10, text: core })).items;
    return found.slice(0, 3).map((view) => ({ detail: contactDetail(view), id: view.id, name: String(view.fields.displayName ?? ""), partial: true, view }));
  } catch {
    return [];
  }
}

/** One character replaced, added or left out (Levenshtein distance at most 1), on characters, not bytes. */
export function oneCharOff(left: string, right: string): boolean {
  const a = [...left];
  const b = [...right];
  if (Math.abs(a.length - b.length) > 1 || left === right) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * AG20b (owner decision 4, 2026-11-20): a full name that names no contact but is one character off the names of contacts
 * of the account ("贺兰清" → 贺兰青, 贺岚清): those are offered as candidates — never taken, never written on. A CJK name of
 * three or more characters, or a Latin name of five letters or more; the account's contacts sharing a character (CJK) or
 * the first three letters (Latin) are compared. None that close: still "not found".
 */
async function nearNames(records: AgentRecordAccess, scope: DomainScope, name: string): Promise<ContactMatch[]> {
  const chars = [...name.replace(/\s+/gu, " ")];
  const cjk = /^\p{Script=Han}+$/u.test(name) && chars.length >= 3;
  const latin = /^[A-Za-z][A-Za-z\s'’.-]+$/u.test(name) && name.replace(/[^A-Za-z]/gu, "").length >= 5;
  if (!cjk && !latin) return [];
  const probes = cjk ? [...new Set([chars[0], chars[chars.length - 1], ...chars.slice(1, -1)])] : [name.slice(0, 3)];
  const seen = new Map<string, RecordView>();
  try {
    for (const probe of probes.slice(0, 4)) for (const view of (await records.reader.read("contact", scope, { limit: 10, text: probe })).items) seen.set(view.id, view);
  } catch {
    return [];
  }
  const near = [...seen.values()].filter((view) => oneCharOff(name.toLowerCase(), String(view.fields.displayName ?? "").replace(/\s+/gu, " ").trim().toLowerCase()));
  if (near.length) emitTrace({ found: near.map((view) => view.id), type: "resolve.contact_near_name" });
  return near.slice(0, 3).map((view) => ({ detail: contactDetail(view), id: view.id, name: String(view.fields.displayName ?? ""), partial: true, view }));
}

/** AG08 repair 1 (AE-UND-010): the words that ask for a list, not what it is about ("列出", "一覧にして", "list"). */
/** AG09 run-04 repair 2: words asking how a person stands now (zh, ja, en). */
const ASKS_NOW = /(现在|目前|如今|眼下|最近在|今は|今どこ|今の|現在|現職|\bnow\b|\bcurrently\b|these days)/iu;
/** AG10 (AE-SCL-020): words asking for the value that holds now ("her current salary expectation", "最新的报价", "今の希望"). */
/** AG10: words of something still to be done in a note ("still need to", "还没", "まだ…ていない"). */
const PENDING = /(still need to|still have to|still to do|haven'?t (?:yet )?sent|还要|还没|尚未|仍需|まだ[^。]{0,12}(?:ていない|していない|送っていない)|しなければ)/iu;
const CURRENT_VALUE = /(\bcurrent\b|现在的|目前的|今の|現在の)/iu;

const LIST_VERBS =/^(?:请|帮我|麻烦)?(?:列出|列一下|列举|列个|看看|看一下|告诉我|查一下|查查|给我看|一覧にして|一覧を|リストにして|見せて|教えて|list|show me|show)\s*/iu;

/**
 * AG08 repair 1 (AE-UND-010): a part that lists the user's notes ("列出我记过的竞品") with no search words from the first
 * layer and no record clue: the part's own words, without the list verb, are the search (the same rule as a clue's own
 * words, AG05 run-02). The caller reads without them when they find nothing.
 */
export function listSearchWords(quote: string): string | undefined {
  return clueSearchWords(quote.replace(/[。.!！?？]+$/u, "").replace(LIST_VERBS, "").replace(/(?:を)?(?:一覧にして|リストにして|見せて|教えて)(?:ください)?$/u, ""));
}

/**
 * AG09 run-04 (AE-WEB-004): a record clue as the user wrote it, for a title or label search ("我竞品笔记 C 里" → "竞品笔记 C"):
 * only the "my" before it and the "in / of" after it are taken off. A pronoun names no title.
 */
export function clueAsWritten(words: string): string | undefined {
  const text = words.replace(/^@/u, "").trim().replace(/^(?:我的|我)/u, "").replace(/(?:里|中|上|的|の中|の)$/u, "").trim();
  if ([...text].length < 2 || isPronounClue(text)) return undefined;
  return text;
}

export function clueSearchWords(words: string): string | undefined {
  let rest = words.replace(/^@/u, "").trim();
  if (!rest) return undefined;
  if (/^[\x20-\x7e’]+$/u.test(rest)) {
    const kept = rest.toLowerCase().split(/[^a-z0-9'’-]+/u).map((word) => word.replace(/['’]s$/u, "")).filter((word) => word && !LATIN_NOISE.has(word));
    const joined = kept.join(" ");
    return joined.length >= 3 ? joined : undefined;
  }
  rest = rest.replace(/第[一二三四五六七八九十\d]+[个条件篇位份]?/gu, "").replace(/[一二两三四五六七八九十几\d]+\s*[份篇条个件本つ枚]/gu, "");
  for (const noise of CJK_NOISE) rest = rest.split(noise).join("");
  rest = rest.replace(/[\s、，。・,.!?！？「」『』"“”]/gu, "");
  return rest.length >= 2 ? rest : undefined;
}

/**
 * AG21a (R44): the distinctive words of a search phrase, each on its own ("Corvid 的订阅" → corvid, 订阅; "白鹭印务 报价单" →
 * 白鹭印务, 报价单): split at spaces, punctuation, the particles 的/の/之 and where Latin letters meet CJK, and each piece held
 * to the same noise rules as a clue's words. One piece or none: the phrase is searched whole only.
 */
export function searchTokensOf(phrase: string): string[] {
  const pieces = phrase.normalize("NFKC")
    .replace(/([A-Za-z0-9])(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])|([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])(?=[A-Za-z0-9])/gu, "$1$2 ")
    .split(/[\s、，。・,.!?！？「」『』"“”'’()（）【】:：;；/]+|[的の之]/u);
  const out: string[] = [];
  for (const piece of pieces) {
    const word = clueSearchWords(piece);
    if (word && !out.includes(word)) out.push(word);
  }
  return out;
}

/** The text of a record view a word search looks in (its string fields), folded as the search folds it. */
function viewText(view: RecordView): string {
  return matchText(Object.values(view.fields).filter((value): value is string => typeof value === "string").join(" "));
}

/** "2026-11-16" at 00:00 in the time zone, as a UTC instant. */
export function localMidnight(day: string, timeZone: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(guess).map((part) => [part.type, part.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}

/**
 * AG21c (R50): the window a repeating item bound by id is read in when the part has none: the day the words name (the clue
 * first, then the part's words), else from now on (the next occurrence).
 */
export function boundOccurrenceWindow(words: readonly string[], now: string, timeZone: string): { from?: string; to?: string } {
  for (const text of words) {
    const day = text ? resolveSaidDate(text, now, timeZone)?.day : null;
    if (day) return { from: localMidnight(day, timeZone), to: localMidnight(nextDay(day), timeZone) };
  }
  return { from: now };
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export interface ContactMatch {
  id: string;
  name: string;
  view: RecordView | null;
  /** AG06: what tells this person apart from others of the name (company, role), for a question. */
  detail?: string;
  /** AG06 repair 1: matched only partially (a nickname): offered in a question, never taken. */
  partial?: boolean;
  /** AG20b (R10): found by the company the words name, not by the person's name (a write asks; a read may take the one). */
  byCompany?: boolean;
}

/** AG06: the company and role of a contact view ("北辰软件 · 销售总监"), or nothing. */
export function contactDetail(view: RecordView | null): string | undefined {
  if (!view) return undefined;
  const parts = [view.fields.company, view.fields.headline].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return parts.length ? parts.join(" · ") : undefined;
}

const ROMANIZED_PAGES = 10;

/**
 * AG07 (AE-UIX-008): a name in Latin letters ("Li Wei", "Wei Li") that names no contact as written, against the
 * account's contacts whose names are Chinese characters, read in pinyin without tones (either name order). Only the
 * account's own contacts are read (a few pages); several of the same reading are all returned (the caller asks).
 */
export async function romanizedContacts(records: AgentRecordAccess, scope: DomainScope, words: string): Promise<RecordView[]> {
  const clean = words.replace(/^@/u, "").replace(LATIN_TITLE, "").trim().toLowerCase();
  if (!/^[a-z][a-z\s'’.-]*$/u.test(clean)) return [];
  const syllables = clean.split(/[\s'’.-]+/u).filter(Boolean);
  const said = syllables.join("");
  if (said.length < 3) return [];
  const reversed = [...syllables].reverse().join("");
  const out: RecordView[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < ROMANIZED_PAGES; page += 1) {
      const result = await records.reader.read("contact", scope, { limit: 10, ...(cursor ? { cursor } : {}) });
      for (const view of result.items) {
        const name = String(view.fields.displayName ?? "").replace(/\s+/gu, "");
        if (!name || !/^\p{Script=Han}+$/u.test(name)) continue;
        const reading = pinyin(name, { surname: "head", toneType: "none", type: "array" }).join("").toLowerCase();
        if (reading === said || reading === reversed) out.push(view);
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "resolve.contact_romanized" });
  }
  if (out.length) emitTrace({ found: out.map((view) => view.id), said: clean, type: "resolve.contact_romanized" });
  return out;
}

/** Words that only point at a company's side ("Fjord 那边", "青柠那个", "東山さん側", "海桐的人"). */
const COMPANY_SIDE_WORDS = /(?:那边|这边|那里|这里|那儿|那头|那家|这家|那个|这个|那位|这位|方面|一方|的人|那些人|のほう|の方|さん側|側|の人|の皆さん)$/u;
/** AG21a (R38): at most this many people of a company named in a read are read together. */
const COMPANY_PEOPLE = 5;

/** Looks a person up by name in the account (never elsewhere) and narrows by the company the user named. */
export async function findContacts(records: AgentRecordAccess, scope: DomainScope, words: string, quote: string, message: string): Promise<{ matches: ContactMatch[]; failed: boolean }> {
  const tokens = nameTokens(words);
  let found: RecordView[] = [];
  let failed = false;
  try {
    for (const token of tokens) {
      found = (await records.reader.read("contact", scope, { limit: 10, text: token })).items;
      if (found.length) break;
    }
    if (!found.length && words.replace(/^@/u, "").trim().length >= 2) found = (await records.reader.read("contact", scope, { limit: 10, status: "within" as never, text: words.replace(/^@/u, "").trim() })).items;
  } catch (error) {
    emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "resolve.contact_search" });
    failed = true;
  }
  // AG20b (TRIAGE R10): no one of that name — the words may name a company ("海桐的…", "蒲公英那个"): the account's contacts at
  // a company holding them. Marked as found by company: a write offers them in a question, never picks one.
  let byCompany = false;
  let companyTried = false;
  const tryCompany = async () => {
    companyTried = true;
    // The words without what only points at the side ("Fjord 那边", "青柠那个", "東山さん側", "海桐的人").
    const bare = words.replace(/^@/u, "").trim().replace(COMPANY_SIDE_WORDS, "").replace(/[\s的の]+$/u, "").trim();
    const companyWords = [...new Set([bare, clueSearchWords(bare), bare.split(/[の的之]/u)[0]?.trim()].filter((item): item is string => Boolean(item) && [...item!].length >= 2))];
    try {
      for (const text of companyWords) {
        found = (await records.reader.read("contact", scope, { limit: 10, status: "company" as never, text })).items;
        if (found.length) break;
      }
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "resolve.contact_company" });
    }
    byCompany = found.length > 0;
    if (byCompany) emitTrace({ found: found.map((view) => view.id), type: "resolve.contact_by_company" });
  };
  // Integration after AG21a (AE-CTX-003 in its run: 「Harbor Analytics 的人」): words in Latin letters that name no one are tried
  // as a company first — the romanized-name pass below reads the account's contacts page by page.
  if (!found.length && !failed && /[A-Za-z]/u.test(words)) await tryCompany();
  // AG07 (AE-UIX-008): "Li Wei" written in Latin letters names 李薇; the contacts' Chinese names are read in pinyin.
  if (!found.length && !failed) found = await romanizedContacts(records, scope, words);
  if (!found.length && !failed && !companyTried) await tryCompany();
  let matches = found;
  // AG20b (TRIAGE R10): a company or a role said in the sentence tells people of the same name apart before any question —
  // the company's distinctive words count ("蒲公英那个" for 蒲公英童书), not only its full name.
  if (matches.length > 1) {
    // The person's own name is not a company word ("小林健" does not name 小林设计).
    // AG21a (R39): only the name is taken out, not the whole clue — the words in it that tell two people of the name apart
    // stay for the company and role tests ("季朗（柏舟那个）" keeps 柏舟). A clue that holds none of the found names as
    // written (a romanized or partial name) is taken out whole, as before.
    const clue = words.replace(/^@/u, "").trim();
    const shownNames = matches.map((view) => String(view.fields.displayName ?? "").trim()).filter(Boolean);
    const namesInClue = shownNames.filter((name) => clue.includes(name));
    const nameWords = namesInClue.length ? [...namesInClue, ...tokens.filter((token) => shownNames.some((name) => name.includes(token)))] : [clue, ...tokens];
    const besides = (text: string) => [...new Set(nameWords.filter(Boolean))].sort((left, right) => right.length - left.length).reduce((rest, name) => rest.split(name).join(" "), text);
    const named = matches.filter((view) => typeof view.fields.company === "string" && view.fields.company && (quote.includes(String(view.fields.company)) || message.includes(String(view.fields.company)) || companyNamedIn(String(view.fields.company), besides(quote)) || companyNamedIn(String(view.fields.company), besides(message))));
    if (named.length) matches = named;
  }
  if (matches.length > 1) {
    const role = matches.filter((view) => typeof view.fields.headline === "string" && [...String(view.fields.headline).trim()].length >= 2 && (quote.includes(String(view.fields.headline).trim()) || message.includes(String(view.fields.headline).trim())));
    if (role.length) matches = role;
  }
  if (matches.length > 1) {
    const exact = matches.filter((view) => tokens.includes(String(view.fields.displayName)));
    if (exact.length) matches = exact;
  }
  return { failed, matches: matches.map((view) => ({ detail: contactDetail(view), id: view.id, name: String(view.fields.displayName ?? ""), view, ...(byCompany ? { byCompany: true } : {}) })) };
}

const GENERIC_COMPANY_WORDS = /(株式会社|有限会社|合同会社|有限公司|股份|集团|公司|事务所|\b(?:inc|ltd|llc|co|corp|corporation|company|group|gmbh|kk)\b\.?)/giu;

/**
 * AG20b (TRIAGE R10): the words name this company — its full name, a distinctive Latin word of it, or the start of its name
 * without the generic words ("蒲公英" of 蒲公英童书, "北辰" of 北辰软件, "Lighthouse" of Lighthouse Press).
 */
export function companyNamedIn(company: string, text: string): boolean {
  const name = company.trim();
  if (!name || !text) return false;
  if (text.includes(name)) return true;
  const core = name.replace(GENERIC_COMPANY_WORDS, " ").replace(/\s+/gu, " ").trim();
  for (const word of core.split(/[\s·・,，]+/u)) {
    if (/^[A-Za-z][A-Za-z0-9&'’-]{2,}$/u.test(word) && new RegExp(`(?:^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:$|[^A-Za-z])`, "iu").test(text)) return true;
  }
  const head = [...core.replace(/[^\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}ー]/gu, "")];
  for (let length = head.length; length >= 2; length -= 1) if (text.includes(head.slice(0, length).join(""))) return true;
  return false;
}

/**
 * AG21a (R40): with two or more people bound in one part, each record clue (a note, to-do or schedule item named without an
 * id) belongs to the person named last before it — the one whose half of the sentence it is in. Returns, per kind, the
 * people it is read for, only where that is fewer than all of them; empty when the clues cannot all be placed.
 */
export function governedSubjects(part: Pick<GraphPart, "refs">, contacts: readonly Pick<ContactMatch, "id">[]): Map<string, string[]> {
  const people = part.refs.filter((ref) => recordKindOf(ref.entity) === "contact" && ref.recordId && ref.quote && contacts.some((item) => item.id === ref.recordId)).sort((left, right) => left.quote![0] - right.quote![0]);
  const distinct = new Set(people.map((ref) => ref.recordId!));
  if (distinct.size < 2) return new Map();
  const byKind = new Map<string, Set<string>>();
  for (const ref of part.refs) {
    const kind = recordKindOf(ref.entity);
    if (!kind || !["memo", "todo", "schedule"].includes(kind) || ref.recordId || !ref.quote) continue;
    const governor = [...people].reverse().find((person) => person.quote![1] <= ref.quote![0]);
    if (!governor) return new Map();
    byKind.set(kind, new Set([...(byKind.get(kind) ?? []), governor.recordId!]));
  }
  return new Map([...byKind].filter(([, ids]) => ids.size < distinct.size).map(([kind, ids]) => [kind, [...ids]]));
}

interface PartRead {
  views: RecordView[];
  /** A schedule item's occurrence inside the asked range, by ref. */
  occurrences: Map<string, string>;
  gaps: Set<GapReason>;
  notes: string[];
  lines: string[];
  coverage: PartCoverage[];
  /** Views of kinds other than the contact profile were asked for. */
  wantsRecords: boolean;
}

export function resolveNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const resume = state.touched !== null;
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part }));
    // AG09: a web part that also reads the user's records reads them here first (webPartReads).
    const due = parts.filter((part) => (part.route === "read" || webPartReads(part)) && part.status === "answered" && (!resume || state.touched!.includes(part.localId)));
    if (!due.length) return {};
    const words = gapWords(state.language);
    const context = run.context;
    const handles = [...(context?.handles.values() ?? [])];
    const handleOf = (id: string | null) => (id ? handles.find((handle) => handle.id === id) ?? null : null);
    const zone = state.timeZone || "Asia/Tokyo";
    const now = state.asOf || deps.now();

    // This turn's @ references that no part bound: to the one part with an unbound clue of that kind.
    for (const reference of run.references) {
      if (parts.some((part) => part.refs.some((ref) => ref.recordId === reference.id))) continue;
      const kind = recordKindOf(reference.type);
      const takers = due.filter((part) => part.refs.some((ref) => !ref.recordId && recordKindOf(ref.entity) === kind));
      if (takers.length === 1) {
        const ref = takers[0].refs.find((item) => !item.recordId && recordKindOf(item.entity) === kind)!;
        ref.recordId = reference.id;
        emitTrace({ partId: takers[0].localId, reference: { id: reference.id, type: reference.type }, type: "resolve.reference_bound" });
      }
    }

    const resolvedParts = new Map<string, { partId: string; contacts: ContactMatch[]; filter: GraphPart["plan"]["readFilter"] }>();
    for (const part of [...due].sort((left, right) => left.quote[0] - right.quote[0])) {
      const quote = input.message.slice(part.quote[0], part.quote[1]);
      const read: PartRead = { coverage: [], gaps: new Set(), lines: [], notes: [], occurrences: new Map(), views: [], wantsRecords: false };
      // AG11 (AE-SCL-021): 「那 @X 呢？」 — the previous question, asked again about the record picked now.
      // AG20b (TRIAGE R20): a part this one goes on from whose record cannot be opened holds nothing back — this part is
      // answered from its own records, and nothing is judged that would need the other one.
      const closedBefore = parts.filter((other) => part.dependsOn.includes(other.localId) && other.status === "unfinished" && other.reason === "reference_not_accessible");
      if (closedBefore.length) read.notes.push(`${closedBefore.map((other) => `"${input.message.slice(other.quote[0], other.quote[1])}"`).join(", ")} points at a record that cannot be opened now (code tells the user to choose it again). Answer this part from the records given only; do not guess what that record says or judge anything that would need it.`);
      const carried = run.carriedQuestions.get(part.localId);
      if (carried) read.notes.push(`This message asks the user's previous question again, about the record they picked now: "${carried}". Answer that question from this record only, not from the earlier record.`);
      const finish = (status: GraphPart["status"], reason: string | null) => {
        part.status = status;
        part.reason = reason;
        part.gaps = [...read.gaps];
        part.coverage = read.coverage;
        part.reads = read.views.map((view) => ({ ref: view.ref, version: view.version }));
        if (read.lines.length) run.gapLines.set(part.localId, read.lines);
        emitTrace({ coverage: read.coverage, gaps: part.gaps, partId: part.localId, reads: part.reads.map((item) => item.ref), status, type: "read.done" });
      };
      const records = deps.records;
      if (!records) {
        read.gaps.add("service_error");
        read.lines.push(words.serviceError(quote));
        finish("unfinished", "read_failed");
        continue;
      }
      const accountScope = records.scope(input.actorId);

      // AG07 (AE-CTX-003): a clue bound to a record of another kind (the first layer gave a memo clue the contact's
      // handle) does not point at that record; it is read as an unbound clue of its own kind, never as "unreadable".
      for (const ref of part.refs) {
        if (!ref.recordId) continue;
        const known = recordKindOf(handleOf(ref.recordId)?.type ?? run.references.find((item) => item.id === ref.recordId)?.type ?? ref.recordId);
        const wanted = recordKindOf(ref.entity);
        if (!known || !wanted || known === wanted) continue;
        emitTrace({ clue: ref.entity, partId: part.localId, recordId: ref.recordId, recordKind: known, type: "resolve.ref_kind_mismatch" });
        ref.recordId = null;
      }

      // 1. A record the part points at that cannot be opened: say so, read nothing else for it.
      const isClosed = (ref: GraphPart["refs"][number]) => Boolean(ref.recordId && (handleOf(ref.recordId)?.accessible === false || run.references.some((item) => item.id === ref.recordId && item.accessible === false)));
      const closedRefs = part.refs.filter(isClosed);
      // AG11 (§3.6, AE-REF-006): the other records the part points at are still read and answered; the closed one is
      // said and asked again, and nothing of it is used.
      const partial = closedRefs.length > 0 && part.refs.some((ref) => ref.recordId && !isClosed(ref));
      // AG11 (AE-REF-008): the kind of a picked record that cannot be opened is not searched instead — never read wider.
      const closedKinds = new Set(closedRefs.map((ref) => recordKindOf(ref.entity)));
      if (closedRefs.length) {
        read.gaps.add("unreadable");
        for (const closed of closedRefs) {
          const handle = handleOf(closed.recordId);
          const line = handle?.source === "reference" || run.references.some((item) => item.id === closed.recordId) ? words.unreadableReference(clueWords(input.message, closed)) : words.unreadableEarlier();
          if (!read.lines.includes(line)) read.lines.push(line);
        }
        if (!partial) {
          finish("unfinished", "reference_not_accessible");
          continue;
        }
        part.refs = part.refs.filter((ref) => !isClosed(ref));
        read.notes.push(`${closedRefs.map((ref) => `"${clueWords(input.message, ref) ?? "a record"}"`).join(", ")} cannot be opened now: code tells the user to choose it again. Do not guess what it says and do not judge anything that would need it; answer from the records given.`);
        emitTrace({ closed: closedRefs.map((ref) => ref.recordId), partId: part.localId, type: "resolve.partly_unreadable" });
      }
      // An unbound clue of a kind mentioned last in this session (and no words to search by) means that record.
      let filter = part.plan.readFilter;
      // AG09 run-04 repair 2 (AE-SCL-007): a part about a person whose own words ask how they stand now ("where is he now",
      // "他现在在哪", "今はどこ") is the AG05 run-03 `current` read even when the first layer gave no readFilter.
      if (!filter?.current && ((part.capabilities.some((capability) => capability === "contact.read" || capability === "view.context") && ASKS_NOW.test(quote)) || (part.capabilities.some((capability) => capability === "memo.read" || capability === "profile.read" || capability === "view.timeline") && part.refs.some((ref) => ref.entity === "contact") && CURRENT_VALUE.test(quote)))) {
        filter = { ...(filter ?? {}), current: true };
        emitTrace({ partId: part.localId, type: "resolve.asks_now" });
      }
      let text = filter?.text ? input.message.slice(filter.text[0], filter.text[1]) : undefined;
      for (const ref of part.refs) {
        // A clue with words of its own is searched by them (below), not taken for the record mentioned last.
        // run-02 repair 1: only a pointer ("那篇", "it") means that record; a kind word ("待办", "notes") does not.
        const said = clueWords(input.message, ref) ?? "";
        if (ref.recordId || ref.entity === "contact" || text || clueSearchWords(said) || !cluePointsAtOne(said)) continue;
        const last = context?.lastMentioned.find((item) => recordKindOf(item.type) === recordKindOf(ref.entity));
        if (last) {
          ref.recordId = last.id;
          emitTrace({ partId: part.localId, recordId: last.id, type: "resolve.last_mentioned_bound" });
          if (last.accessible === false) {
            read.gaps.add("unreadable");
            read.lines.push(words.unreadableEarlier());
          }
        }
      }
      if (read.gaps.has("unreadable") && !partial) {
        finish("unfinished", "reference_not_accessible");
        continue;
      }

      // 2. The people: bound, or looked up by name in the account.
      const contacts: ContactMatch[] = [];
      // AG21a (R38): a company the words name (no person of that name): its words, for a search of the notes as well.
      const companyWords: string[] = [];
      const unmatched: string[] = [];
      let stop = false;
      for (const ref of part.refs.filter((item) => recordKindOf(item.entity) === "contact")) {
        if (ref.recordId) {
          contacts.push({ id: ref.recordId, name: handleOf(ref.recordId)?.name ?? run.names.get(ref.recordId) ?? "", view: null });
          continue;
        }
        let said = clueWords(input.message, ref);
        // AG11 run-02 (AE-AMB-009): in a turn answering an open question, 「我和他」 is the pronoun 他 with the user's own words around it.
        if (said && (isPronounClue(said) || (part.continues?.kind === "clarification" && personPronounInReply(said)))) {
          // A reply that continues an earlier matter is about that matter's person (AG05: open item clues).
          const item = part.continues ? context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
          said = item?.clues?.find((clue) => clue.entity === "contact" && !isPronounClue(clue.text))?.text ?? null;
          // run-02 repair 2 (AE-AMB-012): otherwise the person named earlier in the same message ("小林…。…给他的…")
          // in a part that was not read (a statement). A read part's person is inherited below, with its narrowing.
          if (!said && ![...resolvedParts.values()].some((item) => item.contacts.length)) {
            const antecedent = parts
              .filter((other) => other !== part && other.quote[0] < part.quote[0])
              .sort((left, right) => right.quote[0] - left.quote[0])
              .flatMap((other) => other.refs.filter((item) => recordKindOf(item.entity) === "contact"))
              .find((item) => item.recordId || !isPronounClue(clueWords(input.message, item) ?? "他"));
            if (antecedent?.recordId) {
              ref.recordId = antecedent.recordId;
              contacts.push({ id: antecedent.recordId, name: handleOf(antecedent.recordId)?.name ?? run.readNames.get(antecedent.recordId)?.name ?? "", view: null });
              emitTrace({ partId: part.localId, recordId: antecedent.recordId, type: "resolve.antecedent_bound" });
              continue;
            }
            said = antecedent ? clueWords(input.message, antecedent) : null;
            if (said) emitTrace({ partId: part.localId, type: "resolve.antecedent_named", words: said });
          }
        }
        if (!said) continue;
        // AG20b (TRIAGE R13): the answer to "which one" names an offered person by what tells them apart ("蒲公英那个").
        const asked = part.continues?.kind === "clarification" ? context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
        const named = asked ? optionNamedIn(asked, said, "contact") : null;
        if (named) {
          ref.recordId = named.id;
          contacts.push({ id: named.id, name: run.names.get(named.id) ?? named.label.replace(/[（(].*$/u, "").trim(), view: null });
          emitTrace({ partId: part.localId, recordId: named.id, type: "resolve.option_named" });
          continue;
        }
        const { failed, matches } = await findContacts(records, accountScope, said, quote, input.message);
        if (failed) {
          read.gaps.add("service_error");
          read.lines.push(words.serviceError(quote));
          stop = true;
          break;
        }
        if (!matches.length) {
          // AG06 repair 1 (AE-XL-010): a nickname that matches contacts only partially — offer them, never guess.
          const partial = await partialContacts(records, accountScope, said);
          if (partial.length) matches.push(...partial);
        }
        if (!matches.length) {
          // run-03 repair 1 (AE-CTX-007): decided after all clues — "not found" only when nobody was found.
          unmatched.push(said.replace(/^@/u, ""));
          continue;
        }
        // AG21a (R38): words found only as a company ("我给白鹭印务报的价是多少") in a read: that company's people are read
        // together, and the notes holding the company's words too (below) — a read never dead-ends on "which person". The
        // answer tells the people apart where their records differ.
        if (matches.length > 1 && matches.every((match) => match.byCompany && !match.partial)) {
          const people = matches.slice(0, COMPANY_PEOPLE);
          contacts.push(...people);
          const bare = said.replace(/^@/u, "").trim().replace(COMPANY_SIDE_WORDS, "").replace(/[\s的の]+$/u, "").trim();
          if ([...bare].length >= 2) companyWords.push(bare);
          read.notes.push(`No contact is called "${said.replace(/^@/u, "")}"; it is the company of ${people.map((item) => item.name).join(", ")}, so this reads their records together and the notes that mention "${bare}". Where their records differ in a way that changes the answer, say whose is whose.`);
          emitTrace({ people: people.map((item) => item.id), partId: part.localId, type: "resolve.company_people_read", words: bare });
          continue;
        }
        if (matches.length > 1 || matches[0].partial) {
          // Several people of that name, the company does not tell them apart: ask which (§3.11), do not guess.
          run.candidates.set(part.localId, matches.slice(0, 3).map((match): NamedRecordRef => ({ id: match.id, name: match.name, type: "contact", ...(match.detail ? { detail: match.detail } : {}) })));
          run.steps.set(part.localId, { kind: "ask_missing" });
          run.needsDirections = true;
          part.status = "awaiting_clarification";
          part.waitReason = "object_ambiguous";
          part.route = "clarify";
          part.step = "ask_missing";
          emitTrace({ candidates: matches.length, partId: part.localId, type: "resolve.ambiguous_person" });
          stop = true;
          break;
        }
        ref.recordId = matches[0].id;
        contacts.push(matches[0]);
        if (matches[0].byCompany) read.notes.push(`No contact is called "${said.replace(/^@/u, "")}"; it is the company of ${matches[0].name}, so this reads ${matches[0].name}'s records.`);
      }
      if (part.status === "awaiting_clarification") continue;
      if (!stop && unmatched.length) {
        if (!contacts.length) {
          read.gaps.add("no_record");
          read.lines.push(words.noContact(unmatched[0]));
          stop = true;
        } else {
          // A person of the part was bound or found: a further clue no contact matches (a company, a place) is not a missing person.
          read.notes.push(`${unmatched.map((said) => `"${said}"`).join(", ")} matched no contact; it is not taken as a person.`);
          emitTrace({ partId: part.localId, type: "resolve.clue_unmatched", unmatched: unmatched.length });
        }
      }
      if (stop) {
        finish(read.gaps.has("service_error") ? "unfinished" : "answered", read.gaps.has("service_error") ? "read_failed" : null);
        continue;
      }
      // A part that goes on from an earlier part of the same message ("そのとき彼女は…", "the overdue ones") names no
      // person and points at no record of its own: it reads the same person, narrowed the same way.
      const ownTargets = part.refs.some((ref) => ref.recordId && recordKindOf(ref.entity) !== "contact");
      const namesPerson = part.refs.some((ref) => recordKindOf(ref.entity) === "contact" && !isPronounClue(clueWords(input.message, ref) ?? "他"));
      if (!contacts.length && !ownTargets && !namesPerson) {
        const earlier = part.dependsOn.map((id) => resolvedParts.get(id)).find((item) => item?.contacts.length) ?? [...resolvedParts.values()].reverse().find((item) => item.contacts.length);
        if (earlier) {
          contacts.push(...earlier.contacts);
          for (const ref of part.refs) if (!ref.recordId && recordKindOf(ref.entity) === "contact") ref.recordId = earlier.contacts[0].id;
          if (!filter && earlier.filter) {
            filter = earlier.filter;
            text = filter.text ? input.message.slice(filter.text[0], filter.text[1]) : undefined;
          }
          emitTrace({ from: earlier.partId, partId: part.localId, type: "resolve.subject_inherited" });
        }
      }
      resolvedParts.set(part.localId, { contacts: [...contacts], filter, partId: part.localId });
      // A person pointed at only by a pronoun that nothing resolved: do not read everyone's records instead —
      // unless the part names what to look for (its words, or a record it points at). It never says the person
      // is missing: no lookup found no one (run-02 repair 2).
      if (!contacts.length && part.refs.some((ref) => recordKindOf(ref.entity) === "contact")) {
        const narrowed = Boolean(text) || part.refs.some((ref) => recordKindOf(ref.entity) !== "contact" && (ref.recordId || clueSearchWords(clueWords(input.message, ref) ?? "")));
        if (!narrowed) {
          read.lines.push(words.notWho(quote));
          finish("unfinished", "object_unclear");
          continue;
        }
      }

      // AG06 repair 1 (AE-SCL-008): words that only name the person or their company ("東都精機" of "東都精機の鈴木健太さん")
      // are who the records are about, not a topic: they never narrow that person's records.
      if (text && contacts.length) {
        const personWords = part.refs.filter((ref) => recordKindOf(ref.entity) === "contact").map((ref) => clueWords(input.message, ref) ?? "");
        const companies = contacts.map((item) => String(item.view?.fields.company ?? "")).filter(Boolean);
        if (personWords.some((said) => said.includes(text!)) || companies.some((company) => company.includes(text!) || text!.includes(company))) {
          emitTrace({ partId: part.localId, type: "resolve.person_words_not_a_topic", words: text });
          text = undefined;
        }
      }
      // 3. What to read.
      const capabilities = part.reading?.capabilities.length ? part.reading.capabilities : part.capabilities;
      const kinds = readKindsOf(capabilities);
      // Hotfix 2026-11-20 (rule 1, understand/read-window.ts): "what to handle today" reads the open to-dos due or planned up
      // to today (overdue included) and today's schedule items, whichever of the two the first layer named.
      const today = localDayOf(now, zone);
      // Hotfix 1c: also a follow-up that only swaps the period of "what to handle today" (understand/read-window.ts swapsPeriod).
      const previousAsk = [...(context?.messages ?? [])].reverse().find((item) => item.role === "user")?.text;
      const swappedPlate = Boolean(previousAsk) && swapsPeriod(quote) && asksTodaysPlate(previousAsk!);
      const plate = (asksTodaysPlate(quote) && isPlateFilter(filter, today)) || (swappedPlate && isPlateFilter(filter, today, true));
      if (plate && !contacts.length && !text) {
        kinds.add("todo");
        kinds.add("schedule");
        read.notes.push("This asks what to take up today: these are the to-dos not done that are due or planned today or earlier (the overdue ones included, most overdue first) and today's schedule items. Give them all, the most urgent first; never say only today's records were looked at.");
        emitTrace({ partId: part.localId, today, type: "resolve.todays_plate" });
        run.showAllRead.add(part.localId);
      }
      // AG21a (R35): "which events did I go to" lists the account's own «我去过» records (attendance.read, or an event read
      // whose words say the user went), in the period said — not a search of the event directory. A part that points at an
      // event by id reads that event as before.
      const pointsAtEvent = part.refs.some((ref) => ref.recordId && recordKindOf(ref.entity) === "event");
      // With a person named and no words of going (「田中在客户访谈里最在意什么」 tagged attendance.read), it is about that person's
      // notes, as AG11 run-02 reads it (below).
      const listsAttendance = !pointsAtEvent && ((kinds.has("attendance") && (!contacts.length || asksWhereIWent(quote))) || (kinds.has("event") && asksWhereIWent(quote)));
      if (listsAttendance) kinds.add("attendance");
      else kinds.delete("attendance");
      // Finding events by conditions is not a read of this version (an attached event is read by id).
      if (!listsAttendance && kinds.has("event") && !part.refs.some((ref) => ref.recordId && recordKindOf(ref.entity) === "event") && ![...kinds].some((kind) => kind !== "event" && kind !== "contact") && contacts.length && (text || part.refs.some((ref) => recordKindOf(ref.entity) === "event" && clueSearchWords(clueWords(input.message, ref) ?? "")))) {
        // AG11 run-02 (AE-RD-009): "田中在客户访谈里最在意什么" tagged as an event of a named person: a meeting or interview with
        // someone is in the user's notes about them — those are read by the words, not the event directory.
        kinds.add("memo");
        if (!text) text = part.refs.map((ref) => (recordKindOf(ref.entity) === "event" ? clueSearchWords(clueWords(input.message, ref) ?? "") : undefined)).find(Boolean);
        emitTrace({ partId: part.localId, type: "resolve.person_event_in_notes", words: text ?? null });
      }
      if (!listsAttendance && kinds.has("event") && !part.refs.some((ref) => ref.recordId && recordKindOf(ref.entity) === "event") && ![...kinds].some((kind) => kind !== "event" && kind !== "contact")) {
        read.lines.push(words.eventSearch(quote));
        finish("unfinished", "not_in_this_version");
        continue;
      }
      // A profile alone may be out of date (设计稿 §4: newer wins): a person's latest notes are read with it.
      // run-03 repair 1 (AE-CTX-007): those notes only check the profile — none found is not "no record".
      const notesBesideProfile = ![...kinds].some((kind) => kind !== "contact");
      if (notesBesideProfile) kinds.add("memo");
      const boundIds = new Map<DomainKind, string[]>();
      for (const ref of part.refs) {
        const kind = recordKindOf(ref.entity);
        if (ref.recordId && kind && kind !== "contact") boundIds.set(kind as DomainKind, [...(boundIds.get(kind as DomainKind) ?? []), ref.recordId]);
      }
      const names = new Map<string, string>(contacts.filter((item) => item.name).map((item) => [item.id, item.name]));
      // AG06 repair 1 (AE-SCL-007): "第一次", "初めて", "when I first met" read the oldest records even when the first layer gave no order.
      const order = filter?.order ?? (FIRST_TIME.test(quote) ? "oldest" : "newest");
      // AG06 repair 1 (AE-SCL-008): "まだ終わっていない", "没做完", "open" in the words narrow by status even when the first
      // layer gave none; the read, and the total counted with it, then hold only those.
      const status = filter?.status ?? statusSaidIn(quote) ?? (part.reading?.key === "contact.recent_and_open" ? "open" : undefined);
      const from = filter?.from ? localMidnight(filter.from, zone) : undefined;
      const to = filter?.to ? localMidnight(nextDay(filter.to), zone) : undefined;
      const maxPages = LIST_DELIVERABLES.has(part.plan.deliverable) ? records.maxPages : 1;
      const failures: string[] = [];
      let withheld = 0;
      const push = (view: RecordView) => {
        if (!read.views.some((item) => item.ref === view.ref)) read.views.push(view);
      };

      // The people's profiles (who they are; when the profile was last updated).
      for (const contact of contacts) {
        try {
          const view = contact.view ?? (await records.reader.read("contact", accountScope, { id: contact.id })).items[0];
          if (view) {
            push(view);
            names.set(view.id, String(view.fields.displayName ?? contact.name));
            run.readNames.set(view.id, { name: String(view.fields.displayName ?? contact.name), type: "contact" });
          }
        } catch (error) {
          const gap = gapOfReadError(error, { byId: true });
          if (gap === "service_error") failures.push("contact");
          else read.gaps.add("unreadable");
        }
      }
      // AG21a (R40): people of the same name read together are told apart in the materials by their company or title
      // ("季朗（白鹭印务）", "季朗（柏舟设计）"), so one is never described as the other.
      const sameName = new Map<string, string[]>();
      for (const contact of contacts) {
        const name = names.get(contact.id);
        if (name) sameName.set(name, [...new Set([...(sameName.get(name) ?? []), contact.id])]);
      }
      for (const [name, ids] of sameName) {
        if (ids.length < 2) continue;
        for (const id of ids) {
          const view = read.views.find((item) => item.kind === "contact" && item.id === id) ?? contacts.find((item) => item.id === id)?.view ?? null;
          const label = contactDetail(view)?.split(" · ")[0];
          if (label) names.set(id, `${name}（${label}）`);
        }
        read.notes.push(`${ids.map((id) => names.get(id)).join(" and ")} are different people with the same name; keep what each record says with its own person.`);
      }
      // Records the part points at by id.
      for (const [kind, ids] of boundIds) {
        read.wantsRecords = true;
        for (const id of ids) {
          try {
            let view = (await records.reader.read(kind, accountScope, { id })).items[0];
            // Integration 2026-11-20 (AE-EVT-005, AE-SCL-025): a repeating schedule item the part points at by id (since AG20a
            // a card's schedule item is a mentioned record the next turn binds to) is given as its occurrence in the period
            // said, with what was changed for that one time — as the search below does (the hotfix's occurrence rule).
            // AG21c (R50): with no window of the part's own ("明天这场例会" — the day sits inside the clue), the occurrence is the
            // one the clue's own date words name, else the next one from now; always one occurrence, its changes applied.
            if (view && kind === "schedule" && typeof view.fields.recurrence === "string") {
              const ref = part.refs.find((item) => item.recordId === id);
              const window = from || to ? { from, to } : boundOccurrenceWindow([ref?.quote ? input.message.slice(ref.quote[0], ref.quote[1]) : "", quote], now, zone);
              const at = occurrenceIn(String(view.fields.startsAt), view.fields.recurrence, window.from, window.to);
              if (at && at !== view.fields.startsAt) read.occurrences.set(view.ref, at);
              if (at) {
                view = (await occurrenceViews(records.source, accountScope, [view], read.occurrences, zone))[0] ?? view;
                if (typeof view.fields.recurrence === "string") read.occurrences.delete(view.ref);
                emitTrace({ at, partId: part.localId, ref: view.ref, type: "resolve.bound_occurrence" });
              }
            }
            if (view) push(view);
          } catch (error) {
            const gap = gapOfReadError(error, { byId: true });
            if (gap === "service_error") failures.push(kind);
            else {
              read.gaps.add("unreadable");
              const ref = part.refs.find((item) => item.recordId === id);
              const line = run.references.some((item) => item.id === id) ? words.unreadableReference(clueWords(input.message, ref)) : words.unreadableEarlier();
              if (!read.lines.includes(line)) read.lines.push(line);
            }
          }
        }
      }
      // AG21a (R35): the account's own «我去过» records in the period said, the latest first, each read by id (with the event
      // it is about) — the same records the write path lists. Only these count as "went": an event the user only
      // registered for is not one.
      if (listsAttendance) {
        read.wantsRecords = true;
        try {
          const all = records.attendance ? await records.attendance.list(input.actorId) : null;
          if (!all) throw new Error("attendance notes are not available");
          const inPeriod = all.filter((note) => (!filter?.from || note.attendedOn >= filter.from) && (!filter?.to || note.attendedOn <= filter.to))
            .sort((left, right) => (left.attendedOn === right.attendedOn ? (left.id < right.id ? -1 : 1) : left.attendedOn < right.attendedOn ? 1 : -1));
          const limit = Math.max(1, records.maxPages) * 10;
          // An event named in words ("校友茶会那次我是哪天去的") keeps the records of events of that title only.
          const eventWords = part.refs.filter((ref) => !ref.recordId && recordKindOf(ref.entity) === "event").map((ref) => { const said = (clueWords(input.message, ref) ?? "").replace(/(哪些|哪几场|哪几个|哪个|哪场|哪|什么|啥|どの|どれ|どんな|\bwhich\b|\bwhat\b|\bany\b)/giu, " ").replace(new RegExp(WENT_WORDS.source, "giu"), " "); return onlyWindowWords(said) ? undefined : clueSearchWords(said); }).find(Boolean);
          let seen = 0;
          let total = eventWords ? 0 : inPeriod.length;
          for (const note of inPeriod.slice(0, limit)) {
            const view = (await records.reader.read("event", accountScope, { id: note.id }).catch(() => ({ items: [] as RecordView[] }))).items[0];
            if (!view) continue;
            if (eventWords && !matchText(String(view.fields.title ?? "")).includes(matchText(eventWords))) continue;
            push(view);
            seen += 1;
            if (eventWords) total += 1;
          }
          read.coverage.push({ complete: inPeriod.length <= limit, kind: "attendance", pagesRead: 1, seen, total });
          read.notes.push(`These are the user's own «I went» records${filter?.from || filter?.to ? ` from ${filter?.from ?? "the start"} to ${filter?.to ?? "now"}` : ""}, the latest first: only these are events the user went to (an event only registered for is not one).`);
          emitTrace({ found: inPeriod.length, from: filter?.from ?? null, partId: part.localId, to: filter?.to ?? null, type: "resolve.attendance_read" });
        } catch (error) {
          failures.push("attendance");
          emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.failed", where: "resolve.attendance" });
        }
      }
      // The last interaction (structured only), or the person's notes as old material.
      if (kinds.has("interaction")) {
        read.wantsRecords = true;
        for (const contact of contacts) {
          const view = await readRecentInteraction({ reader: records.reader, source: records.source }, accountScope, { contactId: contact.id, now, timeZone: zone });
          withheld += view.withheld;
          failures.push(...view.failures.filter((failure) => !failure.startsWith("encounter")).map((failure) => failure.split(":")[0]));
          if (view.interactions.length) {
            read.notes.push(`Recorded interactions with ${contact.name || "this person"}, newest first${view.sameDay.length ? `; on ${view.sameDay.map((list) => list.length).join(", ")} same-day entries the order within the day is not known` : ""}. The latest is ${view.latest!.occurredOn}.`);
            for (const item of view.interactions) if (item.view) push(item.view);
          } else if (view.legacy.length) {
            read.notes.push(`No interaction with ${contact.name || "this person"} is recorded as such; the materials are the user's notes about them, newest first: the latest note is what "last time" means. (Code tells the user this comes from the notes.)`);
            read.lines.push(words.fromNotes());
            for (const item of view.legacy) push(item);
          }
        }
        if (!contacts.length) read.notes.push("No person was named, so no interaction could be looked up.");
      }
      // Searches by kind (not for kinds the part already points at by id).
      // The interaction view stands in for the notes only for "the last time" without words to look for.
      // run-03 (AE-SCL-007): how a person stands now also reads their newest notes, so a newer note wins over an
      // older interaction or profile. "The last time" reads as before.
      const current = Boolean(filter?.current) && contacts.length > 0;
      const interactionAnswers = !current && kinds.has("interaction") && !text && order === "newest" && read.views.some((view) => view.kind === "memo");
      // AG07 run-02 (AE-RD-008): a part whose every object is an attached record (@, not a person) and that has no
      // words to search by asks about that record: other kinds the first layer added are not searched.
      const attachedOnly = !text && part.refs.length > 0 && part.refs.every((ref) => ref.recordId && recordKindOf(ref.entity) !== "contact" && /^@/u.test(input.message.slice(ref.quote?.[0] ?? 0, ref.quote?.[1] ?? 0).trim()));
      // AG10 (AE-SCL-020): "what's still open" is the to-dos and follow-ups not done; a note that once said "still need to send
      // the JD" has no status and is not an open item (the to-do may be done since), so notes are not searched for it.
      const openItems = status === "open" && kinds.has("todo") && !current;
      if (openItems && kinds.has("memo")) emitTrace({ partId: part.localId, type: "resolve.open_items_from_todos" });
      // AG20b (TRIAGE R9): a question about a person with words to look for ("Beatrix 的 option 哪天到期") that the first layer
      // took for a to-do or a schedule item also reads that person's notes holding the words — a first guess of the kind
      // does not end the part when a note holds the answer. Not for a list, not for what the words call open or done.
      const notesToo = !attachedOnly && !kinds.has("memo") && (kinds.has("todo") || kinds.has("schedule")) && contacts.length > 0 && Boolean(text) && !LIST_DELIVERABLES.has(part.plan.deliverable) && statusSaidIn(quote) === undefined && !current;
      if (notesToo) {
        kinds.add("memo");
        emitTrace({ partId: part.localId, type: "resolve.notes_also_read", words: text ?? null });
      }
      const searchKinds = attachedOnly ? [] : (["memo", "todo", "schedule"] as const).filter((kind) => (kinds.has(kind) || (kind === "memo" && current)) && !boundIds.has(kind) && !closedKinds.has(kind) && !(kind === "memo" && interactionAnswers) && !(kind === "memo" && openItems && !notesToo));
      if (current) read.notes.push("This asks how the person stands now: the interactions, their newest notes and the profile are all here; where they differ, the newer dated record is what holds now. Never give as current anything a newer record replaces (a former company, an old role).");
      const subjects = contacts.length ? contacts.map((item) => item.id) : [undefined];
      // AG21a (R40): two people in one part, each object clue in the half of the sentence its person governs ("把 @季朗 的待办和
      // @季朗 的笔记对一下"): a kind named in one person's half is read for that person only.
      const governed = governedSubjects(part, contacts);
      if (governed.size) {
        read.notes.push(`Each kind of record here is read for the person the sentence puts it with: ${[...governed].map(([kind, ids]) => `${kind === "memo" ? "notes" : kind === "todo" ? "to-dos" : "schedule items"} of ${ids.map((id) => names.get(id) ?? id).join(", ")}`).join("; ")}. Keep each record with its own person.`);
        emitTrace({ governed: Object.fromEntries(governed), partId: part.localId, type: "resolve.clues_governed" });
      }
      const asked: AskedRead[] = [];
      let unclear = false;
      const reads = new Map<string, { complete: boolean; kind: string; pagesRead: number; total: number | null; directions: Set<"oldest" | "newest"> }>();
      for (const kind of searchKinds) {
        // run-02: a read never gets wider because a field was left out. Without the first layer's words, the
        // record clue's own words are the search; a clue of only a pronoun with no person to read for points
        // at nothing code can find — it says so instead of reading the newest page.
        const clue = part.refs.find((ref) => !ref.recordId && recordKindOf(ref.entity) === kind);
        // Hotfix 1c (AE-ENT-005): a clue of only date, time-of-day and kind words is the window (graphPartsOf), never a search.
        const windowClue = clue ? onlyWindowWords(clueWords(input.message, clue) ?? "") : false;
        const clueText = clue && !windowClue ? clueSearchWords(clueWords(input.message, clue) ?? "") : undefined;
        // AG08 repair 1 (AE-UND-010): a list of notes with nothing to search by searches by its own words.
        const ownWords = !text && !clueText && !clue && kind === "memo" && !contacts.length && part.plan.deliverable === "list" ? listSearchWords(quote) : undefined;
        const kindText = text ?? clueText ?? ownWords;
        if (clue && !kindText && !contacts.length && cluePointsAtOne(clueWords(input.message, clue) ?? "")) {
          unclear = true;
          continue;
        }
        // With nothing else to narrow by: a to-do list is the open ones, a schedule question is what is coming.
        const kindStatus = kind === "todo" ? status ?? (!contacts.length && !kindText ? "open" : undefined) : undefined;
        // AG20b (TRIAGE R9): a period said for events (or read for to-dos and schedule items next to the notes added above)
        // is not the notes' — a note named as the criterion was written before the weekend it is about.
        const ownPeriod = !(kind === "memo" && (notesToo || (kinds.has("event") && part.capabilities.includes("fn.rank"))));
        const kindFrom = !ownPeriod ? undefined : kind === "schedule" && plate ? localMidnight(today, zone) : kind === "schedule" && !from && !to && !contacts.length && !kindText ? now : from;
        const kindTo = ownPeriod ? to : undefined;
        if (!ownPeriod && (from || to)) emitTrace({ kind, partId: part.localId, type: "resolve.period_not_for_notes" });
        if (kind === "todo" && kindStatus && !status) read.notes.push("Only the to-dos not done yet were read.");
        if (kind === "schedule" && kindFrom !== from && !plate) read.notes.push("Only schedule items from now on were read.");
        // Integration seam (2026-11-20; the hotfix's part 1b item 4 × AG20b's AE-RD-004 shape, where the to-do clue is "open
        // to-dos for Inès Moreau"): what the read is SAID to have looked for never holds the words that name the one person
        // it was read for — she is the narrowing already. The read itself is as before (with no record of hers holding the
        // words it reads hers without them, below), so the sentence says what was really looked at.
        let askedText = kindText;
        if (!text && clueText && contacts.length === 1) {
          let rest = clueWords(input.message, clue) ?? "";
          const personWords = [...part.refs.filter((ref) => ref.entity === "contact").map((ref) => clueWords(input.message, ref) ?? ""), names.get(contacts[0].id) ?? "", contacts[0].name ?? ""].filter(Boolean);
          for (const name of personWords.flatMap((item) => nameTokens(item)).sort((left, right) => right.length - left.length)) rest = rest.split(name).join(" ");
          askedText = rest.trim() ? clueSearchWords(rest) : undefined;
          if (askedText !== kindText) emitTrace({ kind, partId: part.localId, type: "resolve.person_words_not_searched_for" });
        }
        if (kind === "todo" || kind === "schedule") asked.push({ ...(contacts.length === 1 ? { person: { id: contacts[0].id, name: names.get(contacts[0].id) || contacts[0].name } } : {}), defaultFrom: kind === "schedule" && kindFrom === now && !from, from: kindFrom, fromDay: plate ? (kind === "schedule" ? today : undefined) : filter?.from, kind, status: kindStatus, statusSaid: Boolean(status), text: askedText, to, toDay: filter?.to });
        if (!(kind === "memo" && notesBesideProfile && contacts.length)) read.wantsRecords = true;
        for (const contactId of governed.get(kind) ?? subjects) {
          const orders: ("newest" | "oldest")[] = order === "both" ? ["newest", "oldest"] : [order];
          for (const direction of orders) {
            try {
              const queryOf = (words: string | undefined) => ({
                ...(contactId ? { contactId } : {}),
                ...(words ? { text: words } : {}),
                ...(kindStatus ? { status: kindStatus } : {}),
                ...(kindFrom ? { from: kindFrom } : {}),
                ...(kindTo ? { to: kindTo } : {}),
                ...(kind === "todo" && !filter?.order ? {} : { order: direction }),
              });
              let pages = await readPages(records.reader, kind, accountScope, queryOf(kindText), order === "both" ? 1 : maxPages);
              // AG21a (R44): a phrase of several distinctive words found as one piece nowhere ("Corvid 的订阅" for a note on
              // "Corvid Analytics 的年度订阅") — the records holding every one of its words, in any order and distance; only when
              // none holds them all, the records holding its rarest word. The other narrowings (the person, status, period) stay.
              const tokens = kindText && !pages.items.length && !pages.withheld ? searchTokensOf(kindText) : [];
              if (tokens.length >= 2) {
                const counted = await Promise.all(tokens.map(async (token) => ({ first: await readPages(records.reader, kind, accountScope, queryOf(token), 1), token })));
                const rarest = counted.filter((item) => item.first.items.length || item.first.withheld).sort((left, right) => (left.first.total ?? Number.MAX_SAFE_INTEGER) - (right.first.total ?? Number.MAX_SAFE_INTEGER) || right.token.length - left.token.length)[0];
                if (rarest) {
                  const all = await readPages(records.reader, kind, accountScope, queryOf(rarest.token), Math.max(maxPages, records.maxPages));
                  const holding = all.items.filter((view) => tokens.every((token) => viewText(view).includes(matchText(token))));
                  if (holding.length) {
                    pages = { ...all, complete: all.complete, items: holding, total: all.complete ? holding.length : null };
                    emitTrace({ found: holding.length, kind, partId: part.localId, tokens, type: "resolve.text_all_words" });
                  } else {
                    pages = rarest.first.items.length && maxPages > 1 ? await readPages(records.reader, kind, accountScope, queryOf(rarest.token), order === "both" ? 1 : maxPages) : rarest.first;
                    read.notes.push(`No ${kind === "memo" ? "note" : "record"} holds all of ${tokens.map((token) => `"${token}"`).join(", ")}; these hold "${rarest.token}" only. Say so; do not present them as holding the rest.`);
                    emitTrace({ found: pages.items.length, kind, partId: part.localId, tokens, type: "resolve.text_rarest_word", word: rarest.token });
                  }
                }
              }
              // The words were a narrowing: when none of the person's records has them, read the person's records
              // without them and say so. With no person, nothing found stays nothing found (no newest page instead).
              if (ownWords && !pages.items.length && !pages.withheld) {
                pages = await readPages(records.reader, kind, accountScope, queryOf(undefined), order === "both" ? 1 : maxPages);
                emitTrace({ partId: part.localId, type: "resolve.own_words_unmatched", words: ownWords });
              } else if (ownWords) emitTrace({ partId: part.localId, type: "resolve.own_words", words: ownWords });
              // AG09 run-04 (AE-WEB-004): a clue that names a record by its title or label ("竞品笔记 C", "笔记 C") lost its
              // generic word in the search words ("竞品c"); when those find nothing, the clue is searched as the user wrote it.
              if (clue && !windowClue && !text && !pages.items.length && !pages.withheld) {
                const asWritten = clueAsWritten(clueWords(input.message, clue) ?? "");
                if (asWritten && asWritten !== kindText) {
                  pages = await readPages(records.reader, kind, accountScope, queryOf(asWritten), order === "both" ? 1 : maxPages);
                  emitTrace({ found: pages.items.length, partId: part.localId, type: "resolve.clue_as_written", words: asWritten });
                }
              }
              // AG09 dev run 2 (AE-SCL-015): notes compared with a web lookup of the same message ("和我笔记里他们给我的价格比一下"
              // after "查 Kasane Pack 官网…"): when the part's words find no note, the public name the user typed for that lookup
              // is searched — the user's own words of this message, never a record's.
              if (kind === "memo" && !contactId && !pages.items.length && !pages.withheld) {
                const webName = [...parts.filter((other) => part.dependsOn.includes(other.localId)), ...parts.filter((other) => other !== part)].map((other) => (other.plan.webTarget?.quote ? input.message.slice(other.plan.webTarget.quote[0], other.plan.webTarget.quote[1]).replace(/^@/u, "").trim() : "")).find((name) => name && name !== kindText);
                if (webName) {
                  pages = await readPages(records.reader, kind, accountScope, queryOf(webName), order === "both" ? 1 : maxPages);
                  emitTrace({ found: pages.items.length, partId: part.localId, type: "resolve.web_name", words: webName });
                }
              }
              if (kindText && contactId && !pages.items.length && !pages.withheld && !(kind === "memo" && notesToo)) {
                pages = await readPages(records.reader, kind, accountScope, queryOf(undefined), order === "both" ? 1 : maxPages);
                if (pages.items.length) read.notes.push(`No note of theirs contains "${kindText}"; these are their ${kind === "memo" ? "notes" : "records"} without that filter.`);
              }
              withheld += pages.withheld;
              let items = pages.items;
              if (kind === "schedule" && (kindFrom || to)) {
                items = items.filter((view) => {
                  const at = occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, kindFrom, to);
                  if (at && at !== view.fields.startsAt) read.occurrences.set(view.ref, at);
                  return Boolean(at);
                });
                // Hotfix 2026-11-20: a repeating item with no occurrence in the window is no match; a complete read counts only
                // the ones kept (otherwise 「共1条，这次看的是最新的0条」 for the weekly meeting on a Friday).
                if (pages.complete && items.length !== pages.items.length) pages = { ...pages, items, total: items.length };
                // Integration 2026-11-20 (after AG20b): the plain schedule question with no period reads from now on, but an
                // all-day item is stored at its day's midnight and is coming up until the end of its day in the user's time
                // zone (comesUp, as in the preparation answer). The all-day items whose occurrence is today are read apart (from
                // the start of the user's day up to now) and come first; a repeating one is given as today's occurrence.
                const dayStart = localMidnight(today, zone);
                if (kindFrom === now && !from && !to && dayStart < now) {
                  const earlier = await readPages(records.reader, kind, accountScope, { from: dayStart, to: now }, 1);
                  withheld += earlier.withheld;
                  const allDayToday = earlier.items.filter((view) => {
                    if (view.fields.allDay !== true) return false;
                    const at = occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, dayStart, now);
                    if (!at || !comesUp(at, true, now, zone)) return false;
                    if (at !== view.fields.startsAt) read.occurrences.set(view.ref, at);
                    else read.occurrences.delete(view.ref);
                    return true;
                  });
                  if (allDayToday.length) {
                    const kept = [...allDayToday, ...items.filter((view) => !allDayToday.some((item) => item.ref === view.ref))];
                    if (pages.total !== null) pages = { ...pages, total: pages.total + kept.length - items.length };
                    items = kept;
                    read.notes.push("The all-day schedule items of today are listed too, first: they last until the end of the day.");
                    emitTrace({ items: allDayToday.map((view) => view.ref), partId: part.localId, type: "resolve.all_day_today" });
                  }
                }
                // Hotfix 2026-11-20 (AE-SCL-025): a repeating item is given as its occurrence, with what was changed for that one time.
                const resolved = await occurrenceViews(records.source, accountScope, items, read.occurrences, zone);
                for (const view of resolved) if (typeof view.fields.recurrence === "string") read.occurrences.delete(view.ref);
                items = resolved;
              }
              for (const view of items) push(view);
              // AG10 (AE-SCL-020): how a person stands now ("her current salary expectation") reads their newest notes as well,
              // not only the ones holding the words — a newer note that says it differently ("updated her expectation") wins.
              // AG20b (R24, AE-SCL-020 split into parts): the same for every read of ONE resolved person's notes by words — the
              // words mark the notes that hold them, they never hide that person's newer notes (a person's notes are few; words
              // narrow only an account-wide read). The coverage then counts all of the person's notes.
              let personNotes: { total: number | null; complete: boolean } | null = null;
              // Not for the notes R9 adds beside a to-do or schedule question (those are the notes holding the words only;
              // AE-AMB-012 in run-03: "排在哪天" about a to-do must not read the person's other notes).
              if ((current || (contacts.length === 1 && !notesToo)) && kind === "memo" && contactId && kindText && direction === "newest") {
                const newest = await readPages(records.reader, kind, accountScope, queryOf(undefined), 1);
                const added = newest.items.filter((view) => !read.views.some((item) => item.ref === view.ref));
                for (const view of added) push(view);
                personNotes = { complete: newest.complete && pages.complete, total: newest.total };
                if (added.length) {
                  const holding = pages.items.map((view) => nameOf(view, zone)).slice(0, 5);
                  read.notes.push(`Besides the note(s) holding "${kindText}"${holding.length ? ` (${holding.map((name) => `"${name}"`).join(", ")})` : ""}, these are ${names.get(contactId) ?? "this person"}'s newest notes: a newer one may say the same thing in other words. Where they differ, the newer dated note is what holds now; give the older one as what it was before. Never say a value is the only one on record.`);
                  emitTrace({ added: added.length, partId: part.localId, type: "resolve.current_newest", words: kindText });
                }
              }
              // run-02 repair 2 (AE-SCL-007): one entry per kind and person; the newest and oldest reads of the same
              // records share one total, and `seen` is set below from what is really given to the answer.
              const key = `${kind}|${contactId ?? ""}`;
              const prior = reads.get(key);
              reads.set(key, { complete: (prior?.complete ?? true) && (personNotes?.complete ?? pages.complete), directions: new Set([...(prior?.directions ?? []), ...(kind === "todo" ? [] : [direction])]), kind, pagesRead: (prior?.pagesRead ?? 0) + pages.pagesRead + (personNotes ? 1 : 0), total: prior?.total ?? personNotes?.total ?? pages.total });
              if (!pages.complete || (pages.total !== null && pages.total > pages.items.length)) {
                read.notes.push(pages.total !== null
                  ? `${kind}: ${pages.total} match in all (an exact count); the ${pages.items.length} listed here are the ${kind === "todo" ? "soonest due" : direction === "oldest" ? "oldest" : "newest"} of them${kind === "todo" ? "" : direction === "oldest" ? ", so it is newer ones that may be missing, never older ones" : ", so it is older ones that may be missing, never newer ones"}. Give the total as ${pages.total}; do not present the listed ones as all.`
                  : `${kind}: ${pages.items.length} listed; there are more. Do not present them as all.`);
              }
            } catch (error) {
              failures.push(kind);
              emitTrace({ error: error instanceof Error ? error.message : String(error), kind, partId: part.localId, type: "read.failed" });
            }
          }
        }
      }
      // AG21a (R38): the notes that mention the company named in the words, whoever they are linked to (a note about the
      // company may name none of its people). Under the part's period; one page per word at most a page of the part.
      if (companyWords.length && searchKinds.includes("memo")) {
        for (const word of companyWords) {
          try {
            const pages = await readPages(records.reader, "memo", accountScope, { order: "newest", text: word, ...(from ? { from } : {}), ...(to ? { to } : {}) }, maxPages);
            withheld += pages.withheld;
            for (const view of pages.items) push(view);
            read.wantsRecords = true;
            reads.set(`memo|company:${word}`, { complete: pages.complete, directions: new Set(["newest"]), kind: "memo", pagesRead: pages.pagesRead, total: null });
            emitTrace({ found: pages.items.length, partId: part.localId, type: "resolve.company_notes", words: word });
          } catch (error) {
            failures.push("memo");
            emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.failed", where: "resolve.company_notes" });
          }
        }
      }
      for (const kind of searchKinds) {
        const entries = [...reads.values()].filter((item) => item.kind === kind);
        if (!entries.length) continue;
        const seen = read.views.filter((view) => view.kind === kind).length;
        const total = entries.every((item) => item.total !== null) ? entries.reduce((sum, item) => sum + (item.total ?? 0), 0) : null;
        // AG07 run-02 (AE-SCL-007): which end was read, when only one was (the notice says which ones may be missing).
        const directions = new Set(entries.flatMap((item) => [...item.directions]));
        const direction = directions.size === 1 ? [...directions][0] : null;
        read.coverage.push({ complete: entries.every((item) => item.complete) || (total !== null && seen >= total), kind, pagesRead: entries.reduce((sum, item) => sum + item.pagesRead, 0), seen, total, ...(direction ? { direction } : {}) });
      }
      if (kinds.has("event") && !boundIds.has("event") && !listsAttendance) read.notes.push("Events are read when the user attaches one; none was attached.");

      // AG10 (AE-SCL-020): how a person stands now — a note saying something still needs doing ("Still need to send Priya the
      // JD") is not given when the person's to-do for it was completed after the note: it no longer holds (设计稿 §4 新的为准).
      if (current && read.views.some((view) => view.kind === "memo" && PENDING.test(String(view.fields.body ?? "")))) {
        for (const contact of contacts) {
          const done = await records.reader.read("todo", accountScope, { contactId: contact.id, limit: 20, status: "completed" }).then((result) => result.items).catch(() => [] as RecordView[]);
          const stale = read.views.filter((view) => view.kind === "memo" && Array.isArray(view.fields.contactIds) && (view.fields.contactIds as string[]).includes(contact.id) && PENDING.test(String(view.fields.body ?? ""))
            && done.some((todo) => similarity(String(todo.fields.title ?? ""), String(view.fields.body ?? "")) >= SIMILAR_TITLE && String(todo.fields.completedAt ?? "") > String(view.fields.createdAt ?? "")));
          if (!stale.length) continue;
          read.views = read.views.filter((view) => !stale.includes(view));
          read.notes.push(`Left out ${stale.length} older note(s) about ${contact.name || "this person"} that said something still needed doing: the matching to-do has been completed since.`);
          emitTrace({ notes: stale.map((view) => view.ref), partId: part.localId, type: "resolve.pending_note_done" });
        }
      }

      // 4. Gaps (code decides; the model never does).
      const recordViews = read.views.filter((view) => view.kind !== "contact");
      if (failures.length) {
        read.gaps.add("service_error");
        read.lines.push(words.serviceError(quote));
      }
      if (withheld > 0) {
        read.gaps.add("partial");
        read.notes.push(`${withheld} more matching record(s) cannot be read now; do not guess what they say.`);
        read.lines.push(words.partial());
      }
      if (unclear && !recordViews.length && !failures.length) {
        read.lines.push(words.notWhich(quote));
        finish("unfinished", "object_unclear");
        continue;
      }
      // AG20b (R25, AE-REF-004): a resolved person whose profile was read is a record of this part. When the related kinds
      // it also asked for came back empty, the profile is answered from and the empty kinds are said as what they are —
      // "nothing found" only when nothing that can answer the part was read. The coverage shows the profile too.
      const profiles = read.views.filter((view) => view.kind === "contact");
      // Only when the part asks about the person (their profile, their context), not for a list of one kind ("Do I have open
      // to-dos for Emily?": the profile cannot answer that; nothing found stays nothing found).
      // AE-RD-004 (run-05): "Do I have any open to-dos for Emily?" tagged contact.read + todo.read is still a list of to-dos —
      // a list, or a part naming a kind of record in its own words, is not a question about the person.
      const namesRecordKind = part.refs.some((ref) => ["todo", "memo", "schedule", "event"].includes(recordKindOf(ref.entity) ?? "") && !ref.recordId);
      // Integration seam (2026-11-20, coordinator): "what to handle today" about a picked person (the hotfix's plate) is a
      // question about the day's to-dos and schedule, never about the person — the hotfix's "nothing under this narrowing,
      // here is what is outside it" answers it, not the profile.
      const asksAboutPerson = capabilities.some((capability) => capability === "contact.read" || capability === "profile.read" || capability === "view.context") && !LIST_DELIVERABLES.has(part.plan.deliverable) && !namesRecordKind && !plate;
      const profileAnswers = asksAboutPerson && !recordViews.length && profiles.length > 0 && read.wantsRecords && !failures.length && !withheld && !read.gaps.has("unreadable");
      if (profileAnswers) {
        const empty = searchKinds.filter((kind) => read.coverage.some((item) => item.kind === kind && item.seen === 0));
        const who = profiles.map((view) => String(view.fields.displayName ?? "")).filter(Boolean).join(state.language === "en" ? ", " : "、");
        if (empty.length) read.lines.push(emptyKindsLine(state.language, who, empty));
        read.notes.push(`No ${empty.length ? empty.map((kind) => (kind === "memo" ? "notes" : kind === "todo" ? "to-dos" : "schedule items")).join(" or ") : "other records"} about ${who || "this person"} were found; the material is their contact profile. Answer from it (cite it); code tells the user the rest is empty.`);
        read.coverage.push({ complete: true, kind: "contact", pagesRead: 1, seen: profiles.length, total: profiles.length });
        emitTrace({ empty, partId: part.localId, profiles: profiles.map((view) => view.ref), type: "resolve.profile_answers" });
      }
      if (!profileAnswers && !recordViews.length && !failures.length && !withheld && (read.wantsRecords || !contacts.length) && !read.gaps.has("unreadable")) {
        read.gaps.add("no_record");
        read.lines.push(words.noRecord(quote));
      }
      // Hotfix 2026-11-20 (rule 3, graph/nodes/wider-read.ts): nothing under a narrowing, but records of the kind outside it —
      // code says what was looked for and how many there are, and shows them (no model call).
      let widened: Widened | null = null;
      if (read.gaps.has("no_record") && contacts.length <= 1 && !boundIds.size && !recordViews.length && asked.length) {
        try {
          widened = await widerThanAsked({ asked, cardOf: (view) => recordOfView(view, { language: state.language, nameOf: (id) => names.get(id) ?? run.readNames.get(id)?.name, now, timeZone: zone }), language: state.language, maxPages: records.maxPages, now, quote, reader: records.reader, scope: accountScope });
        } catch (error) {
          emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.failed", where: "resolve.wider" });
        }
        if (widened) {
          read.lines = read.lines.filter((line) => line !== words.noRecord(quote));
          run.answers.set(part.localId, widened.text);
          run.answerBlocks.set(part.localId, widened.blocks);
          widened.views.forEach((view, index) => {
            run.recordCards.set(view.ref, widened!.cards[index]);
            run.recordSort.set(view.ref, listSortKey(view));
            run.readNames.set(view.id, { name: nameOf(view, zone), type: view.kind });
            const source = readSourceOf(view, zone);
            if (source) run.readSources.set(view.ref, source);
          });
          emitTrace({ partId: part.localId, shown: widened.views.map((view) => view.ref), type: "resolve.nothing_under_narrowing" });
        }
      }
      const coverageLine = read.coverage.find((item) => item.total !== null && item.total > item.seen);
      if (coverageLine && LIST_DELIVERABLES.has(part.plan.deliverable)) read.lines.push(words.coverage(coverageLine.seen, coverageLine.total, coverageLine.direction ?? null));

      // 5. Materials for the answer step (only when there is something to answer from).
      const usable = read.wantsRecords ? recordViews.length > 0 || profileAnswers : read.views.length > 0;
      if (usable) {
        // AG13: the names of the people, notes and events these records link to.
        await addLinkNames(records, accountScope, read.views, names);
        let n = [...run.materials.values()].reduce((sum, list) => sum + list.length, 0);
        const materials: Material[] = [...read.views.filter((view) => view.kind === "contact"), ...read.views.filter((view) => view.kind !== "contact")]
          .map((view) => materialOf(view, part.localId, `s${(n += 1)}`, { names, now, occurrence: read.occurrences.get(view.ref) ?? null, timeZone: zone }));
        run.materials.set(part.localId, materials);
        run.readNotes.set(part.localId, read.notes);
        for (const view of read.views) if (!run.readNames.has(view.id)) run.readNames.set(view.id, { name: nameOf(view, zone), type: view.kind });
        // AG07: what the answer's links need of each record read (the basis line is written from the citations).
        for (const view of read.views) {
          const source = readSourceOf(view, zone);
          if (source) run.readSources.set(view.ref, source);
          // AG19: its card (the three lines are code's), for the list or the small cards under the answer.
          run.recordCards.set(view.ref, recordOfView(view, { language: state.language, nameOf: (id) => names.get(id) ?? run.readNames.get(id)?.name, now, timeZone: zone }));
          run.recordSort.set(view.ref, listSortKey(view));
          // AG19 repair round 1: what a statement about this event can be checked against (start, end, fee).
          if (view.kind === "event" && typeof view.fields.title === "string") {
            const kind = typeof view.fields.feeKind === "string" ? view.fields.feeKind : null;
            const amount = typeof view.fields.feeAmountYen === "string" && view.fields.feeAmountYen.trim() ? Number(view.fields.feeAmountYen) : undefined;
            run.eventFacts.set(view.ref, { endsAt: typeof view.fields.endsAt === "string" ? view.fields.endsAt : null, fee: kind ? { kind, ...(amount !== undefined && Number.isFinite(amount) ? { amountYen: amount } : {}) } : null, startsAt: typeof view.fields.startsAt === "string" ? view.fields.startsAt : null, title: view.fields.title });
          }
        }
        finish("answered", null);
      } else if (read.gaps.has("service_error")) {
        finish("unfinished", "read_failed");
      } else if (read.gaps.has("unreadable")) {
        finish("unfinished", "reference_not_accessible");
      } else {
        // Nothing found: the part is answered by code's sentence (no model call).
        finish("answered", null);
        // Hotfix 2026-11-20: the records shown instead were read and are what the answer rests on.
        if (widened) {
          part.reads = [...(part.reads ?? []), ...widened.views.map((view) => ({ ref: view.ref, version: view.version }))];
          part.cites = widened.views.map((view) => view.ref);
        }
      }
    }
    settleDependencies(parts);
    return { parts };
  };
}

/** A short name of a record for the session state ("the memo mentioned last"). */
function nameOf(view: RecordView, timeZone: string): string {
  const fields = view.fields as Record<string, unknown>;
  const title = typeof fields.title === "string" && fields.title.trim() ? fields.title.trim() : typeof fields.displayName === "string" ? fields.displayName : null;
  if (title) return title.slice(0, 40);
  const created = typeof fields.createdAt === "string" ? localDay(fields.createdAt, timeZone) : "";
  return `${view.kind}${created ? ` ${created}` : ""}`;
}
