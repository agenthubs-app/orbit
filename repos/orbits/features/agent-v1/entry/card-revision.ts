/**
 * agent-design AG20a R1 (设计稿 §5.1 "去掉一项、改内容、选'本次／整个系列'都只生成新版本，走普通消息或点选"; §5.2 "用户若去掉一项，
 * 服务器重新冻结剩余清单并显示新的数量"): while a card of this conversation waits for the click, a message about its items
 * changes the card — by code, no model, nothing written:
 *
 * - "设备清单那项不要了", "drop the second one", "その項目はいらない": that item is taken off (editCard); the rest is frozen
 *   again as the next revision with the new count. A card of one item is not emptied: taking its item off rejects it;
 * - "算了先别建", "やっぱりやめとく", "never mind, don't create it" (AE-XL-016): the change is called off — the card is rejected
 *   as its reject button does (the same decision; the request that showed it follows), with a short reply. A hold
 *   ("先等等"), or words naming something else, leave it waiting;
 * - "改到周五", "时间改成下午三点", "make it 3pm": the one item with a date or time (or the item named) gets the new value
 *   (reviseCard from its intent with the value replaced);
 * - "就这一次", "整个系列": a repeating schedule item's scope is switched; when the card already says so, nothing changes;
 * - "不是这条，是给李薇寄样片那条", "それじゃなくて、…の方", "not that one, the … one" (AE-XL-014): the card's one to-do item is
 *   the wrong record — the same change goes to the to-do those words name (found by its title; none or several found is
 *   said, the card left as it is). That to-do and its people are the records mentioned last (the next "她").
 *
 * The earlier revision can no longer be confirmed (its revision and hash are stale); the request that showed the card
 * shows the new revision (card-document.ts). Words that name no item of the card, or that say more than the change (a new
 * request beside it), are left to the graph: nothing here guesses. When the words do mean the card but not which item,
 * the user is asked which one and the card is left as it is.
 */
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import type { NoteInteractionContract } from "../../../shared/contract/notes";
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
import { languageOfText } from "../answer/blocks";
import { refreshCardInDocument } from "./card-document";
import type { AgentEntryExecuteResult } from "./service";
import type { AgentEntryStore } from "./store";

/** Words that take an item off the card whatever it is. */
const DROP_STRONG = /(不要了|不需要了|不用了|不用加|别加了?|不加了|先不加|先不要|不建了|别建了?|先不建|不记了|别记了?|去掉|拿掉|划掉|撤掉|删去|いらない|いりません|要らない|不要です|外して|外しといて|除いて|\bdrop\b|\bskip\b|\bleave (?:it |that )?out\b|\bdon'?t (?:add|need|create|include|make)\b|\bno need for\b|\btake (?:it |that )?off\b)/iu;
/** Words that also delete records: they take an item off only when it is a new record, or the words say "that item". */
const DROP_WEAK = /(删掉|删了|删除|取消|不做了|やめて|削除して|消して|\bremove\b|\bdelete\b|\bcancel\b)/iu;
/**
 * AE-XL-016: words that call off the waiting card's change as a whole (「算了先别建」「やっぱりやめとく」"never mind, don't create
 * it"). Bare 「不用了」「不要了」 are not among them (they may answer something else; with 「这条」 they take the item off).
 */
const CANCEL = /(算了|罢了|作罢|(?:先|就|还是)?(?:别|不要|不用|甭)(?:再)?(?:新建|创建|添加|修改|删除|建|加|记|改|删|做|弄|发|执行|办|动)了?|(?:先|就|还是)?不(?:新建|创建|添加|修改|删除|建|加|记|改|删|做|弄|发|执行|办|动)了|先不(?:建|加|记|改|删|做|弄|发)|(?:やっぱり|やはり)?(?:やめ|止め)(?:とく|ておく|ておきます|ます|る|よう|ましょう|とき)|(?:作ら|登録し|追加し|作成し|変更し|削除し|入れ|送ら)(?:ないで|なくて(?:いい|大丈夫|結構))|\bnever\s*mind\b|\bforget (?:it|that|about it)\b|\bscratch that\b|\bcall it off\b|\bdon['’]?t (?:create|add|make|do|change|delete|save|send|schedule|record|bother)\b|\bdo not (?:create|add|make|do|change|delete|save|send)\b)/iu;
/** Calling off words that may also mean the record itself (「取消那个会」): they call the card off only when it only creates. */
const CANCEL_WEAK = /(取消|作废|撤销|キャンセル|取り消して|取りやめ|やめて|\bcancel\b)/iu;
/** A hold is not a cancel: 「先等等」「ちょっと待って」"hold on" leave the card waiting. */
const HOLD = /(等等|等一下|等一等|等会|等我|稍等|先放|放一放|搁着|再说|回头|晚点|待会|考虑|想想|保留|暂缓|ちょっと待|待って|後で|あとで|考え|\bwait\b|\bhold\b|\blater\b|\bnot yet\b|\bhang on\b|\bthink\b|\bpause\b)/iu;
/** The kind words a cancel may say beside it (「这个待办先别建」). */
const KIND_WORDS = /(待办|日程|笔记|安排|备忘|全部|所有|ToDo|タスク|予定|メモ|全部|\bto-?dos?\b|\btasks?\b|\bnotes?\b|\ball\b|\bthem\b|\bany of (?:it|them)\b)/giu;
const ITEM_WORDS = /(这一?项|那一?项|这一?条|那一?条|这一?个|那一?个|その項目|この項目|その件|\bthat (?:one|item)\b|\bthis (?:one|item)\b)/iu;
const CHANGE = /(改成|改到|改为|改在|换成|换到|挪到|推到|移到|调到|变成|定在|放到|に変更|にして|に変えて|へ変更|にずらして|\bchange (?:it |that |this )?to\b|\bmove (?:it |that |this )?to\b|\b(?:change|move|shift|push|reschedule)\s+the\s+(?:[^\s,.;:!?]+\s+){0,5}?(?:one|item|to-?do|task|note|meeting|event)\s+(?:to|for)\b|\bmake it\b|\binstead\b|\bshift (?:it )?to\b|\breschedule (?:it )?(?:to|for)\b|\bpush (?:it )?to\b)/iu;
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

/**
 * AE-XL-014: a correction of the card's object — "not this one, it is X" — and the words of X. The whole message is the
 * correction (a sentence beside it is another request, left to the graph). The part after "not" may name the card's item
 * that is wrong (「不是小林那条，是…」「2つ目じゃなくて、…」"not the second one, the … one"); a bare "this one" names none.
 */
const CORRECTION: { pattern: RegExp; wrong: number | null; meant: number }[] = [
  { meant: 2, pattern: /^(?:不对|错了|搞错了|弄错了)?[，,、\s]*不是([^，,、;；\s是]{0,24}?(?:(?:这|那)一?(?:条|个|项|件|张)?(?:待办|日程|笔记|安排)?|第\s*[一二三四五六七八九十\d]+\s*[项条个件]))[，,、;；\s]*(?:而)?是(?:说)?(.+)$/u, wrong: 1 },
  { meant: 1, pattern: /^(?:不对|错了|搞错了|弄错了)[，,、\s]*(?:我说的|我要改的|要改的)?是(.+)$/u, wrong: null },
  { meant: 2, pattern: /^((?:これ|それ|そっち|こっち|この件|その件)|[^、,，\s]{1,24}?(?:の(?:方|ほう|やつ|件|項目|予定|メモ)|(?:つ|番|件)目))(?:じゃなくて|ではなくて|じゃなく|でなく)[、,，\s]*(.+)$/u, wrong: 1 },
  { meant: 2, pattern: /^(?:no[,.]?\s*)?not (this|that|the [^,.;:]{1,30}?)(?: one)?[,.;:]?\s*(?:it'?s |i mean |i meant )?(.+)$/iu, wrong: 1 },
];
const POINTER_TAIL = /(?:的)?(?:那|这)一?(?:条|个|项|件)(?:待办|日程|笔记|安排)?$|の(?:方|ほう|やつ|件|ToDo|タスク|予定|メモ)$|\s+(?:one|to-?do|task|note|meeting|event)$/iu;

/** The words naming the record meant instead, and the words naming the card's wrong item (null: "this one"). */
export function correctionOf(message: string): { words: string; wrong: string | null } | null {
  const text = message.trim().replace(/[。.!！]+$/u, "").trim();
  if (!text || text.length > 60) return null;
  for (const { meant, pattern, wrong } of CORRECTION) {
    const match = pattern.exec(text);
    const said = match?.[meant]?.trim();
    if (!said || /[。！？!?\n]/u.test(said)) continue;
    const words = said.replace(/^the\s+/iu, "").replace(POINTER_TAIL, "").replace(/^(?:那|这)(?:条|个)?/u, "").trim();
    if ([...words].length < 2) continue;
    const wrongText = wrong !== null ? match![wrong]?.trim() ?? "" : "";
    return { words, wrong: wrongText && !/^(?:(?:这|那)一?(?:条|个|项|件|张)?(?:待办|日程|笔记|安排)?|これ|それ|そっち|こっち|この件|その件|this|that)$/iu.test(wrongText) ? wrongText : null };
  }
  return null;
}

/** The words naming the record meant instead, or null when the message is not such a correction. */
export function correctionWords(message: string): string | null {
  return correctionOf(message)?.words ?? null;
}

/**
 * Words that point at one item of the card: its place (「第二条」「2つ目」"the second one"), or what it is called — its title
 * words, a person on it, its day or time — before 「那条/那个」「の方」"one" (「王磊那条」「三点那个」「機材リストの方」"the 3pm one").
 * `span` is the text of the pointer in the message (its words are not a new value: 「三点那个改到五点」 changes to five).
 */
interface ItemReference {
  span: string;
  words: string;
  ordinal: number | null;
}

const REFERENCE = [
  /([^\s，,。.！!？?、；;：:「」]{1,24}?)(?:的)?(?:那|这)一?(?:条|个|项|件|张)(?:待办|日程|笔记|安排)?/u,
  /([^\s、,，。！!？?「」]{1,24}?)の(?:方|ほう|やつ|件|項目|予定|メモ|ToDo|タスク)/u,
  /\bthe ((?:[^\s,.;:!?]+\s+){0,5}?[^\s,.;:!?]+)\s+(?:one|item|to-?do|task|note|meeting|event|entry)\b/iu,
];
const LEAD_WORDS = /^(?:不对|不是|那就|那|就|还是|先|也|把|将|给我把|帮我把|请把|麻烦把)+/u;
const DEICTIC = /^(?:刚才|刚刚|上面|上边|前面|之前|最后|原来|卡上|卡片|卡里|里面|其中|另外|那|这|this|that|other|last|same|これ|それ|あれ|この|その|あの|さっき)+$/iu;

function referenceOf(message: string): ItemReference | null {
  const ordinalMatch = ORDINAL.exec(message);
  if (ordinalMatch) return { ordinal: ordinalOf(message), span: ordinalMatch[0], words: "" };
  for (const pattern of REFERENCE) {
    const match = pattern.exec(message);
    if (!match) continue;
    const words = match[1].replace(LEAD_WORDS, "").trim();
    const cleaned = words.replace(FILLER, "");
    if (!cleaned || DEICTIC.test(cleaned)) continue;
    if ([...cleaned].length < 2 && !/\d/u.test(cleaned)) continue;
    return { ordinal: null, span: match[0], words };
  }
  return null;
}

/** What an item is known by: its visible line (record, rows, the people's names) and its days and times of day. */
function itemFacts(item: Item, intent: CardOperationIntent | null, fallbackZone: string): { text: string; days: Set<string>; times: Set<string> } {
  const raw = (intent ?? {}) as unknown as Record<string, unknown>;
  const zone = zoneOf(raw, fallbackZone);
  const set = (raw.set ?? {}) as Record<string, unknown>;
  const shown = (raw.shown ?? {}) as Record<string, unknown>;
  const names = [set.names, shown.names].flatMap((value) => (value && typeof value === "object" ? Object.values(value as Record<string, unknown>).map(String) : []));
  const text = [item.name, item.op.preview, item.op.display?.record ?? "", ...(item.op.display?.rows ?? []).flatMap((row) => [String(row.before ?? ""), String(row.after ?? "")]), ...names].join(" ");
  const days = new Set<string>();
  const times = new Set<string>();
  const interaction = (set.interaction ?? {}) as Record<string, unknown>;
  const before = (shown.before ?? {}) as Record<string, unknown>;
  for (const day of [set.plannedDate, set.occurrenceDate, set.attendedOn, set.startsOn, interaction.occurredOn]) if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(day)) days.add(day);
  for (const at of [set.dueAt, set.startsAt, before.startsAt, shown.startsAt, interaction.occurredAt]) {
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) continue;
    days.add(localDayOf(at, zone));
    if (!set.allDay) times.add(localTimeOf(at, zone));
  }
  return { days, text, times };
}

/** The items the reference fits best: by place, or by every clue it gives (words, day, time); [] when none fits. */
function referredItems(ref: ItemReference, items: readonly Item[], intents: readonly (CardOperationIntent | null)[], deps: CardRevisionDeps): Item[] {
  if (ref.ordinal !== null) return items[ref.ordinal - 1] ? [items[ref.ordinal - 1]] : [];
  const day = resolveSaidDate(ref.words, deps.now(), deps.timeZone)?.day ?? null;
  const time = resolveSaidTimes(ref.words)?.start ?? null;
  const rest = ref.words.replace(DATE_WORDS, " ").replace(TIME_WORDS, " ").trim();
  const restCounts = [...rest.replace(FILLER, "")].length >= 2;
  const scored = items.map((item) => {
    const facts = itemFacts(item, intents[item.index], deps.timeZone);
    let score = 0;
    if (day) {
      if (!facts.days.has(day)) return { item, score: 0 };
      score += 1;
    }
    if (time) {
      const [hour, minute] = time.split(":").map(Number);
      const afternoon = hour < 12 && !/(上午|早上|午前|朝|am|a\.m\.)/iu.test(ref.words) ? `${String(hour + 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : null;
      if (!facts.times.has(time) && !(afternoon && facts.times.has(afternoon))) return { item, score: 0 };
      score += 1;
    }
    if (restCounts) {
      const words = nameScore(rest, facts.text);
      if (!words) return { item, score: 0 };
      score += words;
    }
    return { item, score };
  }).filter((entry) => entry.score > 0);
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score === best).map((entry) => entry.item);
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
function onlyAbout(message: string, patterns: readonly RegExp[], item: Item | null, limit = RESIDUE_LIMIT): boolean {
  let rest = message;
  for (const pattern of patterns) rest = rest.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), " ");
  rest = rest.replace(ORDINAL, " ").replace(FILLER, "");
  if (item) {
    const own = new Set([...squash(item.name)]);
    rest = [...rest].filter((char) => !own.has(char.toLowerCase())).join("");
    for (const word of item.name.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/gu) ?? []) rest = rest.toLowerCase().split(word).join("");
  }
  return [...rest.replace(/\s+/gu, "")].length <= limit;
}

const WORDS: Record<CardLocale, {
  dropped: (name: string, before: string, after: string) => string;
  changed: (name: string, before: string, after: string) => string;
  /** The card's summary did not change: what changed on the item (its rows' labels and new values), or only that it changed. */
  changedTo: (name: string, rows: { label: string; value: string }[]) => string;
  droppedOnly: (name: string) => string;
  scope: (name: string, before: string, after: string) => string;
  already: (name: string, scope: string) => string;
  which: (names: string[]) => string;
  last: (name: string) => string;
  whichDay: (name: string) => string;
  noDay: (name: string, day: string) => string;
  needed: (name: string, others: string[]) => string;
  closed: string;
  retargeted: (before: string, after: string) => string;
  notFound: (words: string, kind?: RecordKind) => string;
  whichRecord: (names: string[]) => string;
  notLinked: (title: string, events: string[]) => string;
  notAbout: (title: string, names: string[]) => string;
}> = {
  en: {
    needed: (name, others) => `${others.map((other) => `"${other}"`).join(", ")} on the card waits for "${name}", so "${name}" was not taken off alone. Reject the card and ask again if you want neither.`,
    already: (name, scope) => `The card already says "${name}": ${scope}. Nothing was changed; it still needs your click.`,
    changed: (name, before, after) => `OK — "${name}" is changed on the card. The card went from "${before}" to "${after}"; nothing is done until you confirm it.`,
    changedTo: (name, rows) => (rows.length ? `OK — on the card, "${name}" now has ${rows.map((row) => `${row.label.toLowerCase()} ${row.value}`).join(", ")}. Nothing is done until you confirm it.` : `OK — "${name}" is changed on the card. Nothing is done until you confirm it.`),
    droppedOnly: (name) => `OK — "${name}" is off the card. Nothing is done until you confirm it.`,
    closed: "That card is no longer waiting for a click, so it was not changed.",
    dropped: (name, before, after) => `OK — "${name}" is off the card. The card went from "${before}" to "${after}"; nothing is done until you confirm it.`,
    last: (name) => `"${name}" is the only item on the card. If you don't want it, reject the card; nothing is done without a click.`,
    noDay: (name, day) => `"${name}" does not take place on ${day}, so the card was not changed.`,
    scope: (name, before, after) => `OK — "${name}" now changes ${after} instead of ${before}. Nothing is done until you confirm the card.`,
    which: (names) => `Which item do you mean? The card has: ${names.map((name) => `"${name}"`).join(", ")}. The card was not changed.`,
    whichDay: (name) => `Which day of "${name}" should change? Tell me the date; the card was not changed.`,
    retargeted: (before, after) => `OK — the card now changes "${after}" instead of "${before}". Nothing is done until you confirm it.`,
    notFound: (words, kind = "todo") => `I found no ${kind === "schedule" ? "schedule item" : kind === "memo" ? "note" : "open to-do"} called "${words}", so the card was not changed.`,
    notLinked: (title, events) => `"${title}" is not linked to ${events.map((event) => `"${event}"`).join(", ")}, so the card was not changed.`,
    notAbout: (title, names) => `"${title}" does not mention ${names.join(", ")}, so the card was not changed.`,
    whichRecord: (names) => `Which one do you mean: ${names.map((name) => `"${name}"`).join(", ")}? The card was not changed.`,
  },
  ja: {
    needed: (name, others) => `カードの${others.map((other) => `「${other}」`).join("・")}は「${name}」を前提にしているため、「${name}」だけを外すことはしていません。どちらも不要ならカードを却下してから、もう一度お伝えください。`,
    already: (name, scope) => `カードの「${name}」はすでに「${scope}」になっています。変更はありません。確認を押すまで実行しません。`,
    changed: (name, before, after) => `「${name}」をカード上で変更しました。カードは「${before}」から「${after}」になりました。確認を押すまで実行しません。`,
    changedTo: (name, rows) => (rows.length ? `カードの「${name}」の${rows.map((row) => `${row.label}を${row.value}`).join("、")}に変更しました。確認を押すまで実行しません。` : `「${name}」をカード上で変更しました。確認を押すまで実行しません。`),
    droppedOnly: (name) => `「${name}」をカードから外しました。確認を押すまで実行しません。`,
    closed: "そのカードはもう確認待ちではないため、変更していません。",
    dropped: (name, before, after) => `「${name}」をカードから外しました。カードは「${before}」から「${after}」になりました。確認を押すまで実行しません。`,
    last: (name) => `カードに残っているのは「${name}」だけです。不要ならカードごと却下してください。押さない限り何も実行しません。`,
    noDay: (name, day) => `「${name}」は${day}にはないため、カードは変更していません。`,
    scope: (name, before, after) => `「${name}」は「${before}」ではなく「${after}」を変更する内容にしました。確認を押すまで実行しません。`,
    which: (names) => `どの項目のことですか？カードには${names.map((name) => `「${name}」`).join("・")}があります。カードはまだ変更していません。`,
    whichDay: (name) => `「${name}」のどの日を変更しますか？日付を教えてください。カードはまだ変更していません。`,
    retargeted: (before, after) => `カードの対象を「${before}」から「${after}」に変えました。確認を押すまで実行しません。`,
    notFound: (words, kind = "todo") => `「${words}」という${kind === "schedule" ? "予定" : kind === "memo" ? "メモ" : "未完了のToDo"}が見つからないため、カードは変更していません。`,
    notLinked: (title, events) => `「${title}」は${events.map((event) => `「${event}」`).join("・")}と紐づいていないため、カードは変更していません。`,
    notAbout: (title, names) => `「${title}」には${names.join("・")}が出てこないため、カードは変更していません。`,
    whichRecord: (names) => `どれのことですか？${names.map((name) => `「${name}」`).join("・")}があります。カードはまだ変更していません。`,
  },
  zh: {
    needed: (name, others) => `卡上的${others.map((other) => `「${other}」`).join("、")}要等「${name}」先做成，所以没有单独去掉「${name}」。两项都不要的话，请否决整张卡再重新说。`,
    already: (name, scope) => `卡上的「${name}」已经是「${scope}」了，这次没有改动；点确认之前不会执行。`,
    changed: (name, before, after) => `好的，卡上的「${name}」已改。卡片从「${before}」更新为「${after}」，点确认之前不会执行。`,
    changedTo: (name, rows) => (rows.length ? `好的，卡上的「${name}」${rows.map((row) => `${row.label}改到${row.value}`).join("，")}。点确认之前不会执行。` : `好的，卡上的「${name}」已改，点确认之前不会执行。`),
    droppedOnly: (name) => `好的，已从卡上去掉「${name}」，点确认之前不会执行。`,
    closed: "这张卡已经不在等确认了，所以没有改它。",
    dropped: (name, before, after) => `好的，已从卡上去掉「${name}」。卡片从「${before}」更新为「${after}」，点确认之前不会执行。`,
    last: (name) => `卡上只剩「${name}」这一项了，不要的话请否决整张卡；不点确认什么都不会执行。`,
    noDay: (name, day) => `「${name}」在${day}没有安排，所以卡片没有改。`,
    scope: (name, before, after) => `好的，「${name}」从「${before}」改为「${after}」。点确认之前不会执行。`,
    which: (names) => `你说的是哪一项？卡上有${names.map((name) => `「${name}」`).join("、")}。卡片还没有改。`,
    whichDay: (name) => `「${name}」要改哪一天的那次？告诉我日期就行，卡片还没有改。`,
    retargeted: (before, after) => `好的，卡上改的是「${after}」，不再是「${before}」。点确认之前不会执行。`,
    notFound: (words, kind = "todo") => (kind === "schedule" ? `没有找到「${words}」这个日程，卡片没有改。` : kind === "memo" ? `没有找到「${words}」这篇笔记，卡片没有改。` : `没有找到「${words}」这条未完成的待办，卡片没有改。`),
    notLinked: (title, events) => `「${title}」没有关联${events.map((event) => `「${event}」`).join("、")}，卡片没有改。`,
    notAbout: (title, names) => `「${title}」里没有提到${names.join("、")}，卡片没有改。`,
    whichRecord: (names) => `你说的是哪一条？有${names.map((name) => `「${name}」`).join("、")}。卡片还没有改。`,
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
  /** AE-XL-014: the open to-dos whose title holds the words, with the people each is about (ids and names only). */
  findTodos?: (words: string) => Promise<{ id: string; title: string; people: { id: string; name: string }[] }[]>;
  /** The to-dos, schedule items or notes whose words hold these, with what a card about them shows (findTodos is the to-do fallback). */
  findRecords?: (kind: RecordKind, words: string) => Promise<FoundRecord[]>;
}

export type RecordKind = "todo" | "schedule" | "memo";

/** A record a correction may move the card's change to: what its card line shows and what the change is checked against. */
export interface FoundRecord {
  id: string;
  title: string;
  people: { id: string; name: string }[];
  /** To-do: open / completed. */
  status?: string;
  /** Schedule item: its (series) start, end, zone and repetition. */
  startsAt?: string;
  endsAt?: string | null;
  timeZone?: string | null;
  recurrence?: string | null;
  /** Note: its version, people, recorded interaction and linked events (with their titles when known). */
  version?: number;
  contactIds?: string[];
  interaction?: NoteInteractionContract | null;
  eventRefs?: { kind: "platform" | "private"; id: string }[];
  eventTitles?: Record<string, string>;
}

/** A card revision's result; `mentioned` are the records the words named (the session's records mentioned last). */
export type CardRevisionResult = AgentEntryExecuteResult & { mentioned?: { type: string; id: string; name: string }[] };

type Plan =
  | { kind: "drop"; item: Item }
  | { kind: "revise"; item: Item; intents: CardOperationIntent[]; lead: "changed" | "scope"; scope?: { before: string; after: string } }
  | { kind: "say"; text: string }
  | { kind: "reject" }
  | { kind: "retarget"; item: Item; intents: CardOperationIntent[]; after: string; mentioned: { type: string; id: string; name: string }[] };

/** The newest card of this conversation waiting for the click (an import card is revised by import-revision.ts). */
async function waitingCard(deps: CardRevisionDeps): Promise<AgentActionRecord | null> {
  const waiting = await deps.runtime.listActions({ status: "awaiting_confirmation", workflowKey: "agent_v1_card" }).catch(() => []);
  return [...waiting]
    .filter((action) => action.origin?.kind === "conversation" && action.origin.conversationId === deps.sessionId && !action.operations.some((op) => op.capability === CONTACT_IMPORT))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

/** A cheap first look: no word of a change at all, no ledger read. */
export function mayReviseCard(message: string): boolean {
  return correctionWords(message) !== null || CANCEL.test(message) || CANCEL_WEAK.test(message) || DROP_STRONG.test(message) || DROP_WEAK.test(message) || CHANGE.test(message) || THIS_TIME_WORDS.test(message) || SERIES_WORDS.test(message);
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

/** The kind of record an item changes when a correction may move it to another record of that kind; null when it cannot. */
function movableKind(item: Item, intent: CardOperationIntent | null): RecordKind | null {
  if (!intent || !item.op.targetRef) return null;
  const raw = intent as unknown as { capability: string; links?: boolean; targetId?: string; set?: Record<string, unknown> };
  if (!raw.targetId) return null;
  switch (raw.capability) {
    case "todo.update":
      return raw.links ? null : "todo";
    case "todo.complete":
    case "todo.reopen":
    case "todo.delete":
      return "todo";
    case "schedule.update":
      return typeof raw.set?.startsAt === "string" && !raw.set.eventRefs ? "schedule" : null;
    case "schedule.delete":
      return "schedule";
    case "memo.update":
      return "memo";
    default:
      return null;
  }
}

const refKey = (ref: { kind: string; id: string }) => `${ref.kind}:${ref.id}`;
const refsIn = (value: unknown): { kind: "platform" | "private"; id: string }[] => (Array.isArray(value) ? value : []).flatMap((ref) => {
  if (typeof ref === "string") {
    const at = ref.indexOf(":");
    const kind = ref.slice(0, at);
    return (kind === "platform" || kind === "private") && at > 0 ? [{ id: ref.slice(at + 1), kind }] : [];
  }
  return ref && typeof ref === "object" && ((ref as { kind?: unknown }).kind === "platform" || (ref as { kind?: unknown }).kind === "private") && typeof (ref as { id?: unknown }).id === "string" ? [{ id: (ref as { id: string }).id, kind: (ref as { kind: "platform" | "private" }).kind }] : [];
});

/** The same change, on the record found instead: the intent for it, or what keeps it from fitting (said, the card left as it is). */
function movedIntent(intent: CardOperationIntent, record: FoundRecord, deps: CardRevisionDeps, locale: CardLocale): CardOperationIntent | { say: string } {
  const raw = intent as unknown as Record<string, unknown> & { capability: string; set?: Record<string, unknown>; shown?: Record<string, unknown>; before?: Record<string, unknown> };
  const set = { ...(raw.set ?? {}) };
  const shown = { ...(raw.shown ?? {}) };
  switch (raw.capability) {
    case "todo.update":
      return { ...raw, targetId: record.id } as unknown as CardOperationIntent;
    case "todo.complete":
    case "todo.reopen":
    case "todo.delete":
      return { ...raw, shown: { ...shown, status: record.status ?? shown.status, title: record.title }, targetId: record.id } as unknown as CardOperationIntent;
    case "schedule.update":
    case "schedule.delete": {
      if (!record.startsAt) return { say: WORDS[locale].notFound(record.title, "schedule") };
      const oldZone = typeof shown.timeZone === "string" ? shown.timeZone : deps.timeZone;
      const zone = record.timeZone || oldZone;
      const repeats = record.recurrence === "daily" || record.recurrence === "weekly" || record.recurrence === "monthly" ? record.recurrence : null;
      const wantedDay = set.scope === "this_occurrence" && typeof set.occurrenceDate === "string" ? set.occurrenceDate : null;
      let scope: string;
      let anchorDay: string;
      if (repeats && wantedDay) {
        const from = instantOf(wantedDay, "00:00", zone);
        if (!occurrenceIn(record.startsAt, repeats, from, new Date(Date.parse(from) + 86_400_000).toISOString())) return { say: WORDS[locale].noDay(record.title, dayText(wantedDay, locale)) };
        scope = "this_occurrence";
        anchorDay = wantedDay;
      } else {
        scope = repeats ? "whole_series" : raw.capability === "schedule.delete" ? "single" : "whole_series";
        anchorDay = localDayOf(record.startsAt, zone);
      }
      const recordLength = record.endsAt ? Date.parse(record.endsAt) - Date.parse(record.startsAt) : null;
      const beforeStart = instantOf(anchorDay, localTimeOf(record.startsAt, zone), zone);
      const beforeEnd = recordLength !== null ? new Date(Date.parse(beforeStart) + recordLength).toISOString() : null;
      const occurrence = scope === "this_occurrence" ? { occurrenceDate: anchorDay } : {};
      const baseSet: Record<string, unknown> = { ...set, scope };
      delete baseSet.occurrenceDate;
      if (raw.capability === "schedule.delete") {
        return { ...raw, set: { ...baseSet, ...occurrence }, shown: { ...shown, repeats, startsAt: beforeStart, timeZone: zone, title: record.title }, targetId: record.id } as unknown as CardOperationIntent;
      }
      // The new time of day of the change, on that item's day; its own length unless the change set another.
      const start = instantOf(anchorDay, localTimeOf(String(set.startsAt), oldZone), zone);
      const before = (shown.before ?? {}) as { startsAt?: string; endsAt?: string | null };
      const changeLength = typeof set.endsAt === "string" ? Date.parse(set.endsAt) - Date.parse(String(set.startsAt)) : null;
      const oldLength = before.startsAt && before.endsAt ? Date.parse(before.endsAt) - Date.parse(before.startsAt) : null;
      const length = changeLength !== null && oldLength !== null && changeLength === oldLength ? recordLength ?? changeLength : changeLength ?? recordLength;
      const next: Record<string, unknown> = { ...baseSet, ...occurrence, startsAt: start };
      delete next.endsAt;
      if (length !== null) next.endsAt = new Date(Date.parse(start) + length).toISOString();
      return { ...raw, set: next, shown: { ...shown, before: { endsAt: beforeEnd, startsAt: beforeStart }, repeats, timeZone: zone, title: record.title }, targetId: record.id } as unknown as CardOperationIntent;
    }
    case "memo.update": {
      if (raw.links) {
        // The events the change takes off (or adds), on that note's own links.
        const before = refsIn((raw.before as { eventRefs?: unknown } | undefined)?.eventRefs);
        const after = refsIn(set.eventRefs);
        const removed = before.filter((ref) => !after.some((other) => refKey(other) === refKey(ref)));
        const added = after.filter((ref) => !before.some((other) => refKey(other) === refKey(ref)));
        const events = (shown.events ?? { after: [], before: [] }) as { before: string[]; after: string[] };
        const labels = new Map<string, string>([...before.map((ref, index) => [refKey(ref), events.before[index]] as const), ...after.map((ref, index) => [refKey(ref), events.after[index]] as const)].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
        for (const [key, title] of Object.entries(record.eventTitles ?? {})) if (!labels.has(key)) labels.set(key, title);
        const label = (ref: { kind: string; id: string }) => labels.get(refKey(ref)) ?? ref.id;
        const current = refsIn(record.eventRefs);
        const missing = removed.filter((ref) => !current.some((other) => refKey(other) === refKey(ref)));
        if (missing.length) return { say: WORDS[locale].notLinked(record.title, missing.map(label)) };
        const rest = [...current.filter((ref) => !removed.some((other) => refKey(other) === refKey(ref))), ...added.filter((ref) => !current.some((other) => refKey(other) === refKey(ref)))];
        return { ...raw, before: { eventRefs: current }, expectedVersion: record.version ?? Number(raw.expectedVersion ?? 1), set: { eventRefs: rest }, shown: { ...shown, events: { after: rest.map(label), before: current.map(label) }, title: record.title }, targetId: record.id } as unknown as CardOperationIntent;
      }
      // An interaction: the people it is with must be on that note.
      const interaction = set.interaction as NoteInteractionContract | undefined;
      const contactIds = record.contactIds ?? record.people.map((person) => person.id);
      const names = { ...((shown.names ?? {}) as Record<string, string>), ...Object.fromEntries(record.people.map((person) => [person.id, person.name])) };
      const absent = (interaction?.actualContactIds ?? []).filter((id) => !contactIds.includes(id));
      if (!interaction || absent.length) return { say: WORDS[locale].notAbout(record.title, absent.map((id) => names[id] ?? id)) };
      return { ...raw, expectedVersion: record.version ?? Number(raw.expectedVersion ?? 1), shown: { ...shown, before: record.interaction ?? null, contactIds: [...contactIds], names, title: record.title }, targetId: record.id } as unknown as CardOperationIntent;
    }
    default:
      return { say: WORDS[locale].notFound(record.title) };
  }
}

/** The records of a kind whose words hold these (the to-do finder of AE-XL-014 when no other is given). */
async function findOf(deps: CardRevisionDeps, kind: RecordKind, words: string): Promise<FoundRecord[]> {
  if (deps.findRecords) return deps.findRecords(kind, words);
  if (kind === "todo" && deps.findTodos) return (await deps.findTodos(words)).map((todo) => ({ ...todo, status: "open" }));
  return [];
}

/** 「不是这个，是X那个」: the item meant (the only one a correction can move, or the one named) gets the same change on X. */
async function correctionPlan(deps: CardRevisionDeps, correction: { words: string; wrong: string | null }, items: readonly Item[], intents: readonly (CardOperationIntent | null)[], locale: CardLocale): Promise<Plan | null> {
  const which = (list: readonly Item[]): Plan => ({ kind: "say", text: WORDS[locale].which(list.map((item) => item.name)) });
  const movable = items.filter((item) => movableKind(item, intents[item.index]));
  let candidates: Item[] = movable;
  if (correction.wrong) {
    const ref = referenceOf(correction.wrong) ?? { ordinal: null, span: correction.wrong, words: correction.wrong.replace(/^the\s+/iu, "") };
    const named = referredItems(ref, items, intents, deps);
    if (named.length !== 1) return which(named.length > 1 ? named : movable.length ? movable : items);
    if (!movable.includes(named[0])) return null;
    candidates = [named[0]];
  }
  if (!candidates.length || (!deps.findRecords && !deps.findTodos)) return null;
  const kinds = [...new Set(candidates.map((item) => movableKind(item, intents[item.index])!))];
  const foundByKind = new Map<RecordKind, FoundRecord[]>();
  for (const kind of kinds) {
    const own = new Set(candidates.filter((item) => movableKind(item, intents[item.index]) === kind).map((item) => item.op.targetRef!.id));
    foundByKind.set(kind, (await findOf(deps, kind, correction.words)).filter((record) => !own.has(record.id)));
  }
  if (candidates.length > 1) {
    const withFound = candidates.filter((item) => foundByKind.get(movableKind(item, intents[item.index])!)!.length);
    if (withFound.length !== 1) return withFound.length ? which(withFound) : { kind: "say", text: WORDS[locale].notFound(correction.words, kinds.length === 1 ? kinds[0] : undefined) };
    candidates = withFound;
  }
  const item = candidates[0];
  const kind = movableKind(item, intents[item.index])!;
  const capability = item.op.capability;
  const found = foundByKind.get(kind)!.filter((record) => kind !== "todo" || !record.status || (capability === "todo.reopen" ? record.status === "completed" : record.status === "open"));
  const exact = found.filter((record) => squash(record.title) === squash(correction.words));
  const meant = exact.length === 1 ? exact : found;
  if (!meant.length) return { kind: "say", text: WORDS[locale].notFound(correction.words, kind) };
  if (meant.length > 1) return { kind: "say", text: WORDS[locale].whichRecord(meant.slice(0, 3).map((record) => record.title)) };
  const moved = movedIntent(intents[item.index]!, meant[0], deps, locale);
  if ("say" in moved) return { kind: "say", text: moved.say };
  const next = intents.map((intent, index) => (index === item.index ? moved : intent)).filter((intent): intent is CardOperationIntent => intent !== null);
  return { after: meant[0].title, intents: next, item, kind: "retarget", mentioned: [{ id: meant[0].id, name: meant[0].title, type: kind }, ...meant[0].people.map((person) => ({ id: person.id, name: person.name, type: "contact" }))] };
}

/** Words that add another record beside the card's ("也", "also"): not a reference to one of its items. */
const ALSO = /(也|还有|另外|再|\balso\b|\btoo\b|\bas well\b|も)/iu;

/** What the words do to the card, or null when they are not about it. */
async function planFor(deps: CardRevisionDeps, card: AgentActionRecord, locale: CardLocale): Promise<Plan | null> {
  const message = deps.message;
  const items: Item[] = card.operations.map((op, index) => ({ creates: !op.targetRef, index, name: itemNameOf(op), op }));
  const intents = card.operations.map((op) => cardIntentOf(op, card.operations));
  // 0. AE-XL-014: another record for one of the card's items ("不是这条，是给李薇寄样片那条"): the same change, that record.
  const correction = correctionOf(message);
  if (correction) return correctionPlan(deps, correction, items, intents, locale);
  // The item the words point at (「王磊那条」「第二条」「三点那个」): exactly one, or the words fit none or several (asked).
  const ref = referenceOf(message);
  const referred = ref ? referredItems(ref, items, intents, deps) : null;
  const named = referred ? (referred.length === 1 ? referred[0] : null) : namedItem(message, items);
  const unresolved = referred !== null && referred.length !== 1 && !(referred.length === 0 && ALSO.test(message));
  const rest = ref ? message.replace(ref.span, " ") : message;
  const ask = (patterns: readonly RegExp[]): Plan | null => (onlyAbout(rest, patterns, null) ? { kind: "say", text: WORDS[locale].which((referred && referred.length > 1 ? referred : items).map((item) => item.name)) } : null);
  if (referred && !referred.length && !unresolved) return null;
  // 0b. AE-XL-016: calling off the card's change (「算了先别建」「やっぱりやめとく」"never mind, don't create it") rejects the card,
  // as its reject button does. On a card of one item, taking that item off is the same (「这条不要了」). A hold, a new value,
  // an item of several named, or any word beyond the cancel leaves the card waiting.
  if (!HOLD.test(message) && !CHANGE.test(message) && !unresolved) {
    const saysItem = ITEM_WORDS.test(message) || ordinalOf(message) !== null || ref !== null;
    const cancels = CANCEL.test(message) || (items.every((item) => item.creates) && CANCEL_WEAK.test(message));
    const single = items.length === 1 && Boolean(named || saysItem);
    if ((cancels && (single || (!named && !saysItem))) || (single && DROP_STRONG.test(message))) {
      if (onlyAbout(rest, [CANCEL, CANCEL_WEAK, DROP_STRONG, ITEM_WORDS, KIND_WORDS], single ? items[0] : null, 0)) return { kind: "reject" };
    }
  }
  // 1. Taking an item off.
  const strong = DROP_STRONG.test(message);
  const weak = !strong && DROP_WEAK.test(message);
  if ((strong || weak) && !CHANGE.test(message)) {
    if (unresolved) return ask([DROP_STRONG, DROP_WEAK, ITEM_WORDS]);
    const saysItem = ITEM_WORDS.test(message) || ordinalOf(message) !== null || ref !== null;
    // "不用了" alone may answer something else; without the item's name or "那项" it is left to the graph.
    const target = named ?? (saysItem && items.length === 1 ? items[0] : null);
    if (weak && !(target?.creates || saysItem)) return null;
    if (!onlyAbout(rest, [DROP_STRONG, DROP_WEAK, ITEM_WORDS], target)) return null;
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
  // 3. A new day or time (the words of the pointer are not the new value: 「三点那个改到五点」).
  if (CHANGE.test(message)) {
    if (unresolved) return ask([CHANGE, DATE_WORDS, TIME_WORDS, FIELD_WORDS]);
    const day = resolveSaidDate(rest, deps.now(), deps.timeZone)?.day ?? null;
    const times = resolveSaidTimes(rest) ?? (/(中午|正午|\bnoon\b|昼)/iu.test(rest) ? { start: "12:00" } : null);
    if (!day && !times) return null;
    const change = { day, due: DUE.test(message), plan: PLAN.test(message), times };
    const fits = items.map((item) => ({ item, next: intents[item.index] ? withNewWhen(intents[item.index]!, change, deps.timeZone) : null })).filter((entry) => entry.next);
    const target = named ? fits.find((entry) => entry.item === named) ?? null : fits.length === 1 ? fits[0] : null;
    if (!onlyAbout(rest, [CHANGE, DATE_WORDS, TIME_WORDS, FIELD_WORDS], target?.item ?? named)) return null;
    if (!target) return fits.length > 1 ? { kind: "say", text: WORDS[locale].which(fits.map((entry) => entry.item.name)) } : null;
    const next = intents.map((intent, index) => (index === target.item.index ? target.next! : intent)).filter((intent): intent is CardOperationIntent => intent !== null);
    return { intents: next, item: target.item, kind: "revise", lead: "changed" };
  }
  return null;
}

/** The rows of an item whose new value differs after the revision (the item found again by its card line's record). */
function changedRows(item: Item, before: readonly AgentActionOperationPayload[], after: readonly AgentActionOperationPayload[]): { label: string; value: string }[] {
  const record = item.op.display?.record;
  const same = record ? after.filter((op) => op.display?.record === record) : [];
  const next = same.length === 1 ? same[0] : after[item.index] ?? null;
  const old = new Map((before[item.index]?.display?.rows ?? []).map((row) => [row.field, String(row.after ?? "")]));
  return (next?.display?.rows ?? []).filter((row) => old.get(row.field) !== String(row.after ?? "")).map((row) => ({ label: row.label, value: String(row.after ?? "") }));
}

/** AE-XL-016: the short reply to a cancel, in the user's language: nothing is created (or changed). */
const CANCELLED: Record<CardLocale, (creates: boolean, count: number) => string> = {
  en: (creates, count) => (creates ? `OK, I won't create ${count > 1 ? "them" : "it"}.` : "OK, I won't make that change."),
  ja: (creates) => (creates ? "わかりました。今回は作成しません。" : "わかりました。今回は変更しません。"),
  zh: (creates, count) => (creates ? `好，这${count > 1 ? "几" : ""}条先不建了。` : "好，这次先不改了。"),
};

/**
 * AE-XL-016: the card is rejected as its reject button rejects it — the same decision (decideAction, recorded with its
 * revision and hash), the same state, and the request that showed the card follows it (refreshCardInDocument, as the
 * button's route hook does), so both clients show it rejected. This turn shows no card; nothing is written.
 */
async function rejectByWords(deps: CardRevisionDeps, card: AgentActionRecord, before: AgentActionPreviewContract, revision: number, cardLanguage: CardLocale): Promise<CardRevisionResult | null> {
  if (!deps.runtime.decideAction) return null;
  const decision = await deps.runtime.decideAction({ actionId: card.actionId, clientDecisionId: `words:${card.actionId}:${revision}`, decision: "reject", payloadHash: card.payloadHash ?? "", revision });
  if (!decision) return null;
  const action = await deps.runtime.getAction(card.actionId);
  const preview = action ? agentCardPreview(action, await deps.runtime.getRun(action.runId), deps.now()) : null;
  if (preview && deps.store) await refreshCardInDocument({ actorId: deps.actorId, now: deps.now(), previous: before, store: deps.store, updated: preview }).catch(() => false);
  if (action?.status !== "rejected") {
    emitTrace({ cardId: card.actionId, reason: decision.reason ?? decision.outcome, type: "card.revision_refused" });
    return { partResults: [{ partId: "p1", reason: "card_closed", route: "answer", sourceQuote: deps.message, status: "answered" }], sourceRefs: [], status: "completed", text: WORDS[cardLanguage].closed };
  }
  emitTrace({ cardId: card.actionId, revision, type: "card.rejected_by_words" });
  const language = deps.message.trim() ? (languageOfText(deps.message) as CardLocale) : cardLanguage;
  const creates = card.operations.every((op) => !op.targetRef);
  return { partResults: [{ partId: "p1", reason: "card_rejected_by_words", route: "answer", sourceQuote: deps.message, status: "answered" }], sourceRefs: [], status: "completed", text: CANCELLED[language](creates, card.operations.length) };
}

export async function reviseCardByWords(deps: CardRevisionDeps): Promise<CardRevisionResult | null> {
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
  if (plan.kind === "reject") return rejectByWords(deps, card, before, revision, locale);
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
  // A summary that stays the same («新增2项» → «新增2项») is never said as a change: the item's new values are said instead.
  const sameTitle = before.title === preview.title;
  const lead = plan.kind === "drop" ? (sameTitle ? words.droppedOnly(plan.item.name) : words.dropped(plan.item.name, before.title, preview.title)) : plan.kind === "retarget" ? words.retargeted(plan.item.name, plan.after) : plan.lead === "scope" && plan.scope ? words.scope(plan.item.name, plan.scope.before, plan.scope.after) : sameTitle ? words.changedTo(plan.item.name, changedRows(plan.item, card.operations, action.operations)) : words.changed(plan.item.name, before.title, preview.title);
  const cardLine = cardLineOf(preview, locale);
  emitTrace({ cardId: card.actionId, item: plan.item.op.operationId, kind: plan.kind === "drop" ? "drop" : plan.kind === "retarget" ? "retarget" : plan.lead, revision: preview.revision, type: "card.revised_by_words" });
  return { ...respond(`${lead}\n\n${cardLine}`, preview, "card_revised"), cardLine, ...(plan.kind === "retarget" ? { mentioned: plan.mentioned } : {}) };
}
