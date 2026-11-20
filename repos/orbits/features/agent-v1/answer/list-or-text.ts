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
  let out = text.replace(new RegExp(`(\\d+)(\\s*(?:项|件|条|个)[^。；;\\n]{0,12}?${late})`, "gu"), (_m, said: string, rest: string) => `${fix(said, rest)}${rest}`);
  out = out.replace(new RegExp(`((?:过期|逾期|过了计划日)[^。；;\\n\\d]{0,8}?)(\\d+)(\\s*(?:项|件|条|个))`, "gu"), (_m, head: string, said: string, unit: string) => `${head}${fix(said, head)}${unit}`);
  out = out.replace(/(\d+)(\s*件[^。\n]{0,10}?(?:期限を過ぎ|期限切れ|期限超過|予定日を過ぎ)[^。\n]{0,12})/gu, (_m, said: string, rest: string) => `${fix(said, rest)}${rest}`);
  out = out.replace(/((?:期限を過ぎ|期限切れ|期限超過|予定日を過ぎ)[^。\n\d]{0,12}?)(\d+)(\s*件)/gu, (_m, head: string, said: string, unit: string) => `${head}${fix(said, head)}${unit}`);
  out = out.replace(/\b(\d+)(\s+(?:of them\s+)?(?:(?:are|is|were)\s+)?(?:overdue|past (?:their|its|the) (?:deadline|due date|planned day)(?:\s+or\s+planned day)?))/giu, (_m, said: string, rest: string) => `${fix(said, rest)}${rest}`);
  return { changed, text: out };
}

export type { Language };
