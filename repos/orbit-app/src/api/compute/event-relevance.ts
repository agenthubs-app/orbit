/**
 * 2026-11-15 活动不再打分：把已有的事实整理成「跟你有关」（events DESIGN 去分数提案）。两端共用、纯函数、不调 AI。
 *
 * - people：报名者 / 登壇者 / 展示社里属于计划人物类型（还没见够的）的，按人数多到少，最多 3 类。
 * - known：人脉里参加的人（名字最多 6 个）。
 * - topic：没有 people 时，活动内容提到的计划人物类型（最多 3 个）。
 * - warnings：只有超出上限才出（费用 > 上限、单程移动 > 上限）；查不到的事实不出任何东西。
 */
import type { EventRelevance, EventRelevancePeople, EventRelevanceWarning } from "../contract/event-relevance";
import { parseTimestamp } from "./compute-text";

export interface EventRelevanceType {
  key: string;
  shortLabel: string;
  emoji: string;
  targetCount: number;
  metCount: number;
  skipped: boolean;
}

export interface EventRelevanceInput {
  types: readonly EventRelevanceType[];
  /** 每类的来源人数（`typeAttendees` 的 breakdown）。 */
  breakdown: Readonly<Record<string, { speakers: number; exhibitors: number; registrants: number }>>;
  /** 活动内容提到的类型 key（`typesMentionedIn`）。 */
  mentioned: readonly string[];
  known: readonly { name: string }[];
  feeYen: number | null;
  travelMinutes: number | null;
  limits: { maxFee: number; maxTravelMinutes: number };
}

export const RELEVANCE_PEOPLE_MAX = 3;
export const RELEVANCE_TOPIC_MAX = 3;
export const RELEVANCE_KNOWN_NAMES_MAX = 6;

export function eventRelevance(input: EventRelevanceInput): EventRelevance {
  const open = input.types.filter((type) => !type.skipped && type.targetCount > type.metCount);
  const people: EventRelevancePeople[] = open.flatMap((type): EventRelevancePeople[] => {
    const entry = input.breakdown[type.key];
    if (!entry) return [];
    const source: EventRelevancePeople["source"] | null = entry.registrants > 0 ? "registrants" : entry.speakers > 0 ? "speakers" : entry.exhibitors > 0 ? "exhibitors" : null;
    if (!source) return [];
    return [{ count: entry[source], emoji: type.emoji, label: type.shortLabel, source, typeKey: type.key }];
  }).sort((a, b) => b.count - a.count).slice(0, RELEVANCE_PEOPLE_MAX);
  const known = input.known.length ? { count: input.known.length, names: input.known.slice(0, RELEVANCE_KNOWN_NAMES_MAX).map((person) => person.name) } : null;
  const mentioned = new Set(input.mentioned);
  const topicLabels = people.length ? [] : open.filter((type) => mentioned.has(type.key)).map((type) => type.shortLabel).slice(0, RELEVANCE_TOPIC_MAX);
  const warnings: EventRelevanceWarning[] = [];
  if (input.feeYen !== null && input.feeYen > input.limits.maxFee) warnings.push({ feeYen: input.feeYen, kind: "budget", limitYen: input.limits.maxFee });
  if (input.travelMinutes !== null && input.travelMinutes > input.limits.maxTravelMinutes) warnings.push({ kind: "travel", limitMinutes: input.limits.maxTravelMinutes, minutes: input.travelMinutes });
  return {
    group: people.length ? "people" : topicLabels.length ? "topic" : "other",
    known,
    people,
    topic: topicLabels.length ? { labels: topicLabels } : null,
    warnings,
  };
}

const GROUP_ORDER = { other: 2, people: 0, topic: 1 } as const;

/** 计划页 / 推荐的排序：people → topic → other，组内按开始时间。没有 relevance 的排最后。 */
export function compareByRelevance(a: { relevance?: EventRelevance | null; startsAt: string }, b: { relevance?: EventRelevance | null; startsAt: string }): number {
  const ga = a.relevance ? GROUP_ORDER[a.relevance.group] : 3;
  const gb = b.relevance ? GROUP_ORDER[b.relevance.group] : 3;
  return ga - gb || parseTimestamp(a.startsAt) - parseTimestamp(b.startsAt);
}
