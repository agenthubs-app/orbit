/**
 * agent-design AG19-6: a question right after a list goes on from that list.
 *
 * The user, 2026-11-19: after "最近有哪些活动适合我？" listed three events, "哪些活动？你觉得有必要参加？为什么？" was split at
 * the question marks into parts that had nothing to do with each other — one turned down as a search of the event
 * directory, one left waiting for it. Code's rule, from the words and the session's list (no model decides it): while the
 * list shown last is still the matter (the session is not idle), a message that asks for an opinion or a choice about
 * records of the list's kind, attaches nothing with @, changes nothing and does not ask for other or newer ones, is one
 * question about that list — read those records again by id and answer from them.
 */
import { asksUpcomingEvents } from "../functions/basis";

export type ListKind = "event" | "contact" | "todo" | "memo" | "schedule";

const KIND_OF: Record<string, ListKind> = { contact: "contact", event: "event", memo: "memo", note: "memo", schedule: "schedule", todo: "todo" };

/** The list's kind as the user would name it. */
const KIND_NOUN: Record<ListKind, RegExp> = {
  contact: /(联系人|聯絡人|人脉|这些人|那些人|哪些人|哪几位|哪位|連絡先|\bcontacts?\b|\bpeople\b|\bwho\b|誰)/iu,
  event: /(活动|活動|イベント|\bevents?\b|哪[一几]?场|这几场|那几场)/iu,
  memo: /(笔记|筆記|メモ|\bnotes?\b)/iu,
  schedule: /(日程|安排|予定|\bschedule\b|\bappointments?\b)/iu,
  todo: /(待办|代办|跟进|タスク|\bto-?dos?\b|\btasks?\b|\bfollow[\s-]?ups?\b)/iu,
};

/** Words that point back at what was just shown. */
const POINTS_BACK = /(这些|那些|这几|那几|它们|他们|她们|上面|以上|刚才|刚刚|其中|里面|当中|\bthese\b|\bthose\b|\bthem\b|\babove\b|\bof them\b|これら|それら|この中|その中|さっきの|上の)/iu;

/** Asking for an opinion, a choice or the reason — a discussion of the list, not a new lookup. */
const OPINION = /(值得|有必要|必要|推荐|建议|该不该|要不要|应不应该|应该|适合|优先|先去|更好|哪个好|哪场好|怎么看|你觉得|你认为|为什么|为啥|理由|\bworth\b|\bshould\b|\brecommend\b|\bwhich\b|\bwhy\b|\bbest\b|\bthink\b|おすすめ|べき|なぜ|どうして|どれが|どう思)/iu;

/** Asking for other or more records than the ones shown: a new lookup. */
const ASKS_OTHERS = /(还有|其他|其它|别的|另外|更多|再找|再列|换一批|\bother\b|\bmore\b|\belse\b|\banother\b|ほかに|他に|別の|もっと)/iu;

/** A period of its own: a day or a range said in words or as a date ("下周", "这个周末", "11月16日", "来週", "next week"). */
const NAMES_PERIOD = /(今天|明天|后天|今晚|明晚|这周|本周|下周|下下周|这个?周末|本周末|下个?周末|这个月|本月|下个?月|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|今日|明日|今週|来週|今月|来月|週末|\btoday\b|\btomorrow\b|\b(?:this|next) (?:week|weekend|month)\b)/iu;

export interface FollowListInput {
  message: string;
  /** The list shown last, in display order (empty when the session was idle or showed none). */
  shown: readonly { type: string; id: string }[];
  /** This turn attached records with @. */
  hasReferences: boolean;
  /** A part of this turn would change a record, or answers an open question. */
  writesOrContinues: boolean;
  /** A part names a person in words (a contact clue that is not a question word or a word for the set). */
  namesPerson: boolean;
}

/** The kind of the list this message goes on from, or null. */
export function followsShownList(input: FollowListInput): ListKind | null {
  if (input.shown.length < 2 || input.hasReferences || input.writesOrContinues) return null;
  const kinds = new Set(input.shown.map((item) => KIND_OF[item.type] ?? null));
  if (kinds.size !== 1) return null;
  const [kind] = [...kinds];
  if (!kind) return null;
  const message = input.message;
  if (kind !== "contact" && input.namesPerson) return null;
  if (!OPINION.test(message)) return null;
  if (!KIND_NOUN[kind].test(message) && !POINTS_BACK.test(message)) return null;
  if (ASKS_OTHERS.test(message)) return null;
  // "最近还有哪些活动值得去" asks what is coming up — a new list; with words that point back ("这些活动最近哪场值得去") it stays.
  if (kind === "event" && asksUpcomingEvents(message) && !POINTS_BACK.test(message)) return null;
  // AG14 merge (AE-SCL-028 in the AG14 stability runs): "下周（11 月 16 日到 22 日）有什么值得去的活动？挑三场。" names its
  // own period: a new lookup over that period (with the saved memory), not a question about the list shown before.
  if (NAMES_PERIOD.test(message) && !POINTS_BACK.test(message)) return null;
  return kind;
}
