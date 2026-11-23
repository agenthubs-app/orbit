// 2026-11-23 活动 › 探す：点卡片先出底部简介面板（docs/designs/redesign-2026-10/event-side-panel-proposal.html ④ M1 / M2 · ② S1–S6 · 字段表）。
// 纯函数：一行列表数据 → 面板要画的块和右边主按钮。列表接口现有字段之外的事实（`EventSummaryExtras`）等 Web 补上；
// 没给时按字段表「没有时」的规则不画那一块，主按钮按能确定的状态退回（招募中 = 参加；已结束 = 关注主办方）。
import type { EventDiscoverRow } from "../../../api/contract/event-discover";
import type { EventRelevance } from "../../../api/contract/event-relevance";
import { relevanceChips, relevanceRows, type RelevanceT } from "./Relevance";
import type { ChipTone } from "../../../components/ui/Chip";
import { tokyo, weekday, hm, monthDaySlash, publicOrganizerName } from "./journey-model";

/** A person shown as an avatar (initial + colour slot). */
export interface EventSummaryPerson { initial: string; name?: string | null }

/** The next edition the organizer has open (S5 「看下一场」 switches the panel to it). */
export type EventSummaryNext = Pick<EventDiscoverRow, "eventId" | "title" | "startsAt" | "href"> & Partial<EventDiscoverRow> & Partial<EventSummaryExtras>;

/**
 * Facts the panel needs that the discover list does not carry yet (2026-11-23; to be added by the Web session).
 * Every field is optional: a missing one hides its block (field table 「没有时」) and never guesses.
 */
export interface EventSummaryExtras {
  /** 活动说明的纯文字（Markdown 已去掉）。 */
  description: string | null;
  /** 地点的地址（第二行）；线上活动不给。 */
  venueAddress: string | null;
  /** 剩余名额（定员 − 已报名）；不限名额 = null。 */
  seatsLeft: number | null;
  /** 报名截止（ISO）。 */
  registrationDeadline: string | null;
  /** 报名能否进行：open / full（满员）/ closed（已截止）/ waitlist（满员但开了候补）。 */
  registrationState: "open" | "full" | "closed" | "waitlist" | null;
  /** 本人：registered = 已报名；attended = 签到过（结束后「你参加了」）。 */
  myStatus: "registered" | "attended" | null;
  /** 名单公开后最多 4 人的头像；未公开 = null。 */
  attendeePreview: readonly EventSummaryPerson[] | null;
  /** 参加过：会场记录里见过的人（同桌、交换）。 */
  metPeople: { count: number; notContacts: number; preview: readonly EventSummaryPerson[] } | null;
  /** 同一主办方最近一场还能报名的活动。 */
  nextEvent: EventSummaryNext | null;
  /** 我是否已关注主办方。 */
  organizerFollowing: boolean | null;
}

export type EventSummaryRow = EventDiscoverRow & Partial<EventSummaryExtras>;

export type EventSummaryState = "open" | "registered" | "full" | "closed" | "waitlist" | "attended" | "missedNext" | "missed";

export type EventSummaryAction =
  | { kind: "register"; href: string }
  | { kind: "myRegistration"; href: string }
  | { kind: "disabled"; reason: "full" | "closed" }
  | { kind: "waitlist"; href: string }
  | { kind: "venueRecord"; href: string }
  | { kind: "nextEvent"; next: EventSummaryNext }
  | { kind: "follow"; organizerId: string | null; following: boolean };

export interface EventSummaryFact { icon: "calendar" | "pin" | "ticket"; main: string; sub: string | null }
export interface EventSummaryRelevance { key: string; tone: ChipTone; chip: string; text: string }

export interface EventSummary {
  eventId: string;
  title: string;
  organizer: string | null;
  organizerInitial: string | null;
  ended: boolean;
  state: EventSummaryState;
  /** 标题下的状态标记（最多 2 个）；招募中且未报名时为空，这一行不画。 */
  marks: readonly { key: "ended" | "registered" | "attended"; tone: "plain" | "teal" }[];
  facts: readonly EventSummaryFact[];
  intro: string | null;
  relevance: readonly EventSummaryRelevance[];
  /** 「参加者」/「你在这场见过的人」：头像（≤4）+ 一句；没有可写的 = null（整块不画）。 */
  people: { title: "attendees" | "met"; preview: readonly EventSummaryPerson[]; text: string } | null;
  next: EventSummaryNext | null;
  detailHref: string;
  action: EventSummaryAction;
}

/** 面板文字（eventsV2.panel*）。 */
export type EventSummaryT = RelevanceT;

const ATTENDEE_COUNT_MIN = 10;
const PREVIEW_MAX = 4;

/** 「11月28日（六）14:00 – 17:30」/ en 「Sat 11/28 · 14:00 – 17:30」（东京时间；句式在 eventsV2.panelWhen）。 */
export function summaryWhen(startsAt: string, endsAt: string | null | undefined, language: string, t: EventSummaryT): string {
  const s = tokyo(startsAt);
  if (!s) return "";
  const end = endsAt ? hm(endsAt) : "";
  const time = `${hm(startsAt)}${end ? ` – ${end}` : ""}`;
  return t("eventsV2.panelWhen", { d: s.day, m: s.month, time, wd: weekday(language, s.weekday) });
}

export function eventEnded(row: Pick<EventDiscoverRow, "startsAt" | "endsAt">, now: number): boolean {
  const end = Date.parse(row.endsAt ?? row.startsAt);
  return Number.isFinite(end) && end <= now;
}

const eventBase = (eventId: string) => `/events/${encodeURIComponent(eventId)}`;

function summaryState(row: EventSummaryRow, ended: boolean): EventSummaryState {
  if (ended) {
    if (row.myStatus === "attended") return "attended";
    return row.nextEvent ? "missedNext" : "missed";
  }
  if (row.myStatus === "registered" || row.myStatus === "attended") return "registered";
  if (row.registrationState === "full" || row.registrationState === "closed" || row.registrationState === "waitlist") return row.registrationState;
  return "open";
}

function summaryAction(row: EventSummaryRow, state: EventSummaryState): EventSummaryAction {
  const base = eventBase(row.eventId);
  switch (state) {
    case "registered": return { kind: "myRegistration", href: `${base}/prep` };
    case "full": case "closed": return { kind: "disabled", reason: state };
    case "waitlist": return { kind: "waitlist", href: `${base}/register` };
    case "attended": return { kind: "venueRecord", href: `${base}/live` };
    case "missedNext": return { kind: "nextEvent", next: row.nextEvent! };
    case "missed": return { kind: "follow", organizerId: row.organizerId ?? null, following: row.organizerFollowing === true };
    default: return { kind: "register", href: `${base}/register` };
  }
}

function relevanceLines(relevance: EventRelevance | null | undefined, t: EventSummaryT): EventSummaryRelevance[] {
  if (!relevance) return [];
  const rows = relevanceRows(relevance, t);
  const row = (kind: string) => rows.find((item) => item.kind === kind);
  return relevanceChips(relevance, t).map((chip) => {
    let text = "";
    if (chip.kind === "people") text = row("people")?.basis ?? "";
    else if (chip.kind === "known") {
      const names = relevance.known?.names.filter(Boolean) ?? [];
      text = names.length ? t("eventsV2.panelKnownNames", { names: names.join(t("eventsV2.relNamesSep")) }) : row("known")?.main ?? "";
    } else text = row(chip.kind)?.main ?? "";
    return { chip: chip.label, key: chip.key, text, tone: chip.tone };
  });
}

export function eventSummary(row: EventSummaryRow, input: { now: number; language: string; t: EventSummaryT }): EventSummary {
  const { now, language, t } = input;
  const ended = eventEnded(row, now);
  const state = summaryState(row, ended);
  const organizer = publicOrganizerName(row.organizerName);
  const marks: EventSummary["marks"][number][] = [];
  if (ended) marks.push({ key: "ended", tone: "plain" });
  if (state === "attended") marks.push({ key: "attended", tone: "teal" });
  else if (!ended && state === "registered") marks.push({ key: "registered", tone: "teal" });

  const online = row.area === "online";
  const facts: EventSummaryFact[] = [{ icon: "calendar", main: summaryWhen(row.startsAt, row.endsAt, language, t), sub: null }];
  if (online) facts.push({ icon: "pin", main: t("eventsV2.panelOnline"), sub: null });
  else if (row.venue) facts.push({ icon: "pin", main: row.venue, sub: row.venueAddress?.trim() || null });
  // 费用行：已结束、已报名都不显示（S2 / S4–S6 只有时间、地点）。
  if (!ended && state !== "registered" && typeof row.priceYen === "number") {
    const fee = row.priceYen === 0 ? t("eventsV2.panelFree") : `¥${row.priceYen.toLocaleString("en-US")}`;
    const seats = row.registrationState === "full" || row.registrationState === "waitlist" ? t("eventsV2.panelSeatsFull")
      : typeof row.seatsLeft === "number" ? t("eventsV2.panelSeatsLeft", { n: row.seatsLeft }) : null;
    const deadline = row.registrationState === "full" || row.registrationState === "waitlist" ? null
      : row.registrationDeadline ? t("eventsV2.panelDeadline", { date: monthDaySlash(row.registrationDeadline) }) : null;
    facts.push({ icon: "ticket", main: fee, sub: [seats, deadline].filter(Boolean).join(" · ") || null });
  }

  let people: EventSummary["people"] = null;
  if (state === "attended") {
    const met = row.metPeople;
    people = met && met.count > 0
      ? { preview: met.preview.slice(0, PREVIEW_MAX), text: met.notContacts > 0 ? t("eventsV2.panelMetCount", { m: met.notContacts, n: met.count }) : t("eventsV2.panelMetCountAll", { n: met.count }), title: "met" }
      : { preview: [], text: t("eventsV2.panelMetNone"), title: "met" };
  } else {
    const count = row.registrationCount;
    const preview = (row.attendeePreview ?? []).slice(0, PREVIEW_MAX);
    const text = typeof count === "number" && count >= ATTENDEE_COUNT_MIN ? t(ended ? "eventsV2.panelAttendedCount" : "eventsV2.panelRegisteredCount", { n: count }) : "";
    if (text || preview.length) people = { preview, text, title: "attendees" };
  }

  const intro = row.description?.replace(/\s+/gu, " ").trim() || null;
  return {
    action: summaryAction(row, state),
    detailHref: eventBase(row.eventId),
    ended,
    eventId: row.eventId,
    facts,
    intro,
    marks: marks.slice(0, 2),
    next: state === "missedNext" ? row.nextEvent ?? null : null,
    organizer,
    organizerInitial: organizer ? Array.from(organizer)[0] ?? null : null,
    people,
    // 「和你有关」只给招募中的活动（已结束的画板里没有这一块）。
    relevance: ended ? [] : relevanceLines(row.relevance, t),
    state,
    title: row.title,
  };
}

/** 下一场那一行的小字：「11/28（六）· 新橋 · 报名中」。 */
export function nextEventLine(next: EventSummaryNext, language: string, t: EventSummaryT): string {
  const p = tokyo(next.startsAt);
  const date = p ? (language === "en" ? `${weekday(language, p.weekday)} ${p.month}/${p.day}` : `${p.month}/${p.day}（${weekday(language, p.weekday)}）`) : "";
  return [date, next.venue, t("eventsV2.panelNextOpen")].filter(Boolean).join(" · ");
}
