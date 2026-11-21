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
  for (const item of input.time) {
    if (!item.preference.hard || item.removed <= 0) continue;
    add({ kind: "rule", memoryId: item.entry.memoryId, text: SAY.rule[language](say.timeWords(item.preference, language), !item.preference.exclude) });
  }
  return chips;
}
