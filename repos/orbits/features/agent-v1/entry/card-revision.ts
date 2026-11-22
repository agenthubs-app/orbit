/**
 * agent-design AG20a R1 (设计稿 §5.1 "去掉一项、改内容、选'本次／整个系列'都只生成新版本，走普通消息或点选"; §5.2 "用户若去掉一项，
 * 服务器重新冻结剩余清单并显示新的数量"): while a card of this conversation waits for the click, a message about its items
 * changes the card — by code, no model, nothing written:
 *
 * - "设备清单那项不要了", "drop the second one", "その項目はいらない": that item is taken off (editCard); the rest is frozen
 *   again as the next revision with the new count. A card of one item is not emptied (rejecting it is a click);
 * - "改到周五", "时间改成下午三点", "make it 3pm": the one item with a date or time (or the item named) gets the new value
 *   (reviseCard from its intent with the value replaced);
 * - "就这一次", "整个系列": a repeating schedule item's scope is switched; when the card already says so, nothing changes.
 *
 * The earlier revision can no longer be confirmed (its revision and hash are stale); the request that showed the card
 * shows the new revision (card-document.ts). Words that name no item of the card, or that say more than the change (a new
 * request beside it), are left to the graph: nothing here guesses. When the words do mean the card but not which item,
 * the user is asked which one and the card is left as it is.
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import type { AgentActionOperationPayload, AgentActionRecord } from "../../agent/runtime/contract";
import { cardIntentOf, type CardOperationIntent } from "../../agent/runtime/card-operations";
import { agentCardPreview } from "../../agent/runtime/card-view";
import type { AgentRuntimeService } from "../../agent/runtime/service";
import { cardLocale, dayText, type CardLocale } from "../../agent/runtime/todo-operations";
import { CONTACT_IMPORT } from "../domains/contact/types";
import { occurrenceIn } from "../domains/schedule/read";
import { emitTrace } from "../observability/trace";
import { cardLineOf } from "../propose/copy";
import { instantOf, localDayOf, localTimeOf, resolveSaidDate } from "../propose/dates";
import { NOT_ONLY_THIS_WORDS, SERIES_WORDS, THIS_TIME_WORDS } from "../propose/events-resolve";
import { resolveSaidTimes, type SaidTimes } from "../propose/times";
import { refreshCardInDocument } from "./card-document";
import type { AgentEntryExecuteResult } from "./service";
import type { AgentEntryStore } from "./store";

/** Words that take an item off the card whatever it is. */
const DROP_STRONG = /(不要了|不需要了|不用了|不用加|别加了?|不加了|先不加|先不要|不建了|别建了?|先不建|不记了|别记了?|去掉|拿掉|划掉|撤掉|删去|いらない|いりません|要らない|不要です|外して|外しといて|除いて|\bdrop\b|\bskip\b|\bleave (?:it |that )?out\b|\bdon'?t (?:add|need|create|include|make)\b|\bno need for\b|\btake (?:it |that )?off\b)/iu;
/** Words that also delete records: they take an item off only when it is a new record, or the words say "that item". */
const DROP_WEAK = /(删掉|删了|删除|取消|不做了|やめて|削除して|消して|\bremove\b|\bdelete\b|\bcancel\b)/iu;
const ITEM_WORDS = /(这一?项|那一?项|这一?条|那一?条|这一?个|那一?个|その項目|この項目|その件|\bthat (?:one|item)\b|\bthis (?:one|item)\b)/iu;
const CHANGE = /(改成|改到|改为|改在|换成|换到|挪到|推到|移到|调到|变成|定在|放到|に変更|にして|に変えて|へ変更|にずらして|\bchange (?:it |that |this )?to\b|\bmove (?:it |that |this )?to\b|\bmake it\b|\binstead\b|\bshift (?:it )?to\b|\breschedule (?:it )?(?:to|for)\b|\bpush (?:it )?to\b)/iu;
const DUE = /(截止|最迟|最晚|期限|締め切り|締切|〆切|まで|\bdue\b|\bdeadline\b|\bby\b)/iu;
const PLAN = /(计划|予定日|\bplanned\b|\bplan\b)/iu;
const ORDINAL = /(?:第\s*([一二三四五六七八九十\d]+)\s*[项条个件]|([一二三四五六七八九\d]+)\s*(?:つ目|番目|件目)|\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\b|\bitem\s*(\d+)\b)/iu;
const NUMBERS: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, fifth: 5, first: 1, fourth: 4, second: 2, third: 3, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** What is left of the words once the change, the item and the small words are taken out; more than this is another request. */
const RESIDUE_LIMIT = 2;
const FILLER = /(不对|不是|那就|那|这|就|吧|了|呢|啊|呀|哦|嗯|好的|好|还是|算了|先|也|都|要|改|吗|的|把|给|帮我|麻烦|请|一下|一项|项|条|个|件|卡上|卡片|卡里|里|上|やっぱり|やはり|その|この|項目|カード|は|を|の|で|に|も|ね|よ|お願い|します|ください|して|\bplease\b|\bactually\b|\bthe\b|\bthat\b|\bthis\b|\bone\b|\bitem\b|\bit\b|\bon\b|\bfrom\b|\bcard\b|\band\b|\bok\b|\bokay\b|\bjust\b|\bthen\b|[\s，,。.！!？?、：:；;「」『』"“”'’（）()—\-…~～])/giu;
const DATE_WORDS = /(\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{4}-\d{2}-\d{2}|(?:下个?|这个?|本|上个?)?(?:周|星期|礼拜)[一二三四五六日天]|(?:来週|今週|再来週|先週)?の?[月火水木金土日]曜日?|今天|明天|后天|大后天|昨天|前天|今日|明日|明後日|あさって|\b(?:next |this |last )?(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\btoday\b|\btomorrow\b/giu;
const TIME_WORDS = /(上午|下午|中午|晚上|早上|傍晚|午前|午後|夕方|朝|夜)?\s*(\d{1,2}\s*[:：]\s*\d{2}|[\d〇零一二两三四五六七八九十]{1,3}\s*(?:点|點|時|时)\s*(?:半|一刻|\d{1,2}\s*分?)?|\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.))|上午|下午|中午|晚上|午前|午後|\bnoon\b|\bmorning\b|\bafternoon\b|\bevening\b/giu;
const FIELD_WORDS = /(日期|时间|時間|日付|截止时间|截止日期|截止|最迟|最晚|期限|計画|计划日?|开始|開始|结束|終了|まで|から|到|\bdate\b|\btime\b|\bdeadline\b|\bdue\b|\bstart\b|\bend\b|\bby\b|\bto\b|\bat\b)/giu;

export const CARD_REVISION_WORDS = { CHANGE, DROP_STRONG, DROP_WEAK };

interface Item {
  op: AgentActionOperationPayload;
  index: number;
  name: string;
  creates: boolean;
}

const squash = (text: string) => text.toLowerCase().replace(/[\s，,。.！!？?、：:；;「」『』"“”'’（）()·•\-—]/gu, "");

/** The name a user calls an item by: the quoted record name of its display, else the event it is about, else its line. */
export function itemNameOf(op: AgentActionOperationPayload): string {
  const record = op.display?.record ?? "";
  const quoted = /[「『“"]([^」』”"]+)[」』”"]/u.exec(record)?.[1];
  if (quoted) return quoted.trim();
  const event = op.display?.rows.find((row) => row.field === "eventRef")?.after;
  if (event) return String(event).split(" · ")[0];
  return record || op.preview;
}

function longestShared(left: string, right: string): string {
  const a = squash(left);
  const b = squash(right);
  let best = "";
  for (let start = 0; start < a.length; start += 1) {
    for (let end = a.length; end > start + best.length; end -= 1) {
      const piece = a.slice(start, end);
      if (b.includes(piece)) {
        best = piece;
        break;
      }
    }
  }
  return best;
}

/** How strongly the words name an item: shared characters (two at least), or shared Latin words of three letters or more. */
function nameScore(message: string, name: string): number {
  const latin = (text: string) => new Set((text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/gu) ?? []).filter((word) => !["the", "that", "this", "one", "item", "drop", "skip", "remove", "change", "make", "move", "and", "for", "with", "please"].includes(word)));
  const words = latin(message);
  const shared = [...latin(name)].filter((word) => words.has(word)).length;
  if (shared) return shared * 3;
  const piece = longestShared(message.replace(/[a-z]/giu, ""), name.replace(/[a-z]/giu, ""));
  return [...piece].length >= 2 ? [...piece].length : 0;
}

function ordinalOf(message: string): number | null {
  const match = ORDINAL.exec(message);
  if (!match) return null;
  const raw = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").toLowerCase();
  return /^\d+$/u.test(raw) ? Number(raw) : NUMBERS[raw] ?? null;
}

/** The item the words name: by its name, by its place on the card, or null (none, or more than one fits equally). */
function namedItem(message: string, items: readonly Item[]): Item | null {
  const ordinal = ordinalOf(message);
  if (ordinal !== null && items[ordinal - 1]) return items[ordinal - 1];
  const scored = items.map((item) => ({ item, score: nameScore(message, item.name) })).filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score);
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].item;
}

/** True when nothing but the change, the item's own name and small words is in the message (no other request beside it). */
function onlyAbout(message: string, patterns: readonly RegExp[], item: Item | null): boolean {
  let rest = message;
  for (const pattern of patterns) rest = rest.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), " ");
  rest = rest.replace(ORDINAL, " ").replace(FILLER, "");
  if (item) {
    const own = new Set([...squash(item.name)]);
    rest = [...rest].filter((char) => !own.has(char.toLowerCase())).join("");
    for (const word of item.name.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/gu) ?? []) rest = rest.toLowerCase().split(word).join("");
  }
  return [...rest.replace(/\s+/gu, "")].length <= RESIDUE_LIMIT;
}

const WORDS: Record<CardLocale, {
  dropped: (name: string, before: string, after: string) => string;
  changed: (name: string, before: string, after: string) => string;
  scope: (name: string, before: string, after: string) => string;
  already: (name: string, scope: string) => string;
  which: (names: string[]) => string;
  last: (name: string) => string;
  whichDay: (name: string) => string;
  noDay: (name: string, day: string) => string;
  needed: (name: string, others: string[]) => string;
  closed: string;
}> = {
  en: {
    needed: (name, others) => `${others.map((other) => `"${other}"`).join(", ")} on the card waits for "${name}", so "${name}" was not taken off alone. Reject the card and ask again if you want neither.`,
    already: (name, scope) => `The card already says "${name}": ${scope}. Nothing was changed; it still needs your click.`,
    changed: (name, before, after) => `OK — "${name}" is changed on the card. The card went from "${before}" to "${after}"; nothing is done until you confirm it.`,
    closed: "That card is no longer waiting for a click, so it was not changed.",
    dropped: (name, before, after) => `OK — "${name}" is off the card. The card went from "${before}" to "${after}"; nothing is done until you confirm it.`,
    last: (name) => `"${name}" is the only item on the card. If you don't want it, reject the card; nothing is done without a click.`,
    noDay: (name, day) => `"${name}" does not take place on ${day}, so the card was not changed.`,
    scope: (name, before, after) => `OK — "${name}" now changes ${after} instead of ${before}. Nothing is done until you confirm the card.`,
    which: (names) => `Which item do you mean? The card has: ${names.map((name) => `"${name}"`).join(", ")}. The card was not changed.`,
    whichDay: (name) => `Which day of "${name}" should change? Tell me the date; the card was not changed.`,
  },
  ja: {
    needed: (name, others) => `カードの${others.map((other) => `「${other}」`).join("・")}は「${name}」を前提にしているため、「${name}」だけを外すことはしていません。どちらも不要ならカードを却下してから、もう一度お伝えください。`,
    already: (name, scope) => `カードの「${name}」はすでに「${scope}」になっています。変更はありません。確認を押すまで実行しません。`,
    changed: (name, before, after) => `「${name}」をカード上で変更しました。カードは「${before}」から「${after}」になりました。確認を押すまで実行しません。`,
    closed: "そのカードはもう確認待ちではないため、変更していません。",
    dropped: (name, before, after) => `「${name}」をカードから外しました。カードは「${before}」から「${after}」になりました。確認を押すまで実行しません。`,
    last: (name) => `カードに残っているのは「${name}」だけです。不要ならカードごと却下してください。押さない限り何も実行しません。`,
    noDay: (name, day) => `「${name}」は${day}にはないため、カードは変更していません。`,
    scope: (name, before, after) => `「${name}」は「${before}」ではなく「${after}」を変更する内容にしました。確認を押すまで実行しません。`,
    which: (names) => `どの項目のことですか？カードには${names.map((name) => `「${name}」`).join("・")}があります。カードはまだ変更していません。`,
    whichDay: (name) => `「${name}」のどの日を変更しますか？日付を教えてください。カードはまだ変更していません。`,
  },
  zh: {
    needed: (name, others) => `卡上的${others.map((other) => `「${other}」`).join("、")}要等「${name}」先做成，所以没有单独去掉「${name}」。两项都不要的话，请否决整张卡再重新说。`,
    already: (name, scope) => `卡上的「${name}」已经是「${scope}」了，这次没有改动；点确认之前不会执行。`,
    changed: (name, before, after) => `好的，卡上的「${name}」已改。卡片从「${before}」更新为「${after}」，点确认之前不会执行。`,
    closed: "这张卡已经不在等确认了，所以没有改它。",
    dropped: (name, before, after) => `好的，已从卡上去掉「${name}」。卡片从「${before}」更新为「${after}」，点确认之前不会执行。`,
    last: (name) => `卡上只剩「${name}」这一项了，不要的话请否决整张卡；不点确认什么都不会执行。`,
    noDay: (name, day) => `「${name}」在${day}没有安排，所以卡片没有改。`,
    scope: (name, before, after) => `好的，「${name}」从「${before}」改为「${after}」。点确认之前不会执行。`,
    which: (names) => `你说的是哪一项？卡上有${names.map((name) => `「${name}」`).join("、")}。卡片还没有改。`,
    whichDay: (name) => `「${name}」要改哪一天的那次？告诉我日期就行，卡片还没有改。`,
  },
};

const SCOPE_WORDS: Record<CardLocale, { this: (day: string) => string; series: string }> = {
  en: { series: "the whole series", this: (day) => `only this time (${day})` },
  ja: { series: "シリーズ全体", this: (day) => `今回だけ（${day}）` },
  zh: { series: "整个系列", this: (day) => `只改这一次（${day}）` },
};

export interface CardRevisionDeps {
  runtime: AgentRuntimeService;
  store: AgentEntryStore | null;
  actorId: string;
  sessionId: string;
  message: string;
  now: () => string;
  timeZone: string;
  /** A schedule item as stored (its series start, zone and repetition), for switching a card between this time and the series. */
  readSchedule?: (id: string) => Promise<{ startsAt: string; endsAt?: string | null; timeZone?: string | null; recurrence?: string | null } | null>;
}

type Plan =
  | { kind: "drop"; item: Item }
  | { kind: "revise"; item: Item; intents: CardOperationIntent[]; lead: "changed" | "scope"; scope?: { before: string; after: string } }
  | { kind: "say"; text: string };

/** The newest card of this conversation waiting for the click (an import card is revised by import-revision.ts). */
async function waitingCard(deps: CardRevisionDeps): Promise<AgentActionRecord | null> {
  const waiting = await deps.runtime.listActions({ status: "awaiting_confirmation", workflowKey: "agent_v1_card" }).catch(() => []);
  return [...waiting]
    .filter((action) => action.origin?.kind === "conversation" && action.origin.conversationId === deps.sessionId && !action.operations.some((op) => op.capability === CONTACT_IMPORT))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

/** A cheap first look: no word of a change at all, no ledger read. */
export function mayReviseCard(message: string): boolean {
  return DROP_STRONG.test(message) || DROP_WEAK.test(message) || CHANGE.test(message) || THIS_TIME_WORDS.test(message) || SERIES_WORDS.test(message);
}

const zoneOf = (intent: Record<string, unknown>, fallback: string) => {
  const set = (intent.set ?? {}) as Record<string, unknown>;
  const shown = (intent.shown ?? {}) as Record<string, unknown>;
  return typeof set.timeZone === "string" ? set.timeZone : typeof shown.timeZone === "string" ? shown.timeZone : fallback;
};

/** An item's intent with a new day and/or time; null when the item has no such value or the change does not fit it. */
export function withNewWhen(intent: CardOperationIntent, change: { day: string | null; times: SaidTimes | null; due: boolean; plan: boolean }, fallbackZone: string): CardOperationIntent | null {
  const raw = intent as unknown as Record<string, unknown>;
  const zone = zoneOf(raw, fallbackZone);
  const set = { ...((raw.set ?? {}) as Record<string, unknown>) };
  const moveStart = (startsAt: string, endsAt: unknown) => {
    const day = change.day ?? localDayOf(startsAt, zone);
    const start = instantOf(day, change.times?.start ?? localTimeOf(startsAt, zone), zone);
    const end = change.times?.end ? instantOf(day, change.times.end, zone) : typeof endsAt === "string" ? new Date(Date.parse(start) + Date.parse(endsAt) - Date.parse(startsAt)).toISOString() : undefined;
    return { end, start };
  };
  switch (intent.capability) {
    case "todo.create":
    case "todo.update": {
      if ("links" in intent && intent.links) return null;
      if (intent.capability === "todo.update" && !("plannedDate" in set) && !("dueAt" in set)) return null;
      if (change.day) {
        const field = change.due ? "dueAt" : change.plan ? "plannedDate" : typeof set.dueAt === "string" && !set.plannedDate ? "dueAt" : "plannedDate";
        if (field === "dueAt") set.dueAt = instantOf(change.day, change.times?.start ?? (typeof set.dueAt === "string" ? localTimeOf(set.dueAt, zone) : "23:59"), zone);
        else set.plannedDate = change.day;
      } else if (change.times && typeof set.dueAt === "string") {
        set.dueAt = instantOf(localDayOf(set.dueAt, zone), change.times.start, zone);
      } else return null;
      return { ...intent, set } as CardOperationIntent;
    }
    case "schedule.create":
    case "privateEvent.create": {
      if (typeof set.startsAt !== "string") {
        // A private event with a day only: a time said now gives it one.
        if (intent.capability !== "privateEvent.create" || !change.times || !change.day && typeof set.startsOn !== "string") return null;
        const day = change.day ?? String(set.startsOn);
        const next: Record<string, unknown> = { ...set, startsAt: instantOf(day, change.times.start, zone) };
        delete next.startsOn;
        delete next.allDay;
        if (change.times.end) next.endsAt = instantOf(day, change.times.end, zone);
        return { ...intent, set: next } as CardOperationIntent;
      }
      if (!change.day && !change.times) return null;
      if (set.allDay && !change.times) return { ...intent, set: { ...set, startsAt: instantOf(change.day!, "00:00", zone) } } as CardOperationIntent;
      const moved = moveStart(set.startsAt, set.endsAt);
      const next: Record<string, unknown> = { ...set, startsAt: moved.start };
      delete next.allDay;
      if (moved.end) next.endsAt = moved.end;
      return { ...intent, set: next } as CardOperationIntent;
    }
    case "schedule.update": {
      // Only a new time of day: the day is the occurrence (or the series) the card names.
      if (change.day || !change.times || typeof set.startsAt !== "string") return null;
      const moved = moveStart(set.startsAt, set.endsAt);
      return { ...intent, set: { ...set, startsAt: moved.start, ...(moved.end ? { endsAt: moved.end } : {}) } } as CardOperationIntent;
    }
    case "attendance.create":
      if (!change.day || change.times) return null;
      return { ...intent, set: { ...set, attendedOn: change.day } } as CardOperationIntent;
    case "memo.create": {
      const interaction = set.interaction as Record<string, unknown> | undefined;
      if (!change.day || change.times || !interaction) return null;
      return { ...intent, set: { ...set, interaction: { ...interaction, occurredOn: change.day } } } as CardOperationIntent;
    }
    default:
      return null;
  }
}

async function scopeSwitch(deps: CardRevisionDeps, item: Item, intent: CardOperationIntent, wantThis: boolean, locale: CardLocale): Promise<Plan | null> {
  const raw = intent as unknown as { capability: string; targetId: string; set: Record<string, unknown>; shown: Record<string, unknown> };
  const scope = raw.set.scope;
  if (scope !== "this_occurrence" && scope !== "whole_series") return null;
  const zone = zoneOf(raw as unknown as Record<string, unknown>, deps.timeZone);
  const words = SCOPE_WORDS[locale];
  const label = (value: string, day?: string) => (value === "whole_series" ? words.series : words.this(day ? dayText(day, locale) : ""));
  const current = label(String(scope), typeof raw.set.occurrenceDate === "string" ? raw.set.occurrenceDate : undefined);
  if ((wantThis && scope === "this_occurrence") || (!wantThis && scope === "whole_series")) return { kind: "say", text: WORDS[locale].already(item.name, current) };
  const stored = deps.readSchedule ? await deps.readSchedule(raw.targetId).catch(() => null) : null;
  if (!stored) return null;
  const itemZone = stored.timeZone || zone;
  const timeOfSet = typeof raw.set.startsAt === "string" ? localTimeOf(raw.set.startsAt, itemZone) : null;
  const length = typeof raw.set.startsAt === "string" && typeof raw.set.endsAt === "string" ? Date.parse(raw.set.endsAt) - Date.parse(raw.set.startsAt) : null;
  const storedLength = stored.endsAt ? Date.parse(stored.endsAt) - Date.parse(stored.startsAt) : null;
  let set: Record<string, unknown>;
  let shown: Record<string, unknown>;
  let after: string;
  if (wantThis) {
    const day = resolveSaidDate(deps.message, deps.now(), itemZone)?.day ?? null;
    if (!day) return { kind: "say", text: WORDS[locale].whichDay(item.name) };
    const from = instantOf(day, "00:00", itemZone);
    const to = new Date(Date.parse(from) + 86_400_000).toISOString();
    if (!occurrenceIn(stored.startsAt, stored.recurrence ?? undefined, from, to)) return { kind: "say", text: WORDS[locale].noDay(item.name, dayText(day, locale)) };
    const beforeStart = instantOf(day, localTimeOf(stored.startsAt, itemZone), itemZone);
    set = { ...raw.set, occurrenceDate: day, scope: "this_occurrence" };
    if (timeOfSet) {
      set.startsAt = instantOf(day, timeOfSet, itemZone);
      if (length !== null) set.endsAt = new Date(Date.parse(String(set.startsAt)) + length).toISOString();
    }
    shown = raw.capability === "schedule.delete" ? { ...raw.shown, startsAt: beforeStart } : { ...raw.shown, before: { endsAt: storedLength !== null ? new Date(Date.parse(beforeStart) + storedLength).toISOString() : null, startsAt: beforeStart } };
    after = label("this_occurrence", day);
  } else {
    const anchor = localDayOf(stored.startsAt, itemZone);
    set = { ...raw.set, scope: "whole_series" };
    delete set.occurrenceDate;
    if (timeOfSet) {
      set.startsAt = instantOf(anchor, timeOfSet, itemZone);
      if (length !== null) set.endsAt = new Date(Date.parse(String(set.startsAt)) + length).toISOString();
    }
    shown = raw.capability === "schedule.delete" ? { ...raw.shown, startsAt: stored.startsAt } : { ...raw.shown, before: { endsAt: stored.endsAt ?? null, startsAt: stored.startsAt } };
    after = label("whole_series");
  }
  return { intents: [{ ...(intent as object), set, shown } as unknown as CardOperationIntent], item, kind: "revise", lead: "scope", scope: { after, before: current } };
}

/** What the words do to the card, or null when they are not about it. */
async function planFor(deps: CardRevisionDeps, card: AgentActionRecord, locale: CardLocale): Promise<Plan | null> {
  const message = deps.message;
  const items: Item[] = card.operations.map((op, index) => ({ creates: !op.targetRef, index, name: itemNameOf(op), op }));
  const named = namedItem(message, items);
  const intents = card.operations.map((op) => cardIntentOf(op, card.operations));
  // 1. Taking an item off.
  const strong = DROP_STRONG.test(message);
  const weak = !strong && DROP_WEAK.test(message);
  if ((strong || weak) && !CHANGE.test(message)) {
    const saysItem = ITEM_WORDS.test(message) || ordinalOf(message) !== null;
    // "不用了" alone may answer something else; without the item's name or "那项" it is left to the graph.
    const target = named ?? (saysItem && items.length === 1 ? items[0] : null);
    if (weak && !(target?.creates || saysItem)) return null;
    if (!onlyAbout(message, [DROP_STRONG, DROP_WEAK, ITEM_WORDS], target)) return null;
    if (!target) return saysItem ? { kind: "say", text: WORDS[locale].which(items.map((item) => item.name)) } : null;
    if (items.length === 1) return { kind: "say", text: WORDS[locale].last(target.name) };
    // An item another one waits for («我去过» on the event this card creates) is not taken off alone.
    const waiting = items.filter((item) => item.op.dependsOn?.includes(target.op.operationId));
    if (waiting.length) return { kind: "say", text: WORDS[locale].needed(target.name, waiting.map((item) => item.name)) };
    return { item: target, kind: "drop" };
  }
  // 2. This time or the whole series.
  const notOnlyThis = NOT_ONLY_THIS_WORDS.test(message);
  const wantThis = THIS_TIME_WORDS.test(message) && !notOnlyThis;
  const wantSeries = SERIES_WORDS.test(message) || notOnlyThis;
  if (wantThis !== wantSeries) {
    const scoped = items.filter((item) => {
      const scope = ((intents[item.index] as unknown as { set?: { scope?: string } } | null)?.set?.scope);
      return (item.op.capability === "schedule.update" || item.op.capability === "schedule.delete") && (scope === "this_occurrence" || scope === "whole_series");
    });
    const target = named && scoped.includes(named) ? named : scoped.length === 1 ? scoped[0] : null;
    if (target && onlyAbout(message, [NOT_ONLY_THIS_WORDS, THIS_TIME_WORDS, SERIES_WORDS, CHANGE, DATE_WORDS, TIME_WORDS, FIELD_WORDS], target)) {
      const plan = await scopeSwitch(deps, target, intents[target.index]!, wantThis, locale);
      // The switched item goes back among the others.
      if (plan?.kind === "revise") return { ...plan, intents: intents.map((intent, index) => (index === target.index ? plan.intents[0] : intent)).filter((intent): intent is CardOperationIntent => intent !== null) };
      if (plan) return plan;
    }
  }
  // 3. A new day or time.
  if (CHANGE.test(message)) {
    const day = resolveSaidDate(message, deps.now(), deps.timeZone)?.day ?? null;
    const times = resolveSaidTimes(message) ?? (/(中午|正午|\bnoon\b|昼)/iu.test(message) ? { start: "12:00" } : null);
    if (!day && !times) return null;
    const change = { day, due: DUE.test(message), plan: PLAN.test(message), times };
    const fits = items.map((item) => ({ item, next: intents[item.index] ? withNewWhen(intents[item.index]!, change, deps.timeZone) : null })).filter((entry) => entry.next);
    const target = named ? fits.find((entry) => entry.item === named) ?? null : fits.length === 1 ? fits[0] : null;
    if (!onlyAbout(message, [CHANGE, DATE_WORDS, TIME_WORDS, FIELD_WORDS], target?.item ?? named)) return null;
    if (!target) return fits.length > 1 ? { kind: "say", text: WORDS[locale].which(fits.map((entry) => entry.item.name)) } : null;
    const next = intents.map((intent, index) => (index === target.item.index ? target.next! : intent)).filter((intent): intent is CardOperationIntent => intent !== null);
    return { intents: next, item: target.item, kind: "revise", lead: "changed" };
  }
  return null;
}

export async function reviseCardByWords(deps: CardRevisionDeps): Promise<AgentEntryExecuteResult | null> {
  if (!mayReviseCard(deps.message) || !deps.runtime.reviseCard || !deps.runtime.editCard) return null;
  const card = await waitingCard(deps);
  if (!card) return null;
  const locale = cardLocale(card.locale);
  const plan = await planFor(deps, card, locale);
  if (!plan) return null;
  const before = agentCardPreview(card, await deps.runtime.getRun(card.runId), deps.now());
  const respond = (text: string, preview: AgentActionPreviewContract, reason: string): AgentEntryExecuteResult => ({
    actionPreview: preview,
    partResults: [{ operationId: preview.operations[0]?.operationId, partId: "p1", reason, route: "propose_write", sourceQuote: deps.message, status: "awaiting_confirmation" }],
    sourceRefs: [],
    status: "completed",
    text,
  });
  if (plan.kind === "say") {
    emitTrace({ cardId: card.actionId, revision: card.revision ?? 1, type: "card.revision_not_applied" });
    return respond(plan.text, before, "card_unchanged");
  }
  const revision = card.revision ?? 1;
  const outcome = plan.kind === "drop"
    ? await deps.runtime.editCard({ actionId: card.actionId, payloadHash: card.payloadHash ?? "", removeOperationId: plan.item.op.operationId, revision })
    : await deps.runtime.reviseCard({ actionId: card.actionId, intents: plan.intents });
  if (!outcome || (outcome.outcome !== "edited" && outcome.outcome !== "revised")) {
    emitTrace({ cardId: card.actionId, reason: outcome?.reason ?? null, type: "card.revision_refused" });
    return outcome ? respond(WORDS[locale].closed, before, "card_closed") : null;
  }
  const action = await deps.runtime.getAction(card.actionId);
  if (!action) return null;
  const preview = agentCardPreview(action, await deps.runtime.getRun(action.runId), deps.now());
  if (deps.store) await refreshCardInDocument({ actorId: deps.actorId, now: deps.now(), previous: before, store: deps.store, updated: preview, keepText: true }).catch(() => false);
  const words = WORDS[locale];
  const lead = plan.kind === "drop" ? words.dropped(plan.item.name, before.title, preview.title) : plan.lead === "scope" && plan.scope ? words.scope(plan.item.name, plan.scope.before, plan.scope.after) : words.changed(plan.item.name, before.title, preview.title);
  const cardLine = cardLineOf(preview, locale);
  emitTrace({ cardId: card.actionId, item: plan.item.op.operationId, kind: plan.kind === "drop" ? "drop" : plan.lead, revision: preview.revision, type: "card.revised_by_words" });
  return { ...respond(`${lead}\n\n${cardLine}`, preview, "card_revised"), cardLine };
}
