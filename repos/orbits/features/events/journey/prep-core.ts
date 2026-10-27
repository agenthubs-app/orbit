/**
 * R27 会う準備 的纯逻辑（规则，不调 AI；DESIGN §2.5）。Owner: 甲 (R27).
 * - 会いたい人：计划人物类型匹配到的报名者 + 已认识的人；会いやすい順 = 已认识（協業中 > 会ったことあり）> 有共通の知り合い > 同桌 > 其他；最多 4 人。
 * - 話しかけ方：规则模板（按对方的类型 / 关系；`openerFor`）。
 * - 名刺：人数 + 予備，最少 15 枚（余量本身只存本机，不在这里）。
 * - 明日のフォロー：活动结束后的下一个工作日 9:30–10:00（东京），写日历要用户确认。
 */
import type { EventPrepAgendaItem, EventPrepChecklistItem, EventPrepPerson, EventPrepRelation, EventPrepResponse } from "../../../shared/contract/event-prep";
import { tokyoParts } from "../../../shared/compute/event-score-input";

export type JourneyLanguage = "ja" | "zh" | "en";

export interface PrepAttendee {
  attendeeId: string;
  name: string;
  org?: string | null;
  role?: string | null;
  contactId?: string | null;
  relation: EventPrepRelation;
  /** Matches one of my plan person types (label), when it does. */
  planTypeLabel?: string | null;
  why?: string | null;
  history?: string | null;
  mutualVia?: string | null;
  sameTable?: string | null;
  speaker?: boolean;
}

const RELATION_RANK: Record<EventPrepRelation, number> = { met: 1, none: 0, working: 2 };
export const PREP_PEOPLE_LIMIT = 4;
export const PREP_MIN_CARDS = 15;
export const PREP_SPARE_CARDS = 10;

export function prepOrder(attendees: readonly PrepAttendee[]): PrepAttendee[] {
  const wanted = attendees.filter((item) => item.relation !== "none" || item.planTypeLabel);
  const score = (item: PrepAttendee) => RELATION_RANK[item.relation] * 100 + (item.mutualVia ? 30 : 0) + (item.sameTable ? 20 : 0) + (item.planTypeLabel ? 5 : 0);
  return [...wanted].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "ja")).slice(0, PREP_PEOPLE_LIMIT);
}

const INVESTOR = /VC|CVC|キャピタル|capital|ベンチャーズ|ventures|投資|プリンシパル|パートナー|partner|principal/i;
const FINANCE = /CFO|財務|経理|ファイナンス/i;
const BANK = /銀行|証券|bank|金融/i;

/** 話しかけ方（规则）。语言跟随界面；没有特征时用通用的一句。 */
export function openerFor(attendee: Pick<PrepAttendee, "name" | "org" | "role" | "relation" | "speaker">, language: JourneyLanguage = "ja"): string {
  const org = attendee.org?.trim() || "";
  const text = `${org} ${attendee.role ?? ""}`;
  const family = attendee.name.split(" ")[0] ?? attendee.name;
  const t = (ja: string, zh: string, en: string) => (language === "zh" ? zh : language === "en" ? en : ja);
  if (attendee.relation === "working") return attendee.speaker ? t("「キーノートのあと、5分だけ相談させてください」", "「主题演讲之后，能占用您 5 分钟请教一下吗？」", "\"After the keynote, could I have five minutes of your time?\"") : t(`「${family}さん、今日は少しお時間をいただけますか？」`, `「${family}，今天能占用您一点时间吗？」`, `"${family}, could I have a few minutes today?"`);
  if (INVESTOR.test(text)) return t(`「${org.split(" ")[0] || family} さんの投資領域について伺えますか？最近どの分野を見ていますか？」`, `「想请教一下 ${org || family} 的投资方向，最近在关注哪些领域？」`, `"Could you tell me about ${org || "your"} investment focus? Which areas are you looking at lately?"`);
  if (FINANCE.test(text)) return t("「調達のとき、最初に固めた資本政策のポイントは何でしたか？」", "「融资时，最先定下来的股权规划要点是什么？」", "\"When you raised, what was the first point you settled in your cap table plan?\"");
  if (BANK.test(text)) return t("「エクイティと併用する場合のタイミングを伺えますか」", "「想请教一下和股权融资搭配使用时的时机」", "\"Could I ask about timing when combining it with equity?\"");
  return t(`「${org ? `${org}では` : ""}今どんなテーマに取り組んでいますか？」`, `「${org ? `在${org}` : ""}最近在做哪些方向？」`, `"What are you working on${org ? ` at ${org}` : ""} these days?"`);
}

/** 活动结束后的下一个工作日（东京）9:30–10:00。 */
/** 面談の候補 3 つ：活动日之后的 3 个工作日，各东京时间 10:00（与开场时刻无关）。 */
export function meetingSlotsAfter(startsAt: string, count = 3): string[] {
  const DAY = 86_400_000;
  let dayIndex = tokyoParts(Date.parse(startsAt)).dayIndex;
  const slots: string[] = [];
  while (slots.length < count) {
    dayIndex += 1;
    if ([0, 6].includes((((dayIndex + 4) % 7) + 7) % 7)) continue;
    slots.push(new Date(dayIndex * DAY - 9 * 3_600_000 + 10 * 3_600_000).toISOString());
  }
  return slots;
}

export function followupSlot(endsAt: string, title: string, language: JourneyLanguage = "ja"): { startsAt: string; endsAt: string; title: string } {
  const DAY = 86_400_000;
  const end = Date.parse(endsAt);
  let dayIndex = tokyoParts(end).dayIndex + 1;
  while ([0, 6].includes((((dayIndex + 4) % 7) + 7) % 7)) dayIndex += 1;
  const start = dayIndex * DAY - 9 * 3_600_000 + 9.5 * 3_600_000;
  const short = title.replace(/\s*(Tokyo|東京)?\s*vol\.?\s*\d+\s*$/i, "").replace(/\s+Tokyo$/i, "").trim() || title;
  const label = language === "zh" ? `${short}的致谢与跟进` : language === "en" ? `${short}: thanks and follow-up` : `${short} のお礼とフォロー`;
  return { endsAt: new Date(start + 30 * 60_000).toISOString(), startsAt: new Date(start).toISOString(), title: label };
}

export function buildPrep(input: {
  event: { eventId: string; title: string; startsAt: string; endsAt?: string | null; venue?: string | null; access?: string | null; mapUrl?: string | null };
  now: Date;
  attendees: readonly PrepAttendee[];
  checklist: readonly EventPrepChecklistItem[];
  selfIntro?: EventPrepResponse["selfIntro"];
  agenda?: readonly EventPrepAgendaItem[];
  seatHint?: string | null;
  language?: JourneyLanguage;
}): EventPrepResponse {
  const language = input.language ?? "ja";
  const people: EventPrepPerson[] = prepOrder(input.attendees).map((item) => ({
    attendeeId: item.attendeeId,
    contactId: item.contactId ?? null,
    history: item.history?.trim() || (language === "en" ? "None" : language === "zh" ? "无" : "なし"),
    initial: item.name.trim().charAt(0),
    name: item.name,
    opener: openerFor(item, language),
    org: item.org ?? null,
    relation: item.relation,
    role: item.role ?? null,
    why: item.why?.trim() || item.planTypeLabel || "",
  }));
  const endsAt = input.event.endsAt ?? new Date(Date.parse(input.event.startsAt) + 2 * 3_600_000).toISOString();
  return {
    access: input.event.access ?? null,
    ...(input.agenda?.length ? { agenda: input.agenda } : {}),
    cardsRecommended: Math.max(PREP_MIN_CARDS, people.length + PREP_SPARE_CARDS),
    checklist: input.checklist,
    endsAt: input.event.endsAt ?? null,
    eventId: input.event.eventId,
    followupSuggestion: followupSlot(endsAt, input.event.title, language),
    mapUrl: input.event.mapUrl ?? (input.event.venue ? `https://maps.apple.com/?q=${encodeURIComponent(input.event.venue)}` : null),
    now: input.now.toISOString(),
    people,
    seatHint: input.seatHint ?? null,
    selfIntro: input.selfIntro ?? null,
    startsAt: input.event.startsAt,
    title: input.event.title,
    venue: input.event.venue ?? null,
  };
}
