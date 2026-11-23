// 2026-11-23 活动 › 探す：点卡片先出底部简介面板（docs/designs/redesign-2026-10/event-side-panel-proposal.html ④ M1 / M2 · ② S1–S6 · 字段表）。
// 纯函数：一行列表数据 → 面板要画的块和右边主按钮。列表没有的事实来自 GET /api/events/:id/summary（`rowWithSummary`）。
// 先出布局再填内容：摘要没到之前（summaryLoaded 不是 true）列表已有的字段照画，介绍 / 参加者 / 名额那行画骨架，主按钮画占位
// （pending），到了原位替换。主按钮规则与 Web EventSidePanel.primaryAction 相同。
import type { EventDiscoverRow } from "../../../api/contract/event-discover";
import type { EventSummaryResponse } from "../../../api/contract/event-summary";
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
  /** 本人和这场的关系（摘要的 status 里与报名有关的几种）。结束后 registered / attended = 去了（「你参加了」）。 */
  myStatus: "registered" | "pending_review" | "waitlisted" | "attended" | null;
  /** 名单公开后最多 4 人的头像；未公开 = null。 */
  attendeePreview: readonly EventSummaryPerson[] | null;
  /** 参加过：会场记录里见过的人（同桌、交换）。 */
  metPeople: { count: number; notContacts: number; preview: readonly EventSummaryPerson[]; hasRecord?: boolean } | null;
  /** 同一主办方最近一场还能报名的活动。 */
  nextEvent: EventSummaryNext | null;
  /** 我是否已关注主办方。 */
  organizerFollowing: boolean | null;
  /** 摘要接口的答复已经并进来了（false / 缺省 = 还在读：骨架 + 主按钮占位）。 */
  summaryLoaded: boolean;
}

export type EventSummaryRow = EventDiscoverRow & Partial<EventSummaryExtras>;

export type EventSummaryState = "pending" | "open" | "registered" | "full" | "closed" | "waitlist" | "attended" | "went" | "missedNext" | "missed";

export type EventSummaryAction =
  | { kind: "register"; href: string }
  | { kind: "myRegistration"; href: string }
  | { kind: "disabled"; reason: "full" | "closed" }
  | { kind: "waitlist"; href: string }
  | { kind: "venueRecord"; href: string }
  | { kind: "nextEvent"; next: EventSummaryNext }
  | { kind: "follow"; organizerId: string | null; following: boolean }
  /** 摘要还没到：画同尺寸占位。 */
  | { kind: "pending" };

/** `sub: "pending"` = 这一行的小字（名额 / 截止）还在读，画一条骨架。 */
export interface EventSummaryFact { icon: "calendar" | "pin" | "ticket"; main: string; sub: string | null | "pending" }
export interface EventSummaryRelevance { key: string; tone: ChipTone; chip: string; text: string }

export interface EventSummary {
  eventId: string;
  title: string;
  organizer: string | null;
  organizerInitial: string | null;
  ended: boolean;
  state: EventSummaryState;
  /** 标题下的状态标记（最多 2 个）；招募中且未报名时为空，这一行不画。 */
  marks: readonly { key: "ended" | "registered" | "attended" | "pending_review" | "waitlisted"; tone: "plain" | "teal" }[];
  facts: readonly EventSummaryFact[];
  /** "pending" = 摘要还在读（画 4 行骨架）。 */
  intro: string | null | "pending";
  relevance: readonly EventSummaryRelevance[];
  /** 「参加者」/「你在这场见过的人」：头像（≤4）+ 一句；没有可写的 = null（整块不画）。 */
  people: { title: "attendees" | "met"; preview: readonly EventSummaryPerson[]; text: string } | { title: "attendees" | "met" | null; pending: true } | null;
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

const REGISTERED = new Set(["registered", "pending_review", "waitlisted", "attended"]);

function summaryState(row: EventSummaryRow, ended: boolean): EventSummaryState {
  if (!row.summaryLoaded) return "pending";
  if (ended) {
    const went = row.myStatus === "registered" || row.myStatus === "attended";
    if (went) return row.metPeople?.hasRecord ? "attended" : "went";
    return row.nextEvent ? "missedNext" : "missed";
  }
  if (row.myStatus && REGISTERED.has(row.myStatus)) return "registered";
  if (row.registrationState === "full" || row.registrationState === "closed" || row.registrationState === "waitlist") return row.registrationState;
  return "open";
}

function summaryAction(row: EventSummaryRow, state: EventSummaryState): EventSummaryAction {
  const base = eventBase(row.eventId);
  switch (state) {
    case "pending": return { kind: "pending" };
    // 「查看我的报名」= 报名内容（与 Web 相同去参加登録页）。
    case "registered": return { kind: "myRegistration", href: `${base}/register` };
    case "full": case "closed": return { kind: "disabled", reason: state };
    case "waitlist": return { kind: "waitlist", href: `${base}/register` };
    case "attended": return { kind: "venueRecord", href: `${base}/live?record=1` };
    case "missedNext": return { kind: "nextEvent", next: row.nextEvent! };
    case "went": case "missed": return { kind: "follow", organizerId: row.organizerId ?? null, following: row.organizerFollowing === true };
    default: return { kind: "register", href: `${base}/register` };
  }
}

/**
 * 摘要答复并进列表行（或「看下一场」时只有基本事实的种子）。名额 / 截止按 Web 同一规则算出 registrationState。
 */
export function rowWithSummary(row: EventSummaryRow, summary: EventSummaryResponse, now: number): EventSummaryRow {
  const closed = Boolean(summary.registrationClosesAt && Date.parse(summary.registrationClosesAt) <= now);
  const full = summary.remaining === 0;
  const registrationState = closed || full ? (summary.waitlistEnabled ? "waitlist" : full ? "full" : "closed") : "open";
  const next = summary.next ? { ...summary.next, href: eventBase(summary.next.eventId) } : null;
  return {
    ...row,
    coverUrl: row.coverUrl ?? summary.coverUrl ?? null,
    description: summary.description,
    endsAt: row.endsAt ?? summary.endsAt ?? null,
    myStatus: REGISTERED.has(summary.status) ? summary.status as EventSummaryExtras["myStatus"] : null,
    nextEvent: next,
    organizerFollowing: summary.organizer.following,
    organizerId: row.organizerId ?? summary.organizer.organizerId,
    organizerName: row.organizerName ?? (summary.organizer.unnamed ? null : summary.organizer.name),
    attendeePreview: summary.attendeeInitials.map((initial) => ({ initial })),
    metPeople: summary.met ? { count: summary.met.count, hasRecord: summary.met.hasRecord, notContacts: summary.met.notInContacts, preview: summary.met.initials.map((initial) => ({ initial })) } : null,
    priceYen: row.priceYen ?? summary.priceYen ?? null,
    registrationCount: summary.registrationCount,
    registrationDeadline: summary.registrationClosesAt,
    registrationState,
    seatsLeft: summary.remaining,
    summaryLoaded: true,
    venue: row.venue ?? summary.venue ?? null,
  };
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
  if (state === "attended" || state === "went") marks.push({ key: "attended", tone: "teal" });
  else if (!ended && state === "registered") {
    marks.push(row.myStatus === "pending_review" ? { key: "pending_review", tone: "plain" } : row.myStatus === "waitlisted" ? { key: "waitlisted", tone: "plain" } : { key: "registered", tone: "teal" });
  }

  const online = row.area === "online";
  const facts: EventSummaryFact[] = [{ icon: "calendar", main: summaryWhen(row.startsAt, row.endsAt, language, t), sub: null }];
  if (online) facts.push({ icon: "pin", main: t("eventsV2.panelOnline"), sub: null });
  else if (row.venue) facts.push({ icon: "pin", main: row.venue, sub: row.venueAddress?.trim() || null });
  // 费用行：已结束不显示（列表就知道，第一帧即定）。已报名也照旧显示（与 Web 相同）：报名状态要等摘要，
  // 到时再拿掉这一行会把下面的块往上推。名额 / 截止那行小字等摘要，先画骨架。
  if (!ended && typeof row.priceYen === "number") {
    const fee = row.priceYen === 0 ? t("eventsV2.panelFree") : `¥${row.priceYen.toLocaleString("en-US")}`;
    const closed = row.registrationState === "closed" || Boolean(row.registrationDeadline && Date.parse(row.registrationDeadline) <= now);
    const seats = row.seatsLeft === 0 ? t("eventsV2.panelSeatsFull")
      : closed ? t("eventsV2.panelClosed")
      : typeof row.seatsLeft === "number" ? t("eventsV2.panelSeatsLeft", { n: row.seatsLeft }) : null;
    const deadline = row.seatsLeft === 0 || closed ? null
      : row.registrationDeadline ? t("eventsV2.panelDeadline", { date: monthDaySlash(row.registrationDeadline) }) : null;
    facts.push({ icon: "ticket", main: fee, sub: row.summaryLoaded ? [seats, deadline].filter(Boolean).join(" · ") || null : "pending" });
  }

  let people: EventSummary["people"] = null;
  if (state === "pending") people = { pending: true, title: ended ? null : "attendees" };
  else if (state === "attended" || state === "went") {
    const met = row.metPeople;
    people = met && met.hasRecord !== false && met.count > 0
      ? { preview: met.preview.slice(0, PREVIEW_MAX), text: met.notContacts > 0 ? t("eventsV2.panelMetCount", { m: met.notContacts, n: met.count }) : t("eventsV2.panelMetCountAll", { n: met.count }), title: "met" }
      : { preview: [], text: t("eventsV2.panelMetNone"), title: "met" };
  } else {
    const count = row.registrationCount;
    const preview = (row.attendeePreview ?? []).slice(0, PREVIEW_MAX);
    const text = typeof count === "number" && count >= ATTENDEE_COUNT_MIN ? t(ended ? "eventsV2.panelAttendedCount" : "eventsV2.panelRegisteredCount", { n: count }) : "";
    if (text || preview.length) people = { preview, text, title: "attendees" };
  }

  const intro = state === "pending" ? "pending" : row.description?.replace(/\s+/gu, " ").trim() || null;
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
