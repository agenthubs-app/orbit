// R27 — 参加登録 (5 questions → attendee profile → submit). Owner: 甲 (R27). Used by: events (参加登録, both clients).
// A thin facade over the existing registration routes (adaptive interview, persona, registration / admission application):
// questions are the existing AI interview (≤ 5), answers carry the signed question tokens, and the server keeps per-field
// visibility (2026-11-26: every answer of a new submission, incl. 参加目的 / 会いたい人, is shown to the event's attendees).

import type { HostEventContact } from "./host-events";

export type EventJoinProfileItemKey = "company" | "purpose" | "topics" | "target" | "offer";
/** 资料里有、报名时自动带上的基本项。 */
export type EventJoinPrefilledField = "company" | "title" | "industry";

export interface EventJoinQuestion {
  field: string;
  prompt: string;
  /** Small line under the prompt (「参加者にも表示されます（複数可）」). */
  help?: string | null;
  options: readonly string[];
  multi: boolean;
  /** Max choices when `multi` (「2つまで」). */
  max?: number | null;
  allowCustom: boolean;
  questionToken: string;
  /** Options already in the person's own profile (会いたい人 / 提供できること): shown selected, still changeable. Always a subset of `options`. */
  prefill?: readonly string[];
}

export interface EventJoinAnswer {
  field: string;
  prompt: string;
  /** Multi-select answers are joined with 「 · 」. */
  answer: string;
  questionToken: string;
}

/** `POST /api/events/[id]/join/next` — body `{ answers, more?, focus? }`; `focus` (an item key) asks that one item again although the profile would fill it. */
export interface EventJoinStep {
  /** 1-based index of `question`. */
  index: number;
  total: number;
  remainingMinutes: number;
  done: boolean;
  question?: EventJoinQuestion | null;
}

/** `POST /api/events/[id]/join/profile` — rules only unless `draft` (then the AI persona writes the self-introduction draft). */
export interface EventJoinProfile {
  coverage: number;
  /** `fromProfile`: nobody asked, the answer will be filled from the person's own profile (offering / seeking) — shown as such and changeable (`next` with `focus`). */
  items: readonly { key: EventJoinProfileItemKey; done: boolean; fromProfile?: boolean }[];
  topics: readonly string[];
  /**
   * 2026-11-27：问题页「…はプロフィールから入力済み」只列资料里确实有的项（公司 / 职位 / 行业）。只在新报名的第一次读取和改资料时给；
   * 空数组 = 一项都没有（整行不显示）；缺省 = 没读（旧服务端或资料读不到，同样不显示）。
   */
  prefilledFrom?: readonly EventJoinPrefilledField[];
  selfIntro?: { text: string; source: "ai_draft" | "profile" } | null;
  /** What the draft was written from (「回答（目的・テーマ・会いたい人）とプロフィール（…）から作成。」). */
  selfIntroBasis?: string | null;
  /** Profile edits allowed until (「申込後も 10/6 まで編集できます」). */
  editableUntil?: string | null;
  /** Organizer review deadline (「審査 〜10/3」), when the event is screened. */
  reviewUntil?: string | null;
  review: boolean;
  /**
   * 2026-11-27 用户新增：主办方开了「已加群的报名自动通过」（审核制活动才有）。true = 确认页必须先答「是否已联系主办方报名并加入微信群？」
   * （不占 5 题、不走 AI）；改资料（edit）时只有审核中的人会问（选「已加群」同样自动通过），其他状态缺省。旧客户端不认这个字段 = 不问 = 照旧进审核。
   */
  wechatCheck?: boolean;
  /** 只在 `wechatCheck` 时给：选「还没有」时就地显示的主办方联系方式（null = 主办方没填）。 */
  hostContact?: HostEventContact | null;
}

/** 确认页那道必答题的回答（submit 的 `wechatJoined`）：已加群 / 还没有。 */
export type EventJoinWechatAnswer = "joined" | "not_yet";

/**
 * `GET /api/events/[id]/join/current` — read before anything is asked: am I already registered, may I still change it, and what
 * I answered last time. Registered / in review / waitlisted people start on the review with these answers (nothing is asked
 * again, no AI); each answer carries its question so it can be changed alone, and a fresh `questionToken`.
 */
export interface EventJoinCurrent {
  status: "none" | "registered" | "pending_review" | "waitlisted" | "rejected" | "cancelled";
  /** Why it cannot be changed (same codes as `join/submit`); null = it can, or this is a new registration. */
  blocked: "JOIN_CLOSED" | "JOIN_LOCKED" | "JOIN_REJECTED" | null;
  /** Last answers, in asking order. `item` = which review item it fills (null = another question, shown as its own row). */
  answers: readonly (EventJoinAnswer & { item: EventJoinProfileItemKey | null; question: EventJoinQuestion })[];
  /** Must be answered before submitting: required organizer questions added since, questions whose options changed, a missing core item. */
  ask: readonly (EventJoinQuestion & { item: EventJoinProfileItemKey | null })[];
  /** The self-introduction confirmed for this event last time; kept unless it is changed. */
  selfIntro: string | null;
}

/**
 * `POST /api/events/[id]/join/submit` — submitting again before registration closes updates the same registration (answers and
 * self-introduction; place, waitlist order and registration time stay). Body `edit: true` = changing an existing registration.
 * Refused with 409 and `context.reason`: JOIN_CLOSED (closed), JOIN_LOCKED (the organizer already decided), JOIN_REJECTED,
 * JOIN_CANCELLED (register again instead).
 */
export interface EventJoinResult {
  eventId: string;
  status: "registered" | "pending_review";
  submittedAt: string;
  reviewUntil?: string | null;
  startsAt: string;
  endsAt?: string | null;
  /** What a calendar entry for this event looks like (older clients offer it with `join/tentative`, which returns the one already written). */
  tentative?: { startsAt: string; endsAt: string; title: string } | null;
  /**
   * 2026-11-27: the calendar entry written automatically on a successful registration (in review = tentative title, confirmed = final
   * title); null = not written (the person removed it before, or the calendar could not be written — offer `join/tentative`).
   * Absent on `edit` submissions. Removed with `DELETE join/tentative`.
   */
  calendar?: { scheduleItemId: string; title: string; final: boolean } | null;
  /** 主催者の連絡先（刚报名成功的人能看；null = 主办方没填）。完成页有 ID 就自动弹窗。 */
  hostContact?: HostEventContact | null;
}

/** `POST /api/events/[id]/join/cancel` — 「参加を取り消す」; the tentative calendar entry is removed too. */
export interface EventJoinCancelResult {
  eventId: string;
  status: "cancelled";
}

/** `DELETE /api/events/[id]/join/tentative` — 「移除」: the entry is deleted and not written again automatically until the person adds it. */
export interface EventJoinCalendarRemoveResult {
  eventId: string;
  removed: true;
}

/**
 * `POST /api/events/[id]/join/tentative` — add the calendar entry (returns the existing one when it is still there); renamed / removed /
 * moved as the registration and the event change.
 */
export interface EventJoinTentativeResult {
  eventId: string;
  scheduleItemId: string;
  title: string;
}
