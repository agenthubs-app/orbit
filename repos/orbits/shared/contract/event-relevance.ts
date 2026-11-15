// 2026-11-15 活动不再打分：只列「跟你有关的事实」（docs/designs/redesign-2026-10/event-relevance-proposal.html）。
// Owner: 甲. Used by: 探す、活动详情、外部活动评估、计划页（两端）。文字由各端按结构化字段拼，不在服务端拼句子。

/** people = 报名者 / 登壇者 / 展示里有计划想见的类型；topic = 只有活动内容提到；other = 都没有。排序：people → topic → other，组内按日期。 */
export type EventRelevanceGroup = "people" | "topic" | "other";

export interface EventRelevancePeople {
  /** 计划人物类型 key 与短名（「VC パートナー」）。 */
  typeKey: string;
  label: string;
  emoji: string;
  count: number;
  /** 依据：报名者 / 登壇者 / 展示社。 */
  source: "registrants" | "speakers" | "exhibitors";
}

export type EventRelevanceWarning =
  | { kind: "budget"; feeYen: number; limitYen: number }
  | { kind: "travel"; minutes: number; limitMinutes: number };

export interface EventRelevance {
  group: EventRelevanceGroup;
  /** 想见的人（按人数多到少，≤3）。 */
  people: readonly EventRelevancePeople[];
  /** 我人脉里报名 / 登壇的人。 */
  known: { count: number; names: readonly string[] } | null;
  /** 只在没有 people 时给：活动内容提到的计划人物类型短名（≤3）。 */
  topic: { labels: readonly string[] } | null;
  warnings: readonly EventRelevanceWarning[];
}
