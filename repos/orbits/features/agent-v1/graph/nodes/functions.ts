/**
 * functions (code; at most one main-model call for an extraction and one judgment request per part): the second-level
 * functions of 设计稿 §3.5 (agent-design AG08 minimal version, replaced in AG10 by the functions/ module). Code picks the
 * function from the part's deliverable, capabilities and words (§3.5 谁选择函数):
 *
 *   - an ordered pick of records (contacts, events, to-dos) → rankCandidates(): the basis is looked for in this turn's
 *     words, the @ references and the session, then saved memory, then history signals; with none, one question
 *     (clarify, "按什么来挑") — the reply "随便" gives the natural order (functions/basis.ts, functions/rank.ts);
 *   - the interactions in a memo → extractInteractions(); the follow-ups → extractFollowUps(); both in one model call,
 *     each reviewed by the judgment (functions/extract*.ts). "我答应了什么" only answers, quoting the memo; "加到待办" and
 *     "更新往来" make the card's operations (propose freezes them; no second-layer model call) unless the record is
 *     already there (functions/link-back.ts);
 *   - "整理一下" with a memo and nothing named: a summary only (the read and the grounded answer as before), code's lead
 *     saying so and two entries; none of the three functions runs;
 *   - a comparison or groups of events → compare() / group(), from the records' own fields.
 * Every function that runs is traced (fn.rank with the list it delivered, fn.extractInteractions, fn.extractFollowUps).
 */
import { readSourceOf } from "../../answer/basis";
import { gapWords } from "../../answer/gap-copy";
import type { SessionOpenItem } from "../../context/session-state";
import { eventFactsOf } from "../../domains/event/read";
import type { DomainScope, RecordView } from "../../domains/types";
import { askJudgment } from "../../judgment/ask";
import { FIELD_WEIGHT, rankJudgmentInput, type FunnelCandidate } from "../../judgment/funnel";
import { emitTrace, evalDeniedReads } from "../../observability/trace";
import type { RankField } from "../../understand/schema";
import { localDay } from "../../views/recent-interaction";
import type { CanonicalEventRecord } from "../../../events/core/contract";
import type { NoteInteractionContract } from "../../../../shared/contract/notes";
import type { CardOperationIntent } from "../../../agent/runtime/card-operations";
import { directionSaidIn, FOLLOW_UP_WORDS, groundedField, leavesItToAgent, memoriesFor, naturalField, PICK_WORDS, timeClauseOf, timePreferenceIn, topicWordsOf, type RankDomain, type TimePreference } from "../../functions/basis";
import { compare, dimensionsIn, type ComparedEvent } from "../../functions/compare";
import * as say from "../../functions/copy";
import { memoDayOf } from "../../functions/dates";
import { contactOfClue, type LinkedContact, type MemoForExtraction } from "../../functions/extract";
import { extractFromMemo } from "../../functions/extract-memo";
import { groupEventsByFee } from "../../functions/group";
import { linkFollowUp, linkInteraction, type ExistingTodo } from "../../functions/link-back";
import { rankCandidates, type RankCandidate, type RankResult } from "../../functions/rank";
import type { AgentRecordAccess, GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { clueWords, setIdOf } from "./clarify";
import { localMidnight } from "./resolve";

type Language = "zh" | "ja" | "en";

/** At most this many in a list ordered only by a field (the rest are counted). */
export const FIELD_LIST_LIMIT = 20;
const PAGE = 500;
const MAX_ROWS = 6_000;

/* ── which function ────────────────────────────────────────────────── */

/**
 * A contact clue that names the set to pick from, not a person ("联系人", "东京做零售的联系人", "my contacts based in
 * Singapore", "連絡先"): it holds a word for contacts in general (stab2: "my contacts based in Singapore").
 */
const GENERIC_CONTACT_CLUE = /(?:联系人|聯絡人|人脉|連絡先|コンタクト|\bcontacts\b|\bpeople\b)|^(?:人|persons?|contact)$/iu;
const RANK_WORDS = /(挑|选出|选几|排序|排一下|排个序|并べ|並べ|選んで|順に|順番|\bpick\b|\bchoose\b|\brank\b|\bsort\b|\border\b|\blist the\b)/iu;
const TODO_LIST_WORDS = /(待办|跟进|タスク|ToDo|フォローアップ|\bto-?dos?\b|\bfollow[\s-]?ups?\b|\btasks?\b)/iu;
const WHO_WORDS = /(谁|哪位|哪些人|哪几位|\bwho\b|\bwhom\b|誰|どなた|どの人)/iu;
const FORMAL_FOLLOW_UP = /(正式跟进|正式的跟进|フォローアップ|formal follow[\s-]?ups?)/iu;

/** The kind of records a part ranks, or null when it is not a ranking this node does. */
export function rankDomainOf(part: GraphPart, message: string): RankDomain | null {
  if (part.route !== "read" || !part.capabilities.includes("fn.rank")) return null;
  // Comparing and grouping are other functions (AE-FN-014: "按免费和收费分个组" is a group, not a pick).
  if (part.capabilities.includes("fn.group") || part.capabilities.includes("fn.compare")) return null;
  const quote = message.slice(part.quote[0], part.quote[1]);
  if (!part.plan.rank && !RANK_WORDS.test(quote) && !PICK_WORDS.test(quote)) return null;
  const contact = part.capabilities.includes("contact.read") || part.capabilities.includes("view.recentInteraction");
  // AG10 (AE-FN-001): two or more events chosen with @ are an event ranking even when the first layer named no event read.
  const chosenEvents = part.refs.filter((ref) => ref.entity === "event" && ref.recordId).length;
  const event = part.capabilities.includes("event.read") || chosenEvents >= 2;
  const todo = part.capabilities.includes("todo.read");
  // AG10 (AE-FN-003): "这周该跟进谁" asks for people — a contact ranking whose to-dos and schedule are only its signals.
  if (contact && WHO_WORDS.test(quote) && !part.refs.some((ref) => ref.entity === "contact" && ref.recordId)) return "contact";
  // AG10 (AE-SCL-017, dev run 2): to-dos or follow-ups named in the words, ordered or picked, with no memo chosen, are a to-do
  // ranking — the note reads the first layer may add are not what is listed.
  if (todo && TODO_LIST_WORDS.test(quote) && !part.refs.some((ref) => ref.recordId && (ref.entity === "memo" || ref.entity === "todo"))) return "todo";
  // Reading other records is another kind of task — except a memo attached with @ (its topics are the basis).
  const memoBasis = part.refs.filter((ref) => ref.entity === "memo");
  const readsMemoBasis = memoBasis.length > 0 && memoBasis.every((ref) => ref.recordId);
  if (part.capabilities.some((capability) => capability === "schedule.read" || (capability === "memo.read" && !readsMemoBasis))) return null;
  const said = (ref: GraphPart["refs"][number]) => (ref.quote ? message.slice(ref.quote[0], ref.quote[1]) : "").replace(/^@/u, "").trim();
  if (event && !contact && !todo) return chosenEvents === 1 ? null : "event";
  // AG10 (AE-SCL-017): to-dos and formal follow-ups, ordered or picked.
  if (todo && !contact && !event) return part.refs.some((ref) => ref.entity === "todo" && ref.recordId) ? null : "todo";
  if (contact && !event && !todo) return part.refs.some((ref) => ref.entity === "contact" && (ref.recordId || (said(ref) && !GENERIC_CONTACT_CLUE.test(said(ref))))) ? null : "contact";
  return null;
}

const INTERACTION_WORDS = /(往来|互动|来往|联系记录|通话记录|来电|やり取り|やりとり|接触|interactions?|contact log)/iu;
const FOLLOW_UP_ASK = /(答应|承诺|约好|说好|約束|やること|待办|ToDo|TODO|タスク|\bto-?dos?\b|\btasks?\b|跟进事项|要做的事|\bpromise[sd]?\b|\bcommit(?:ted|ments?)?\b|supposed to do|follow[\s-]?ups?)/iu;
const SUMMARIZE_WORDS = /(整理|总结|归纳|概括|摘要|まとめ|要約|summari[sz]e|sum up|tidy up)/iu;
const COMPARE_WORDS = /(对比|比较|比一比|比べ|比較|\bcompare\b|\bversus\b|\bvs\.?\b)/iu;
const GROUP_WORDS = /(分组|分个组|分成|按.{0,6}分类|归类|グループ|分けて|\bgroup\b|\bsplit into\b)/iu;

export type FunctionTask =
  | { kind: "rank"; domain: RankDomain }
  | { kind: "rank_reply"; item: SessionOpenItem }
  | { kind: "extract"; memoId: string; want: { interactions: boolean; followUps: boolean }; write: boolean }
  | { kind: "summary"; memoId: string }
  | { kind: "compare" }
  | { kind: "group" };

const isMemoType = (type: string) => type === "memo" || type === "note";

/** The memo a part works on: its own bound memo, this turn's @ memo, or (a reply that points back, "それ") the last one. */
function memoOf(scope: NodeScope, part: GraphPart): string | null {
  const bound = part.refs.find((ref) => ref.entity === "memo" && ref.recordId);
  if (bound) return bound.recordId!;
  const attached = scope.run.references.filter((reference) => isMemoType(reference.type) && reference.accessible !== false);
  if (attached.length === 1) return attached[0].id;
  // A memo clue with no record ("それ", "約束したこと") goes back to the memo of the conversation, when there is one.
  if (part.refs.some((ref) => ref.entity === "memo" && !ref.recordId)) {
    const last = scope.run.context?.lastMentionedForCode.find((item) => isMemoType(item.type));
    if (last) return last.id;
  }
  return null;
}

/** The function this part needs, chosen by code (§3.5 谁选择函数), or null. */
export function functionOf(scope: NodeScope, part: GraphPart): FunctionTask | null {
  const message = scope.input.message;
  const quote = message.slice(part.quote[0], part.quote[1]);
  // A reply to "按什么来挑" (AG10-1): the ranking asked about goes on with this answer.
  const item = part.continues?.kind === "clarification" ? scope.run.context?.openItems.find((open) => open.ref === part.continues!.ref) : undefined;
  if (item?.rank) return { item, kind: "rank_reply" };
  if (part.route === "read" || part.route === "answer") {
    const events = part.refs.filter((ref) => ref.entity === "event" && ref.recordId).length + scope.run.references.filter((reference) => reference.type === "event" && reference.accessible !== false).length;
    // Comparing and grouping are done here for events (their fee, time and topics); other records go on to the read and the answer.
    const aboutEvents = part.capabilities.includes("event.read") && !part.capabilities.some((capability) => capability === "memo.read" || capability === "todo.read" || capability === "contact.read");
    if (aboutEvents && (part.capabilities.includes("fn.group") || GROUP_WORDS.test(quote))) return { kind: "group" };
    if ((aboutEvents || events >= 2) && events >= 2 && (part.capabilities.includes("fn.compare") || COMPARE_WORDS.test(quote))) return { kind: "compare" };
  }
  const write = part.route === "propose_write";
  if (part.route === "read" || write) {
    const interactions = part.capabilities.includes("fn.extractInteractions") || INTERACTION_WORDS.test(quote);
    const followUps = part.capabilities.includes("fn.extractFollowUps") || FOLLOW_UP_ASK.test(quote);
    const memoId = memoOf(scope, part);
    if (memoId && (interactions || followUps)) {
      // A write asks for one kind: to-dos are follow-ups; anything else written from a memo is its interaction.
      const writesTodo = part.capabilities.some((capability) => capability.startsWith("todo."));
      const want = write ? { followUps: writesTodo || (followUps && !interactions), interactions: !writesTodo && interactions } : { followUps, interactions };
      if (want.followUps || want.interactions) return { kind: "extract", memoId, want, write };
    }
    if (!write && memoId && scope.run.references.some((reference) => isMemoType(reference.type) && reference.id === memoId) && (part.capabilities.includes("fn.summarize") || part.plan.deliverable === "summary" || SUMMARIZE_WORDS.test(quote))) return { kind: "summary", memoId };
  }
  const domain = rankDomainOf(part, message);
  return domain ? { domain, kind: "rank" } : null;
}

const due = (state: AgentGraphState, part: GraphPart) => (state.touched === null || state.touched.includes(part.localId)) && !part.reads && !part.gaps && ((part.status === "answered" && (part.route === "read" || part.route === "answer")) || (part.route === "propose_write" && part.reason === "proposing" && !part.write));

/** Parts this pass runs a function for. */
export function functionsDue(state: AgentGraphState, scope: NodeScope): boolean {
  return state.parts.some((part) => due(state, part) && functionOf(scope, part) !== null && !scope.run.functionsDone.has(part.localId));
}

/* ── candidates ────────────────────────────────────────────────────── */

const INDUSTRY_WORDS: Record<string, string[]> = {
  软件: ["software", "ソフトウェア", "软件", "ソフト"], 贸易: ["trade", "trading", "貿易", "商社"], 摄影: ["photography", "写真", "攝影"], 出版: ["publishing", "出版"],
  设计: ["design", "デザイン"], 物流: ["logistics", "物流"], 金融: ["finance", "金融"], 教育: ["education", "教育"], 零售: ["retail", "小売", "零售"],
  半导体: ["semiconductor", "semiconductors", "半導体"], 陶艺: ["ceramics", "pottery", "陶芸"], 机器人: ["robotics", "ロボット"], 餐饮: ["restaurant", "food", "飲食"], 媒体: ["media", "メディア"],
};
const PLACE_WORDS: Record<string, string[]> = { 东京: ["東京", "tokyo"], 大阪: ["osaka"], 横滨: ["横浜", "yokohama"], 京都: ["kyoto"], 上海: ["shanghai"], 新加坡: ["シンガポール", "singapore"], 北京: ["beijing"], 深圳: ["shenzhen"], 杭州: ["hangzhou"], 苏州: ["suzhou"], 台北: ["taipei"], 栃木: ["tochigi"], 茨城: ["ibaraki"], 神奈川: ["kanagawa"] };

const saidIn = (text: string, word: string) => (/^[a-z]+$/iu.test(word) ? new RegExp(`\\b${word}\\b`, "iu").test(text) : text.includes(word));
const outside = (message: string, span: [number, number] | undefined) => (span ? message.slice(0, span[0]) + " ".repeat(span[1] - span[0]) + message.slice(span[1]) : message);
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

interface ContactCandidate extends RankCandidate {
  view: RecordView;
  name: string;
  company: string | null;
  role: string | null;
  place: string | null;
  city: string | null;
  industry: string | null;
  tags: string[];
  notes: string | null;
  lastInteraction: string | null;
  signals: ContactSignal[];
}

interface EventCandidate extends RankCandidate {
  view: RecordView;
  title: string;
  startsAt: string | null;
  venue: string | null;
  topics: string | null;
  event: ComparedEvent;
}

interface TodoCandidate extends RankCandidate {
  view: RecordView;
  title: string;
  dueAt: string | null;
  plannedDate: string | null;
  status: string;
  source: string | null;
}

/** AG10 history signals of a contact (code, from the user's own to-dos): a formal follow-up past due, a to-do past its planned day, … */
interface ContactSignal {
  kind: "overdue_followup" | "overdue_todo" | "past_planned" | "due_in_period" | "planned_in_period";
  todo: { ref: string; title: string; dueAt: string | null; plannedDate: string | null };
}

type Candidate = ContactCandidate | EventCandidate | TodoCandidate;

async function readAll(records: AgentRecordAccess, scope: { accountId: string; workspaceId: string }, spec: Parameters<AgentRecordAccess["source"]["page"]>[1]): Promise<Awaited<ReturnType<AgentRecordAccess["source"]["page"]>>> {
  const rows: Awaited<ReturnType<AgentRecordAccess["source"]["page"]>> = [];
  let after: { key: string; id: string } | null = null;
  while (rows.length < MAX_ROWS) {
    const page = await records.source.page(scope, spec, after, PAGE);
    rows.push(...page);
    if (page.length < PAGE) break;
    const last = page[page.length - 1];
    after = { id: last.id, key: last.sortKey };
  }
  return rows;
}

function todoOf(row: { id: string; payload: Record<string, unknown>; updatedAt: string }): TodoCandidate | null {
  const task = row.payload.task as Record<string, unknown> | undefined;
  if (!task || typeof task.title !== "string") return null;
  const title = task.title;
  return {
    dueAt: str(task.dueAt),
    id: row.id,
    plannedDate: str(task.plannedDate),
    ref: `todo:${row.id}`,
    source: str(task.source),
    status: str(task.status) ?? "open",
    title,
    view: { fields: { dueAt: str(task.dueAt) ?? undefined, plannedDate: str(task.plannedDate) ?? undefined, status: str(task.status) ?? undefined, title }, id: row.id, kind: "todo", ref: `todo:${row.id}`, updatedAt: row.updatedAt, version: str(task.updatedAt) ?? row.updatedAt },
    words: title,
  };
}

async function openTodos(records: AgentRecordAccess, where: { accountId: string; workspaceId: string }): Promise<(TodoCandidate & { contactId: string | null })[]> {
  const rows = await readAll(records, where, { collection: "tasks", denied: [...evalDeniedReads()], equals: [{ paths: [["task", "status"]], value: "open" }], order: { direction: "asc", paths: [["task", "dueAt"], ["task", "plannedDate"]] } });
  return rows.map((row) => {
    const todo = todoOf(row);
    return todo ? { ...todo, contactId: str((row.payload.task as Record<string, unknown>).relatedContactId) } : null;
  }).filter((item): item is TodoCandidate & { contactId: string | null } => Boolean(item));
}

async function contactCandidates(records: AgentRecordAccess, actorId: string, withInteractions: boolean): Promise<ContactCandidate[]> {
  const scope = records.scope(actorId);
  const where = { accountId: scope.accountId, workspaceId: scope.workspaceId };
  const denied = [...evalDeniedReads()];
  const rows = await readAll(records, where, { collection: "contacts", denied, order: { direction: "asc", paths: [["displayName"]] } });
  const last = new Map<string, string>();
  if (withInteractions) {
    const notes = await readAll(records, where, { collection: "notes", denied, order: { direction: "desc", paths: [["note", "interaction", "occurredOn"]] }, present: [["note", "interaction", "occurredOn"]] });
    for (const row of notes) {
      const interaction = (row.payload.note as { interaction?: { actualContactIds?: unknown; occurredOn?: unknown } } | undefined)?.interaction;
      const day = str(interaction?.occurredOn);
      const ids = Array.isArray(interaction?.actualContactIds) ? interaction!.actualContactIds.filter((id): id is string => typeof id === "string") : [];
      if (!day) continue;
      for (const id of ids) if (!last.has(id) || last.get(id)! < day) last.set(id, day);
    }
  }
  const out: ContactCandidate[] = [];
  for (const row of rows) {
    const payload = row.payload;
    const name = str(payload.displayName);
    if (!name || payload.stage === "archived") continue;
    const tags = Array.isArray(payload.customTags) ? payload.customTags.filter((tag): tag is string => typeof tag === "string") : [];
    const industry = tags.find((tag) => tag.startsWith("行业:"))?.slice(3) ?? null;
    const plainTags = tags.filter((tag) => !tag.startsWith("行业:"));
    const region = typeof payload.region === "object" && payload.region !== null ? (payload.region as { city?: unknown }) : null;
    const candidate: ContactCandidate = {
      city: str(region?.city),
      company: str(payload.organization) ?? str(payload.company),
      id: row.id,
      industry,
      lastInteraction: last.get(row.id) ?? null,
      name,
      notes: str(payload.notes),
      place: str(payload.location),
      ref: `contact:${row.id}`,
      role: str(payload.role) ?? str(payload.headline),
      signals: [],
      tags: plainTags,
      view: { fields: { company: str(payload.organization) ?? undefined, displayName: name, headline: str(payload.role) ?? undefined }, id: row.id, kind: "contact", ref: `contact:${row.id}`, updatedAt: row.updatedAt, version: str(payload.updatedAt) ?? row.updatedAt },
      words: "",
    };
    candidate.words = [name, candidate.company, candidate.role, candidate.place, candidate.city, industry, ...(industry ? INDUSTRY_WORDS[industry] ?? [] : []), ...plainTags, candidate.notes].filter(Boolean).join(" ");
    // run-02 (AE-SCL-014): what the record says the person does weighs more than a word inside a company's name.
    candidate.fields = [
      { text: name, weight: FIELD_WEIGHT.name },
      ...(candidate.company ? [{ text: candidate.company, weight: FIELD_WEIGHT.company }] : []),
      ...[candidate.place, candidate.city].filter((text): text is string => Boolean(text)).map((text) => ({ text, weight: FIELD_WEIGHT.place })),
      ...[candidate.role, industry, ...(industry ? INDUSTRY_WORDS[industry] ?? [] : []), ...plainTags, candidate.notes].filter((text): text is string => Boolean(text)).map((text) => ({ text, weight: FIELD_WEIGHT.describes })),
    ];
    out.push(candidate);
  }
  return out;
}

function eventCandidate(event: CanonicalEventRecord): EventCandidate {
  const facts = eventFactsOf(event);
  const topics = facts.topics.length ? facts.topics.join("、") : null;
  const title = event.title ?? "";
  // A draft keeps a placeholder start: only a published event's start is announced.
  const startsAt = event.lifecycleState === "published" ? event.startsAt : null;
  return {
    event: { facts, id: event.eventId, ref: `event:${event.eventId}`, startsAt, title, venue: event.venue },
    id: event.eventId,
    ref: `event:${event.eventId}`,
    startsAt,
    title,
    topics,
    venue: event.venue,
    view: { fields: { location: event.venue ?? undefined, startsAt: startsAt ?? undefined, title }, id: event.eventId, kind: "event", ref: `event:${event.eventId}`, updatedAt: startsAt ?? "", version: String(event.eventVersion) },
    words: [title, topics, event.venue, event.description].filter(Boolean).join(" "),
  };
}

const visibleEvent = (event: CanonicalEventRecord, actorId: string) => !event.archivedAt && !event.cancelledAt && (event.lifecycleState === "published" || event.organizerActorId === actorId);

/* ── copy (AG08, kept) ─────────────────────────────────────────────── */

const LEVEL_WORDS: Record<Language, Record<"insufficient" | "partial" | "match", string>> = {
  en: { insufficient: "nothing in the record ties it to this directly", match: "the record fits directly", partial: "partly related" },
  ja: { insufficient: "記録からは直接の関係は読み取れません", match: "記録が直接合っています", partial: "一部関連があります" },
  zh: { insufficient: "记录里看不出和这个主题直接相关", match: "记录直接对得上", partial: "部分相关" },
};

function contactLine(item: ContactCandidate, language: Language, level: string | null): string {
  const sep = language === "en" ? ", " : "，";
  const facts: string[] = [];
  const head = [item.company, item.role].filter(Boolean).join(" · ");
  if (head) facts.push(head);
  if (item.place) facts.push(item.place);
  if (item.industry) facts.push(language === "en" ? `industry: ${item.industry}${INDUSTRY_WORDS[item.industry]?.[0] ? ` (${INDUSTRY_WORDS[item.industry][0]})` : ""}` : language === "ja" ? `業種：${item.industry}` : `行业：${item.industry}`);
  if (item.tags.length) facts.push(language === "en" ? `tags: ${item.tags.join(", ")}` : language === "ja" ? `タグ：${item.tags.join("、")}` : `标签：${item.tags.join("、")}`);
  if (item.notes) facts.push(language === "en" ? `note: ${item.notes}` : language === "ja" ? `メモ：${item.notes}` : `备注：${item.notes}`);
  if (item.lastInteraction) facts.push(language === "en" ? `last recorded interaction: ${say.dayWordsOf(item.lastInteraction, language)}` : language === "ja" ? `最後のやり取り：${say.dayWordsOf(item.lastInteraction, language)}` : `最近一次往来：${say.dayWordsOf(item.lastInteraction, language)}`);
  const open = language === "en" ? " (" : "（";
  const close = language === "en" ? ")" : "）";
  const levelText = level ? `${language === "en" ? " — " : "——"}${LEVEL_WORDS[language][level as keyof (typeof LEVEL_WORDS)["zh"]]}` : "";
  return `${item.name}${facts.length ? `${open}${facts.join(sep)}${close}` : ""}${levelText}`;
}

function eventLine(item: EventCandidate, language: Language, level: string | null, timeZone: string, extra: string | null = null): string {
  const sep = language === "en" ? ", " : "，";
  const facts = [item.startsAt ? say.whenWordsOf(item.startsAt, timeZone, language) : null, item.venue, item.topics ? (language === "en" ? `topics: ${item.topics}` : language === "ja" ? `テーマ：${item.topics}` : `主题：${item.topics}`) : null].filter(Boolean);
  const open = language === "en" ? " (" : "（";
  const close = language === "en" ? ")" : "）";
  const levelText = level ? `${language === "en" ? " — " : "——"}${LEVEL_WORDS[language][level as keyof (typeof LEVEL_WORDS)["zh"]]}` : "";
  return `${item.title}${facts.length ? `${open}${facts.join(sep)}${close}` : ""}${extra ? `${language === "en" ? " — " : "——"}${extra}` : ""}${levelText}`;
}

function todoLine(item: TodoCandidate, language: Language, timeZone: string, now: string): string {
  const due = item.dueAt ? say.whenWordsOf(item.dueAt, timeZone, language) : null;
  const overdue = item.dueAt && item.dueAt < now ? Math.floor((Date.parse(now) - Date.parse(item.dueAt)) / 86_400_000) : null;
  const facts = [due ? ({ en: `due ${due}`, ja: `期限 ${due}`, zh: `截止 ${due}` } as const)[language] : null, overdue !== null ? ({ en: overdue >= 1 ? `${overdue} day${overdue > 1 ? "s" : ""} overdue` : "overdue", ja: overdue >= 1 ? `${overdue}日超過` : "期限超過", zh: overdue >= 1 ? `已过期${overdue}天` : "已过期" } as const)[language] : null, item.plannedDate ? ({ en: `planned ${say.dayWordsOf(item.plannedDate, language)}`, ja: `予定日 ${say.dayWordsOf(item.plannedDate, language)}`, zh: `计划日 ${say.dayWordsOf(item.plannedDate, language)}` } as const)[language] : null].filter(Boolean);
  return `${item.title}${facts.length ? (language === "en" ? ` (${facts.join(", ")})` : `（${facts.join("，")}）`) : ""}`;
}

const UNIT: Record<RankDomain, Record<Language, string>> = { contact: { en: "contacts", ja: "人", zh: "位" }, event: { en: "events", ja: "件", zh: "场" }, todo: { en: "to-dos", ja: "件", zh: "条" } };
const NOUN: Record<RankDomain, Record<Language, string>> = { contact: { en: "contacts", ja: "連絡先", zh: "联系人" }, event: { en: "events", ja: "イベント", zh: "活动" }, todo: { en: "to-dos", ja: "タスク", zh: "待办" } };

function unmatchedWhy(reason: string | null, language: Language): string {
  const words: Record<string, Record<Language, string>> = {
    not_enabled: { en: "that step is not switched on yet", ja: "その判定はまだ使えない状態です", zh: "这一步的判断还没有启用" },
    timeout: { en: "the matching step did not answer in time", ja: "判定が時間内に返ってきませんでした", zh: "判断没有及时回应" },
  };
  return (words[reason ?? ""] ?? { en: "the matching step was not available", ja: "判定が使えませんでした", zh: "判断暂时不可用" })[language];
}

function fieldWords(field: RankField | null, direction: "asc" | "desc", language: Language): string {
  const names: Record<RankField, Record<Language, string>> = {
    dueAt: { en: "deadline", ja: "期限", zh: "截止时间" },
    lastInteraction: { en: "the date of your last recorded interaction", ja: "最後に記録されたやり取りの日付", zh: "最近一次往来的日期" },
    plannedDate: { en: "planned date", ja: "予定日", zh: "计划日" },
    startsAt: { en: "start time", ja: "開始時間", zh: "开始时间" },
  };
  const name = names[field ?? "startsAt"][language];
  if (language === "en") return `${name}, ${direction === "asc" ? (field === "lastInteraction" ? "oldest first" : "earliest first") : "latest first"}`;
  if (language === "ja") return `${name}の${direction === "asc" ? (field === "lastInteraction" ? "古い順" : "早い順") : (field === "lastInteraction" ? "新しい順" : "遅い順")}`;
  return `${name}${direction === "asc" ? "从远到近（由早到晚）" : "由近到远"}`;
}

/** "11月21日到11月22日的活动", "the events of Nov 21–Nov 22": the dates the events were kept by. */
function periodWords(period: { from?: string; to?: string } | null, language: Language): string | null {
  if (!period?.from && !period?.to) return null;
  const short = (day: string) => {
    const [, month, date] = day.split("-").map(Number);
    return language === "en" ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${date}` : `${month}月${date}日`;
  };
  const from = period.from ? short(period.from) : null;
  const to = period.to ? short(period.to) : null;
  if (language === "en") return from && to ? (from === to ? `on ${from}` : `from ${from} to ${to}`) : from ? `from ${from}` : `until ${to}`;
  if (language === "ja") return from && to ? (from === to ? `${from}の` : `${from}から${to}までの`) : from ? `${from}以降の` : `${to}までの`;
  return from && to ? (from === to ? `${from}的` : `${from}到${to}的`) : from ? `${from}以后的` : `${to}之前的`;
}

interface Written {
  text: string;
  cites: string[];
}

/** The AG08 answer of a ranking (scope, topic, coverage; the reason of each by the record's own fields). */
function writeAnswer(input: { domain: RankDomain; language: Language; basis: string | null; basisMemo: string | null; within: string | null; period: { from?: string; to?: string } | null; field: RankField | null; direction: "asc" | "desc"; result: RankResult<Candidate>; timeZone: string; now: string; lead: string | null; reasons: Map<string, string> }): Written {
  const { domain, language, result } = input;
  const unit = UNIT[domain][language];
  const noun = NOUN[domain][language];
  const n = result.ordered.length;
  const lines: string[] = [];
  if (input.lead) lines.push(input.lead);
  // Events are Orbit's public directory, not the user's own: they are named by the dates they were kept by.
  const period = domain === "event" ? periodWords(input.period, language) : null;
  const scope = input.within
    ? (language === "en" ? `your ${noun} ${input.within}` : language === "ja" ? `${input.within}${noun}` : `${input.within.replace(/的$/u, "")}的${noun}`)
    : domain === "event"
      ? (language === "en" ? `the public events${period ? ` ${period}` : ""}` : language === "ja" ? `${period ?? "公開中の"}イベント` : `${period ?? "公开的"}活动`)
      : language === "en" ? `your ${noun}` : language === "ja" ? `あなたの${noun}` : `你的${noun}`;
  const topic = input.basisMemo ? (language === "en" ? `the topics of your note "${input.basisMemo}"` : language === "ja" ? `メモ「${input.basisMemo}」のテーマ` : `你的笔记「${input.basisMemo}」的主题`) : input.basis ? (language === "en" ? `"${input.basis}"` : `「${input.basis}」`) : null;
  const { afterHardConditions, judged, truncated } = result.coverage;
  if (input.lead) {
    // AG10: the lead said the basis; the coverage follows.
    lines.push(say.coverageLine(language, n, result.matching, { en: unit, ja: UNIT[domain].ja, zh: UNIT[domain].zh }));
  } else if (result.semantic && result.matched) {
    lines.push(language === "en" ? `From ${scope}, picked by ${topic}: ${n} ${unit}.` : language === "ja" ? `${scope}の中から、${topic}に合うものを${n}${unit}選びました。` : `在${scope}里，按${topic}这个主题挑了${n}${unit}：`);
    if (truncated > 0) {
      lines.push(language === "en"
        ? `I looked closely at ${judged} of them; ${truncated} more were not looked at closely (${afterHardConditions} in all), so these are the best fits among the ones looked at, not necessarily among all ${noun}.`
        : language === "ja"
          ? `今回詳しく見たのは${judged}${unit}で、残りの${truncated}${unit}は詳しく見ていません（全部で${afterHardConditions}${unit}）。詳しく見た範囲での結果で、すべての${noun}の中で最適という意味ではありません。`
          : `这次细看了${judged}${unit}，还有${truncated}${unit}没有细看（共${afterHardConditions}${unit}），所以这是细看过的范围里的结果，不代表全部${noun}里最合适。`);
    } else {
      lines.push(language === "en" ? `All ${afterHardConditions} of them were looked at closely; this is within those ${afterHardConditions}, not all of your ${noun}.` : language === "ja" ? `対象の${afterHardConditions}${unit}はすべて詳しく見ました（その範囲での結果です）。` : `符合条件的共${afterHardConditions}${unit}，都细看过了；这是在这${afterHardConditions}${unit}里挑的，不是在全部${noun}里。`);
    }
  } else if (result.semantic) {
    if (input.basisMemo) lines.push(language === "en" ? `Based on ${topic}.` : language === "ja" ? `${topic}をもとにしています。` : `依据是${topic}。`);
    const why = unmatchedWhy(result.unmatchedReason, language);
    const order = input.basisMemo
      ? (language === "en" ? "the overlap of the note's words with each event's title and topics, then start time" : language === "ja" ? "メモの言葉とイベントのタイトル・テーマの重なり、その次に開始時間" : "笔记里的词和活动标题、标签的重合，再按开始时间")
      : domain === "event"
        ? (language === "en" ? `the overlap of ${topic} with each event's title and topics, then start time` : language === "ja" ? `${topic}とイベントのタイトル・テーマの重なり、その次に開始時間` : `${topic}和活动标题、标签的重合，再按开始时间`)
        : (language === "en" ? `the overlap of ${topic} with each contact's industry, company, role and notes` : language === "ja" ? `${topic}と連絡先の業種・会社・役職・メモの重なり` : `${topic}和联系人行业、机构、职位、备注的重合`);
    // AG10 opening item (AG08 交接 1): the lead says what was asked for and that the topic match was not done — never
    // "picked by the topic" — in the same sentence, so no sentence of it claims a topic ranking.
    lines.push(language === "en"
      ? `${topic ? `You asked for ${noun} from ${scope} that fit ${topic}, but no topic matching was done this time` : `From ${scope}: no topic matching was done this time`} (${why}), so none of the ${afterHardConditions} ${noun} was looked at closely; the order below is by record fields only: ${order}. It does not mean nothing fits. ${n} ${unit}:`
      : language === "ja"
        ? `${scope}（全部で${afterHardConditions}${unit}）${topic ? `から${topic}に合うものを、というご依頼ですが` : "について"}、今回はテーマとの照合をしていません（${why}）。詳しく見たものはなく、以下は記録の項目だけで並べた順です：${order}。合うものがないという意味ではありません。${n}${unit}：`
        : `在${scope}里（共${afterHardConditions}${unit}）${topic ? `，你要的是和${topic}相关的，但这次没有做主题匹配` : "，这次没有做主题匹配"}（${why}），${afterHardConditions}${unit}都没有细看，下面的顺序只按记录里的字段排：${order}。这不代表没有合适的。列出${n}${unit}：`);
  } else {
    const total = result.matching;
    lines.push(language === "en"
      ? `Sorted by ${fieldWords(input.field, input.direction, language)}: ${n} of ${total} ${noun}.`
      : language === "ja"
        ? `${fieldWords(input.field, input.direction, language)}に並べました（${total}${unit}中${n}${unit}）。`
        : `按${fieldWords(input.field, input.direction, language)}排（共${total}${unit}，列出${n}${unit}）：`);
  }
  result.ordered.forEach((item, index) => {
    const candidate = item.candidate;
    const level = result.matched ? item.level : null;
    const reason = input.reasons.get(candidate.id) ?? null;
    const line = domain === "contact" ? `${contactLine(candidate as ContactCandidate, language, level)}${reason ? `${language === "en" ? " — " : "——"}${reason}` : ""}` : domain === "event" ? eventLine(candidate as EventCandidate, language, level, input.timeZone, reason) : todoLine(candidate as TodoCandidate, language, input.timeZone, input.now);
    lines.push(`${index + 1}. ${line}`);
  });
  if (result.untimed.length && domain === "event") lines.push(say.untimedLine(language, result.untimed.map((item) => (item as EventCandidate).title)));
  if (input.lead) lines.push(say.changeBasisLine(language));
  return { cites: [...result.ordered.map((item) => item.candidate.ref), ...(domain === "event" ? result.untimed.map((item) => item.ref) : [])], text: lines.join("\n") };
}

/* ── the node ──────────────────────────────────────────────────────── */

const LAST_INTERACTION_WORDS = /(最久没|很久没|多久没|最近一次往来|最后一次联系|上次联系|しばらく連絡|連絡していない|最後に(连絡|話)|longest without|haven'?t talked|last (recorded )?interaction|gone the longest)/iu;
const START_WORDS = /(开始时间|按时间|时间顺序|時間順|開始時間|開始時刻|日付順|start time|starting time|by date|soonest|earliest first)/iu;
const COUNT_WORDS: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** "挑三个", "the ten", "3つ" — the count said in the words (code's check of the first layer's count). */
export function countSaidIn(words: string): number | null {
  const digit = words.match(/(\d{1,2})\s*(?:个|位|场|条|件|人|つ|名|本)/u) ?? words.match(/\b(?:the |top )?(\d{1,2})\b(?!\s*(?:月|日|号|:|：))/iu);
  if (digit) return Number(digit[1]);
  const cjk = words.match(/([一两二三四五六七八九十])\s*(?:个|位|场|条|件|项|人|つ|名)/u);
  if (cjk) return COUNT_WORDS[cjk[1]] ?? null;
  const latin = words.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/u);
  return latin ? COUNT_WORDS[latin[1]] : null;
}

export function functionsNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part, plan: { ...part.plan } }));
    const tasks = parts.map((part) => ({ part, task: due(state, part) && !run.functionsDone.has(part.localId) ? functionOf(scope, part) : null })).filter((item): item is { part: GraphPart; task: FunctionTask } => item.task !== null);
    if (!tasks.length) return {};
    const optionSets = [...state.optionSets];
    let budget = { ...state.budget };
    let repairs = state.repairs;
    for (const { part, task } of tasks) {
      run.functionsDone.add(part.localId);
      const quote = input.message.slice(part.quote[0], part.quote[1]);
      if (!deps.records) {
        part.status = "unfinished";
        part.reason = "read_failed";
        part.gaps = ["service_error"];
        run.gapLines.set(part.localId, [gapWords(state.language).serviceError(quote)]);
        continue;
      }
      try {
        if (task.kind === "summary") summaryPart(scope, state, part, optionSets);
        else if (task.kind === "compare" || task.kind === "group") await eventsPart(scope, state, part, task.kind);
        else if (task.kind === "extract") {
          const done = await extractPart(scope, state, part, task, { budget, repairs });
          budget = done.budget;
          repairs = done.repairs;
        } else await rankPart(scope, state, part, task, optionSets);
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.failed", where: `functions.${task.kind}` });
        part.status = "unfinished";
        part.reason = "read_failed";
        part.gaps = ["service_error"];
        run.gapLines.set(part.localId, [gapWords(state.language).serviceError(quote)]);
      }
    }
    const ordered = [...parts].sort((left, right) => left.quote[0] - right.quote[0]);
    run.sourceRefs = [...new Set(ordered.flatMap((part) => part.cites ?? []))];
    return { budget, optionSets, parts, repairs };
  };
}

/* ── ranking ───────────────────────────────────────────────────────── */

interface RankPlanState {
  domain: RankDomain;
  count?: number;
  from?: string;
  to?: string;
}

/** The orderings a domain can use right now (the options of the one question). */
function orderingsOf(domain: RankDomain): string[] {
  if (domain === "event") return ["startsAt", "weekend", "topic"];
  if (domain === "contact") return ["overdue", "lastInteraction"];
  return ["dueAt", "plannedDate"];
}

async function rankPart(scope: NodeScope, state: AgentGraphState, part: GraphPart, task: Extract<FunctionTask, { kind: "rank" | "rank_reply" }>, optionSets: OptionSetState[]): Promise<void> {
  const { deps, input, run } = scope;
  const records = deps.records!;
  const language = state.language;
  const timeZone = state.timeZone || "Asia/Tokyo";
  const now = state.asOf || deps.now();
  const message = input.message;
  const quote = message.slice(part.quote[0], part.quote[1]);
  const reply = task.kind === "rank_reply";
  // A reply to the basis question: the ranking asked about (its domain, dates, count), with this reply as the basis.
  const plan: RankPlanState = reply ? (task.item.rank as RankPlanState) : { domain: task.domain, ...(part.plan.rank?.count ? { count: part.plan.rank.count } : {}), ...(part.plan.readFilter?.from ? { from: part.plan.readFilter.from } : {}), ...(part.plan.readFilter?.to ? { to: part.plan.readFilter.to } : {}) };
  const domain = plan.domain;
  const original = reply ? task.item.quote ?? "" : quote;
  const rank = reply ? {} : part.plan.rank ?? {};
  const basisSpan = rank.basis;
  const withinWords = rank.within ? message.slice(rank.within[0], rank.within[1]) : null;
  // A click on a way of ordering (the question's option) or a reply naming one.
  const picked = state.optionSets.find((set) => set.partId === part.localId && set.purpose === "ranking" && set.selectedOptionId);
  const chosen = picked?.options.find((option) => option.optionId === picked.selectedOptionId)?.refId ?? null;
  const replyWords = reply ? quote : "";
  const leftToAgent = reply && leavesItToAgent(replyWords);

  // 1. The basis (functions/basis.ts): now → memory → history; none → one question.
  const words = `${original} ${replyWords}`;
  const fieldFromWords = groundedField(rank.orderBy, words) ?? (domain === "contact" && LAST_INTERACTION_WORDS.test(words) ? "lastInteraction" : domain === "event" && START_WORDS.test(words) ? "startsAt" : null) ?? (chosen === "startsAt" || chosen === "dueAt" || chosen === "plannedDate" || chosen === "lastInteraction" ? chosen : null);
  const field: RankField | null = fieldFromWords;
  const direction: "asc" | "desc" = field ? (rank.direction && groundedField(rank.orderBy, words) ? rank.direction : directionSaidIn(words, field === "lastInteraction" ? "asc" : "asc")) : "asc";
  const time: TimePreference[] = [];
  const timeClause = timeClauseOf(words) ?? (chosen === "weekend" ? (language === "en" ? "weekends" : language === "ja" ? "週末" : "周末") : null);
  const turnTime = timeClause ? timePreferenceIn(timeClause, "turn") : null;
  if (turnTime && domain === "event") time.push(turnTime);
  // The topic: a memo attached with @ gives its words; otherwise the basis words, when something is left of them.
  // A to-do ranking's "正式跟进" is a hard condition (formal follow-ups), not a topic.
  let basis = basisSpan ? message.slice(basisSpan[0], basisSpan[1]).replace(domain === "todo" ? FORMAL_FOLLOW_UP : /$^/u, " ").trim() || null : null;
  let basisMemo: string | null = null;
  const memoRef = run.references.find((reference) => isMemoType(reference.type));
  const accountScope = records.scope(input.actorId);
  if (memoRef && memoRef.accessible !== false && (!basis || basis.includes("@") || !field)) {
    try {
      const view = (await records.reader.read("memo", accountScope, { id: memoRef.id })).items[0];
      const body = view ? String(view.fields.body ?? "") : "";
      if (body) {
        basis = body;
        basisMemo = String(view!.fields.title ?? memoRef.name ?? "");
        run.readSources.set(view!.ref, readSourceOf(view!, timeZone) ?? { id: view!.id, kind: "memo" });
      }
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "functions.basis_memo" });
    }
  }
  const topicWords = basisMemo ? basis : topicWordsOf(basis ?? (reply ? replyWords : original));
  const followUpAsk = domain === "contact" && FOLLOW_UP_WORDS.test(words) && !basisMemo && !topicWordsOf(basis ?? "").replace(FOLLOW_UP_WORDS, "").trim();
  let topic: string | null = basisMemo ? basis : topicWords && !followUpAsk ? (basis && topicWordsOf(basis) ? basis : reply ? replyWords : null) : null;
  // A ranking with neither a basis nor a field, in AG08's words of the part itself ("最适合聊…"): kept when words remain.
  if (!topic && !field && !reply && domain !== "todo" && topicWordsOf(original) && !followUpAsk) topic = original;
  // "随便" leaves it to the agent: no topic, the natural order.
  if (leftToAgent) topic = null;
  // Saved memory (read only until AG14): preferences rank, constraints are hard conditions.
  const memories = deps.memories ? await deps.memories.list(input.actorId).catch(() => []) : [];
  const recalled = memoriesFor(domain, memories);
  for (const item of recalled) if (item.time && domain === "event") time.push(item.time);
  if (recalled.length) emitTrace({ memories: recalled.map((item) => item.memory.id), partId: part.localId, type: "memory.recall" });
  const listing = !PICK_WORDS.test(original) && (part.plan.deliverable === "list" || /(列出|列一下|列个|\blist\b|一覧|並べて)/iu.test(original));
  const history = !topic && !field && !time.length && domain === "contact" && (followUpAsk || chosen === "overdue");
  const todoNatural = domain === "todo";
  const haveBasis = Boolean(topic || field || time.length || history || leftToAgent || listing || todoNatural || chosen);
  // 2. None: one question (AG10-1). Asked once only (a part that answered a question is not asked again).
  if (!haveBasis) {
    if (part.asked >= 1 || reply) {
      // Asked already: the natural order, said as such.
    } else {
      const options = orderingsOf(domain);
      const clarificationId = setIdOf(input.requestId, part.localId, "q");
      const labels = new Map(options.map((key, index) => [`o${index + 1}`, { label: say.orderingLabel(key, language) }]));
      const set: OptionSetState = { asks: "reading", clarificationId, kind: "question", options: options.map((key, index) => ({ capabilities: [...part.capabilities], capability: "fn.rank", optionId: `o${index + 1}`, refId: key, refType: "ranking" })), partId: part.localId, purpose: "ranking", state: "open", subgoal: `clarification:${input.requestId}:${part.localId}` };
      optionSets.push(set);
      run.optionLabels.set(clarificationId, labels);
      run.questionLines.set(part.localId, say.askBasisLine(language, original.replace(/[。.!！?？]+$/u, ""), [...labels.values()].map((item) => item.label)));
      part.status = "awaiting_clarification";
      part.waitReason = "object_ambiguous";
      part.asked += 1;
      part.plan = { ...part.plan, rankAsk: plan };
      emitTrace({ clarificationId, domain, kind: "question", options: options.length, partId: part.localId, question: "ranking_basis", subgoal: set.subgoal, type: "clarify.asked" });
      return;
    }
  }
  const useNatural = !topic && !field && !time.length && !history;
  const order = useNatural || (!field && domain === "todo") ? naturalField(domain) : null;
  const orderField: RankField | null = field ?? order?.field ?? null;
  const orderDirection = field ? direction : order?.direction ?? "asc";
  const count = plan.count ?? rank.count ?? countSaidIn(original) ?? (orderField && !topic && !time.length ? FIELD_LIST_LIMIT : 3);

  // 3. Candidates and hard conditions (code), read under the account's scope.
  const freeWords = (withinWords ?? "") + " " + outside(quote, basisSpan ? [Math.max(0, basisSpan[0] - part.quote[0]), Math.max(0, basisSpan[1] - part.quote[0])] : undefined);
  const reasons = new Map<string, string>();
  let candidates: Candidate[] = [];
  let hard: (candidate: Candidate) => boolean = () => true;
  let signal: ((candidate: Candidate) => number[]) | undefined;
  let timeOf: ((candidate: Candidate) => string | null) | undefined;
  const fromDay = plan.from ? localMidnight(plan.from, timeZone) : null;
  const toDay = plan.to ? localMidnight(new Date(Date.parse(`${plan.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), timeZone) : null;
  if (domain === "contact") {
    const list = await contactCandidates(records, input.actorId, orderField === "lastInteraction" || history);
    const places = new Set(Object.entries(PLACE_WORDS).filter(([place, others]) => saidIn(freeWords, place) || others.some((other) => saidIn(freeWords, other))).map(([place]) => place));
    const industries = new Set(Object.entries(INDUSTRY_WORDS).filter(([industry, others]) => saidIn(freeWords, industry) || others.some((other) => saidIn(freeWords, other))).map(([industry]) => industry));
    if (history) {
      // AG10-1 layer 3: the history signals of contacts, from the user's own to-dos (code).
      const todos = await openTodos(records, { accountId: accountScope.accountId, workspaceId: accountScope.workspaceId });
      const today = localDay(now, timeZone);
      for (const todo of todos) {
        if (!todo.contactId) continue;
        const contact = list.find((item) => item.id === todo.contactId);
        if (!contact) continue;
        const ref = { dueAt: todo.dueAt, plannedDate: todo.plannedDate, ref: todo.ref, title: todo.title };
        const dueDay = todo.dueAt ? localDay(todo.dueAt, timeZone) : null;
        const inPeriod = (day: string | null) => Boolean(day && (!plan.from || day >= plan.from) && (!plan.to || day <= plan.to));
        if (todo.dueAt && todo.dueAt < now) contact.signals.push({ kind: todo.source === "contact" ? "overdue_followup" : "overdue_todo", todo: ref });
        else if (todo.plannedDate && !todo.dueAt && todo.plannedDate < today) contact.signals.push({ kind: "past_planned", todo: ref });
        else if (inPeriod(dueDay)) contact.signals.push({ kind: "due_in_period", todo: ref });
        else if (inPeriod(todo.plannedDate)) contact.signals.push({ kind: "planned_in_period", todo: ref });
      }
      for (const contact of list) {
        if (!contact.signals.length) continue;
        reasons.set(contact.id, contact.signals.map((item) => signalWords(item, language, timeZone)).join(language === "en" ? "; " : "；"));
        for (const item of contact.signals) run.readSources.set(item.todo.ref, { id: item.todo.ref.slice(5), kind: "todo", title: item.todo.title } as never);
      }
      signal = (candidate) => {
        const kinds = (candidate as ContactCandidate).signals.map((item) => item.kind);
        return [kinds.filter((kind) => kind === "overdue_followup").length, kinds.filter((kind) => kind === "overdue_todo" || kind === "past_planned").length, kinds.filter((kind) => kind === "due_in_period").length, kinds.length];
      };
    }
    hard = (candidate) => {
      const item = candidate as ContactCandidate;
      if (places.size && !(item.place && places.has(item.place)) && !(item.city && [...places].some((place) => PLACE_WORDS[place]?.includes(item.city!.toLowerCase())))) return false;
      if (industries.size && !(item.industry && industries.has(item.industry))) return false;
      if (orderField === "lastInteraction" && !history && !item.lastInteraction) return false;
      if (history && !item.signals.length) return false;
      return true;
    };
    candidates = list;
    emitTrace({ hard: { history, industries: [...industries], places: [...places], withInteraction: orderField === "lastInteraction" }, partId: part.localId, type: "functions.hard_conditions" });
  } else if (domain === "event") {
    // The @ selection is the set (AE-FN-001); otherwise the events the account may see.
    const chosenIds = [...new Set([...part.refs.filter((ref) => ref.entity === "event" && ref.recordId).map((ref) => ref.recordId!), ...run.references.filter((reference) => reference.type === "event" && reference.accessible !== false).map((reference) => reference.id)])];
    const all = records.listEvents ? await records.listEvents() : [];
    const visible = all.filter((event) => visibleEvent(event, input.actorId) && !evalDeniedReads().has(event.eventId));
    const pool = chosenIds.length >= 2 ? visible.filter((event) => chosenIds.includes(event.eventId)) : visible;
    candidates = pool.map(eventCandidate);
    timeOf = (candidate) => (candidate as EventCandidate).startsAt;
    hard = (candidate) => {
      const at = (candidate as EventCandidate).startsAt;
      if ((fromDay || toDay) && !at) return true;
      if (fromDay && at! < fromDay) return false;
      if (toDay && at! >= toDay) return false;
      return true;
    };
    for (const candidate of candidates) {
      const item = candidate as EventCandidate;
      if (item.startsAt && time.length) reasons.set(item.id, time.map((preference) => (preferenceMet(preference, item.startsAt!, timeZone) ? say.timeWords(preference, language) : null)).filter(Boolean).join("、"));
    }
    emitTrace({ chosen: chosenIds.length >= 2 ? chosenIds.length : 0, hard: { from: fromDay, to: toDay }, partId: part.localId, time: time.map((item) => ({ days: item.days ?? null, hard: item.hard, part: item.part ?? null, source: item.source })), type: "functions.hard_conditions" });
  } else {
    const todos = await openTodos(records, { accountId: accountScope.accountId, workspaceId: accountScope.workspaceId });
    const formal = FORMAL_FOLLOW_UP.test(words);
    const overdueWords = /(过期|逾期|超过|期限切れ|期限を過ぎ|overdue)/iu.test(words);
    candidates = todos;
    hard = (candidate) => {
      const item = candidate as TodoCandidate;
      if (formal && item.source !== "contact") return false;
      if (orderField === "dueAt" && !item.dueAt) return false;
      if (item.dueAt && toDay && item.dueAt >= toDay && !(overdueWords && item.dueAt < now)) return false;
      if (item.dueAt && fromDay && item.dueAt < fromDay && !overdueWords) return false;
      return true;
    };
    emitTrace({ hard: { formal, from: fromDay, overdue: overdueWords, to: toDay }, partId: part.localId, type: "functions.hard_conditions" });
  }
  const natural = naturalField(domain);
  const valueOf = (which: RankField) => (candidate: Candidate) => {
    if (which === "startsAt") return (candidate as EventCandidate).startsAt ?? null;
    if (which === "lastInteraction") return (candidate as ContactCandidate).lastInteraction ?? null;
    if (which === "dueAt") return (candidate as TodoCandidate).dueAt ?? null;
    return (candidate as TodoCandidate).plannedDate ?? null;
  };
  const topicAsFilter = Boolean(topic && field && !basisMemo);
  const result = await rankCandidates<Candidate>({
    candidates,
    count,
    field: orderField && (field || order) ? { direction: orderDirection, value: valueOf(orderField) } : null,
    hard,
    judge: topic ? async (kept) => askJudgment(deps.judgment, run.judgment, {
      coverage: { afterHardConditions: candidates.filter(hard).length, judged: kept.length, total: candidates.length, truncated: Math.max(0, candidates.filter(hard).length - kept.length) },
      input: rankJudgmentInput(language, topic!, kept.map(({ candidate, key }) => ({ key, text: domain === "contact" ? contactLine(candidate as ContactCandidate, language, null) : domain === "event" ? eventLine(candidate as EventCandidate, language, null, timeZone) : todoLine(candidate as TodoCandidate, language, timeZone, now) }))),
      items: kept.map(({ key }) => ({ key, question: "match.level" as const, subject: key })),
      language,
      purpose: "rank",
      requestId: input.requestId,
    }) : undefined,
    natural: { direction: natural.direction, value: valueOf(natural.field) },
    ...(signal ? { signal } : {}),
    ...(timeOf ? { timeOf } : {}),
    time,
    timeZone,
    topic,
    topicAsFilter,
  });
  if (result.rejected) emitTrace({ partId: part.localId, rejected: result.rejected, type: "functions.rejected", note: "judgment answers for candidates that were not asked (or repeated) are not taken" });
  // The lead: what the ranking used (code). AG08's shapes stay for a topic or a field alone.
  const steps: string[] = [];
  for (const preference of time.filter((item) => item.source === "turn")) steps.push(language === "en" ? `whether it is ${say.timeWords(preference, language)}` : language === "ja" ? `${say.timeWords(preference, language)}かどうか` : `是不是${say.timeWords(preference, language)}`);
  if (topic && time.length) steps.push(basisMemo ? (language === "en" ? `how closely it relates to the topics of your note "${basisMemo}"` : language === "ja" ? `メモ「${basisMemo}」のテーマにどれだけ合うか` : `和你的笔记「${basisMemo}」的主题有多相关`) : (language === "en" ? `how closely it relates to "${topic}"` : language === "ja" ? `「${topic}」にどれだけ合うか` : `和「${topic}」有多相关`));
  if (history) steps.push(language === "en" ? "follow-ups past due that are not done, then to-dos past their planned day" : language === "ja" ? "期限を過ぎて未完了のフォローアップ、次に予定日を過ぎたタスク" : "已到期没做的跟进、过了计划日的待办");
  if (domain === "todo" && orderField) steps.push(say.fieldOrderWords(orderField, orderDirection, language));
  const memoryWords = recalled.map((item) => item.memory.content);
  // AE-FN-006: only the related ones, in the order of the field the user named.
  const filterLead = topicAsFilter && orderField ? ({ en: `Only the ${NOUN[domain].en} related to "${topic}", ${say.fieldOrderWords(orderField, orderDirection, "en")}.`, ja: `「${topic}」に関連する${NOUN[domain].ja}だけを、${say.fieldOrderWords(orderField, orderDirection, "ja")}に並べました。`, zh: `只列和「${topic}」相关的${NOUN[domain].zh}，${say.fieldOrderWords(orderField, orderDirection, "zh")}排。` } as const)[language] : null;
  const lead = filterLead ?? (useNatural && !listing && !todoNatural
    ? say.rankLead(language, [say.fieldName(natural.field, language)], { history: false, memory: [], natural: true })
    : steps.length || memoryWords.length ? say.rankLead(language, steps, { history, memory: memoryWords, natural: false }) : null);
  const written = writeAnswer({ basis: topic && !basisMemo ? topic : null, basisMemo, direction: orderDirection, domain, field: orderField, language, lead, now, period: domain === "event" ? { ...(plan.from ? { from: plan.from } : {}), ...(plan.to ? { to: plan.to } : {}) } : null, reasons, result, timeZone, within: withinWords });
  if (result.semantic && result.matched) run.topicMatched = true;
  run.answers.set(part.localId, written.text);
  part.route = "read";
  part.status = "answered";
  part.reason = null;
  part.waitReason = null;
  const signalRefs = history ? [...new Set(result.ordered.flatMap((item) => (item.candidate as ContactCandidate).signals.map((signalItem) => signalItem.todo.ref)))] : [];
  part.cites = [...written.cites, ...signalRefs];
  part.reads = [...result.ordered.map((item) => ({ ref: item.candidate.view.ref, version: item.candidate.view.version })), ...signalRefs.map((ref) => ({ ref, version: "" }))];
  part.coverage = [{ complete: result.coverage.truncated === 0, kind: domain, pagesRead: Math.max(1, Math.ceil(result.coverage.total / PAGE)), seen: result.semantic && result.matched ? result.coverage.judged : result.ordered.length, total: result.matching }];
  part.gaps = [];
  for (const item of [...result.ordered.map((entry) => entry.candidate), ...(domain === "event" ? result.untimed : [])]) {
    const source = readSourceOf(item.view, timeZone);
    if (source) run.readSources.set(item.view.ref, source);
    run.readNames.set(item.view.id, { name: domain === "contact" ? (item as ContactCandidate).name : domain === "event" ? (item as EventCandidate).title : (item as TodoCandidate).title, type: domain });
  }
  emitTrace({ coverage: result.coverage, domain, listed: result.ordered.map((item) => item.candidate.ref), matched: result.matched, partId: part.localId, semantic: result.semantic, type: "functions.ranked", unmatchedReason: result.unmatchedReason, untimed: result.untimed.map((item) => item.ref) });
  emitTrace({ basis: { field: orderField, history, memory: recalled.map((item) => item.memory.id), natural: useNatural, time: time.length, topic: Boolean(topic) }, listed: result.ordered.map((item) => item.candidate.ref), partId: part.localId, rejected: result.rejected, type: "fn.rank", untimed: result.untimed.map((item) => item.ref) });
}

function preferenceMet(preference: TimePreference, startsAt: string, timeZone: string): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone, weekday: "short" }).formatToParts(new Date(startsAt)).map((part) => [part.type, part.value]));
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const hour = Number(parts.hour);
  const days = !preference.days || (preference.days === "weekend" ? weekend : !weekend);
  const part = !preference.part || (preference.part === "morning" ? hour < 12 : preference.part === "afternoon" ? hour >= 12 && hour < 17 : hour >= 17);
  return preference.exclude ? !(days && part) : days && part;
}

function signalWords(signal: ContactSignal, language: Language, timeZone: string): string {
  const title = say.quoted(language, signal.todo.title);
  const due = signal.todo.dueAt ? say.dayWordsOf(localDay(signal.todo.dueAt, timeZone), language) : null;
  const planned = signal.todo.plannedDate ? say.dayWordsOf(signal.todo.plannedDate, language) : null;
  switch (signal.kind) {
    case "overdue_followup":
      return { en: `the follow-up ${title} was due ${due} and is not done`, ja: `フォローアップ${title}は${due}が期限で、まだ完了していません`, zh: `跟进${title}在${due}到期，还没完成` }[language];
    case "overdue_todo":
      return { en: `the to-do ${title} was due ${due} and is not done`, ja: `タスク${title}は${due}が期限で、まだ完了していません`, zh: `待办${title}在${due}到期，还没完成` }[language];
    case "past_planned":
      return { en: `the to-do ${title} was planned for ${planned}; that day has passed (it has no deadline)`, ja: `タスク${title}の予定日${planned}を過ぎています（期限は設定されていません）`, zh: `待办${title}的计划日${planned}已过（它没有截止时间）` }[language];
    case "due_in_period":
      return { en: `${title} is due ${due}`, ja: `${title}の期限が${due}です`, zh: `${title}在${due}到期` }[language];
    default:
      return { en: `${title} is planned for ${planned}`, ja: `${title}の予定日が${planned}です`, zh: `${title}计划在${planned}做` }[language];
  }
}

/* ── summary ("整理一下") ──────────────────────────────────────────── */

function summaryPart(scope: NodeScope, state: AgentGraphState, part: GraphPart, optionSets: OptionSetState[]): void {
  const { input, run } = scope;
  const language = state.language;
  // The read and the grounded answer run as before (resolve, answer); code says how "整理一下" was taken and offers two entries.
  run.leadLines.set(part.localId, say.summaryLead(language));
  const clarificationId = setIdOf(input.requestId, part.localId, "e");
  if (optionSets.some((set) => set.clarificationId === clarificationId)) return;
  const options: OptionSetState["options"] = [
    { capabilities: ["memo.read", "fn.extractInteractions"], capability: "fn.extractInteractions", optionId: "o1" },
    { capabilities: ["memo.read", "fn.extractFollowUps"], capability: "fn.extractFollowUps", optionId: "o2" },
  ];
  optionSets.push({ clarificationId, kind: "entry", options, partId: part.localId, purpose: "entry", state: "open", subgoal: `entry:${input.requestId}:${part.localId}` });
  run.optionLabels.set(clarificationId, new Map([["o1", { label: say.summaryEntryLabel("interactions", language) }], ["o2", { label: say.summaryEntryLabel("followUps", language) }]]));
  emitTrace({ clarificationId, options: options.length, partId: part.localId, purpose: "entry", type: "clarify.entry_offered" });
  emitTrace({ partId: part.localId, type: "functions.summary_only", note: "整理一下 with nothing named: a summary of the memo; no second-level function runs" });
}

/* ── compare and group ─────────────────────────────────────────────── */

async function eventsPart(scope: NodeScope, state: AgentGraphState, part: GraphPart, kind: "compare" | "group"): Promise<void> {
  const { deps, input, run } = scope;
  const language = state.language;
  const timeZone = state.timeZone || "Asia/Tokyo";
  const quote = input.message.slice(part.quote[0], part.quote[1]);
  const all = deps.records!.listEvents ? await deps.records!.listEvents() : [];
  const visible = all.filter((event) => visibleEvent(event, input.actorId) && !evalDeniedReads().has(event.eventId)).map(eventCandidate);
  let written: { text: string; cites: string[] };
  let shown: EventCandidate[];
  if (kind === "compare") {
    // The records chosen: this part's bound events, else this turn's @ events.
    const ids = [...new Set([...part.refs.filter((ref) => ref.entity === "event" && ref.recordId).map((ref) => ref.recordId!), ...run.references.filter((reference) => reference.type === "event" && reference.accessible !== false).map((reference) => reference.id)])];
    shown = ids.map((id) => visible.find((event) => event.id === id)).filter((event): event is EventCandidate => Boolean(event));
    written = compare(shown.map((event) => event.event), dimensionsIn(quote), language, timeZone);
  } else {
    const from = part.plan.readFilter?.from ? localMidnight(part.plan.readFilter.from, timeZone) : null;
    const to = part.plan.readFilter?.to ? localMidnight(new Date(Date.parse(`${part.plan.readFilter.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), timeZone) : null;
    shown = visible.filter((event) => event.startsAt && (!from || event.startsAt >= from) && (!to || event.startsAt < to));
    written = groupEventsByFee(shown.map((event) => event.event), language, timeZone, periodWords({ ...(part.plan.readFilter?.from ? { from: part.plan.readFilter.from } : {}), ...(part.plan.readFilter?.to ? { to: part.plan.readFilter.to } : {}) }, language)?.replace(/的$/u, "") ?? null);
  }
  for (const event of shown) {
    const source = readSourceOf(event.view, timeZone);
    if (source) run.readSources.set(event.view.ref, source);
    run.readNames.set(event.id, { name: event.title, type: "event" });
  }
  run.answers.set(part.localId, written.text);
  part.route = "read";
  part.status = "answered";
  part.reason = null;
  part.cites = written.cites;
  part.reads = shown.map((event) => ({ ref: event.view.ref, version: event.view.version }));
  part.coverage = [{ complete: true, kind: "event", pagesRead: 1, seen: shown.length, total: shown.length }];
  part.gaps = shown.length ? [] : ["no_record"];
  emitTrace({ events: shown.map((event) => event.ref), kind, partId: part.localId, type: kind === "compare" ? "functions.compared" : "functions.grouped" });
}

/* ── extraction ────────────────────────────────────────────────────── */

async function memoAndContacts(records: AgentRecordAccess, scope: DomainScope, memoId: string): Promise<{ memo: MemoForExtraction | null; view: RecordView | null; contacts: LinkedContact[] }> {
  const view = (await records.reader.read("memo", scope, { id: memoId })).items[0] ?? null;
  if (!view) return { contacts: [], memo: null, view: null };
  const fields = view.fields as Record<string, unknown>;
  const contactIds = Array.isArray(fields.contactIds) ? fields.contactIds.filter((id): id is string => typeof id === "string") : [];
  const contacts: LinkedContact[] = [];
  for (const id of contactIds) {
    const contact = (await records.reader.read("contact", scope, { id }).catch(() => ({ items: [] as RecordView[] }))).items[0];
    const name = contact ? str((contact.fields as Record<string, unknown>).displayName) : null;
    if (name) contacts.push({ id, name });
  }
  const memo: MemoForExtraction = {
    body: String(fields.body ?? ""),
    contactIds,
    createdAt: String(fields.createdAt ?? view.updatedAt),
    id: view.id,
    interaction: (fields.interaction as MemoForExtraction["interaction"]) ?? null,
    ref: view.ref,
    title: String(fields.title ?? ""),
    version: Number(fields.version ?? view.version) || 1,
  };
  return { contacts, memo, view };
}

async function existingTodosFrom(records: AgentRecordAccess, scope: DomainScope, memoId: string): Promise<ExistingTodo[]> {
  const rows = await readAll(records, { accountId: scope.accountId, workspaceId: scope.workspaceId }, { collection: "tasks", denied: [...evalDeniedReads()], equals: [{ paths: [["task", "sourceNoteId"]], value: memoId }], excludes: [{ path: ["task", "status"], values: ["deleted", "cancelled"] }], order: { direction: "asc", paths: [["task", "createdAt"]] } });
  return rows.map((row) => {
    const task = row.payload.task as Record<string, unknown>;
    return { dueAt: str(task.dueAt), id: row.id, notes: str(task.notes), plannedDate: str(task.plannedDate), ref: `todo:${row.id}`, sourceNoteId: str(task.sourceNoteId), status: str(task.status) ?? "open", title: String(task.title ?? "") };
  });
}

async function extractPart(scope: NodeScope, state: AgentGraphState, part: GraphPart, task: Extract<FunctionTask, { kind: "extract" }>, round: { budget: AgentGraphState["budget"]; repairs: number }): Promise<{ budget: AgentGraphState["budget"]; repairs: number }> {
  const { deps, input, run } = scope;
  const records = deps.records!;
  const language = state.language;
  const timeZone = state.timeZone || "Asia/Tokyo";
  const quote = input.message.slice(part.quote[0], part.quote[1]);
  const accountScope = records.scope(input.actorId);
  const settle = (status: GraphPart["status"], reason: string | null, line: string | null) => {
    part.status = status;
    part.reason = reason;
    if (task.write) {
      if (line) run.writeLines.set(part.localId, line);
    } else if (line) run.answers.set(part.localId, line);
  };
  const { contacts, memo, view } = await memoAndContacts(records, accountScope, task.memoId);
  if (!memo || !view) {
    part.gaps = ["unreadable"];
    settle("unfinished", "source_not_accessible", say.noMemoLine(language, quote));
    return round;
  }
  run.readSources.set(view.ref, readSourceOf(view, timeZone) ?? { id: view.id, kind: "memo" });
  // A memo with no title of its own (the service fills it with the start of the body) is named by its day.
  const ownTitle = memo.title && !memo.body.startsWith(memo.title.replace(/[…\.]+$/u, "")) && memo.title.length <= 40 ? memo.title : "";
  const memoDay = memoDayOf(memo.createdAt, timeZone);
  const memoName = ownTitle || ({ en: `note of ${say.dayWordsOf(memoDay, language)}`, ja: `${say.dayWordsOf(memoDay, language)}のメモ`, zh: `${say.dayWordsOf(memoDay, language)}的笔记` } as const)[language];
  run.readNames.set(view.id, { name: memoName, type: "memo" });
  for (const contact of contacts) run.readNames.set(contact.id, { name: contact.name, type: "contact" });
  // The people the user asked about ("我和小林的往来"): only these may be written.
  const focus = part.refs.filter((ref) => ref.entity === "contact").map((ref) => (ref.recordId && contacts.some((contact) => contact.id === ref.recordId) ? contacts.find((contact) => contact.id === ref.recordId)! : contactOfClue((clueWords(input.message, ref) ?? "").replace(/^@/u, ""), contacts))).filter((contact): contact is LinkedContact => Boolean(contact)).map((contact) => contact.id);
  const budget = { ...round.budget };
  const result = await extractFromMemo({ budget, contacts, fetchImplementation: deps.fetchImplementation, focus, judgment: deps.judgment, judgmentBudget: run.judgment, language, memo, quote, repairs: round.repairs, requestId: input.requestId, timeZone, want: task.want });
  part.reads = [{ ref: view.ref, version: String(memo.version) }];
  part.cites = [view.ref];
  part.coverage = [{ complete: true, kind: "memo", pagesRead: 1, seen: 1, total: 1 }];
  part.gaps = [];
  if (!result.ok) {
    settle("unfinished", result.failure === "budget" ? "budget" : "model_error", say.extractFailedLine(language, quote));
    return { budget, repairs: result.repairs };
  }
  const sentenceOf = (ids: readonly number[]) => ids.map((id) => result.sentences.find((sentence) => sentence.id === id)?.text ?? "").join(" ").trim();
  const nameOf = (contact: LinkedContact | null, clue: string) => contact?.name ?? clue;
  const lines: string[] = [say.memoHead(language, ownTitle, memoDay)];
  const intents: (CardOperationIntent & { localId: string })[] = [];
  const extraCites: string[] = [];

  // Interactions.
  if (task.want.interactions) {
    const happened = result.interactions.filter((item) => item.writable);
    const others = result.interactions.filter((item) => !item.writable);
    // Read only: what code read as having happened is listed; one the review was not sure of is marked doubtful (§3.8).
    const doubtfulOnes = others.filter((item) => item.reason === "unsure");
    // A person the memo shows in real contact is not listed again as "only mentioned" or "only planned" (the promise to send
    // them something is a follow-up, not a second contact).
    const inContact = new Set([...happened, ...doubtfulOnes].map((item) => item.contact?.id).filter(Boolean));
    const repeated = (item: (typeof others)[number]) => Boolean(item.contact && inContact.has(item.contact.id) && (item.reason === "planned" || item.reason === "mentioned_only"));
    if (!task.write || !happened.length) {
      const listed = task.write ? happened : [...happened, ...doubtfulOnes];
      if (listed.length) {
        lines.push(`${say.HEADINGS.interactions[language]}${language === "en" ? ":" : "："}`);
        for (const item of listed) lines.push(`- ${nameOf(item.contact, item.clue)}，${item.occurredOn ? say.dayWordsOf(item.occurredOn, language) : ""}，${say.howWords(item.channel, item.direction, language)}${item.writable ? "" : (language === "en" ? " (doubtful: the review was not sure)" : language === "ja" ? "（要確認：確認で確信が持てませんでした）" : "（存疑：复核没有把握）")} ${say.sentenceQuote(language, sentenceOf(item.sentenceIds))}`.replace(/，/gu, language === "en" ? ", " : "，"));
      }
      if (!happened.length && (task.write || !doubtfulOnes.length)) lines.push(say.noInteractionLine(language));
      const notCounted = (task.write ? others : others.filter((item) => item.reason !== "unsure")).filter((item) => !repeated(item));
      if (notCounted.length) {
        lines.push(`${say.HEADINGS.notInteractions[language]}${language === "en" ? ":" : "："}`);
        for (const item of notCounted) lines.push(`- ${say.quoted(language, sentenceOf(item.sentenceIds))}${language === "en" ? " — " : "——"}${nameOf(item.contact, item.clue)}${language === "en" ? ": " : "："}${say.WHY_NOT[item.reason ?? "unsure"][language]}`);
      }
    } else {
      // One memo holds one interaction (附录 E): several real ones are listed for the user to choose; none is merged.
      if (happened.length > 1) {
        lines.push(`${say.HEADINGS.interactions[language]}${language === "en" ? ":" : "："}`);
        for (const item of happened) lines.push(`- ${nameOf(item.contact, item.clue)}，${item.occurredOn ? say.dayWordsOf(item.occurredOn, language) : ""}，${say.howWords(item.channel, item.direction, language)} ${say.sentenceQuote(language, sentenceOf(item.sentenceIds))}`.replace(/，/gu, language === "en" ? ", " : "，"));
        lines.push({ en: "A note records one interaction; tell me which one to mark on it.", ja: "1つのメモに記録できるやり取りは1件です。どれを記録するか教えてください。", zh: "一篇笔记只能记一次往来，请告诉我要标记哪一次。" }[language]);
      } else {
        const item = happened[0];
        const interaction: NoteInteractionContract = { actualContactIds: [item.contact!.id], channel: item.channel, direction: item.direction, occurredOn: item.occurredOn!, precision: "day" } as NoteInteractionContract;
        const link = linkInteraction(memo.interaction as NoteInteractionContract | null, interaction);
        emitTrace({ link: link.kind, memo: memo.ref, partId: part.localId, type: "functions.link_back" });
        if (link.kind === "recorded") lines.push(say.recordedLine(language, nameOf(item.contact, item.clue), item.occurredOn, say.howWords(item.channel, item.direction, language), memoName));
        else if (link.kind === "conflict") lines.push(say.conflictLine(language, memo.title, `${link.existing.occurredOn ?? ""} ${say.howWords(link.existing.channel, link.existing.direction, language)}`, `${item.occurredOn ?? ""} ${say.howWords(item.channel, item.direction, language)}`));
        else {
          const names = Object.fromEntries(contacts.map((contact) => [contact.id, contact.name]));
          intents.push({ capability: "memo.update", expectedVersion: memo.version, localId: `${part.localId}-i1`, partId: part.localId, set: { interaction }, shown: { before: (memo.interaction as NoteInteractionContract | null) ?? null, contactIds: [...memo.contactIds], names, sentence: sentenceOf(item.sentenceIds), title: memoName }, targetId: memo.id });
          lines.push(`${say.HEADINGS.interactions[language]}${language === "en" ? ":" : "："} ${nameOf(item.contact, item.clue)}，${item.occurredOn ? say.dayWordsOf(item.occurredOn, language) : ""}，${say.howWords(item.channel, item.direction, language)} ${say.sentenceQuote(language, sentenceOf(item.sentenceIds))}`.replace(/，/gu, language === "en" ? ", " : "，"));
        }
      }
      const notCounted = others.filter((item) => item.reason !== "not_asked_about" && !repeated(item));
      if (notCounted.length) {
        lines.push(`${say.HEADINGS.notInteractions[language]}${language === "en" ? ":" : "："}`);
        for (const item of notCounted) lines.push(`- ${nameOf(item.contact, item.clue)}${language === "en" ? ": " : "："}${say.WHY_NOT[item.reason ?? "unsure"][language]}`);
      }
    }
  }

  // Follow-ups.
  if (task.want.followUps) {
    const byOwner = (owner: string) => result.followUps.filter((item) => item.owner === owner);
    const describe = (item: (typeof result.followUps)[number]) => {
      const dates = [item.plannedDate || item.plannedText ? say.plannedWords(language, item.plannedDate, item.plannedText) : null, item.dueDate || item.dueText ? say.dueWords(language, item.dueDate, item.dueText) : null].filter(Boolean).join(language === "en" ? ", " : "，");
      return `- ${item.action}${dates ? (language === "en" ? ` (${dates})` : `（${dates}）`) : ""} ${say.sentenceQuote(language, sentenceOf(item.sentenceIds))}`;
    };
    const mine = byOwner("me");
    if (!task.write) {
      if (mine.length) {
        lines.push(`${say.HEADINGS.myPromises[language]}${language === "en" ? ":" : "："}`);
        for (const item of mine) lines.push(describe(item));
      } else lines.push(say.noMyPromiseLine(language));
      for (const [owner, heading] of [["doubtful", "doubtfulPromise"], ["other", "otherPromises"], ["suggestion", "suggestions"]] as const) {
        const list = byOwner(owner);
        if (!list.length) continue;
        lines.push(`${say.HEADINGS[heading][language]}${language === "en" ? ":" : "："}`);
        for (const item of list) lines.push(describe(item));
      }
    } else {
      const writable = mine.filter((item) => item.writable);
      const existing = writable.length ? await existingTodosFrom(records, accountScope, memo.id) : [];
      for (const todo of existing) {
        extraCites.push(todo.ref);
        run.readSources.set(todo.ref, { id: todo.id, kind: "todo", title: todo.title } as never);
        run.readNames.set(todo.id, { name: todo.title, type: "todo" });
      }
      let n = 0;
      const carded: (typeof result.followUps)[number][] = [];
      for (const item of writable) {
        const sentence = sentenceOf(item.sentenceIds);
        const link = linkFollowUp({ action: item.action, dueDate: item.dueDate, plannedDate: item.plannedDate, sentence }, existing, (instant) => localDay(instant, timeZone));
        emitTrace({ action: item.action, link: link.kind, partId: part.localId, todo: link.kind === "new" ? null : link.todo.ref, type: "functions.link_back" });
        if (link.kind === "same") {
          const when = link.todo.dueAt ? say.dueWords(language, localDay(link.todo.dueAt, timeZone), null) : link.todo.plannedDate ? say.plannedWords(language, link.todo.plannedDate, null) : null;
          lines.push(say.existingTodoLine(language, link.todo.title, link.todo.status, when));
          continue;
        }
        if (link.kind === "differs") {
          const changes = link.differences.map((what) => (what === "dueDate" ? ({ en: `the note says ${say.dueWords(language, item.dueDate, item.dueText)}`, ja: `メモでは${say.dueWords(language, item.dueDate, item.dueText)}`, zh: `笔记里写的是${say.dueWords(language, item.dueDate, item.dueText)}` } as const)[language] : ({ en: `the note says ${say.plannedWords(language, item.plannedDate, item.plannedText)}`, ja: `メモでは${say.plannedWords(language, item.plannedDate, item.plannedText)}`, zh: `笔记里写的是${say.plannedWords(language, item.plannedDate, item.plannedText)}` } as const)[language]));
          lines.push(say.differsLine(language, link.todo.title, changes));
          continue;
        }
        if (link.kind === "unsure") {
          lines.push(say.unsureTodoLine(language, item.action, link.todo.title));
          continue;
        }
        n += 1;
        carded.push(item);
        const dueAt = item.dueDate ? instantAt(item.dueDate, item.dueTime ?? "23:59", timeZone) : null;
        const names = item.contact ? { [item.contact.id]: item.contact.name } : {};
        intents.push({
          capability: "todo.create",
          localId: `${part.localId}-f${n}`,
          partId: part.localId,
          set: { dueAt, notes: `${say.quoted(language, sentence)}（${memoName}）`, plannedDate: item.plannedDate, ...(item.contact ? { relatedContactIds: [item.contact.id] } : {}), sourceNoteId: memo.id, sourceNoteVersion: memo.version, title: item.action },
          shown: { dueDayOnly: Boolean(item.dueDate && !item.dueTime), names, sentence, sourceTitle: memoName },
        });
      }
      if (carded.length) {
        lines.push(`${say.HEADINGS.myPromises[language]}${language === "en" ? ":" : "："}`);
        for (const item of carded) lines.push(describe(item));
      }
      const doubtful = result.followUps.filter((item) => item.owner === "doubtful");
      if (doubtful.length) {
        lines.push(`${say.HEADINGS.doubtfulPromise[language]}${language === "en" ? ":" : "："}`);
        for (const item of doubtful) lines.push(describe(item));
      }
      if (!writable.length && !doubtful.length) lines.push(say.nothingToAddLine(language));
    }
  }

  // Read only: the answer is code's list. A write: the card's operations go to propose (no second-layer model call).
  part.cites = [view.ref, ...extraCites];
  part.reads = [...part.reads, ...extraCites.map((ref) => ({ ref, version: "" }))];
  if (!task.write) {
    run.answers.set(part.localId, lines.join("\n"));
    part.status = "answered";
    part.reason = null;
    return { budget, repairs: result.repairs };
  }
  if (intents.length) {
    // The card is frozen by propose (one card per request); what was found is said before it (code's lines).
    run.presetIntents.set(part.localId, intents);
    part.write = { intents: [], picks: {} };
    run.leadLines.set(part.localId, lines.join("\n"));
    part.status = "unfinished";
    part.reason = "proposing";
  } else {
    part.status = "unfinished";
    part.reason = "nothing_to_write";
    run.writeLines.set(part.localId, lines.join("\n"));
  }
  return { budget, repairs: result.repairs };
}

function instantAt(day: string, time: string, timeZone: string): string {
  const guess = new Date(`${day}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(guess).map((part) => [part.type, part.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString();
}

export type { FunnelCandidate };
