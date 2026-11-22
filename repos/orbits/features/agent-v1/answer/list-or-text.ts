/**
 * Hotfix 2026-11-20 (judges on the hotfix regression run: AE-SCL-025 「明天这场周会关联了哪些人和哪篇笔记？」 was answered by
 * the model and then replaced with 「明天（11月16日）有 1 个日程：」 and one card; AE-UND-015's 「10時から11時まで」 became a card
 * with only the start). The list code writes (answer/list-answer.ts) may replace the model's answer only when it says
 * everything that answer said. Two signals, both code's; when in doubt the model's grounded text stays and its records go
 * under it as the small "mentioned" cards:
 *  1. what the message asks for — anything beyond which records there are (who, which note, why, how long, from when to
 *     when, whether, what it says, a comparison) keeps the text;
 *  2. what the model's text says — after taking out the cards' contents, the records' own fields (title, linked people,
 *     place, repetition), dates, times, counts and the words for states and kinds, anything left means it says more.
 */
import type { AgentAnswerRecordContract } from "../../../shared/contract/agent-v1";
import type { Language } from "../functions/copy";

const BEYOND_LISTING = new RegExp([
  "谁|哪些人|哪位|哪几位|哪篇|哪条笔记|关联|相关的人|和谁|跟谁|为什么|为啥|原因|理由|多久|多长时间|几点到几点|几点结束|什么时候结束|是否|是不是|有没有.{0,8}(?:关联|相关|写)|比较|对比|哪个更|哪个好|区别|写了什么|说了什么|讲了什么|内容是|什么内容",
  "誰|どなた|なぜ|どうして|理由|どのくらい|何時から|何時まで|何時に終わ|関連|比べ|違い|何が書|内容",
  "\\bwho\\b|\\bwhom\\b|\\bwhy\\b|\\breasons?\\b|\\bhow long\\b|\\buntil when\\b|\\bwhen does .{0,20} end\\b|\\bwhether\\b|\\blinked\\b|\\brelated\\b|\\bcompare|\\bdifference\\b|\\bwhat does .{0,30} say\\b|\\bwhat did .{0,30} say\\b",
].join("|"), "iu");

/** Signal 1: the message asks about more than which records there are. */
export function asksBeyondListing(quote: string): boolean {
  return BEYOND_LISTING.test(quote);
}

/** Dates, times, weekdays, counts — the cards and code's lead say these. */
const DATE_TIME = new RegExp([
  "\\d{4}年|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*[日号]?|\\d{1,2}\\s*[日号]|[（(](?:周|星期)?[一二三四五六日天][)）]|[（(][月火水木金土日][)）]|周[一二三四五六日天]|星期[一二三四五六日天]|[月火水木金土日]曜日?",
  "\\d{1,2}[:：]\\d{2}|\\d{1,2}\\s*時(?:\\s*\\d{1,2}\\s*分)?|\\d{1,2}\\s*点(?:\\s*\\d{1,2}\\s*分|半)?|\\d{4}-\\d{2}-\\d{2}",
  "\\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\\b\\.?|\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*\\d{0,2}|\\b\\d+(?:st|nd|rd|th)?\\b",
  "[0-9０-９]+|[一二两三四五六七八九十几]+\\s*(?:项|件|条|个|场|位|篇|天|次|人)",
].join("|"), "giu");

/** Words for states, kinds, links, listing and order — no fact of their own. */
const PLAIN_WORDS = new RegExp([
  // zh
  "状态|未完成|没完成|还没完成|完成|已完成|截止时间|截止|到期|计划日期|计划日|计划在|计划|已经过了|过了|已过|过期|逾期|已逾期|一天|天|待办|日程|活动|笔记|联系人|安排|记录里|记录|标注|备注|写着|写的是|关联|相关|联系人是|与|和|跟|及|以及|或|也|都|还|还有|你有|你|我|有|共|一共|总共|全部|其中|以下|如下|下面|这些|这|那|是|为|的|了|在|到|从|至|于|之|前|后|上午|中午|下午|晚上|今天|明天|昨天|本周|下周|这周|上周|本月|这个月|下个月|目前|现在|时间|每周|每天|每月|重复|没有|没|未|已经|已|一共有|分别|包括|一条|一个|一项|条|项|件|个|场|位|篇|里|上|下|日|号|周",
  // ja
  "は|が|を|に|の|で|と|も|へ|や|から|まで|です|ます|あります|います|ありません|ない|件|未完了|完了|期限切れ|期限|予定日|予定|タスク|メモ|イベント|連絡先|関連|過ぎ|ている|ています|毎週|毎日|繰り返し|今日|明日|全部|うち|入って|入っています|ToDo",
  // en
  "\\b(?:you|your|have|has|had|there|are|is|was|the|a|an|and|or|of|to|on|at|in|for|with|by|from|until|due|planned|plan|open|overdue|done|completed|complete|status|linked|item|items|to-?dos?|tasks?|events?|notes?|schedule|it|its|this|that|these|them|they|which|repeats?|weekly|daily|monthly|all|total|still|not|yet|no|none|also|both|day|days|ago|past|since|today|tomorrow|yesterday|week|month|am|pm)\\b",
].join("|"), "giu");

/** Letters of the text as a count of meaning: each CJK character, and Latin letters by fives (a word). */
function weight(text: string): number {
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
  return cjk + latin / 5;
}

/** What is left above this is "more than the cards say" (two or three content words). */
export const SAYS_MORE = 6;

/**
 * Signal 2: what the model's text says beyond the cards and the records' own fields (`facts`: the material lines a card stands
 * for — title, linked people, place, repetition). Returns the words left over, "" when it says nothing more.
 */
export function leftOver(text: string, cards: readonly AgentAnswerRecordContract[], facts: readonly string[]): string {
  let rest = text;
  const known = [...cards.flatMap((card) => [card.title, card.top, card.sub, card.why].filter((value): value is string => Boolean(value?.trim())).flatMap((value) => [value, ...value.split(/\s*[·,，、]\s*/u)])), ...facts]
    .map((value) => value.trim())
    .filter((value) => [...value].length >= 2)
    .sort((left, right) => right.length - left.length);
  for (const value of known) rest = rest.split(value).join(" ");
  rest = rest.replace(DATE_TIME, " ").replace(PLAIN_WORDS, " ").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
  return rest;
}

export function textSaysMore(text: string, cards: readonly AgentAnswerRecordContract[], facts: readonly string[]): boolean {
  return weight(leftOver(text, cards, facts)) > SAYS_MORE;
}

/** The record fields a card stands for, from the material lines ("Title: …", "Linked contacts: …", "With: …", "Place: …", "Repeats: …"). */
export function cardFactsOf(sentences: readonly string[]): string[] {
  const out: string[] = [];
  for (const sentence of sentences) {
    const match = sentence.match(/^(?:Title|Linked contacts?|With|Place|Repeats|Linked notes|Linked events|For the events|Event|Name|Organization|Role):\s*(.+)$/u);
    if (match) out.push(match[1], ...match[1].split(/\s*,\s*/u));
  }
  return out;
}

/**
 * Hotfix 2026-11-20, part 1b item 2 (both judges, AE-RD-012 turn 2: 「其中 3 项已经过期或过了计划日」 above cards that mark 4):
 * a model sentence that counts the overdue to-dos read this turn says code's number. `late`: past the deadline or the
 * planned day (what the cards mark); `dueLate`: past the deadline only. A phrase naming only the deadline ("已过期", "overdue")
 * may give either; a phrase naming both gives `late`. Any other number there is replaced; the sentence is kept.
 */
export function withCodeLateCount(text: string, counts: { late: number; dueLate: number }): { text: string; changed: { from: number; to: number }[] } {
  const changed: { from: number; to: number }[] = [];
  const fix = (said: string, phrase: string): string => {
    const n = Number(said);
    const both = /(或|和|及|与|または|や|\bor\b|\band\b).{0,6}(计划|予定日|planned)|(计划|予定日|planned).{0,6}(或|和|または|\bor\b)/iu.test(phrase);
    const plannedOnly = !both && /(过了计划日|已过计划日|计划日已过|予定日を過ぎ|planned day)/iu.test(phrase);
    const ok = both ? [counts.late] : plannedOnly ? [counts.late - counts.dueLate] : [counts.dueLate, counts.late];
    if (!Number.isFinite(n) || ok.includes(n)) return said;
    const to = ok[ok.length - 1];
    changed.push({ from: n, to });
    return String(to);
  };
  const late = "(?:已经|都|已)?(?:过期|逾期|超期|过了计划日|已过计划日|过了期限)(?:或(?:者)?(?:已经)?过了计划日|或计划日已过)?";
  // Eval 2026-11-23 (AE-H-008, AE-MEM-005): the phrase after a number holds no other number — 「5件没做完的待办，其中2件已经过了期限」
  // counts 2 overdue, not 5.
  let out = text.replace(new RegExp(`(\\d+)(\\s*(?:项|件|条|个)[^。；;\\n\\d]{0,12}?${late})`, "gu"), (_m, said: string, rest: string) => `${fix(said, rest)}${rest}`);
  out = out.replace(new RegExp(`((?:过期|逾期|过了计划日)[^。；;\\n\\d]{0,8}?)(\\d+)(\\s*(?:项|件|条|个))`, "gu"), (_m, head: string, said: string, unit: string) => `${head}${fix(said, head)}${unit}`);
  out = out.replace(/(\d+)(\s*件[^。\n\d]{0,10}?(?:期限を過ぎ|期限切れ|期限超過|予定日を過ぎ)[^。\n]{0,12})/gu, (_m, said: string, rest: string) => `${fix(said, rest)}${rest}`);
  out = out.replace(/((?:期限を過ぎ|期限切れ|期限超過|予定日を過ぎ)[^。\n\d]{0,12}?)(\d+)(\s*件)/gu, (_m, head: string, said: string, unit: string) => `${head}${fix(said, head)}${unit}`);
  out = out.replace(/\b(\d+)(\s+(?:of them\s+)?(?:(?:are|is|were)\s+)?(?:overdue|past (?:their|its|the) (?:deadline|due date|planned day)(?:\s+or\s+planned day)?))/giu, (_m, said: string, rest: string) => `${fix(said, rest)}${rest}`);
  return { changed, text: out };
}

/**
 * Hotfix 1c (AE-RD-012 turn 2: 「已逾期一天」 copied from the record's note while the card said 已过期5天): how late a to-do is,
 * said in the model's sentence or point that names it, is code's — the card's own lower line, measured against the turn's
 * clock. Only a phrase with a number of days is replaced; the sentence stays.
 */
export function withCodeLateness(text: string, cards: readonly AgentAnswerRecordContract[]): { text: string; changed: string[] } {
  const changed: string[] = [];
  const late = cards.filter((card) => card.kind === "todo" && card.subTone === "late" && card.sub && card.title);
  if (!late.length) return { changed, text };
  const DAYS = /(?:已经|已)?(?:逾期|过期|超期)了?\s*(?:[一二两三四五六七八九十]+|\d+)\s*天|(?:\d+)\s*日超過|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\s+(?:overdue|late|past due)\b/giu;
  // AG21c (R51): other ways of saying it ("晚了6天", "拖了六天", "超过截止日6天", "期限を6日過ぎて", "six days past the deadline"):
  // only the number becomes the card's, so the sentence keeps its own wording.
  const OTHER_DAYS = /((?:晚了|拖了|迟了|超过(?:截止日?|期限)?)\s*)([一二两三四五六七八九十]+|\d+)(\s*天)|((?:期限|締め切り|締切)を\s*)?(\d+)(\s*日(?:以上)?(?:過ぎ|超え|遅れ))|\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(\s+days?\s+(?:past (?:the|its) (?:deadline|due date)|behind(?: schedule)?))\b/giu;
  const out = text.split(/(?<=[。；;\n])/u).map((segment) => {
    const card = late.find((item) => segment.includes(item.title));
    if (!card) return segment;
    const days = /\d+/u.exec(card.sub!)?.[0] ?? null;
    const fixed = segment.replace(DAYS, (said) => {
      if (said === card.sub) return said;
      changed.push(`${said} → ${card.sub}`);
      return /^[A-Za-z]/u.test(card.sub!) ? card.sub!.toLowerCase() : card.sub!;
    });
    if (!days) return fixed;
    return fixed.replace(OTHER_DAYS, (said, zhHead?: string, zhN?: string, zhTail?: string, jaHead?: string, jaN?: string, jaTail?: string, enN?: string, enTail?: string) => {
      const n = zhN ?? jaN ?? enN;
      if (n === days) return said;
      const plural = enTail ? enTail.replace(/^\s+days?/u, Number(days) === 1 ? " day" : " days") : "";
      const to = zhHead !== undefined ? `${zhHead}${days}${zhTail}` : jaN !== undefined ? `${jaHead ?? ""}${days}${jaTail}` : `${days}${plural}`;
      changed.push(`${said} → ${to}`);
      return to;
    });
  });
  return { changed, text: out.join("") };
}

/** Hotfix 1c (AE-SCL-008: 「Notes: 已过期」 on screen): a material's field label copied into a zh or ja answer goes; its value stays.
 *  Integration 2026-11-20: also the all-day labels ("Day:", "Last day:" — AG20a's private events, all-day schedule items). */
const FIELD_LABEL = /\b(?:Notes|Status|Due|Planned date|Title|Linked contacts?|Linked events|Linked notes|Starts|Ends|Last day|Day|Place|With|Repeats|Name|Organization|Role)\s*[:：]\s*/gu;

export function withoutFieldLabels(text: string, language: Language): string {
  return language === "en" ? text : text.replace(FIELD_LABEL, "");
}

/** A sentence saying records could not be read, or were not all read (zh, ja, en). */
const READ_FAILED = /(读不到|读不了|无法读取|没能读取|没有读取到|读取失败|没法读|没能读到|没有读到全部|没有全部读|(?:其他|其余|更早|之前|别的|其它)[^。，,；]{0,10}?(?:并)?没(?:有)?(?:读到|读取|看到)|読めておらず|読めません|読めませんでした|読み込めませ|読み取れませ|取得できませ|アクセスできませ|\bcouldn'?t (?:read|access|load)\b|\bcould not (?:read|access|load)\b|\bunable to (?:read|access|load)\b|\bcan(?:no|')t (?:read|access)\b|\bwasn'?t able to read\b|\bfailed to (?:read|load)\b)/iu;

/**
 * Hotfix 1c (AE-UND-015 run-03: 「カレンダーの予定は…読めておらず」 though the schedule read was complete): a sentence claiming
 * a read failed or was incomplete must agree with the read's coverage record. When every read of the part was complete and
 * nothing was withheld, unreadable or failed, such a sentence is not delivered.
 */
export function withoutFalseReadClaims(text: string, readAllFine: boolean): { text: string; dropped: string[] } {
  if (!readAllFine || !READ_FAILED.test(text)) return { dropped: [], text };
  const dropped: string[] = [];
  const kept = text.split("\n").map((line) => {
    const sentences = line.match(/[^。！？!?]+(?:[。！？!?]+|$)/gu) ?? [line];
    const parts = sentences.flatMap((sentence) => (/[A-Za-z]/u.test(sentence) && !/[぀-ヿ一-鿿]/u.test(sentence) ? sentence.split(/(?<=\.)[ \t]+/u) : [sentence]));
    return parts.filter((part) => {
      if (!READ_FAILED.test(part)) return true;
      dropped.push(part.trim());
      return false;
    }).join(/[A-Za-z]/u.test(line) && !/[぀-ヿ一-鿿]/u.test(line) ? " " : "").trim();
  });
  return { dropped, text: kept.filter((line) => line.trim()).join("\n") };
}

/**
 * Hotfix 1c (live: 「材料里没有显示…」「我读到的这条日程只有…」): "材料" (the materials we hand the model) and "what I read" are our
 * words, not the user's. They become the user's own: 记录 / 記録 / your records, and the record itself.
 */
const INTERNAL: Record<Language, [RegExp, string][]> = {
  en: [[/\b(?:in|from) the (?:provided )?materials?\b/giu, "in your records"], [/\bthe (?:provided )?materials?\b/giu, "your records"], [/\bthe (\w+) I read\b/giu, "the $1"], [/\bI (?:only )?read\b(?= that| the| this)/giu, "your records show"]],
  ja: [[/資料(?:には|では|に|で)/gu, "記録には"], [/資料/gu, "記録"], [/(?:私が)?読んだ(?=この|その)/gu, ""], [/読み取った(?=この|その)/gu, ""]],
  zh: [[/(?:根据)?材料(?:里|中|上)?(?:没有显示|没显示)/gu, "记录里没有写"], [/(?:根据)?材料(?:里|中|上)/gu, "记录里"], [/材料/gu, "记录"], [/我(?:这次)?(?:只)?读到的(?=这|那)/gu, ""], [/我(?:这次)?读到的/gu, ""]],
};

/**
 * AG21c (R52): a record's stored status ("open", "completed", "cancelled") said as the cards say it, and "这部分记录里" as
 * plain "记录里" — the same display words as the cards, never the stored codes.
 */
const STATUS_WORDS: Record<Language, [RegExp, string][]> = {
  en: [[/\b(?:has|is in) (?:the |a )?status\s*(?:of\s*|:\s*)?["“]?open["”]?/giu, "is not done yet"], [/\bwith (?:the |a )?status\s*(?:of\s*|:\s*)?["“]?open["”]?/giu, "that is not done yet"], [/\b(?:its |the )?status\s*(?:is|:)\s*["“]?open["”]?/giu, "it is not done yet"], [/\b(?:has|is in) (?:the |a )?status\s*(?:of\s*|:\s*)?["“]?completed["”]?/giu, "is done"]],
  ja: [[/(?:ステータス|状態)\s*(?:は|が|：|:)?\s*[「"]?open[」"]?\s*(?:のままです|のまま|です)?/giu, "未完了"], [/(?:ステータス|状態)\s*(?:は|が|：|:)?\s*[「"]?completed[」"]?(?:です)?/giu, "完了"]],
  zh: [[/(?:状态|狀態)\s*(?:为|是|：|:)?\s*[「"“]?open[」"”]?/giu, "还没完成"], [/[「"“]?open[」"”]?\s*状态/giu, "还没完成"], [/(?:状态|狀態)\s*(?:为|是|：|:)?\s*[「"“]?completed[」"”]?/giu, "已完成"], [/这部分记录里/gu, "记录里"]],
};

export function withoutInternalWords(text: string, language: Language): string {
  return [...INTERNAL[language], ...STATUS_WORDS[language]].reduce((out, [pattern, to]) => out.replace(pattern, to), text);
}

/** How many records a kept text may walk through point by point before the rest are left to the cards (a list shows five). */
export const POINTS_IN_TEXT = 5;
const POINT = /^\s*(?:[・•●▪◦\-–—*+]|\d{1,2}\s*[.．、)）]|[（(]\d{1,2}[)）])\s*/u;

/**
 * Hotfix 1c (live: 16 stale to-dos written out in the text and again as cards): when a kept model text has one point per
 * listed record for more than POINTS_IN_TEXT records, the points of the to-dos past their deadline stay (or the first five,
 * when none is), the other points go and one line says the rest are the cards below, in the list's order.
 */
export function withListedPointsTrimmed(text: string, cards: readonly AgentAnswerRecordContract[], language: Language): { text: string; dropped: number } {
  const lines = text.split("\n");
  const pointOf = (line: string) => (POINT.test(line) ? cards.find((card) => card.title && line.includes(card.title)) ?? null : null);
  const pointed = lines.map(pointOf);
  const count = pointed.filter(Boolean).length;
  if (count <= POINTS_IN_TEXT) return { dropped: 0, text };
  const late = new Set(cards.filter((card) => card.subTone === "late").map((card) => card.title));
  let kept = 0;
  const keep = (card: AgentAnswerRecordContract) => (late.size ? late.has(card.title) : kept < POINTS_IN_TEXT);
  const out: string[] = [];
  let dropped = 0;
  lines.forEach((line, index) => {
    const card = pointed[index];
    if (!card) return out.push(line);
    if (keep(card)) {
      kept += 1;
      return out.push(line);
    }
    dropped += 1;
  });
  if (!dropped) return { dropped: 0, text };
  const rest = { en: `The other ${dropped} are the cards below, by planned date.`, ja: `残りの${dropped}件は下のカードにあります（予定日の順）。`, zh: `其余 ${dropped} 项在下面的卡片里，按计划日期排。` }[language];
  // The line goes right after the last point kept (or where the points were).
  const lastPoint = out.map((line, index) => (pointOf(line) ? index : -1)).filter((index) => index >= 0).pop();
  const at = lastPoint === undefined ? out.length : lastPoint + 1;
  out.splice(at, 0, rest);
  return { dropped, text: out.join("\n") };
}

export type { Language };
