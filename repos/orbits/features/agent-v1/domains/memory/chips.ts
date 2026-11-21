/**
 * AG14 UI (approved draft board 5, D4–D6): the chips at the start of an answer that say which saved memory it used.
 *
 * - used:    「按你存的偏好「周末上午」挑的」 — a saved preference (a time, a topic, or other words) that this ranking
 *            weighed; the client adds 「修改 ›」 to that entry in settings.
 * - skipped: 「只这一次：没按你存的「周末上午」」 — this turn's own words ("这次看周四晚上") overruled it; no 「修改」.
 * - rule:    「按你定的规矩，没放晚上的」 — an entry of 「一直遵守的」, said only when it removed results (D6); a rule
 *            that took nothing away ("回答用日语", or no evening event this week) is not said.
 * Everything is written here by code in the answer's language; the clients show the sentence as it is.
 */
import type { AgentAnswerMemoryUseContract } from "../../../../shared/contract/agent-v1";
import type { RecalledMemory } from "../../../agent/memory/recall";
import type { TimePreference } from "../../functions/basis";
import * as say from "../../functions/copy";
import type { MemoryLanguage } from "./words";

type Entry = Pick<RecalledMemory, "memoryId" | "content" | "category">;

const SAY = {
  rule: {
    en: (words: string, only: boolean) => (only ? `By your rule: only ${words}` : `By your rule: none ${words}`),
    ja: (words: string, only: boolean) => (only ? `決めたルールで、${words}のものだけにしました` : `決めたルールで、${words}のものは外しました`),
    zh: (words: string, only: boolean) => (only ? `按你定的规矩，只放${words}的` : `按你定的规矩，没放${words}的`),
  },
  skipped: {
    en: (label: string) => `This time only: not by your saved "${label}"`,
    ja: (label: string) => `今回だけ：保存した「${label}」は使っていません`,
    zh: (label: string) => `只这一次：没按你存的「${label}」`,
  },
  unclear: {
    en: (words: string) => `Not used: your saved "${words}" — it is not clear whether it leaves that time out or asks for it only`,
    ja: (words: string) => `保存した「${words}」は、その時間を外すのか、それだけにするのか読み取れなかったため使っていません`,
    zh: (words: string) => `没按你存的「${words}」挑：看不出它是要排除这个时间，还是只要这个时间`,
  },
  format: {
    en: (label: string) => `Written by your saved "${label}"`,
    ja: (label: string) => `保存した「${label}」に沿って書きました`,
    zh: (label: string) => `按你存的「${label}」写的`,
  },
  used: {
    en: (label: string) => `Picked by your saved preference "${label}"`,
    ja: (label: string) => `保存した好み「${label}」で選びました`,
    zh: (label: string) => `按你存的偏好「${label}」挑的`,
  },
} as const;

export interface ChipInput {
  language: MemoryLanguage;
  /** The saved time conditions the ranking applied, with how many candidates each hard one took away. */
  time: readonly { entry: Entry; preference: TimePreference; removed: number }[];
  /** The saved topics the ranking weighed (entry → its topic words). */
  topics: readonly { entry: Entry; topic: string }[];
  /** Other entries the ranking named as its basis (neither a time nor a topic). */
  other: readonly Entry[];
  /** Entries this turn's own words overruled, with the short words to name them by. */
  overruled: readonly { entry: Entry; label: string }[];
  /** AG21c (R33): entries not applied because their direction cannot be read (named so, with 「修改」 to fix the words). */
  unclear?: readonly Entry[];
}

/** The chips of one ranking, each entry once, in the order: what was weighed, what was overruled, what a rule took away. */
export function memoryChipsOf(input: ChipInput): AgentAnswerMemoryUseContract[] {
  const { language } = input;
  const chips: AgentAnswerMemoryUseContract[] = [];
  const add = (chip: AgentAnswerMemoryUseContract) => {
    if (!chips.some((item) => item.memoryId === chip.memoryId)) chips.push(chip);
  };
  for (const item of input.time) if (!item.preference.hard) add({ kind: "used", memoryId: item.entry.memoryId, text: SAY.used[language](say.timeWords(item.preference, language)) });
  for (const item of input.topics) add({ kind: "used", memoryId: item.entry.memoryId, text: SAY.used[language](item.topic) });
  for (const entry of input.other) if (entry.category !== "constraint") add({ kind: "used", memoryId: entry.memoryId, text: SAY.used[language](entry.content) });
  for (const item of input.overruled) add({ kind: "skipped", memoryId: item.entry.memoryId, text: SAY.skipped[language](item.label) });
  for (const entry of input.unclear ?? []) add({ kind: "skipped", memoryId: entry.memoryId, text: SAY.unclear[language](entry.content) });
  for (const item of input.time) {
    if (!item.preference.hard || item.removed <= 0) continue;
    add({ kind: "rule", memoryId: item.entry.memoryId, text: SAY.rule[language](say.timeWords(item.preference, language), !item.preference.exclude) });
  }
  return chips;
}

/* ── AG21c (R57): saved entries for every answer that shape how it is written ── */

/** "回答里的日期都带上星期", "日付には曜日をつけて", "always add the weekday to dates". */
const WEEKDAY_RULE = /(星期|周几|礼拜几|曜日|\bweekdays?\b|\bday of the week\b|\bdays? of the week\b)/iu;
/** A date written with its weekday: 「11月20日（周五）」, 「11月20日（金）」, "Fri, Nov 20", "Nov 20 (Fri)". */
const DATE_WITH_WEEKDAY = /(\d{1,2}\s*月\s*\d{1,2}\s*[日号]\s*[（(]\s*(?:周|星期|礼拜)?[一二三四五六日天月火水木金土](?:曜日?)?\s*[）)]|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\s*\((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\))/iu;
/** "时间一律写 24 小时制", "24時間表記で", "use the 24-hour clock". */
const CLOCK24_RULE = /(24\s*小时|二十四小时|24\s*時間|24\s*-?\s*hours?\b|\bmilitary time\b)/iu;
/** A time of day written on the 24-hour clock ("14:30", "09:00"). */
const CLOCK24_TIME = /(?<![\d:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\d:])/u;

/**
 * AG21c (R57): the saved entries for every answer whose effect shows in this answer's text — a date with its weekday for
 * "日期都带上星期", a 24-hour time for "24 小时制" — each named once with the same small label as task entries (the client
 * adds 「修改 ›」). An entry whose effect is not in the text, or that code cannot see in it, gets no label.
 */
export function everyTaskChipsOf(rules: readonly Entry[], text: string, language: MemoryLanguage): AgentAnswerMemoryUseContract[] {
  const chips: AgentAnswerMemoryUseContract[] = [];
  for (const rule of rules) {
    const shows = (WEEKDAY_RULE.test(rule.content) && DATE_WITH_WEEKDAY.test(text)) || (CLOCK24_RULE.test(rule.content) && CLOCK24_TIME.test(text));
    if (shows && !chips.some((chip) => chip.memoryId === rule.memoryId)) chips.push({ kind: "used", memoryId: rule.memoryId, text: SAY.format[language](rule.content) });
  }
  return chips;
}
