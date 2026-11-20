/**
 * agent-design AG14 (approved visual draft, boards 6–8; D7, D8, D10): what the memory part of the settings page shows,
 * the one rule both clients run (synced byte for byte to the App by `npm run sync:contract`).
 *
 * - Two switches on top; each one's small line says what it does, or 「现在关着：……」 while it is off.
 * - Three groups: 「一直遵守的」 (category constraint), 「酌情参考的」 (the others), 「还没说用在哪的」 (entries saved
 *   before AG14 with no task; last, and gone once all are filled in). Five per group, the rest under 「还有 N 条」 (D7).
 * - Each row: the words, then 「用在：…」 and its last day (D8: no source, no date of saving). An entry past its last day
 *   is no longer used: it stays, faded, last in its group, with 「已到期」 in coral (board 7).
 * - Two entries that ask for opposite times for the same task are shown together with 「留哪一条？」 (board 7).
 * - 「回答时参考这些」 off: every row is faded, still editable (D10). Only the second switch off: nothing fades.
 * - 「一直遵守的」 at its limit (20): a line says so; a new entry can then only go to 「酌情参考的」.
 * Every word comes from `shared/copy` memorySettings in the page's language; dates read 「12月31日（周四）」.
 */
import type { AgentMemoryCategoryContract, AgentMemoryEntryContract, AgentMemorySettingsContract, AgentMemoryTaskContract } from "../contract/agent-v1";

export type MemoryViewLanguage = "zh" | "ja" | "en";

/** The memorySettings words of shared/copy (the client passes standardCopy[language].memorySettings). */
export interface MemorySettingsWords {
  useTitle: string; useOn: string; useOff: string;
  learnTitle: string; learnOn: string; learnOff: string;
  rules: string; rulesNote: string; weighed: string; weighedNote: string; unsorted: string; unsortedNote: string; unsortedRow: string;
  more: string; less: string; usedIn: string; until: string; expired: string;
  emptyTitle: string; emptyNote: string; conflict: string; full: string;
  taskAll: string; taskEvent: string; taskContact: string; taskSchedule: string; taskTodo: string; taskMemo: string;
}

/** The tasks an entry can be used for, in the order the editor offers them (the draft's order). */
export const MEMORY_TASKS: readonly AgentMemoryTaskContract[] = ["event.recommend", "contact.recommend", "schedule.plan", "todo.plan", "memo.summarize", "all"];

/** How many rows a group shows before 「还有 N 条」 (D7). */
export const MEMORY_GROUP_SHOWN = 5;
/** The default limit of 「一直遵守的」 when the list does not say. */
export const MEMORY_RULE_LIMIT = 20;

const fill = (template: string, values: Readonly<Record<string, string | number>>) => template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

export function memoryTaskLabel(task: AgentMemoryTaskContract, words: Pick<MemorySettingsWords, "taskAll" | "taskEvent" | "taskContact" | "taskSchedule" | "taskTodo" | "taskMemo">): string {
  switch (task) {
    case "all": return words.taskAll;
    case "event.recommend": return words.taskEvent;
    case "contact.recommend": return words.taskContact;
    case "schedule.plan": return words.taskSchedule;
    case "todo.plan": return words.taskTodo;
    default: return words.taskMemo;
  }
}

const WEEKDAY = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] } as const;
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Calendar arithmetic only (no Date: shared compute runs the same on every runtime).
const leap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysIn = (year: number, month: number): number => [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
/** 0 = Sunday (Sakamoto's method). */
const weekdayOf = (year: number, month: number, day: number) => {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + (offsets[month - 1] ?? 0) + day) % 7;
};
const dayParts = (day: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  return match ? { day: Number(match[3]), month: Number(match[2]), year: Number(match[1]) } : null;
};
const pad = (value: number) => String(value).padStart(2, "0");

/** A day (YYYY-MM-DD) as the page writes it: 「12月31日（周四）」, 「12月31日（木）」, "Thu, Dec 31". */
export function memoryDayText(day: string, language: MemoryViewLanguage): string {
  const parts = dayParts(day);
  if (!parts) return day;
  const weekday = weekdayOf(parts.year, parts.month, parts.day);
  if (language === "en") return `${WEEKDAY.en[weekday]}, ${MONTH_EN[parts.month - 1]} ${parts.day}`;
  return `${parts.month}月${parts.day}日（${WEEKDAY[language][weekday]}）`;
}

/** The last day of the editor's quick choices: 「一个月后」「三个月后」 from today (the same day of that month, or its last day). */
export function memoryExpiryAfter(today: string, months: number): string {
  const parts = dayParts(today);
  if (!parts) return today;
  const index = parts.month - 1 + months;
  const year = parts.year + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${pad(month)}-${pad(Math.min(parts.day, daysIn(year, month)))}`;
}

/** 一直遵守的 for a constraint; the other three categories are 酌情参考的. */
export const isStandingRule = (category: AgentMemoryCategoryContract) => category === "constraint";

export interface MemoryRowView {
  memoryId: string;
  revision: number;
  content: string;
  /** 「用在：推荐活动时 · 12月31日（周四）到期」, or 「以前存的，没写用在哪」. */
  meta: string;
  /** Past its last day: no longer used; faded, last in its group, the coral words in `expiredText`. */
  expired: boolean;
  /** 「用在：安排日程时 · 」 before the coral 「12月31日（周四）已到期」 (an expired row's meta in two pieces). */
  metaLead: string | null;
  expiredText: string | null;
  unsorted: boolean;
  entry: AgentMemoryEntryContract;
}

export interface MemoryGroupView {
  key: "rules" | "weighed" | "unsorted";
  title: string;
  /** 「12 条 · 每次回答都照做」. */
  note: string;
  rows: MemoryRowView[];
  /** How many rows show before 「还有 N 条」. */
  shown: number;
  moreLabel: string | null;
  lessLabel: string;
  /** 「已经 20 条了。……」 (only 一直遵守的, at its limit). */
  full: string | null;
}

export interface MemorySettingsView {
  switches: { key: "enabled" | "allowConversationLearning"; title: string; note: string; on: boolean }[];
  /** 「回答时参考这些」 off: every row is faded (D10). */
  dim: boolean;
  empty: { title: string; note: string } | null;
  /** Pairs that ask for opposite times for the same task, shown together above the groups. */
  conflicts: { note: string; rows: [MemoryRowView, MemoryRowView] }[];
  groups: MemoryGroupView[];
  /** 一直遵守的 is at its limit: a new entry can only go to 酌情参考的. */
  rulesFull: boolean;
}

const timeOf = (entry: AgentMemoryEntryContract) => {
  const value = entry.structured;
  if (!value || (!value.dayPart && !value.preferredDays?.length)) return null;
  const days = [...(value.preferredDays ?? [])].sort().join(",");
  return { key: `${days}|${value.dayPart ?? ""}`, polarity: value.strength === "avoid" ? "avoid" : "want" };
};

/** Two live entries that ask for different times for the same task, the same way round (both "prefer" or both "avoid"). */
export function memoryConflicts(entries: readonly AgentMemoryEntryContract[]): [AgentMemoryEntryContract, AgentMemoryEntryContract][] {
  const pairs: [AgentMemoryEntryContract, AgentMemoryEntryContract][] = [];
  const taken = new Set<string>();
  const timed = entries.filter((entry) => timeOf(entry) && entry.appliesTo.length > 0);
  for (const [index, left] of timed.entries()) {
    if (taken.has(left.memoryId)) continue;
    for (const right of timed.slice(index + 1)) {
      if (taken.has(right.memoryId)) continue;
      const a = timeOf(left)!;
      const b = timeOf(right)!;
      if (a.polarity !== b.polarity || a.key === b.key) continue;
      if (!left.appliesTo.some((task) => right.appliesTo.includes(task))) continue;
      pairs.push([left, right]);
      taken.add(left.memoryId);
      taken.add(right.memoryId);
      break;
    }
  }
  return pairs;
}

export function memorySettingsView(input: { entries: readonly AgentMemoryEntryContract[]; settings: Pick<AgentMemorySettingsContract, "enabled" | "allowConversationLearning">; today: string; ruleLimit?: number | null; language: MemoryViewLanguage; words: MemorySettingsWords; expanded?: ReadonlySet<string> }): MemorySettingsView {
  const { language, today, words } = input;
  const live = input.entries.filter((entry) => entry.status !== "deleted");
  const isExpired = (entry: AgentMemoryEntryContract) => Boolean(entry.validUntil && entry.validUntil < today);
  const where = (entry: AgentMemoryEntryContract) => fill(words.usedIn, { where: entry.appliesTo.map((task) => memoryTaskLabel(task, words)).join(language === "en" ? ", " : "、") });
  const rowOf = (entry: AgentMemoryEntryContract): MemoryRowView => {
    const unsorted = entry.appliesTo.length === 0;
    const expired = isExpired(entry);
    const lead = unsorted ? words.unsortedRow : where(entry);
    const until = entry.validUntil ? memoryDayText(entry.validUntil, language) : null;
    return {
      content: entry.content,
      entry,
      expired,
      expiredText: expired && until ? fill(words.expired, { day: until }) : null,
      memoryId: entry.memoryId,
      meta: until ? `${lead} · ${fill(expired ? words.expired : words.until, { day: until })}` : lead,
      metaLead: expired ? `${lead} · ` : null,
      revision: entry.revision,
      unsorted,
    };
  };
  const conflictPairs = memoryConflicts(live.filter((entry) => !isExpired(entry)));
  const inConflict = new Set(conflictPairs.flatMap(([left, right]) => [left.memoryId, right.memoryId]));
  const ruleLimit = input.ruleLimit ?? MEMORY_RULE_LIMIT;
  const rulesAll = live.filter((entry) => entry.appliesTo.length && isStandingRule(entry.category));
  const weighedAll = live.filter((entry) => entry.appliesTo.length && !isStandingRule(entry.category));
  const unsortedAll = live.filter((entry) => !entry.appliesTo.length);
  // Expired rows go last in their group; the rest keep the list's order.
  const ordered = (list: readonly AgentMemoryEntryContract[]) => [...list.filter((entry) => !isExpired(entry)), ...list.filter(isExpired)];
  const group = (key: MemoryGroupView["key"], title: string, note: string, list: readonly AgentMemoryEntryContract[]): MemoryGroupView => {
    const rows = ordered(list.filter((entry) => !inConflict.has(entry.memoryId))).map(rowOf);
    const open = input.expanded?.has(key) ?? false;
    const shown = open ? rows.length : Math.min(rows.length, MEMORY_GROUP_SHOWN);
    return {
      full: key === "rules" && list.length >= ruleLimit ? fill(words.full, { count: list.length }) : null,
      key,
      lessLabel: words.less,
      moreLabel: rows.length > MEMORY_GROUP_SHOWN ? (open ? words.less : fill(words.more, { count: rows.length - MEMORY_GROUP_SHOWN })) : null,
      note: fill(note, { count: list.length }),
      rows,
      shown,
      title,
    };
  };
  const groups = [
    ...(rulesAll.length ? [group("rules", words.rules, words.rulesNote, rulesAll)] : []),
    ...(weighedAll.length ? [group("weighed", words.weighed, words.weighedNote, weighedAll)] : []),
    ...(unsortedAll.length ? [group("unsorted", words.unsorted, words.unsortedNote, unsortedAll)] : []),
  ];
  return {
    conflicts: conflictPairs.map(([left, right]) => ({ note: words.conflict, rows: [rowOf(left), rowOf(right)] })),
    dim: !input.settings.enabled,
    empty: live.length ? null : { note: words.emptyNote, title: words.emptyTitle },
    groups,
    rulesFull: rulesAll.length >= ruleLimit,
    switches: [
      { key: "enabled", note: input.settings.enabled ? words.useOn : words.useOff, on: input.settings.enabled, title: words.useTitle },
      { key: "allowConversationLearning", note: input.settings.allowConversationLearning ? words.learnOn : words.learnOff, on: input.settings.allowConversationLearning, title: words.learnTitle },
    ],
  };
}

/**
 * What a save from the editor sends (POST for a new entry, PATCH for one being changed): the words, where it is used,
 * which group, the last day. Changed words drop the values read from the old words, so nothing stale is applied.
 */
export function memoryEditorInput(input: { before: AgentMemoryEntryContract | null; content: string; task: AgentMemoryTaskContract | null; rule: boolean; validUntil: string | null }): { category: AgentMemoryCategoryContract; content: string; appliesTo: AgentMemoryTaskContract[]; validUntil: string | null; structured?: null; expectedRevision?: number } {
  const content = input.content.trim();
  const category: AgentMemoryCategoryContract = input.rule ? "constraint" : input.before && !isStandingRule(input.before.category) ? input.before.category : "preference";
  return {
    appliesTo: input.task ? [input.task] : [],
    category,
    content,
    validUntil: input.validUntil,
    ...(input.before && input.before.content !== content ? { structured: null } : {}),
    ...(input.before ? { expectedRevision: input.before.revision } : {}),
  };
}
