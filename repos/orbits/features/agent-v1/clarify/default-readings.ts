/**
 * The registered read-only defaults and "the most likely reading" (设计稿 §3.11, agent-design AG04).
 *
 * When every reading of a part only reads, the most likely one is done and said first. It is decided,
 * in order, by: the entry the user just clicked or the page they are on; the topic the session is on;
 * the record kind's registered default. Each kind registers one default: a note → its summary; a
 * contact → recent interactions and what is not done yet; an event → time, place and my related
 * records; a to-do → its state and the people linked to it. Picking and ranking have no registered
 * default: with none of the three bases they are asked (§3.5).
 */
import type { ReplyLanguage } from "../route/handoff-copy";
import { capabilityKind, type Capability } from "../route/capabilities";
import type { Deliverable } from "../understand/schema";

export type RecordKind = "contact" | "memo" | "event" | "todo" | "schedule";

export interface Reading {
  /** Set for a registered default (contact.recent_and_open …); model readings have none. */
  key?: string;
  capabilities: Capability[];
  deliverable: Deliverable;
}

export const DEFAULT_READINGS: Record<"contact" | "memo" | "event" | "todo", Reading> = {
  contact: { capabilities: ["view.recentInteraction", "todo.read"], deliverable: "summary", key: "contact.recent_and_open" },
  event: { capabilities: ["event.read", "attendance.read"], deliverable: "answer", key: "event.time_place_mine" },
  memo: { capabilities: ["memo.read", "fn.summarize"], deliverable: "summary", key: "memo.summary" },
  todo: { capabilities: ["todo.read", "contact.read"], deliverable: "answer", key: "todo.state_people" },
};

/** The record kind of a clue entity, a reference type or a record ref ("note" is the product's name for a memo). */
export function recordKindOf(value: string | null | undefined): RecordKind | null {
  if (!value) return null;
  const head = value.includes(":") ? value.slice(0, value.indexOf(":")) : value;
  switch (head) {
    case "contact":
    case "connection":
      return "contact";
    case "memo":
    case "note":
      return "memo";
    case "event":
    case "attendance":
      return "event";
    case "todo":
    case "task":
      return "todo";
    case "schedule":
      return "schedule";
    default:
      return null;
  }
}

/** The record kind a capability works on (contact.read, view.* → contact; attendance.* → event …). */
export function capabilityRecordKind(capability: Capability): RecordKind | null {
  const head = capability.slice(0, capability.indexOf("."));
  if (head === "view") return "contact";
  if (head === "privateEvent") return "event";
  return recordKindOf(head);
}

export function isReadOnlyReading(reading: Pick<Reading, "capabilities">): boolean {
  return reading.capabilities.length > 0 && reading.capabilities.every((capability) => ["read", "function"].includes(capabilityKind(capability)));
}

const RANKING: ReadonlySet<Capability> = new Set(["fn.rank", "fn.compare", "fn.group"]);

/** A reading that picks or ranks: no registered default can stand in for it. */
export function isPickingReading(reading: Pick<Reading, "capabilities" | "deliverable">): boolean {
  return reading.deliverable === "ranked_list" || reading.deliverable === "comparison" || reading.capabilities.some((capability) => RANKING.has(capability));
}

const defaultOf = (kind: RecordKind | null | undefined): Reading | null => (kind && kind in DEFAULT_READINGS ? DEFAULT_READINGS[kind as keyof typeof DEFAULT_READINGS] : null);

export function mostLikelyReading(input: {
  readings: readonly Reading[];
  objectKind: RecordKind | null;
  pageKind?: RecordKind | null;
  topicKind?: RecordKind | null;
  selected?: Reading | null;
}): { reading: Reading; basis: "selection" | "page" | "topic" | "default" } | null {
  if (input.selected) return { basis: "selection", reading: input.selected };
  const page = defaultOf(input.pageKind);
  if (page) return { basis: "page", reading: page };
  if (input.topicKind) {
    const onTopic = input.readings.find((reading) => !isPickingReading(reading) && reading.capabilities.some((capability) => capabilityRecordKind(capability) === input.topicKind));
    if (onTopic) return { basis: "topic", reading: onTopic };
  }
  const registered = defaultOf(input.objectKind);
  if (registered) return { basis: "default", reading: registered };
  return null;
}

/** The two readings are the same thing to do (same capabilities). */
export function sameReading(left: Pick<Reading, "capabilities">, right: Pick<Reading, "capabilities">): boolean {
  return left.capabilities.length === right.capabilities.length && left.capabilities.every((capability) => right.capabilities.includes(capability));
}

type DefaultWords = Record<ReplyLanguage, (object: string | null) => string>;

/** The words of each registered default, as it is said back to the user ("我按「…」来理解"). */
const DEFAULT_WORDS: Record<string, DefaultWords> = {
  "contact.recent_and_open": {
    en: (x) => `see your recent interactions with ${x ?? "this contact"} and what is not done yet`,
    ja: (x) => `${x ? `${x}さん` : "この連絡先"}との最近のやり取りと、まだ終わっていないことを見る`,
    zh: (x) => `看和${x ?? "这位联系人"}最近的往来、还有没做完的事`,
  },
  "event.time_place_mine": {
    en: (x) => `see the time and place of ${x ?? "this event"} and your records about it`,
    ja: (x) => `${x ?? "このイベント"}の日時と場所、自分の関連する記録を見る`,
    zh: (x) => `看${x ?? "这场活动"}的时间地点和我的相关记录`,
  },
  "memo.summary": {
    en: (x) => `see a summary of ${x ?? "this note"}`,
    ja: (x) => `${x ?? "このメモ"}の要約を見る`,
    zh: (x) => `看${x ?? "这篇笔记"}的摘要`,
  },
  "todo.state_people": {
    en: (x) => `see the state of ${x ?? "this to-do"} and the people linked to it`,
    ja: (x) => `${x ?? "このToDo"}の状況と関係する人を見る`,
    zh: (x) => `看${x ?? "这条待办"}的当前状态和关联的人`,
  },
};

/** Code's words for a reading: a registered default by its key, any other reading by its main capability. */
export function readingLabel(reading: Reading, language: ReplyLanguage, object: string | null, capabilityWords?: (capability: Capability, language: ReplyLanguage, object: string | null) => string): string {
  if (reading.key && DEFAULT_WORDS[reading.key]) return DEFAULT_WORDS[reading.key][language](object);
  const main = mainCapability(reading.capabilities);
  return capabilityWords ? capabilityWords(main, language, object) : main;
}

/** The capability that says most about a reading: a function over records, else a write, else the first. */
export function mainCapability(capabilities: readonly Capability[]): Capability {
  return capabilities.find((capability) => capabilityKind(capability) === "function")
    ?? capabilities.find((capability) => capabilityKind(capability) === "write")
    ?? capabilities[0];
}
