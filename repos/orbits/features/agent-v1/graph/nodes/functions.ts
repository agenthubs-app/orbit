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
import { lastInteractionWords, recordOfView, recordsBlock, replaceInBlocks, type AnswerBlock } from "../../answer/blocks";
import type { AgentAnswerRecordContract } from "../../../../shared/contract/agent-v1";
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
import { asksForRecommendation, asksWhoToFollowUp, isWholeQuote, liftedIn, realTopicOf } from "../../functions/basis";
import { holdsRole, rolesIn, roleWordsIn } from "../../understand/role-words";
import { asksWhatToPrepare, preparePart } from "./prepare";
import { asksForNextStep, asksForReasons, asksWhichAreWorthIt, eventReason, fitLine, nextStepWords, themeLinks, themesOf } from "./reasons";
import { onlyWindowWords, withoutWindowWords } from "../../understand/read-window";
import { asksEventsToGoTo, meetsTime, pointsAtPast, writesADate, upcomingTopicOf, directionSaidIn, FOLLOW_UP_WORDS, groundedField, leavesItToAgent, naturalField, PICK_WORDS, sentenceTopicOf, timeClauseOf, timePreferenceIn, topicWordsOf, type RankDomain, type TimePreference } from "../../functions/basis";
import { MEMORY_WORDS } from "../../domains/memory/copy";
import { ensureTurnMemory, overruledByTurn, rankMemoryOf, rulesOnlyOf, timePreferenceOfEntry, topicOfEntry, type RankMemory } from "../../domains/memory/turn";
import { memoryChipsOf } from "../../domains/memory/chips";
import type { RecalledMemory } from "../../../agent/memory/recall";
import { compare, dimensionsIn, type ComparedEvent } from "../../functions/compare";
import * as say from "../../functions/copy";
import { memoDayOf } from "../../functions/dates";
import { resolveSaidDate } from "../../propose/dates";
import { contactOfClue, type LinkedContact, type MemoForExtraction } from "../../functions/extract";
import { extractFromMemo } from "../../functions/extract-memo";
import { splitSentences } from "../../text/sentences";
import { groupInteractions, interactionNamedIn, interactionOfOption, interactionOptionId, type InteractionGroup } from "../../functions/extract-interactions";
import { groupEventsByFee } from "../../functions/group";
import { linkFollowUp, linkInteraction, type ExistingTodo } from "../../functions/link-back";
import { rankCandidates, type RankCandidate, type RankResult } from "../../functions/rank";
import type { AgentRecordAccess, GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { clueWords, setIdOf } from "./clarify";
import { rulePart, ruleTaskOf, type RuleTask } from "./rule";
import { clueSearchWords, localMidnight } from "./resolve";

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
/** Words that name the user's contacts as a set (inside a sentence): 联系人, 連絡先, my contacts. */
const CONTACT_SET_WORDS = /(?:联系人|聯絡人|人脉|連絡先|コンタクト|\bcontacts\b)/iu;
const RANK_WORDS = /(挑|选出|选几|排序|排一下|排个序|并べ|並べ|選んで|順に|順番|\bpick\b|\bchoose\b|\brank\b|\bsort\b|\border\b|\blist the\b)/iu;
const TODO_LIST_WORDS = /(待办|代办|跟进|タスク|ToDo|フォローアップ|\bto-?dos?\b|\bfollow[\s-]?ups?\b|\btasks?\b)/iu;
const WHO_WORDS = /(谁|哪位|哪些人|哪几位|\bwho\b|\bwhom\b|誰|どなた|どの人)/iu;
/** The part of the day a clock bound on the start falls in: before 12:00 → morning, from 17:00 on → evening. */
function partOfClock(clock: NonNullable<TimePreference["clock"]>): TimePreference["part"] {
  if (clock.side === "before") return clock.minutes <= 12 * 60 ? "morning" : undefined;
  return clock.minutes >= 17 * 60 ? "evening" : clock.minutes >= 12 * 60 ? "afternoon" : undefined;
}

/** Words that ask for one person only (the singular "who" alone does not). */
const JUST_ONE_WORDS = /((?<!哪)一个人|(?<!哪)一位|只要一个|就一个|只联系一个|一人だけ|1人だけ|ひとりだけ|一人に絞|\bjust one\b|\bonly one\b|\bone person\b|\bsingle person\b)/iu;
const FORMAL_FOLLOW_UP = /(正式跟进|正式的跟进|フォローアップ|formal follow[\s-]?ups?)/iu;

const EVENT_NOUN = /(活动|活動|イベント|\bevents?\b)/iu;
const OTHER_READS = new Set<string>(["memo.read", "todo.read", "contact.read", "view.recentInteraction", "view.timeline", "view.context"]);
/** Words for the user's own schedule and other records: with one of them, "活动" is not the only thing asked about. */
const OTHER_RECORD_NOUN = /(日程|安排|行程|会议|开会|待办|代办|笔记|联系人|予定|スケジュール|会議|タスク|メモ|\bschedule\b|\bcalendar\b|\bmeetings?\b|\bto-?dos?\b|\bnotes?\b|\bappointments?\b)/iu;

/** Words that name something else to go by than the events themselves: the history with people, records, "根据…". */
const OTHER_BASIS_WORDS = /(根据|按照|依据|结合|参考|基于|往来|互动|来往|聊过|谈过|见过|记录|记过|认识的|に基づ|をもとに|やり取り|やりとり|based on|according to|going by|interactions?|history)/iu;

/**
 * AG19-6: "最近有哪些活动适合我？" is a list of the events that have not started, whatever the first layer tagged (the user's
 * report, 2026-11-19: asked again as "哪些活动？" it was turned down as a search by conditions). Code decides from the words:
 * events asked about as coming up, no person named, no record picked, nothing else to read.
 */
export function listsUpcomingEvents(part: GraphPart, message: string): boolean {
  if (part.route !== "read") return false;
  const quote = message.slice(part.quote[0], part.quote[1]);
  // Repair round 1 (decision 3): with or without "最近" — any asking which events there are or to recommend some.
  if (!EVENT_NOUN.test(quote) || !asksEventsToGoTo(quote)) return false;
  if (part.capabilities.some((capability) => capability === "fn.group" || capability === "fn.compare")) return false;
  // Repair round 1, stability run (AE-ANS-011): "有哪些活动适合我？" came back tagged with a contact read as well, went down
  // the ordinary read path and was answered with one note. Another read the first layer adds counts only when the words
  // name something else to go by (a kind of record, the history with someone, "根据…"); otherwise the words ask for events.
  if (part.capabilities.some((capability) => OTHER_READS.has(capability)) && (OTHER_RECORD_NOUN.test(quote) || OTHER_BASIS_WORDS.test(quote))) return false;
  // AG19 stability run 1 (AE-ANS-010): "把接下来的活动都列出来" tagged as a schedule read listed the user's own schedule
  // items. In Orbit 活动 are events: with no word for the schedule or another kind of record, the event list it is.
  const event = part.capabilities.includes("event.read");
  const schedule = part.capabilities.includes("schedule.read");
  if (!event && !schedule) return false;
  if (schedule && OTHER_RECORD_NOUN.test(quote)) return false;
  return !part.refs.some((ref) => ref.recordId || ref.entity === "contact" || ref.entity === "memo" || ref.entity === "todo" || ref.entity === "schedule");
}

/** The kind of records a part ranks, or null when it is not a ranking this node does. */
export function rankDomainOf(part: GraphPart, message: string): RankDomain | null {
  if (listsUpcomingEvents(part, message)) return "event";
  // Hotfix 2026-11-20 part 2 (the App's suggested 「哪些人值得先跟进？」): asking who to follow up with is the people ranking of
  // 「这周该跟进谁」 whatever the first layer tagged — unless a person is named or picked (then it is about that person).
  const asked = message.slice(part.quote[0], part.quote[1]);
  if (part.route === "read" && asksWhoToFollowUp(asked) && !part.refs.some((ref) => ref.entity === "contact" && (ref.recordId || (ref.quote && !GENERIC_CONTACT_CLUE.test(message.slice(ref.quote[0], ref.quote[1])))))) return "contact";
  // Release-2 gate 2 (AE-ANS-003): which of the events this is about are worth going to, and why — part 3's recommendation
  // with reasons over those events (graph/nodes/reasons.ts), whatever the first layer tagged.
  if (part.route === "read" && asksWhichAreWorthIt(asked) && part.refs.filter((ref) => ref.entity === "event" && ref.recordId).length >= 2) return "event";
  if (part.route !== "read" || !part.capabilities.includes("fn.rank")) return null;
  // Comparing and grouping are other functions (AE-FN-014: "按免费和收费分个组" is a group, not a pick).
  if (part.capabilities.includes("fn.group") || part.capabilities.includes("fn.compare")) return null;
  const quote = message.slice(part.quote[0], part.quote[1]);
  // AG10 stability run d (AE-FN-003): "这周该跟进谁" picks people even with no rank words and no rank from the first layer.
  if (!part.plan.rank && !RANK_WORDS.test(quote) && !PICK_WORDS.test(quote) && !(WHO_WORDS.test(quote) && FOLLOW_UP_WORDS.test(quote))) return null;
  const contact = part.capabilities.includes("contact.read") || part.capabilities.includes("view.recentInteraction");
  // AG10 (AE-FN-001): two or more events chosen with @ are an event ranking even when the first layer named no event read.
  const chosenEvents = part.refs.filter((ref) => ref.entity === "event" && ref.recordId).length;
  const event = part.capabilities.includes("event.read") || chosenEvents >= 2;
  const todo = part.capabilities.includes("todo.read");
  // AG10 (AE-FN-003): "这周该跟进谁" asks for people — a contact ranking whose to-dos and schedule are only its signals.
  if (contact && WHO_WORDS.test(quote) && !part.refs.some((ref) => ref.entity === "contact" && ref.recordId)) return "contact";
  // AG10 (AE-SCL-017, dev run 2): to-dos or follow-ups named in the words, ordered or picked, with no memo chosen, are a to-do
  // ranking — the note reads the first layer may add are not what is listed.
  // AG10 run-03 repair 1 (AE-SCL-017): "正式跟进" (formal follow-ups) ranked are to-dos even when the first layer named a note read
  // and an extraction instead of a to-do read.
  if ((todo || FORMAL_FOLLOW_UP.test(quote)) && TODO_LIST_WORDS.test(quote) && !part.refs.some((ref) => ref.recordId && (ref.entity === "memo" || ref.entity === "todo"))) return "todo";
  // Reading other records is another kind of task — except a memo attached with @ (its topics are the basis).
  const memoBasis = part.refs.filter((ref) => ref.entity === "memo");
  // AG20b (TRIAGE R9, §3.5 "按这篇 Memo 在目录中找活动"): a note named in words ("按我的看展札记挑周末的活动") is the criterion of an
  // event ranking as an attached one is; it is found by its own words (rankPart), never through the events' dates.
  const namedMemoBasis = memoBasis.length > 0 && part.capabilities.includes("event.read") && memoBasis.every((ref) => ref.recordId || Boolean(clueSearchWords((ref.quote ? message.slice(ref.quote[0], ref.quote[1]) : "").replace(/^@/u, ""))));
  const readsMemoBasis = memoBasis.length > 0 && (memoBasis.every((ref) => ref.recordId) || namedMemoBasis);
  // AG13 repair round 8 (AE-SCL-013, AG08 rerun run-08): "东京做零售的联系人里，挑三个最适合聊柴烧器物的人" — the words name
  // the contacts as the set to pick from; a note read the first layer added (memo.read) does not make it another task.
  const namesPerson = part.refs.some((ref) => ref.entity === "contact" && (() => { const words = ref.quote ? message.slice(ref.quote[0], ref.quote[1]).replace(/^@/u, "").trim() : ""; return Boolean(words) && !GENERIC_CONTACT_CLUE.test(words); })());
  if (contact && !event && !todo && CONTACT_SET_WORDS.test(quote) && !memoBasis.length && !namesPerson && !part.refs.some((ref) => ref.recordId) && !part.capabilities.includes("schedule.read")) return "contact";
  if (part.capabilities.some((capability) => capability === "schedule.read" || (capability === "memo.read" && !readsMemoBasis))) return null;
  const said = (ref: GraphPart["refs"][number]) => (ref.quote ? message.slice(ref.quote[0], ref.quote[1]) : "").replace(/^@/u, "").trim();
  if (event && !contact && !todo) return chosenEvents === 1 ? null : "event";
  // AG10 (AE-SCL-017): to-dos and formal follow-ups, ordered or picked.
  if (todo && !contact && !event) return part.refs.some((ref) => ref.entity === "todo" && ref.recordId) ? null : "todo";
  if (contact && !event && !todo) return part.refs.some((ref) => ref.entity === "contact" && (ref.recordId || (said(ref) && !GENERIC_CONTACT_CLUE.test(said(ref))))) ? null : "contact";
  return null;
}

const INTERACTION_WORDS = /(往来|互动|来往|联系记录|通话记录|来电|やり取り|やりとり|接触|interactions?|contact log)/iu;
const FOLLOW_UP_ASK = /(答应|承诺|约好|说好|約束|やること|待办|代办|ToDo|TODO|タスク|\bto-?dos?\b|\btasks?\b|跟进事项|要做的事|\bpromise[sd]?\b|\bcommit(?:ted|ments?)?\b|supposed to do|follow[\s-]?ups?)/iu;
const WRITE_ASK = /(更新|记到|记下|记上|补记|登记|记录到|记进|加到|加进|添加到|放进|建成|update|record|\blog\b|add (?:it |them |these |this )?to|put (?:it |them )?(?:in|on)|追加|記録|登録|入れて)/iu;
const ORGANIZE_WORDS = /(整理(?:一下|整理|下)?|まとめて|まとめ|tidy (?:it |this )?up|organi[sz]e(?: (?:it|this))?)/iu;
const SUMMARY_ASKED = /(总结|归纳|概括|摘要|要約|summari[sz]e|sum (?:it )?up)/iu;
const SUMMARIZE_WORDS = /(整理|总结|归纳|概括|摘要|まとめ|要約|summari[sz]e|sum up|tidy up)/iu;
const COMPARE_WORDS = /(对比|比较|比一比|比べ|比較|\bcompare\b|\bversus\b|\bvs\.?\b)/iu;
const GROUP_WORDS = /(分组|分个组|分成|按.{0,6}分类|归类|グループ|分けて|\bgroup\b|\bsplit into\b)/iu;

/**
 * AG10 (设计稿 §3.5 "“整理一下”没指定产物时默认只给摘要"; stability run e, AE-FN-008): a part on a memo chosen with @ whose words
 * only ask to organize it, naming no product (no interactions, no commitments, no change), is a summary — not a choice of
 * readings to ask about. Code decides it from the words.
 */
export function organizeMeansSummary(part: GraphPart, message: string, attached: ReadonlySet<string>): boolean {
  const quote = message.slice(part.quote[0], part.quote[1]);
  if (!SUMMARIZE_WORDS.test(quote) || INTERACTION_WORDS.test(quote) || FOLLOW_UP_ASK.test(quote) || WRITE_ASK.test(quote)) return false;
  const memos = part.refs.filter((ref) => ref.entity === "memo" && ref.recordId && attached.has(ref.recordId));
  return memos.length > 0 && part.refs.every((ref) => ref.entity === "memo");
}

/**
 * AG20b (TRIAGE R17, 设计稿 §3.5 "用这篇笔记更新我和小林的往来"): on a note the user picked, words asking to update the
 * interactions from it ("このメモでやりとりを更新して") are the extraction of the interactions, prepared as a change — not
 * readings to choose from. Promises and to-dos asked for at the same time are not this one.
 */
const UPDATE_WORDS = /(更新|アップデート|反映|\bupdate\b)/iu;
export function updatesInteractionsFromMemo(part: GraphPart, message: string, attached: ReadonlySet<string>): boolean {
  const quote = message.slice(part.quote[0], part.quote[1]);
  if (!INTERACTION_WORDS.test(quote) || !UPDATE_WORDS.test(quote) || FOLLOW_UP_ASK.test(quote) || part.plan.negation || part.plan.hypothesis) return false;
  return part.refs.some((ref) => ref.entity === "memo" && ref.recordId && attached.has(ref.recordId)) || (attached.size === 1 && part.refs.some((ref) => ref.entity === "memo"));
}

/**
 * AG20b (TRIAGE R17, 设计稿 §3.5 last row): a goal stated for the next note ("下一篇笔记我只要我答应的事", "次のメモは約束だけ",
 * "for the next note, only my promises"): what to extract when the next "整理一下" comes. Null when the words state none.
 */
const NEXT_NOTE = /(下一篇|下篇|下一份|下次(?:的)?(?:笔记|整理)|以后的笔记|次のメモ|次回のメモ|次に(?:整理|まとめ)|\bnext (?:note|memo)s?\b|\bfrom now on\b)/iu;
const ONLY_WORDS = /(只要|只看|只列|只需要|只想要|就要|だけ|のみ|\bonly\b|\bjust\b)/iu;
export function nextNoteGoalIn(quote: string): { followUps: boolean; interactions: boolean } | null {
  if (!NEXT_NOTE.test(quote) || !ONLY_WORDS.test(quote)) return null;
  const followUps = FOLLOW_UP_ASK.test(quote);
  const interactions = INTERACTION_WORDS.test(quote);
  return followUps || interactions ? { followUps, interactions: interactions && !followUps } : null;
}

/** AG20b (R17): the words ask to tidy up a note ("整理一下"), so a goal kept for the next note is used up by them. */
export function asksToOrganize(quote: string): boolean {
  return ORGANIZE_WORDS.test(quote);
}

export type FunctionTask =
  | { kind: "rank"; domain: RankDomain }
  | { kind: "rank_reply"; item: SessionOpenItem }
  | { kind: "extract"; memoId: string; want: { interactions: boolean; followUps: boolean }; write: boolean; /** AG21b (R31): the occasion a reply picked among those offered (its option id). */ pick?: string }
  | { kind: "summary"; memoId: string }
  | { kind: "compare" }
  | { kind: "group" }
  // AG15: a scheduled task to set up, change, pause, resume or remove (graph/nodes/rule.ts).
  | RuleTask
  // Hotfix part 2: 「接下来的会面或活动，该准备什么？」 (graph/nodes/prepare.ts).
  | { kind: "prepare" };

const isMemoType = (type: string) => type === "memo" || type === "note";

/** The memo a part works on: its own bound memo, this turn's @ memo, or (a reply that points back, "それ") the last one. */
function memoOf(scope: NodeScope, part: GraphPart, allowSession: boolean): string | null {
  // AG10 run-03 repair 1 (AE-FN-011): a clue bound to a memo is the memo whatever entity the first layer called it ("それ" as a to-do).
  const memoIds = new Set([...(scope.run.context?.handles.values() ?? [])].filter((handle) => isMemoType(handle.type)).map((handle) => handle.id));
  // AG20b (AE-EVT-009 in the run-01 run): a memo clue the first layer bound to a record of another kind (the private event
  // being deleted) is not a memo to work on.
  const otherKind = (id: string) => {
    const type = scope.run.references.find((reference) => reference.id === id)?.type ?? [...(scope.run.context?.handles.values() ?? [])].find((handle) => handle.id === id)?.type;
    return Boolean(type && !isMemoType(type));
  };
  const bound = part.refs.find((ref) => ref.recordId && (ref.entity === "memo" || memoIds.has(ref.recordId)) && !otherKind(ref.recordId));
  // AG10 run-02: a memo chosen with @ that cannot be opened now is no memo to work on.
  if (bound && scope.run.references.some((reference) => reference.id === bound.recordId && reference.accessible === false)) return null;
  if (bound) return bound.recordId!;
  const attached = scope.run.references.filter((reference) => isMemoType(reference.type) && reference.accessible !== false);
  if (attached.length === 1) return attached[0].id;
  // A memo clue with no record ("それ", "約束したこと") goes back to the memo of the conversation, when there is one.
  if (allowSession && part.refs.some((ref) => ref.entity === "memo" && !ref.recordId)) {
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
  // AG15: scheduled tasks (also the reply to a task's "按什么来挑").
  const rule = ruleTaskOf(scope, part, item);
  if (rule) return rule;
  if (item?.rank) return { item, kind: "rank_reply" };
  // AG21b (R31): a reply to "which occasion should the note record" that names one ("工地那次") goes on with that occasion.
  const occasions = item?.options?.filter((option) => option.type === "interaction") ?? [];
  if (occasions.length) {
    const picked = interactionNamedIn(quote, occasions);
    const occasion = picked ? interactionOfOption(picked) : null;
    if (picked && occasion) return { kind: "extract", memoId: occasion.memoId, pick: picked, want: { followUps: false, interactions: true }, write: true };
  }
  // Hotfix 2026-11-20 part 2 (the App's 「接下来的会面或活动，该准备什么？」): what to prepare for the next meetings or events is
  // code's answer (graph/nodes/prepare.ts), never a topic ranking — unless a person or a record is named (then it is about that).
  if ((part.route === "read" || part.route === "answer") && asksWhatToPrepare(quote) && !part.refs.some((ref) => ref.recordId || (ref.entity === "contact" && ref.quote && !GENERIC_CONTACT_CLUE.test(message.slice(ref.quote[0], ref.quote[1]))))) return { kind: "prepare" };
  if (part.route === "read" || part.route === "answer") {
    // AG11 (App check): an event that is both a clue of the part and an @ reference is one event, not two; and a part that
    // also points at a record of another kind (a schedule item) is not an event comparison — it goes on to the read.
    const otherKind = part.refs.some((ref) => ref.recordId && ref.entity !== "event" && ref.entity !== "contact");
    const events = otherKind ? 0 : new Set([...part.refs.filter((ref) => ref.entity === "event" && ref.recordId).map((ref) => ref.recordId!), ...scope.run.references.filter((reference) => reference.type === "event" && reference.accessible !== false).map((reference) => reference.id)]).size;
    // Comparing and grouping are done here for events (their fee, time and topics); other records go on to the read and the answer.
    const aboutEvents = part.capabilities.includes("event.read") && !part.capabilities.some((capability) => capability === "memo.read" || capability === "todo.read" || capability === "contact.read");
    if (aboutEvents && (part.capabilities.includes("fn.group") || GROUP_WORDS.test(quote))) return { kind: "group" };
    if ((aboutEvents || events >= 2) && events >= 2 && (part.capabilities.includes("fn.compare") || COMPARE_WORDS.test(quote))) return { kind: "compare" };
  }
  // AG20b (TRIAGE R17, §3.5 last row): the goal stated for the next note turns a plain "整理一下" of a note into that extraction;
  // words of this turn asking for a summary win ("这次只要摘要").
  const goal = scope.run.context?.noteGoal;
  if (goal && (part.route === "read" || part.route === "answer") && ORGANIZE_WORDS.test(quote) && !SUMMARY_ASKED.test(quote)) {
    const memoId = memoOf(scope, part, true);
    if (memoId) {
      emitTrace({ goal: { followUps: goal.followUps, interactions: goal.interactions }, memoId, partId: part.localId, type: "functions.note_goal_applied" });
      return { kind: "extract", memoId, want: { followUps: goal.followUps, interactions: goal.interactions }, write: false };
    }
  }
  // AG10 stability run (AE-FN-009): "用这篇笔记更新我和小林的往来" asks for a change in its own words; when the first layer left
  // the write capability out (deliverable change, no write), the extraction still makes the card — never a write without the words.
  const write = part.route === "propose_write" || (part.route === "read" && part.plan.deliverable === "change" && WRITE_ASK.test(quote) && !part.plan.negation && !part.plan.hypothesis);
  if (part.route === "read" || write) {
    const interactions = part.capabilities.includes("fn.extractInteractions") || INTERACTION_WORDS.test(quote);
    const followUps = part.capabilities.includes("fn.extractFollowUps") || FOLLOW_UP_ASK.test(quote);
    // Gate run 1 (AE-XL-007): "刚才那条来电记录没存上，再记一次：小林今天来过电话" dictates a new memo (memo.create) — it is not an
    // extraction from the memo talked about before. The memo of the conversation is taken only for its commitments as to-dos
    // ("それをToDoに追加して"); a new memo from the user's words never comes from one.
    const dictates = part.capabilities.includes("memo.create") && !part.capabilities.some((capability) => capability === "fn.extractInteractions" || capability === "fn.extractFollowUps");
    const toTodos = part.capabilities.some((capability) => capability.startsWith("todo.")) && followUps;
    const memoId = dictates && !scope.run.references.some((reference) => isMemoType(reference.type)) ? null : memoOf(scope, part, toTodos && !dictates);
    if (memoId && (interactions || followUps)) {
      // A write asks for one kind: to-dos are follow-ups; anything else written from a memo is its interaction.
      const writesTodo = part.capabilities.some((capability) => capability.startsWith("todo."));
      const want = write ? { followUps: writesTodo || (followUps && !interactions), interactions: !writesTodo && interactions } : { followUps, interactions };
      if (want.followUps || want.interactions) return { kind: "extract", memoId, want, write };
    }
    // AG10 run-02 (AE-RD-008 b): a memo that cannot be opened this turn gets no summary lead and no offers on its content.
    if (!write && memoId && scope.run.references.some((reference) => isMemoType(reference.type) && reference.id === memoId && reference.accessible !== false) && (part.capabilities.includes("fn.summarize") || part.plan.deliverable === "summary" || SUMMARIZE_WORDS.test(quote))) return { kind: "summary", memoId };
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

/** AG12 opening (AE-FN-003 ja/en): the question words around "follow up" ("誰をフォローすべき", "who … with") are not a topic. */
const FOLLOW_UP_QUESTION_WORDS = /(すべきな?|べき|だれ|誰|\bwhom?\b|\bwith\b|\bshould\b|\bi\b|\s)/giu;

const MEETS_HISTORY: ReadonlySet<ContactSignal["kind"]> = new Set(["overdue_followup", "overdue_todo", "past_planned"]);

/** AE-FN-003: the history criteria hold for a contact only with a follow-up or to-do past due, or a to-do past its planned day. */
export function meetsHistory(contact: { signals: readonly { kind: ContactSignal["kind"] }[] }): boolean {
  return contact.signals.some((item) => MEETS_HISTORY.has(item.kind));
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
  // Hotfix 2026-11-20 part 2: a contact line never carries the contact's free-text notes (phone numbers, addresses went into answers).
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
  // AG19: "从早到晚" for a start, a deadline or a planned day; a last interaction keeps "从远到近" (the longest ago first).
  if (field === "lastInteraction") return `${name}${direction === "asc" ? "从远到近（最久没联系的在前）" : "由近到远"}`;
  return `${name}${direction === "asc" ? "从早到晚" : "从晚到早"}`;
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
  /** The count line under a ranking's lead (rankCountLine), when there is a lead. */
  countLine?: string | null;
  /** AG19: the same answer as blocks — the lines before the list, one card per listed record in the list's order, the lines after. */
  blocks: AnswerBlock[];
}

/** AG19 (board 1 note 1): the lead of a list ordered only by a field — how many in all, how they are ordered, how many are shown. */
export function fieldListLead(language: Language, input: { field: RankField | null; direction: "asc" | "desc"; total: number; listed: number; unit: string; noun: string; upcoming?: boolean }): string {
  const { direction, field, listed, noun, total, unit } = input;
  if (!total || !listed) {
    if (input.upcoming) return { en: "There are no events that have not started yet.", ja: "これから開催されるイベントはありません。", zh: "现在没有还没开始的活动。" }[language];
    // Nothing to list: the order looked for is still said (what the user asked to sort by).
    return { en: `Ordered by ${fieldWords(field, direction, language)}, there are no ${noun} to list.`, ja: `${fieldWords(field, direction, language)}では、該当する${noun}はありません。`, zh: `按${fieldWords(field, direction, language)}排的话，现在没有可以列出的${noun}。` }[language];
  }
  if (language === "en") return `${input.upcoming ? `${total} ${noun} have not started yet` : `${total} ${noun} in all`}, by ${fieldWords(field, direction, language)}${listed < total ? `; here are the first ${listed}` : ""}:`;
  if (language === "ja") return `${input.upcoming ? `これから開催される${noun}は全部で${total}${unit}` : `全部で${total}${unit}`}、${fieldWords(field, direction, language)}です${listed < total ? `。まず${listed}${unit}` : ""}：`;
  return `${input.upcoming ? `还没开始的${noun}共${total}${unit}` : `共${total}${unit}`}，按${fieldWords(field, direction, language)}${listed < total ? `，先看${listed}${unit}` : ""}：`;
}

/**
 * Release-2 gate 2 (AE-ANS-002, AE-MEM-001/003/006/009/011; the hotfix's code-owned count rule): the count line under a
 * ranking's lead says how many meet everything the lead names — the hard conditions and what only ranks (a saved or said
 * preferred time, a topic that was matched) — never the number that passed the hard conditions alone. When fewer meet it
 * than are listed, it says so; with the events in scope it names how many there were; when not all were looked at, how many.
 */
export function rankCountLine(language: Language, input: { listed: number; matching: number; meeting: number; inScope: number | null; period: boolean; upcoming: boolean; noun: string; unit: { en: string; ja: string; zh: string }; judged: number; truncated: number; semantic: boolean }): string {
  const { listed, matching, meeting, noun } = input;
  const unit = input.unit[language];
  const scope = input.inScope !== null && input.inScope > meeting && (input.period || input.upcoming)
    ? input.period
      ? { en: `There are ${input.inScope} in this period; `, ja: `この期間のものは全部で${input.inScope}${unit}、`, zh: `这段时间一共${input.inScope}${unit}，` }[language]
      : { en: `${input.inScope} ${noun} have not started yet; `, ja: `これから開催される${noun}は全部で${input.inScope}${unit}、`, zh: `还没开始的${noun}共${input.inScope}${unit}，` }[language]
    : "";
  let line: string;
  if (meeting >= matching) line = say.coverageLine(language, listed, matching, input.unit);
  else if (meeting === 0) line = { en: `None fully matches these criteria; these are the ${listed} closest.`, ja: `条件に完全に合うものはありません。近いものを${listed}${unit}挙げます。`, zh: `没有完全符合这些条件的，下面是最接近的${listed}${unit}。` }[language];
  else if (listed <= meeting) line = say.coverageLine(language, listed, meeting, input.unit);
  else line = { en: `${meeting} match and come first; the other ${listed - meeting} listed after them do not fully match.`, ja: `該当するのは${meeting}${unit}で、先に並べています。残りの${listed - meeting}${unit}は条件に完全には合いません。`, zh: `符合条件的有${meeting}${unit}，排在前面；后面${listed - meeting}${unit}不完全符合。` }[language];
  if (scope) line = language === "en" ? `${scope}${line.charAt(0).toLowerCase()}${line.slice(1)}` : `${scope}${line}`;
  const looked = input.semantic && input.truncated > 0 ? { en: ` (${input.judged} were looked at closely; ${input.truncated} more were not.)`, ja: `（詳しく見たのは${input.judged}${unit}で、残りの${input.truncated}${unit}は詳しく見ていません。）`, zh: `（这次细看了${input.judged}${unit}，还有${input.truncated}${unit}没有细看。）` }[language] : "";
  return `${line}${looked}`;
}

/** The AG08 answer of a ranking (scope, topic, coverage; the reason of each by the record's own fields). */
function writeAnswer(input: { upcoming?: boolean; inScope?: number | null; apart?: string | null; domain: RankDomain; language: Language; basis: string | null; basisMemo: string | null; within: string | null; period: { from?: string; to?: string } | null; field: RankField | null; direction: "asc" | "desc"; result: RankResult<Candidate>; timeZone: string; now: string; lead: string | null; offerBasis?: boolean; reasons: Map<string, string> }): Written {
  const { domain, language, result } = input;
  const unit = UNIT[domain][language];
  const noun = NOUN[domain][language];
  const n = result.ordered.length;
  const lines: string[] = [];
  let countLine: string | null = null;
  if (input.lead) lines.push(input.lead);
  // Events are Orbit's public directory, not the user's own: they are named by the dates they were kept by.
  const period = domain === "event" ? periodWords(input.period, language) : null;
  const scope = input.within
    ? (language === "en" ? `your ${noun} ${input.within}` : language === "ja" ? `${input.within}${noun}` : `${input.within.replace(/的$/u, "")}的${noun}`)
    : domain === "event"
      ? input.upcoming && !period
        // Repair round 1 (decision 3): the lead says the list holds only events that have not started.
        ? (language === "en" ? "the events that have not started yet" : language === "ja" ? "これから開催されるイベント" : "还没开始的活动")
        : (language === "en" ? `the public events${period ? ` ${period}` : ""}` : language === "ja" ? `${period ?? "公開中の"}イベント` : `${period ?? "公开的"}活动`)
      : language === "en" ? `your ${noun}` : language === "ja" ? `あなたの${noun}` : `你的${noun}`;
  const topic = input.basisMemo ? (language === "en" ? `the topics of your note "${input.basisMemo}"` : language === "ja" ? `メモ「${input.basisMemo}」のテーマ` : `你的笔记「${input.basisMemo}」的主题`) : input.basis ? (language === "en" ? `"${input.basis}"` : `「${input.basis}」`) : null;
  const { afterHardConditions, judged, truncated } = result.coverage;
  if (input.lead && result.semantic && !result.matched && result.unmatchedReason) {
    // AG13 rerun of AG10 (AE-FN-001): the topic check did not finish (the review timed out); the candidates left were not
    // checked against it, so they are not said to meet the criteria — the order shown is by what code could test.
    emitTrace({ listed: n, reason: result.unmatchedReason, type: "functions.coverage_unchecked" });
    lines.push(say.uncheckedCoverageLine(language, n, topic, { en: unit, ja: UNIT[domain].ja, zh: UNIT[domain].zh }));
  } else if (input.lead) {
    // AG10: the lead said the basis; the coverage follows.
    countLine = rankCountLine(language, { inScope: input.inScope ?? null, judged: result.coverage.judged, listed: n, matching: result.matching, meeting: result.meeting, noun, period: Boolean(period), semantic: result.semantic, truncated: result.coverage.truncated, unit: { en: unit, ja: UNIT[domain].ja, zh: UNIT[domain].zh }, upcoming: Boolean(input.upcoming) });
    lines.push(countLine);
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
    lines.push(fieldListLead(language, { direction: input.direction, field: input.field, listed: n, noun, total: result.matching, unit, upcoming: input.upcoming }));
  }
  const listAt = lines.length;
  const cards: AgentAnswerRecordContract[] = [];
  result.ordered.forEach((item, index) => {
    const candidate = item.candidate;
    const level = result.matched ? item.level : null;
    const reason = input.reasons.get(candidate.id) ?? null;
    const line = domain === "contact" ? `${contactLine(candidate as ContactCandidate, language, level)}${reason ? `${language === "en" ? " — " : "——"}${reason}` : ""}` : domain === "event" ? eventLine(candidate as EventCandidate, language, level, input.timeZone, reason) : todoLine(candidate as TodoCandidate, language, input.timeZone, input.now);
    lines.push(`${index + 1}. ${line}`);
    cards.push(cardOf(candidate, { language, level, now: input.now, reason, timeZone: input.timeZone }));
  });
  const afterAt = lines.length;
  if (result.untimed.length && domain === "event") lines.push(say.untimedLine(language, result.untimed.map((item) => (item as EventCandidate).title)));
  if (input.apart) lines.push(input.apart);
  // Coordinator's decision 2026-11-20 (hotfix × AG14): a recommendation of events with nothing to pick by is answered with the
  // list of what is coming up — and, so that nothing is decided for the user, the same standing line that invites another basis.
  if (input.lead || input.offerBasis) lines.push(say.changeBasisLine(language));
  // AG19 (D1): each listed record is one card, in the list's order; the name, the time and the place are on the card.
  const list = recordsBlock(cards, language);
  const paragraphs = (texts: readonly string[]): AnswerBlock[] => texts.filter((text) => text.trim()).map((text) => ({ text, type: "paragraph" as const }));
  const blocks: AnswerBlock[] = [...paragraphs(lines.slice(0, listAt)), ...(list ? [list] : []), ...paragraphs(lines.slice(afterAt))];
  return { blocks, cites: [...result.ordered.map((item) => item.candidate.ref), ...(domain === "event" ? result.untimed.map((item) => item.ref) : [])], countLine, text: lines.join("\n") };
}

/** AG19: the card of a listed candidate — the record's own three lines, and the one-line reason it was picked (if any). */
function cardOf(candidate: Candidate, input: { language: Language; level: string | null; reason: string | null; timeZone: string; now: string }): AgentAnswerRecordContract {
  const { language } = input;
  const card = recordOfView(candidate.view, { language, now: input.now, timeZone: input.timeZone });
  const level = input.level ? LEVEL_WORDS[language][input.level as keyof (typeof LEVEL_WORDS)["zh"]] : null;
  const why = [input.reason, level].filter(Boolean).join(language === "en" ? "; " : "；");
  const contact = candidate.view.kind === "contact" ? (candidate as ContactCandidate) : null;
  const sub = contact ? (contact.lastInteraction ? lastInteractionWords(language, contact.lastInteraction) : [contact.place, contact.industry].filter(Boolean).join(" · ")) : "";
  const top = contact ? [contact.company, contact.role].filter(Boolean).join(" · ") : "";
  return { ...card, ...(top ? { top } : {}), ...(sub ? { sub } : {}), ...(why ? { why } : {}) };
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
    const found = parts.map((part) => ({ part, task: due(state, part) && !run.functionsDone.has(part.localId) ? functionOf(scope, part) : null })).filter((item): item is { part: GraphPart; task: FunctionTask } => item.task !== null);
    if (!found.length) return {};
    // AG10 run-03 (AE-SCL-018): one sentence the first layer split into parts over the same memo ("实际有过的往来和我答应的事"
    // as an interactions part and a follow-ups part) is one extraction, said once; the other part is answered by it.
    const tasks: { part: GraphPart; task: FunctionTask }[] = [];
    const mergedInto = new Map<GraphPart, GraphPart>();
    for (const item of found) {
      const { part, task } = item;
      const first = task.kind === "extract" && !task.write ? tasks.find((other) => other.task.kind === "extract" && !other.task.write && other.task.memoId === task.memoId && other.part.quote[0] === part.quote[0] && other.part.quote[1] === part.quote[1]) : undefined;
      if (first && first.task.kind === "extract" && task.kind === "extract") {
        first.task = { ...first.task, want: { followUps: first.task.want.followUps || task.want.followUps, interactions: first.task.want.interactions || task.want.interactions } };
        mergedInto.set(part, first.part);
        run.functionsDone.add(part.localId);
        emitTrace({ into: first.part.localId, partId: part.localId, type: "functions.same_sentence_merged" });
        continue;
      }
      tasks.push(item);
    }
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
        if (task.kind === "prepare") await preparePart(scope, state, part);
        else if (task.kind === "summary") summaryPart(scope, state, part, optionSets);
        else if (task.kind === "compare" || task.kind === "group") await eventsPart(scope, state, part, task.kind);
        else if (task.kind === "extract") {
          const done = await extractPart(scope, state, part, task, { budget, repairs }, optionSets);
          budget = done.budget;
          repairs = done.repairs;
        } else if (task.kind === "rule") {
          const done = await rulePart(scope, state, part, task, optionSets, { budget, repairs });
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
    for (const [part, first] of mergedInto) {
      part.status = first.status;
      part.reason = first.reason;
      part.route = first.route;
      part.reads = first.reads;
      part.cites = first.cites;
      part.gaps = first.gaps;
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
  // AG21a (decision 1): a number that is only part of the time window ("the next two weeks", "这两周") is no count — it never
  // cuts the list, whether code or the first layer read it as one.
  const windowCountOnly = !reply && countSaidIn(quote) !== null && countSaidIn(withoutWindowWords(quote)) === null;
  if (windowCountOnly && part.plan.rank?.count) emitTrace({ count: part.plan.rank.count, partId: part.localId, type: "functions.window_number_not_a_count" });
  const plan: RankPlanState = reply ? (task.item.rank as RankPlanState) : { domain: task.domain, ...(part.plan.rank?.count && !windowCountOnly ? { count: part.plan.rank.count } : {}), ...(part.plan.readFilter?.from ? { from: part.plan.readFilter.from } : {}), ...(part.plan.readFilter?.to ? { to: part.plan.readFilter.to } : {}) };
  const domain = plan.domain;
  const original = reply ? task.item.quote ?? "" : quote;
  const rank = reply ? {} : windowCountOnly ? { ...part.plan.rank, count: undefined } : part.plan.rank ?? {};
  const basisSpan = rank.basis;
  const withinWords = rank.within ? message.slice(rank.within[0], rank.within[1]) : null;
  // A click on a way of ordering (the question's option) or a reply naming one.
  const picked = state.optionSets.find((set) => set.partId === part.localId && set.purpose === "ranking" && set.selectedOptionId);
  const chosen = picked?.options.find((option) => option.optionId === picked.selectedOptionId)?.refId ?? null;
  const replyWords = reply ? quote : "";
  const leftToAgent = reply && leavesItToAgent(replyWords);

  // 1. The basis (functions/basis.ts): now → memory → history; none → one question.
  // AG14: words of this very message the user asked to remember ("记住，以后……优先周末上午。先按这个推荐……") count as this
  // turn's own basis, whether or not they are saved.
  const rememberedNow = run.memory.turnWords.join("，");
  const words = `${original} ${replyWords}${rememberedNow ? ` ${rememberedNow}` : ""}`;
  const fieldFromWords = groundedField(rank.orderBy, words) ?? (domain === "contact" && LAST_INTERACTION_WORDS.test(words) ? "lastInteraction" : domain === "event" && START_WORDS.test(words) ? "startsAt" : null) ?? (chosen === "startsAt" || chosen === "dueAt" || chosen === "plannedDate" || chosen === "lastInteraction" ? chosen : null);
  const field: RankField | null = fieldFromWords;
  const direction: "asc" | "desc" = field ? (rank.direction && groundedField(rank.orderBy, words) ? rank.direction : directionSaidIn(words, field === "lastInteraction" ? "asc" : "asc")) : "asc";
  const time: TimePreference[] = [];
  const timeClause = timeClauseOf(words) ?? (chosen === "weekend" ? (language === "en" ? "weekends" : language === "ja" ? "週末" : "周末") : null);
  const saidTime = timeClause ? timePreferenceIn(timeClause, "turn") : null;
  // AG21a (R32c): 「这次晚上的也算上」 lifts a saved rule for this turn; the time it names is no preference of its own.
  const lifted = reply ? null : liftedIn(original);
  const liftTime = lifted ? timePreferenceIn(lifted.words, "turn") : null;
  const turnTime = saidTime && liftTime && saidTime.days === liftTime.days && saidTime.part === liftTime.part ? null : saidTime;
  if (lifted) emitTrace({ partId: part.localId, time: liftTime ? { days: liftTime.days ?? null, part: liftTime.part ?? null } : null, type: "functions.saved_rule_lifted", words: lifted.words });
  if (turnTime && domain === "event") time.push(turnTime);
  // The topic: a memo attached with @ gives its words; otherwise the basis words, when something is left of them.
  // A to-do ranking's "正式跟进" is a hard condition (formal follow-ups), not a topic.
  let basis = basisSpan ? message.slice(basisSpan[0], basisSpan[1]).replace(domain === "todo" ? FORMAL_FOLLOW_UP : /$^/u, " ").trim() || null : null;
  let basisMemo: string | null = null;
  const memoRef = run.references.find((reference) => isMemoType(reference.type));
  const accountScope = records.scope(input.actorId);
  // AG20b (TRIAGE R19): the note used as the criterion is one of the answer's openable sources.
  let basisRef: string | null = null;
  const useMemo = (view: RecordView | undefined, name: string | null) => {
    const body = view ? String(view.fields.body ?? "") : "";
    if (!body) return;
    basis = body;
    basisMemo = String(view!.fields.title ?? name ?? "");
    basisRef = view!.ref;
    run.readSources.set(view!.ref, readSourceOf(view!, timeZone) ?? { id: view!.id, kind: "memo" });
    run.recordCards.set(view!.ref, recordOfView(view!, { language, now, timeZone }));
    run.readNames.set(view!.id, { name: basisMemo || "memo", type: "memo" });
  };
  if (memoRef && memoRef.accessible !== false && (!basis || basis.includes("@") || !field)) {
    try {
      useMemo((await records.reader.read("memo", accountScope, { id: memoRef.id })).items[0], memoRef.name ?? null);
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "functions.basis_memo" });
    }
  }
  // AG20b (TRIAGE R9): a note named in words as the criterion ("按我的看展札记") is found by those words — the newest of that
  // name — and never through the events' period (a note written before the weekend is still the criterion).
  const namedMemo = !memoRef && domain === "event" && !reply ? part.refs.find((ref) => ref.entity === "memo" && !ref.recordId && ref.quote) : undefined;
  if (namedMemo && (!field || basisSpan)) {
    const memoWords = clueSearchWords(message.slice(namedMemo.quote![0], namedMemo.quote![1]).replace(/^@/u, ""));
    if (memoWords) {
      try {
        const found = (await records.reader.read("memo", accountScope, { limit: 10, order: "newest", text: memoWords })).items;
        emitTrace({ found: found.map((view) => view.ref), partId: part.localId, type: "functions.basis_memo_by_words", words: memoWords });
        useMemo(found[0], null);
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), partId: part.localId, type: "read.error", where: "functions.basis_memo_words" });
      }
    }
  }
  // Hotfix 2026-11-20 part 2, rule 3 (「哪些人值得先跟进？」 ranked by the topic 「值得先跟进」): the whole question, or words that are
  // only question, kind, time or preparing words, are never the topic. With no real topic in the words it is no topic ranking.
  // Hotfix 1c (AE-ENT-005): words of only a date, a time of day and a kind of record are a window, never a topic.
  // AG21a (R32a/b/c, decision 1): the words of the read window (「这两周」「这几天」) are taken out where they stand; vague fit
  // words (「适合我」「可以去」) and a lifted rule's clause are no topic either (realTopicOf). What is left is the topic, or none.
  const topicText = (words: string) => realTopicOf(withoutWindowWords(lifted ? words.replace(lifted.clause, " ") : words));
  if (basis && !basisMemo && (isWholeQuote(basis, original) || !realTopicOf(basis) || onlyWindowWords(basis) || !topicText(basis))) {
    emitTrace({ partId: part.localId, type: "functions.basis_not_a_topic", whole: isWholeQuote(basis, original) });
    basis = !onlyWindowWords(basis) && isWholeQuote(basis, original) && topicText(basis) ? topicText(basis) : null;
  } else if (basis && !basisMemo && topicText(basis) !== realTopicOf(basis)) {
    emitTrace({ from: basis, partId: part.localId, type: "functions.basis_window_words_out" });
    basis = topicText(basis);
  }
  const topicWords = basisMemo ? basis : topicWordsOf(basis ?? (reply ? replyWords : original));
  // Hotfix part 2: asking who to follow up with is the follow-up ranking; what is left of the basis is held to rule 3.
  const followUpAsk = domain === "contact" && (FOLLOW_UP_WORDS.test(words) || asksWhoToFollowUp(original)) && !basisMemo && !realTopicOf(basis ?? "").replace(FOLLOW_UP_WORDS, "").replace(FOLLOW_UP_QUESTION_WORDS, "").trim();
  // AG14 dev run 2 (AE-SCL-027): basis words that only say "worth going" ("行く価値がありそう", "值得去的") name no topic,
  // whoever copied them out — the first layer's basis is held to the same test as the sentence itself. (The hotfix's
  // rule 3 has already run on the basis above: the whole question, or words of only question, kind, time or preparing,
  // are gone by here. A basis is a topic only when both rules leave something of it.)
  let topic: string | null = basisMemo ? basis : topicWords && !followUpAsk ? (basis && sentenceTopicOf(basis) ? basis : reply ? replyWords : null) : null;
  // A ranking with neither a basis nor a field, in AG08's words of the part itself ("最适合聊…"). Two rules meet here and
  // both hold: the hotfix's rule 3 says what the topic is — the real topic words in the sentence, never the whole
  // message — and AG14's says a sentence that only asks names none and that a topic read from the sentence itself (no
  // basis words from the first layer) is a weak one: saved entries for this task come before it (below).
  let topicIsSentence = false;
  const sentenceTopic = topicText(original);
  if (!topic && !field && !reply && domain !== "todo" && sentenceTopic && sentenceTopicOf(withoutWindowWords(original)) && !followUpAsk) {
    topic = sentenceTopic;
    topicIsSentence = true;
  }
  // "随便" leaves it to the agent: no topic, the natural order.
  if (leftToAgent) topic = null;
  // Release-2 gate 2 (AE-ANS-003): 「你觉得有必要参加？为什么？」 names no topic — which are worth going to is answered with part 3's
  // reasons (below), never by matching the events against 「你觉得」.
  if (topic && topicIsSentence && domain === "event" && asksWhichAreWorthIt(original)) {
    emitTrace({ partId: part.localId, type: "functions.worth_no_topic" });
    topic = null;
    topicIsSentence = false;
  }
  // Integration (coordinator, 2026-11-21): 「帮我挑两位最值得联系的摄影师」 — the profession names the set to pick from (the
  // contacts whose role, tags or notes say it, below), not the standard: with nothing else to go by, the saved entries for
  // picking contacts apply, as for any pick without a standard of its own.
  const roles = domain === "contact" && !basisMemo ? rolesIn(original) : [];
  if (roles.length && topic) {
    const rest = roleWordsIn(original).reduce((text, word) => text.split(word).join(" "), topic);
    if (!realTopicOf(rest) || !sentenceTopicOf(rest)) {
      emitTrace({ partId: part.localId, roles: roles.map((row) => row[0]), type: "functions.role_is_the_set" });
      topic = null;
      topicIsSentence = false;
    }
  }
  // AG19-6: "最近有哪些活动适合我" names no topic ("适合我" is not one): the list of what is coming up, by start time.
  if (topic && !basisMemo && !basisSpan && !reply && listsUpcomingEvents(part, message) && !upcomingTopicOf(original)) {
    emitTrace({ partId: part.localId, type: "functions.upcoming_no_topic" });
    topic = null;
  }
  // AG14 (设计稿 §6; replaces AG10's read-only list): the saved entries for this task. Rules are hard conditions and
  // preferences rank; what this turn's own words say wins over a saved preference ("这次看周四晚上").
  // Release-2 gate (AE-ANS-009, AE-SCL-017; coordinator, 2026-11-20): saved entries are a basis only for a request to
  // recommend or pick (a pick or recommend word, or 「适合我」) that gives no standard of its own. A plain listing
  // (「接下来有哪些活动？」) is never turned into a ranking by memory, nor does a saved time rule hide records from it; an
  // order, a filter or a topic in the sentence (「过期最久的排前面」, 正式跟进, an @ note, a clicked ordering, who to follow up)
  // is the standard and nothing saved is added to it. A count or a period alone says how many and when, not by what
  // (AE-SCL-027/028, AE-FN-002, AE-MEM-*: 「挑三场」 with saved entries ranks by them).
  // AG21a (coordinator's decision 1): 可以去 / 值得去 / 适合我 / worth going / 行ける / おすすめ are a recommendation, from the
  // user's words (asksForRecommendation), however the first layer tagged the question.
  const recommendsOrPicks = run.memory.reranks.includes(part.localId) || PICK_WORDS.test(original) || asksForRecommendation(original) || Boolean(lifted);
  const ownStandard = Boolean(field || basisMemo || chosen || followUpAsk || (topic && !topicIsSentence) || (domain === "todo" && (FORMAL_FOLLOW_UP.test(words) || /(过期|逾期|期限切れ|期限を過ぎ|overdue)/iu.test(words))));
  const memoryApplies = recommendsOrPicks && !ownStandard;
  if (!memoryApplies) emitTrace({ ownStandard, partId: part.localId, recommendsOrPicks, type: "functions.memory_not_a_basis" });
  // AG21c (decision D8): with a standard of the user's own, saved rules still hold (a hard time condition, a topic ruled
  // out); only saved preferences give way to it.
  const saved: RankMemory = memoryApplies ? rankMemoryOf(await ensureTurnMemory(scope, now, timeZone), domain, { now, partId: part.localId, timeZone, turnHasTopic: Boolean(topic) && !topicIsSentence, turnTime: domain === "event" ? turnTime : null }) : recommendsOrPicks && ownStandard ? rulesOnlyOf(await ensureTurnMemory(scope, now, timeZone), domain, { now, partId: part.localId, timeZone }) : { overruled: [], time: [], topic: null, used: [] };
  // AG21a (R32c): a lift takes away only the saved rule it names, this turn (shown as 「只这一次」); every other saved entry
  // still applies. A time rule is the one whose excluded time is the lifted time; otherwise a rule that leaves out what the
  // lifted words name.
  if (lifted && memoryApplies) {
    const liftedTopic = liftTime ? "" : realTopicOf(lifted.words.replace(/的$/u, ""));
    const lifts = (entry: RecalledMemory) => {
      const preference = timePreferenceOfEntry(entry);
      // Integration (coordinator, 2026-11-21; AG21a's lift × AG21b's clock rules): a clock rule ("不要早上八点以前开始的",
      // "只推荐 19 点以后开始的") is about the part of the day its bound falls in, so 「这次早上的也算上」 lifts it.
      const slot = preference && !preference.part && preference.clock ? { ...preference, part: partOfClock(preference.clock) } : preference;
      if (liftTime) return Boolean(slot && (slot.exclude || slot.hard)) && overruledByTurn({ ...slot!, hard: true }, liftTime);
      return Boolean(liftedTopic) && !preference && /(不要|别|除了|排除|避开|以外|は除いて|\bnot\b|\bno\b|\bavoid\b|\bexcept\b|\bwithout\b)/iu.test(entry.content) && liftedTopic.split(" ").some((word) => entry.content.includes(word));
    };
    const gone = saved.used.filter(lifts);
    if (gone.length) {
      saved.overruled.push(...gone);
      saved.used = saved.used.filter((entry) => !gone.includes(entry));
      saved.time = saved.time.filter((item) => !gone.includes(item.entry));
      const topics = saved.used.filter((entry) => !timePreferenceOfEntry(entry)).map((entry) => topicOfEntry(entry)).filter((item): item is string => Boolean(item));
      saved.topic = topics.length ? topics.join("、") : null;
      emitTrace({ lifted: gone.map((entry) => entry.memoryId), partId: part.localId, type: "functions.saved_rule_lifted_this_turn" });
    }
  }
  for (const item of saved.time) time.push(item.preference);
  let topicFromMemory = false;
  if (saved.topic && (!topic || topicIsSentence) && !basisMemo) {
    topic = saved.topic;
    topicFromMemory = true;
  } else if (topicIsSentence && saved.used.length) {
    // "值得去的" with saved entries for this task: the entries are the basis, not the sentence.
    topic = null;
  }
  // AG19-6: "最近有哪些活动适合我" names no standard to pick by; it is a list of what is coming up, never a question back.
  // A pick ("哪两场最值得去") still asks what to pick by, once (AG10-1): only the time filter is the default there.
  // Hotfix 1c (run-04: 「推荐值得参加的活动并说明原因」, 「最近おすすめのイベントは？」 asked what to pick by once rule 3 took the
  // fake topic away): a recommendation of events with no real topic, no field and no count is the list of what is coming up,
  // nearest first (AG19-6, decision 3) — never a question back.
  const recommendsEvents = domain === "event" && !reply && !topic && !field && !rank.count && countSaidIn(withoutWindowWords(original)) === null && asksEventsToGoTo(original) && !pointsAtPast(original);
  const listing = (!PICK_WORDS.test(original) && (part.plan.deliverable === "list" || /(列出|列一下|列个|\blist\b|一覧|並べて)/iu.test(original))) || (!reply && !PICK_WORDS.test(original) && listsUpcomingEvents(part, message)) || recommendsEvents;
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
  // AG19-6: events asked for as "最近／接下来" are given the nearest first ("最近" is not "latest first" here).
  // Repair round 1: for events the nearest comes first unless the words point at the past or say another order outright
  // ("最近" is not "latest first" here, so it is taken out before the direction is read).
  const eventDirection = directionSaidIn(words.replace(/最近|近期|近来|recent(?:ly)?/giu, " "), "asc");
  const orderDirection = domain === "event" && !pointsAtPast(words) && (orderField ?? "startsAt") === "startsAt" ? eventDirection : field ? direction : order?.direction ?? "asc";
  // Integration (AG21b's run, AE-ANS-029): a singular "who" ("Who should I contact now…", 「现在该联系谁」, 「誰に連絡すべき」) is
  // no count of 1 — a count of 1 the first layer read from it is not taken; only a number in the words or 「一个人／一人だけ／
  // just one」 caps the list.
  const saidCount = countSaidIn(withoutWindowWords(original));
  const whoIsNoCount = domain === "contact" && WHO_WORDS.test(original) && (plan.count ?? rank.count) === 1 && saidCount === null && !JUST_ONE_WORDS.test(original);
  if (whoIsNoCount) emitTrace({ partId: part.localId, type: "functions.who_is_no_count" });
  const count = (whoIsNoCount ? null : plan.count ?? rank.count) ?? saidCount ?? (orderField && !topic && !time.length ? FIELD_LIST_LIMIT : 3);

  // 3. Candidates and hard conditions (code), read under the account's scope.
  // A profession named as the set (above) is matched on the contacts' own words; it is not also an industry ("摄影" of 摄影师).
  const freeWords = roleWordsIn(original).filter(() => roles.length > 0).reduce((text, word) => text.split(word).join(" "), (withinWords ?? "") + " " + outside(quote, basisSpan ? [Math.max(0, basisSpan[0] - part.quote[0]), Math.max(0, basisSpan[1] - part.quote[0])] : undefined));
  const reasons = new Map<string, string>();
  let candidates: Candidate[] = [];
  let hard: (candidate: Candidate) => boolean = () => true;
  let signal: ((candidate: Candidate) => number[]) | undefined;
  let timeOf: ((candidate: Candidate) => string | null) | undefined;
  // AG12 opening (AE-FN-003): people with only a to-do due or planned later in the period do not meet the history criteria.
  let upcoming: ContactCandidate[] = [];
  let upcomingOnly = false;
  const fromDay = plan.from ? localMidnight(plan.from, timeZone) : null;
  const toDay = plan.to ? localMidnight(new Date(Date.parse(`${plan.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), timeZone) : null;
  if (domain === "contact") {
    const list = await contactCandidates(records, input.actorId, orderField === "lastInteraction" || history);
    // The profession named as the set: the contacts whose own words say it; none does — the words narrow nothing (traced).
    const holding = roles.length ? list.filter((item) => holdsRole([item.role, item.notes, item.industry, ...item.tags], roles)) : [];
    const roleSet = holding.length ? new Set(holding.map((item) => item.id)) : null;
    if (roles.length) emitTrace({ holding: holding.length, partId: part.localId, roles: roles.map((row) => row[0]), type: "functions.role_set" });
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
      upcoming = list.filter((contact) => contact.signals.length > 0 && !meetsHistory(contact)).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      signal = (candidate) => {
        const kinds = (candidate as ContactCandidate).signals.map((item) => item.kind);
        return [kinds.filter((kind) => kind === "overdue_followup").length, kinds.filter((kind) => kind === "overdue_todo" || kind === "past_planned").length, kinds.filter((kind) => kind === "due_in_period").length, kinds.length];
      };
    }
    hard = (candidate) => {
      const item = candidate as ContactCandidate;
      if (places.size && !(item.place && places.has(item.place)) && !(item.city && [...places].some((place) => PLACE_WORDS[place]?.includes(item.city!.toLowerCase())))) return false;
      if (industries.size && !(item.industry && industries.has(item.industry))) return false;
      if (roleSet && !roleSet.has(item.id)) return false;
      if (orderField === "lastInteraction" && !history && !item.lastInteraction) return false;
      // Code owns who meets the criteria the lead names (AE-FN-003): a follow-up or to-do past due, a to-do past its planned day.
      if (history && !meetsHistory(item)) return false;
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
    // AG19-6: "最近／近期／接下来有哪些活动" with no past period said: only events that have not started, whatever dates
    // the first layer read into "最近" (a range that ends before now is not kept; one that starts earlier starts now).
    // Repair round 1 (decision 3): the default for every event ranking, with or without "最近". Past events are read only
    // when the user points at the past — in words (去过、之前、上个月) or by writing out a date that has passed.
    const pastDate = writesADate(words) && Boolean(toDay && toDay <= now);
    upcomingOnly = chosenIds.length < 2 && !pointsAtPast(words) && !pastDate;
    const from = upcomingOnly ? (fromDay && fromDay > now ? fromDay : now) : fromDay;
    const to = upcomingOnly && toDay && toDay <= now ? null : toDay;
    if (upcomingOnly) emitTrace({ from, partId: part.localId, to, type: "functions.upcoming_only" });
    hard = (candidate) => {
      const at = (candidate as EventCandidate).startsAt;
      if ((from || to) && !at) return true;
      if (from && at! < from) return false;
      if (to && at! >= to) return false;
      return true;
    };
    for (const candidate of candidates) {
      const item = candidate as EventCandidate;
      // AG14: a time that is left out ("不要晚上的") removes candidates; it is not a reason said next to the ones kept
      // (a morning event was labelled "晚上" because it met the exclusion).
      if (item.startsAt && time.length) reasons.set(item.id, time.filter((preference) => !preference.exclude).map((preference) => (preferenceMet(preference, item.startsAt!, timeZone) ? say.timeWords(preference, language) : null)).filter(Boolean).join("、"));
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
  // AG21c (decision D8): a saved rule that leaves a topic out removes the candidates whose own words name it.
  const ruledOutBy = new Map<string, number>();
  if (saved.ruledOut?.length) {
    const own = hard;
    const textOf = (candidate: Candidate) => (domain === "event" ? `${(candidate as EventCandidate).title} ${(candidate as EventCandidate).topics ?? ""}` : domain === "contact" ? [(candidate as ContactCandidate).company, (candidate as ContactCandidate).role, (candidate as ContactCandidate).industry, ...(candidate as ContactCandidate).tags].filter(Boolean).join(" ") : (candidate as TodoCandidate).title).toLowerCase();
    const ruleOf = (candidate: Candidate) => saved.ruledOut!.find((rule) => rule.words.some((word) => textOf(candidate).includes(word.toLowerCase())));
    for (const candidate of candidates) {
      const rule = own(candidate) ? ruleOf(candidate) : undefined;
      if (rule) ruledOutBy.set(rule.entry.memoryId, (ruledOutBy.get(rule.entry.memoryId) ?? 0) + 1);
    }
    hard = (candidate) => own(candidate) && !ruleOf(candidate);
    emitTrace({ partId: part.localId, removed: Object.fromEntries(ruledOutBy), type: "functions.saved_rule_ruled_out" });
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
  // AG14: a topic that came from a saved entry is named with that entry (below), not as a step of its own.
  if (topic && time.length && !topicFromMemory) steps.push(basisMemo ? (language === "en" ? `how closely it relates to the topics of your note "${basisMemo}"` : language === "ja" ? `メモ「${basisMemo}」のテーマにどれだけ合うか` : `和你的笔记「${basisMemo}」的主题有多相关`) : (language === "en" ? `how closely it relates to "${topic}"` : language === "ja" ? `「${topic}」にどれだけ合うか` : `和「${topic}」有多相关`));
  if (history) steps.push(language === "en" ? "follow-ups past due that are not done, then to-dos past their planned day" : language === "ja" ? "期限を過ぎて未完了のフォローアップ、次に予定日を過ぎたタスク" : "已到期没做的跟进、过了计划日的待办");
  if (domain === "todo" && orderField) steps.push(say.fieldOrderWords(orderField, orderDirection, language));
  const removedBy = (preference: TimePreference) => (domain !== "event" ? 0 : candidates.filter((candidate) => hard(candidate)).filter((candidate) => {
    const startsAt = (candidate as EventCandidate).startsAt;
    return Boolean(startsAt) && (preference.exclude ? meetsTime(preference, startsAt!, timeZone) : !meetsTime(preference, startsAt!, timeZone));
  }).length);
  // AG21b (R33): a saved rule (a hard time condition) is named in the lead only when it took something away.
  const idle = new Set(saved.time.filter((item) => item.preference.hard && removedBy(item.preference) === 0).map((item) => item.entry.memoryId));
  const memoryWords = saved.used.filter((item) => !idle.has(item.memoryId)).map((item) => item.content);
  // AE-FN-006: only the related ones, in the order of the field the user named.
  const filterLead = topicAsFilter && orderField ? ({ en: `Only the ${NOUN[domain].en} related to "${topic}", ${say.fieldOrderWords(orderField, orderDirection, "en")}.`, ja: `「${topic}」に関連する${NOUN[domain].ja}だけを、${say.fieldOrderWords(orderField, orderDirection, "ja")}に並べました。`, zh: `只列和「${topic}」相关的${NOUN[domain].zh}，${say.fieldOrderWords(orderField, orderDirection, "zh")}排。` } as const)[language] : null;
  const basisLead = filterLead ?? (useNatural && !listing && !todoNatural
    ? say.rankLead(language, [say.fieldName(natural.field, language)], { history: false, memory: [], natural: true })
    : steps.length || memoryWords.length ? say.rankLead(language, steps, { history, memory: memoryWords, natural: false }) : null);
  // AG14 dev run 2 (AE-MEM-007): a time that is only preferred ("优先周末下午") and that none of the events listed meets is
  // said so right after the basis — the list below is then the other times, never events "that match" the preference.
  const preferred = time.filter((item) => !item.hard && !item.exclude);
  const unmet = domain === "event" && !topic && preferred.length > 0 && result.ordered.length > 0 && !result.ordered.some((item) => item.meetsTime);
  const lead = basisLead && unmet ? `${basisLead}\n${MEMORY_WORDS.noneAtPreferredTime(language, say.timeWords(preferred[0], language))}` : basisLead;
  // Hotfix part 3 (graph/nodes/reasons.ts): asked why, each event's reason is its own themes and the user's note that mentions
  // one; all stay listed by time, one line says which fit. Asked for a next step, each person's line ends with the recorded item.
  let fitText: string | null = null;
  const linkedNotes: RecordView[] = [];
  if (domain === "event" && !topic && asksForReasons(original)) {
    const shown = result.ordered.map((item) => item.candidate as EventCandidate);
    const links = await themeLinks(records.reader, accountScope, [...new Set(shown.flatMap((event) => themesOf(event.topics)))], memoryWords);
    let fitting = 0;
    for (const event of shown) {
      const reason = eventReason(language, themesOf(event.topics), links);
      if (reason) reasons.set(event.id, reason);
      if (themesOf(event.topics).some((theme) => links.has(theme))) fitting += 1;
    }
    fitText = fitLine(language, fitting, shown.length, [...links.keys()]);
    for (const link of links.values()) if (link.note && !linkedNotes.some((view) => view.ref === link.note!.ref)) linkedNotes.push(link.note.view);
    emitTrace({ fitting, linked: [...links.keys()], partId: part.localId, type: "functions.event_reasons" });
  }
  if (domain === "contact" && history && asksForNextStep(original)) {
    const urgency = ["overdue_followup", "overdue_todo", "past_planned", "due_in_period", "planned_in_period"];
    for (const item of result.ordered) {
      const contact = item.candidate as ContactCandidate;
      const first = [...contact.signals].sort((left, right) => urgency.indexOf(left.kind) - urgency.indexOf(right.kind))[0];
      if (first) reasons.set(contact.id, `${reasons.get(contact.id) ?? ""}${reasons.get(contact.id) ? (language === "en" ? "; " : "；") : ""}${nextStepWords(language, first.todo.title)}`);
    }
    emitTrace({ partId: part.localId, people: result.ordered.length, type: "functions.next_steps" });
  }
  const apart = history && upcoming.length ? say.upcomingApartLine(language, upcoming.map((contact) => `${contact.name}${language === "en" ? " — " : "——"}${contact.signals.map((item) => signalWords(item, language, timeZone)).join(language === "en" ? "; " : "；")}`)) : null;
  const written = writeAnswer({ upcoming: upcomingOnly, inScope: domain === "event" ? candidates.filter((candidate) => hard(candidate) && Boolean((candidate as EventCandidate).startsAt)).length : null, apart: apart ?? fitText, basis: topic && !basisMemo && !topicFromMemory ? topic : null, basisMemo, direction: orderDirection, domain, field: orderField, language, lead, now, offerBasis: recommendsEvents && !lead, period: domain === "event" ? { ...(plan.from ? { from: plan.from } : {}), ...(plan.to ? { to: plan.to } : {}) } : null, reasons, result, timeZone, within: withinWords });
  // AG12 run-03 (AE-FN-003 R4): beside a ranking that says its basis, the ways of ordering it again as clickable entries (the
  // same options as the basis question; the clients show entries already). A click ranks again by it; it asks nothing.
  if (lead && !optionSets.some((set) => set.partId === part.localId && set.purpose === "ranking" && set.kind === "entry")) {
    // run-03 repair 2: not the ordering this answer already applied.
    const applied = new Set<string>([...(history ? ["overdue"] : []), ...(orderField ? [orderField] : []), ...(time.length ? ["weekend"] : []), ...(topic ? ["topic"] : [])]);
    const keys = orderingsOf(domain).filter((key) => !applied.has(key));
    if (keys.length) {
      const clarificationId = setIdOf(input.requestId, part.localId, "e");
      optionSets.push({ clarificationId, kind: "entry", options: keys.map((key, index) => ({ capabilities: [...part.capabilities], capability: "fn.rank", optionId: `o${index + 1}`, refId: key, refType: "ranking" })), partId: part.localId, purpose: "ranking", state: "open", subgoal: `entry:${input.requestId}:${part.localId}` });
      run.optionLabels.set(clarificationId, new Map(keys.map((key, index) => [`o${index + 1}`, { label: say.orderingLabel(key, language) }])));
      emitTrace({ clarificationId, options: keys.length, partId: part.localId, purpose: "ranking", type: "clarify.entry_offered" });
    }
  }
  if (result.semantic && result.matched) run.topicMatched = true;
  // AG14 dev run 2: when none meets the preferred time, the count line says how many there are in the period, not how
  // many "match" — in the text and in the blocks alike (AG19: answer.text and answer.blocks change together).
  const coverage = written.countLine ?? say.coverageLine(language, result.ordered.length, result.matching, { en: UNIT[domain].en, ja: UNIT[domain].ja, zh: UNIT[domain].zh });
  const periodCount = MEMORY_WORDS.periodCount(language, result.ordered.length, result.matching, UNIT[domain][language]);
  const answerText = unmet ? written.text.replace(coverage, periodCount) : written.text;
  const answerBlocks = unmet ? replaceInBlocks(written.blocks, coverage, periodCount) : written.blocks;
  run.answers.set(part.localId, answerText);
  run.answerBlocks.set(part.localId, answerBlocks);
  // AG14 UI (approved draft board 5, D4–D6; 设计稿 §6 "旁边可改"): the entries this ranking used are named in chips at the
  // start of the answer, each with 「修改 ›」 to the entry in settings — they replace the old "where to change" line. A
  // saved rule is named only when it took candidates away; an entry this turn's words overruled reads "只这一次".
  const timeIds = new Set(saved.time.map((item) => item.entry.memoryId));
  const topicOf = (entry: RecalledMemory) => (timeIds.has(entry.memoryId) ? null : topicOfEntry(entry));
  run.memoryUse.push(...memoryChipsOf({
    language,
    other: saved.used.filter((entry) => !timeIds.has(entry.memoryId) && !topicOf(entry)),
    overruled: saved.overruled.map((entry) => {
      const preference = timePreferenceOfEntry(entry);
      // A preferred time by its time words ("周末上午"); a rule that leaves something out by its own words.
      return { entry, label: preference && !preference.exclude && !preference.hard ? say.timeWords(preference, language) : preference ? entry.content : topicOfEntry(entry) ?? entry.content };
    }),
    time: saved.time.map((item) => ({ entry: item.entry, preference: item.preference, removed: item.preference.hard ? removedBy(item.preference) : 0 })),
    topics: saved.used.flatMap((entry) => { const topic = topicOf(entry); return topic ? [{ entry, topic }] : []; }),
    unclear: saved.unclear,
    ruledOut: (saved.ruledOut ?? []).map((rule) => ({ entry: rule.entry, removed: ruledOutBy.get(rule.entry.memoryId) ?? 0, words: rule.words })),
  }).filter((chip) => !run.memoryUse.some((item) => item.memoryId === chip.memoryId)));
  // AG14: what this ranking used, by reference, for the session ("为什么排第一", "这次看……").
  run.memory.ranking = {
    at: now,
    domain,
    listed: result.ordered.slice(0, 10).map((item) => item.candidate.ref),
    memories: saved.used.map((item) => ({ memoryId: item.memoryId, revision: item.revision })),
    requestId: input.requestId,
    topic: Boolean(topic),
    turnBasis: Boolean(turnTime) || (Boolean(topic) && !topicFromMemory),
    ...(plan.count ?? rank.count ? { count: plan.count ?? rank.count } : {}),
    ...(plan.from ? { from: plan.from } : {}),
    ...(plan.to ? { to: plan.to } : {}),
  };
  part.route = "read";
  part.status = "answered";
  part.reason = null;
  part.waitReason = null;
  const said = history ? [...result.ordered.map((item) => item.candidate as ContactCandidate), ...upcoming] : [];
  const signalRefs = history ? [...new Set(said.flatMap((item) => item.signals.map((signalItem) => signalItem.todo.ref)))] : [];
  part.cites = [...written.cites, ...upcoming.map((item) => item.ref), ...signalRefs, ...(basisRef && basisMemo ? [basisRef] : []), ...linkedNotes.map((view) => view.ref)];
  // Hotfix part 3: the notes a reason names are records of this answer (small cards under it).
  for (const view of linkedNotes) {
    run.recordCards.set(view.ref, recordOfView(view, { language, now, timeZone }));
    run.readNames.set(view.id, { name: String(view.fields.title ?? ""), type: "memo" });
    const source = readSourceOf(view, timeZone);
    if (source) run.readSources.set(view.ref, source);
  }
  part.reads = [...result.ordered.map((item) => ({ ref: item.candidate.view.ref, version: item.candidate.view.version })), ...upcoming.map((item) => ({ ref: item.view.ref, version: item.view.version })), ...signalRefs.map((ref) => ({ ref, version: "" }))];
  part.coverage = [{ complete: result.coverage.truncated === 0, kind: domain, pagesRead: Math.max(1, Math.ceil(result.coverage.total / PAGE)), seen: result.semantic && result.matched ? result.coverage.judged : result.ordered.length, total: result.matching }];
  part.gaps = [];
  for (const item of [...result.ordered.map((entry) => entry.candidate), ...(domain === "event" ? result.untimed : []), ...upcoming]) {
    const source = readSourceOf(item.view, timeZone);
    if (source) run.readSources.set(item.view.ref, source);
    // AG19: a record named beside the list (time not announced, coming up later) gets a small card under the answer.
    run.recordCards.set(item.view.ref, recordOfView(item.view, { language, now, timeZone }));
    run.readNames.set(item.view.id, { name: domain === "contact" ? (item as ContactCandidate).name : domain === "event" ? (item as EventCandidate).title : (item as TodoCandidate).title, type: domain });
  }
  emitTrace({ coverage: result.coverage, domain, listed: result.ordered.map((item) => item.candidate.ref), matched: result.matched, partId: part.localId, semantic: result.semantic, type: "functions.ranked", unmatchedReason: result.unmatchedReason, untimed: result.untimed.map((item) => item.ref) });
  emitTrace({ basis: { field: orderField, history, memory: saved.used.map((item) => item.memoryId), natural: useNatural, time: time.length, topic: Boolean(topic) }, listed: result.ordered.map((item) => item.candidate.ref), partId: part.localId, rejected: result.rejected, type: "fn.rank", ...(history ? { upcoming: upcoming.map((item) => item.ref) } : {}), untimed: result.untimed.map((item) => item.ref) });
}

function preferenceMet(preference: TimePreference, startsAt: string, timeZone: string): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone, weekday: "short" }).formatToParts(new Date(startsAt)).map((part) => [part.type, part.value]));
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const hour = Number(parts.hour);
  const days = (!preference.days || (preference.days === "weekend" ? weekend : !weekend)) && (!preference.weekdays?.length || preference.weekdays.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday)));
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
  // AG10 run-02 (AE-RD-008 a): only an ambiguous "整理" is restated, in the user's own words; "总结/summarize" asked for a summary.
  const quote = input.message.slice(part.quote[0], part.quote[1]);
  const organized = quote.match(ORGANIZE_WORDS)?.[0];
  if (organized && !SUMMARY_ASKED.test(quote)) run.leadLines.set(part.localId, say.summaryLead(language, organized));
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
  // The records chosen for a comparison: this part's bound events, else this turn's @ events.
  const ids = kind === "compare" ? [...new Set([...part.refs.filter((ref) => ref.entity === "event" && ref.recordId).map((ref) => ref.recordId!), ...run.references.filter((reference) => reference.type === "event" && reference.accessible !== false).map((reference) => reference.id)])] : [];
  // AG11 (AE-REF-002): events the user picked are read by their ids, not by listing every event of the deployment.
  const all = ids.length && deps.records!.eventsByIds ? await deps.records!.eventsByIds(ids) : deps.records!.listEvents ? await deps.records!.listEvents() : [];
  const visible = all.filter((event) => visibleEvent(event, input.actorId) && !evalDeniedReads().has(event.eventId)).map(eventCandidate);
  let written: { text: string; cites: string[] };
  let shown: EventCandidate[];
  if (kind === "compare") {
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

async function existingTodosFrom(records: AgentRecordAccess, scope: DomainScope, memoId: string, contactIds: readonly string[] = []): Promise<ExistingTodo[]> {
  const of = (row: { id: string; payload: Record<string, unknown> }): ExistingTodo => {
    const task = row.payload.task as Record<string, unknown>;
    return { contactId: str(task.relatedContactId), dueAt: str(task.dueAt), id: row.id, notes: str(task.notes), plannedDate: str(task.plannedDate), ref: `todo:${row.id}`, sourceNoteId: str(task.sourceNoteId), status: str(task.status) ?? "open", title: String(task.title ?? "") };
  };
  const base = { accountId: scope.accountId, workspaceId: scope.workspaceId };
  const excludes = [{ path: ["task", "status"], values: ["deleted", "cancelled"] }];
  const rows = await readAll(records, base, { collection: "tasks", denied: [...evalDeniedReads()], equals: [{ paths: [["task", "sourceNoteId"]], value: memoId }], excludes, order: { direction: "asc", paths: [["task", "createdAt"]] } });
  const out = rows.map(of);
  // AG20a R11 (§3.5 "代码查当前 Todo 和来源关联"): the to-dos about the note's people, made by hand or from elsewhere, too.
  for (const contactId of contactIds.slice(0, 5)) {
    const about = await readAll(records, base, { collection: "tasks", denied: [...evalDeniedReads()], equals: [{ paths: [["task", "relatedContactId"]], value: contactId }], excludes, order: { direction: "asc", paths: [["task", "createdAt"]] } }).catch(() => []);
    for (const row of about) if (!out.some((todo) => todo.id === row.id)) out.push(of(row));
  }
  return out;
}

/** AG20a R18: an explicit request for a to-do ("建一条待办", "add a to-do", "ToDoに追加"). */
const CREATE_TODO_ASK = /((?:建|新建|加|添加|创建|记)(?:一?[条个])?(?:待办|提醒|任务)|(?:待办|任务)(?:里|中)?(?:加|添)|\b(?:add|create|make|set up)\b[^.?!]{0,20}\b(?:to-?do|task|reminder)\b|(?:ToDo|TODO|タスク|リマインダー)(?:に|を)?(?:追加|作成|作って|入れて))/iu;
/** AG20a R18: words of following up on what someone else said they would do. */
const CHASE_WORDS = /(跟进|催|追一下|追问|确认一下|提醒我|问问|\bchase\b|\bfollow(?:\s|-)?up\b|\bcheck (?:in|on|back)\b|\bremind me\b|\bnudge\b|フォロー|催促|確認|リマインド)/iu;
const OTHER_PROMISE = /(答应|承诺|说好|说会|保证|约定|promised|said (?:she|he|they)(?:'d| would)|will send|約束|送ると)/iu;

/**
 * AG20a R18 (设计稿 §3.2, §3.5; TP-FN-003): a to-do about what the other person promised, asked for in so many words
 * ("帮我建一条待办，周二跟进 Dana 答应的报价单"). The design separates whose promise it is; it does not forbid a to-do about the
 * other side's. Code writes the title ("跟进 <name>：<their action>"); the day is the one the user said this turn.
 */
const SELF_PROMISE = /(?:我|自己|\bI\b|私が?)\s*(?:答应|承诺|说好|保证|promised|約束)/iu;

export function asksTodoAboutOthersPromise(quote: string): boolean {
  // AG21b (R30): "盯一下" chases too, and words that take the date from what they said point at their promise.
  return CREATE_TODO_ASK.test(quote) && !SELF_PROMISE.test(quote) && (CHASE_WORDS.test(quote) || OTHER_PROMISE.test(quote) || /盯(?:一下|着|紧)/u.test(quote) || usesPromisedDate(quote));
}

/**
 * AG21b (R30): this turn's words point at the promise's own date ("截止就按他说的", "按她答应的时间", "due when he said",
 * "相手の期限で"): the to-do takes the deadline (and planned day) the extraction read from the promise. Without such words
 * the day is never guessed from their deadline.
 */
const PROMISED_DATE = /(按(?:照)?(?:他|她|对方|他们|她们|人家)?(?:说|讲|答应|承诺|约)的(?:时间|日期|日子|期限|截止|那天)?(?:来|定|算|走)?|(?:截止|期限|日期|时间)(?:就|也)?(?:按|跟|照|用)(?:他|她|对方|他们)?(?:说|讲|答应|承诺)?的|跟(?:他|她|对方)说的(?:一样|一致)|\bdue (?:when|by the date) (?:he|she|they) (?:said|promised)\b|\b(?:their|his|her) (?:own )?(?:deadline|date)\b|\bthe date (?:he|she|they) (?:gave|said|promised)\b|相手の(?:期限|日付|締め切り|締切)|(?:彼|彼女|先方)の(?:言った|約束した)?(?:期限|日付|締め切り|締切|日))/iu;
export function usesPromisedDate(quote: string): boolean {
  return PROMISED_DATE.test(quote);
}

function chaseTitle(language: "zh" | "ja" | "en", name: string | null, action: string): string {
  if (language === "en") return `Follow up${name ? ` with ${name}` : ""}: ${action}`;
  if (language === "ja") return `${name ? `${name}さんに` : ""}フォロー：${action}`;
  return `跟进${name ? ` ${name}` : ""}：${action}`;
}

/** AG21b (R31): an occasion as listed and offered: who, the day, how, and its sentence. */
function occasionLabel(occasion: InteractionGroup, sentence: string, language: "zh" | "ja" | "en"): string {
  const who = occasion.contacts.map((contact) => contact.name).join(language === "en" ? ", " : "、");
  return `${who}，${say.dayWordsOf(occasion.occurredOn, language)}，${say.howWords(occasion.channel, occasion.direction, language)} ${say.sentenceQuote(language, sentence)}`.replace(/，/gu, language === "en" ? ", " : "，").trim();
}

/** AG21b (R31): the memo.update for one occasion (all its people), or what is already recorded / in conflict. */
function occasionIntent(part: GraphPart, memo: MemoForExtraction, memoName: string, contacts: readonly LinkedContact[], occasion: InteractionGroup, sentence: string, language: "zh" | "ja" | "en"): { intent: (CardOperationIntent & { localId: string }) | null; lines: string[] } {
  const who = occasion.contacts.map((contact) => contact.name).join(language === "en" ? ", " : "、");
  const interaction: NoteInteractionContract = { actualContactIds: occasion.contacts.map((contact) => contact.id), channel: occasion.channel, direction: occasion.direction, occurredOn: occasion.occurredOn, precision: "day" } as NoteInteractionContract;
  const link = linkInteraction(memo.interaction as NoteInteractionContract | null, interaction);
  emitTrace({ link: link.kind, memo: memo.ref, partId: part.localId, people: interaction.actualContactIds.length, type: "functions.link_back" });
  if (link.kind === "recorded") return { intent: null, lines: [say.recordedLine(language, who, occasion.occurredOn, say.howWords(occasion.channel, occasion.direction, language), memoName)] };
  if (link.kind === "conflict") return { intent: null, lines: [say.conflictLine(language, memo.title, `${link.existing.occurredOn ?? ""} ${say.howWords(link.existing.channel, link.existing.direction, language)}`, `${occasion.occurredOn} ${say.howWords(occasion.channel, occasion.direction, language)}`)] };
  const names = Object.fromEntries(contacts.map((contact) => [contact.id, contact.name]));
  return {
    intent: { capability: "memo.update", expectedVersion: memo.version, localId: `${part.localId}-i1`, partId: part.localId, set: { interaction }, shown: { before: (memo.interaction as NoteInteractionContract | null) ?? null, contactIds: [...memo.contactIds], names, sentence, title: memoName }, targetId: memo.id },
    lines: [`${say.HEADINGS.interactions[language]}${language === "en" ? ":" : "："} ${occasionLabel(occasion, sentence, language)}`],
  };
}

/**
 * AG21b (R31): the interactions not written, with their reason. A person the note names but does not link is looked up
 * among the account's contacts: when one has that name, the line offers it (link them on the note first) — never picks it.
 */
async function notLinkedLinesOf(records: AgentRecordAccess, scope: DomainScope, items: readonly { contact: LinkedContact | null; clue: string; reason: string | null }[], language: "zh" | "ja" | "en"): Promise<string[]> {
  const out: string[] = [];
  for (const item of items) {
    let line = `- ${item.contact?.name ?? item.clue}${language === "en" ? ": " : "："}${say.WHY_NOT[(item.reason ?? "unsure") as keyof typeof say.WHY_NOT][language]}`;
    if (item.reason === "not_linked" && item.clue.trim()) {
      const found = (await records.reader.read("contact", scope, { limit: 5, text: item.clue.trim() }).catch(() => ({ items: [] as RecordView[] }))).items
        .map((view) => ({ id: view.id, name: str((view.fields as Record<string, unknown>).displayName) ?? "", organization: str((view.fields as Record<string, unknown>).company) ?? "" }))
        .filter((contact) => contact.name && contactOfClue(item.clue.trim(), [{ id: contact.id, name: contact.name }]));
      if (found.length) {
        const shown = found.slice(0, 2).map((contact) => (contact.organization ? (language === "en" ? `${contact.name} (${contact.organization})` : `${contact.name}（${contact.organization}）`) : contact.name)).join(language === "en" ? " or " : "、");
        line += ({ en: `. Your contacts have ${shown}; to record this one, link them to the note first.`, ja: `。連絡先に${shown}がいます。このやり取りを記録するには、先にメモに紐づけてください。`, zh: `。联系人里有${shown}；要记这次，先把他关联到这篇笔记。` } as const)[language];
      }
    }
    out.push(line);
  }
  return out;
}

async function extractPart(scope: NodeScope, state: AgentGraphState, part: GraphPart, task: Extract<FunctionTask, { kind: "extract" }>, round: { budget: AgentGraphState["budget"]; repairs: number }, optionSets: OptionSetState[]): Promise<{ budget: AgentGraphState["budget"]; repairs: number }> {
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
  // AG21b (R31): the occasion picked among those offered (a typed reply, or a click on the question): its card, from the
  // ids the option kept and the memo as it is now — no second extraction. Its people must still be linked to the note.
  const pickedSet = state.optionSets.find((set) => set.partId === part.localId && set.purpose === "interaction" && set.selectedOptionId);
  const pickId = task.pick ?? pickedSet?.options.find((option) => option.optionId === pickedSet.selectedOptionId)?.refId;
  const picked = pickId ? interactionOfOption(pickId) : null;
  if (task.write && picked && picked.memoId === memo.id && picked.contactIds.every((id) => contacts.some((contact) => contact.id === id))) {
    const sentences = splitSentences(memo.body);
    const occasion: InteractionGroup = { channel: picked.channel, contacts: picked.contactIds.map((id) => contacts.find((contact) => contact.id === id)!), direction: picked.direction, occurredOn: picked.occurredOn, sentenceIds: picked.sentenceIds };
    const made = occasionIntent(part, memo, memoName, contacts, occasion, picked.sentenceIds.map((id) => sentences.find((sentence) => sentence.id === id)?.text ?? "").join(" ").trim(), language);
    part.reads = [{ ref: view.ref, version: String(memo.version) }];
    part.cites = [view.ref];
    part.coverage = [{ complete: true, kind: "memo", pagesRead: 1, seen: 1, total: 1 }];
    part.gaps = [];
    part.route = "propose_write";
    emitTrace({ memo: memo.ref, partId: part.localId, type: "functions.interaction_picked" });
    if (made.intent) {
      run.presetIntents.set(part.localId, [made.intent]);
      part.write = { intents: [], picks: {} };
      run.leadLines.set(part.localId, [say.memoHead(language, ownTitle, memoDay), ...made.lines].join("\n"));
      part.status = "unfinished";
      part.reason = "proposing";
    } else {
      part.status = "unfinished";
      part.reason = "nothing_to_write";
      run.writeLines.set(part.localId, [say.memoHead(language, ownTitle, memoDay), ...made.lines].join("\n"));
    }
    return round;
  }
  // The people the user asked about ("我和小林的往来"): only these may be written.
  const focus = part.refs.filter((ref) => ref.entity === "contact").map((ref) => (ref.recordId && contacts.some((contact) => contact.id === ref.recordId) ? contacts.find((contact) => contact.id === ref.recordId)! : contactOfClue((clueWords(input.message, ref) ?? "").replace(/^@/u, ""), contacts))).filter((contact): contact is LinkedContact => Boolean(contact)).map((contact) => contact.id);
  const budget = { ...round.budget };
  const result = await extractFromMemo({ budget, contacts, fetchImplementation: deps.fetchImplementation, focus, judgment: deps.judgment, judgmentBudget: run.judgment, language, memo, quote, repairs: round.repairs, requestId: input.requestId, timeZone, want: task.want });
  part.reads = [{ ref: view.ref, version: String(memo.version) }];
  part.cites = [view.ref];
  part.coverage = [{ complete: true, kind: "memo", pagesRead: 1, seen: 1, total: 1 }];
  part.gaps = [];
  if (!result.ok) {
    // AG10 run-03 (AE-FN-009 R3): the memo already holds an interaction with the people asked about (an earlier card wrote
    // it): the failure line says where it is recorded; the memo stays cited so it can be opened.
    const held = memo.interaction as NoteInteractionContract | null;
    const heldWith = held?.occurredOn ? (held.actualContactIds ?? []).filter((id) => !focus.length || focus.includes(id)) : [];
    if (task.want.interactions && held && heldWith.length) {
      const who = heldWith.map((id) => contacts.find((contact) => contact.id === id)?.name ?? "").filter(Boolean).join(language === "en" ? ", " : "、");
      settle("unfinished", result.failure === "budget" ? "budget" : "model_error", say.recordedButFailedLine(language, who, held.occurredOn, say.howWords(held.channel, held.direction, language), memoName));
      return { budget, repairs: result.repairs };
    }
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
    // AG21c (R46): each person once, in the group that decided their row — one in real contact is never listed again as
    // "between others" either.
    const counted = new Set(happened.map((item) => item.contact?.id).filter(Boolean));
    const repeated = (item: (typeof others)[number]) => Boolean(item.contact && (counted.has(item.contact.id) || (item.reason !== "unsure" && inContact.has(item.contact.id))));
    if (!task.write || !happened.length) {
      const listed = task.write ? happened : [...happened, ...doubtfulOnes];
      if (listed.length) {
        lines.push(`${say.HEADINGS.interactions[language]}${language === "en" ? ":" : "："}`);
        for (const item of listed) lines.push(`- ${nameOf(item.contact, item.clue)}，${item.occurredOn ? say.dayWordsOf(item.occurredOn, language) : ""}，${say.howWords(item.channel, item.direction, language)}${item.writable ? "" : (language === "en" ? " (doubtful: the review was not sure)" : language === "ja" ? "（要確認：確認で確信が持てませんでした）" : "（存疑：复核没有把握）")} ${say.sentenceQuote(language, sentenceOf(item.sentenceIds))}`.replace(/，/gu, language === "en" ? ", " : "，"));
      }
      // AG13 rerun of AG10 (AE-FN-009): with the review unavailable (timeout) a doubtful contact is not "no interaction".
      if (!happened.length && doubtfulOnes.length && result.judgment?.unavailable) {
        emitTrace({ type: "functions.review_unavailable_said", unavailable: result.judgment.unavailable });
        lines.push(say.reviewUnavailableLine(language));
      } else if (!happened.length && (task.write || !doubtfulOnes.length)) lines.push(say.noInteractionLine(language));
      const notCounted = (task.write ? others : others.filter((item) => item.reason !== "unsure")).filter((item) => !repeated(item));
      if (notCounted.length) {
        lines.push(`${say.HEADINGS.notInteractions[language]}${language === "en" ? ":" : "："}`);
        for (const item of notCounted) lines.push(`- ${say.quoted(language, sentenceOf(item.sentenceIds))}${language === "en" ? " — " : "——"}${nameOf(item.contact, item.clue)}${language === "en" ? ": " : "："}${say.WHY_NOT[item.reason ?? "unsure"][language]}`);
      }
    } else {
      // One memo holds one interaction (附录 E), which takes several people. AG21b (R31): the interactions of one occasion
      // (same sentence, day and channel) are one interaction with all their contacts; several occasions are a registered
      // question with one option per occasion (a reply naming one, or a click, goes on with it); none is merged.
      const occasions = groupInteractions(happened);
      const notCounted = others.filter((item) => item.reason !== "not_asked_about" && !repeated(item));
      const notLinkedLines = await notLinkedLinesOf(records, accountScope, notCounted, language);
      if (occasions.length > 1) {
        const labels = occasions.map((occasion) => occasionLabel(occasion, sentenceOf(occasion.sentenceIds), language));
        lines.push(`${say.HEADINGS.interactions[language]}${language === "en" ? ":" : "："}`);
        for (const label of labels) lines.push(`- ${label}`);
        if (notCounted.length) {
          lines.push(`${say.HEADINGS.notInteractions[language]}${language === "en" ? ":" : "："}`);
          lines.push(...notLinkedLines);
        }
        lines.push({ en: "A note records one interaction; which one should it record?", ja: "1つのメモに記録できるやり取りは1件です。どれを記録しますか？", zh: "一篇笔记只能记一次往来，要记哪一次？" }[language]);
        const clarificationId = setIdOf(input.requestId, part.localId, "q");
        const set: OptionSetState = { asks: "object", clarificationId, kind: "question", options: occasions.map((occasion, index) => ({ capabilities: [...part.capabilities], capability: "memo.update", optionId: `o${index + 1}`, refId: interactionOptionId(memo.id, occasion), refType: "interaction" })), partId: part.localId, purpose: "interaction", state: "open", subgoal: `clarification:${input.requestId}:${part.localId}` };
        optionSets.push(set);
        run.optionLabels.set(clarificationId, new Map(labels.map((label, index) => [`o${index + 1}`, { label }])));
        run.questionLines.set(part.localId, lines.join("\n"));
        part.cites = [view.ref, ...extraCites];
        part.route = "propose_write";
        part.status = "awaiting_clarification";
        part.waitReason = "object_ambiguous";
        part.reason = null;
        part.asked += 1;
        emitTrace({ clarificationId, kind: "question", options: occasions.length, partId: part.localId, question: "which_interaction", subgoal: set.subgoal, type: "clarify.asked" });
        return { budget, repairs: result.repairs };
      }
      const made = occasionIntent(part, memo, memoName, contacts, occasions[0], sentenceOf(occasions[0].sentenceIds), language);
      lines.push(...made.lines);
      if (made.intent) intents.push(made.intent);
      if (notCounted.length) {
        lines.push(`${say.HEADINGS.notInteractions[language]}${language === "en" ? ":" : "："}`);
        lines.push(...notLinkedLines);
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
      // AG20a R18: no promise of the user's, and the words ask for a to-do about the other side's: those become the items.
      const theirs = !writable.length && asksTodoAboutOthersPromise(quote) ? result.followUps.filter((item) => item.owner === "other" && (!focus.length || !item.contact || focus.includes(item.contact.id))) : [];
      const existing = writable.length ? await existingTodosFrom(records, accountScope, memo.id, contacts.map((contact) => contact.id)) : [];
      for (const todo of existing) {
        extraCites.push(todo.ref);
        run.readSources.set(todo.ref, { id: todo.id, kind: "todo", title: todo.title } as never);
        run.readNames.set(todo.id, { name: todo.title, type: "todo" });
      }
      let n = 0;
      const carded: (typeof result.followUps)[number][] = [];
      for (const item of writable) {
        const sentence = sentenceOf(item.sentenceIds);
        const link = linkFollowUp({ action: item.action, contactId: item.contact?.id ?? null, dueDate: item.dueDate, plannedDate: item.plannedDate, sentence }, existing, (instant) => localDay(instant, timeZone));
        emitTrace({ action: item.action, link: link.kind, partId: part.localId, todo: link.kind === "new" ? null : link.todo.ref, type: "functions.link_back" });
        if (link.kind === "same") {
          const when = link.todo.dueAt ? say.dueWords(language, localDay(link.todo.dueAt, timeZone), null) : link.todo.plannedDate ? say.plannedWords(language, link.todo.plannedDate, null) : null;
          lines.push(say.existingTodoLine(language, link.todo.title, link.todo.status, when));
          continue;
        }
        if (link.kind === "differs") {
          const changes = link.differences.map((what) => (what === "dueDate" ? ({ en: `the note says ${say.dueWords(language, item.dueDate, item.dueText)}`, ja: `メモでは${say.dueWords(language, item.dueDate, item.dueText)}`, zh: `笔记里写的是${say.dueWords(language, item.dueDate, item.dueText)}` } as const)[language] : ({ en: `the note says ${say.plannedWords(language, item.plannedDate, item.plannedText)}`, ja: `メモでは${say.plannedWords(language, item.plannedDate, item.plannedText)}`, zh: `笔记里写的是${say.plannedWords(language, item.plannedDate, item.plannedText)}` } as const)[language]));
          lines.push(say.differsLine(language, link.todo.title, changes, link.todo.sourceNoteId === memo.id ? undefined : { status: link.todo.status }));
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
      if (theirs.length) {
        // The day the user said for following up (this turn's words); none said: no day, never their deadline guessed as one.
        const said = part.refs.reduce((text, ref) => { const named = ref.entity === "memo" ? clueWords(input.message, ref) : null; return named ? text.split(named).join(" ") : text; }, quote);
        const day = resolveSaidDate(said, state.asOf || deps.now(), timeZone)?.day ?? null;
        // AG21b (R30): "截止就按他说的": their promise's own deadline (and planned day) is the to-do's.
        const theirDate = usesPromisedDate(quote);
        for (const item of theirs) {
          n += 1;
          const sentence = sentenceOf(item.sentenceIds);
          const names = item.contact ? { [item.contact.id]: item.contact.name } : {};
          const dueAt = theirDate && item.dueDate ? instantAt(item.dueDate, item.dueTime ?? "23:59", timeZone) : null;
          const plannedDate = day ?? (theirDate ? item.plannedDate ?? null : null);
          if (theirDate) emitTrace({ dueAt, item: item.key, partId: part.localId, type: "functions.promised_date_used" });
          intents.push({
            capability: "todo.create",
            localId: `${part.localId}-f${n}`,
            partId: part.localId,
            set: { dueAt, notes: `${say.quoted(language, sentence)}（${memoName}）`, plannedDate, ...(item.contact ? { relatedContactIds: [item.contact.id] } : {}), sourceNoteId: memo.id, sourceNoteVersion: memo.version, title: chaseTitle(language, item.contact?.name ?? item.aboutClue, item.action) },
            shown: { ...(dueAt ? { dueDayOnly: !item.dueTime } : {}), names, sentence, sourceTitle: memoName },
          });
        }
        emitTrace({ items: theirs.map((item) => item.key), partId: part.localId, type: "functions.todo_for_others_promise" });
        lines.push(`${say.HEADINGS.otherPromises[language]}${language === "en" ? ":" : "："}`);
        for (const item of theirs) lines.push(describe(item));
      }
      const doubtful = result.followUps.filter((item) => item.owner === "doubtful");
      if (doubtful.length) {
        lines.push(`${say.HEADINGS.doubtfulPromise[language]}${language === "en" ? ":" : "："}`);
        for (const item of doubtful) lines.push(describe(item));
      }
      if (!writable.length && !doubtful.length && !theirs.length) lines.push(say.nothingToAddLine(language));
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
  // A write the first layer routed as a read (deliverable change, the words ask for it) goes to the card step like any write.
  part.route = "propose_write";
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
// agent-design AG15: a scheduled rule's period reads and words its candidates exactly as a conversation's ranking does.
export { contactCandidates, contactLine, eventCandidate, eventLine, INDUSTRY_WORDS, openTodos, PLACE_WORDS, visibleEvent };
