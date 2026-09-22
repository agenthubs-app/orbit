/**
 * 工作策略（Orbit_0918 iOrbit strategy 屏）route view-model。
 *
 * 静态聚合，全部为已交付的既有数据源，不发明新能力：
 *   先联系谁   = home-facts followups.current（规则版联系人机会）
 *   下一步去哪 = D17 公开活动目标词法推荐（snapshot.recommendations，
 *                success / needs_goal / no_match / unavailable 四态如实呈现）
 * 「缺什么人」「准备什么」依赖 W4 策略生成能力（无接口）→ 显式「等 W4」空态，
 * 不放设计稿 mock 内容（用户 2026-09-19 拍板）。
 */
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import type { HomeFactsViewItem } from "../home-facts-view-model";

export type AgentStrategyDataState = "pending" | "ready" | "empty" | "unavailable";

export type AgentStrategyNextEventsState =
  | AgentStrategyDataState
  | "needs_goal"
  | "no_match";

export interface AgentStrategyContactItem {
  dueLabel: string | null;
  href: string | null;
  id: string;
  issue: string | null;
  meta: string | null;
  name: string;
}

export interface AgentStrategyEventItem {
  dayLabel: string;
  href: string;
  id: string;
  matchedTokens: readonly string[];
  title: string;
  venue: string;
}

export interface AgentStrategyWaitingSection {
  description: string;
  key: "missing" | "prep";
  title: string;
}

export interface AgentStrategyViewModel {
  nextEvents: readonly AgentStrategyEventItem[];
  nextEventsState: AgentStrategyNextEventsState;
  /**
   * 行级「等 W4」说明：**主语中立**的一句话，给那些没有自己段落的空位用
   * （联系人卡的「他能提供什么」「建议开场白」）。两段式的
   * `waitingSections[].description` 各自带主语（缺口分析 / 准备清单），
   * 放进行里会答非所问 —— 修订轮 2 的 Important 2 就是这个。
   */
  waitingNote: string;
  waitingSections: readonly AgentStrategyWaitingSection[];
  whoFirst: readonly AgentStrategyContactItem[];
  whoFirstState: AgentStrategyDataState;
}

const COPY = {
  en: {
    missingDescription:
      "Gap analysis needs the W4 strategy capability, which is not available yet. Ask iOrbit in chat for now.",
    missingTitle: "Who you are missing",
    neutralWaiting:
      "This needs the W4 strategy capability, which is not available yet. Ask iOrbit in chat for now.",
    prepDescription:
      "Preparation checklists need the W4 strategy capability, which is not available yet. Ask iOrbit in chat for now.",
    prepTitle: "What to prepare",
  },
  zh: {
    missingDescription:
      "缺口分析需要 W4 策略生成能力，尚未上线；目前可在对话中直接向 iOrbit 提问。",
    missingTitle: "你还缺什么人",
    neutralWaiting:
      "这一项需要 W4 策略生成能力，尚未上线；目前可在对话中直接向 iOrbit 提问。",
    prepDescription:
      "准备清单需要 W4 策略生成能力，尚未上线；目前可在对话中直接向 iOrbit 提问。",
    prepTitle: "聊之前，准备什么",
  },
} as const;

const STRATEGY_TZ = "Asia/Tokyo";

type StrategyCopy = Record<keyof (typeof COPY)["zh"], string>;

function isFollowupItem(
  item: HomeFactsViewItem,
): item is Extract<HomeFactsViewItem, { contactName: string }> {
  return "contactName" in item;
}

function dayLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    timeZone: STRATEGY_TZ,
  }).format(date);
}

function joinMeta(...parts: readonly (string | null | undefined)[]): string | null {
  const value = parts.filter((part): part is string => Boolean(part?.trim())).join(" · ");
  return value || null;
}

export function buildAgentStrategyViewModel(input: {
  language: "en" | "zh";
  snapshot: HomeDashboardSnapshot | "pending" | "unavailable";
}): AgentStrategyViewModel {
  const copy: StrategyCopy = COPY[input.language === "en" ? "en" : "zh"];
  const locale = input.language === "en" ? "en-US" : "zh-CN";
  const facts = input.snapshot !== "pending" && input.snapshot !== "unavailable"
    ? input.snapshot.facts
    : null;

  const whoFirst: AgentStrategyContactItem[] = (facts?.followups.current.items ?? [])
    .filter(isFollowupItem)
    .map((item) => ({
      dueLabel: item.dueAt ? dayLabel(item.dueAt, locale) : null,
      href: item.href ?? (item.contactId ? `/app/contacts/${encodeURIComponent(item.contactId)}` : null),
      id: item.key,
      issue: item.issue ?? null,
      meta: joinMeta(item.contactName, item.organization),
      name: item.contactName,
    }));

  const whoFirstState: AgentStrategyDataState = !facts
    ? input.snapshot === "pending"
      ? "pending"
      : "unavailable"
    : whoFirst.length > 0
      ? "ready"
      : facts.followups.state === "unavailable"
        ? "unavailable"
        : "empty";

  const recommendations = input.snapshot !== "pending" && input.snapshot !== "unavailable"
    ? input.snapshot.recommendations
    : null;
  const nextEventsState: AgentStrategyNextEventsState = !recommendations
    ? input.snapshot === "pending"
      ? "pending"
      : "unavailable"
    : recommendations.state === "success"
      ? "ready"
      : recommendations.state;
  const nextEvents: AgentStrategyEventItem[] = (recommendations?.items ?? []).map(
    (item) => ({
      dayLabel: dayLabel(item.startsAt, locale),
      href: `/app/events/${encodeURIComponent(item.eventId)}`,
      id: item.eventId,
      matchedTokens: item.matchedTokens,
      title: item.title,
      venue: item.venue,
    }),
  );

  return {
    nextEvents,
    nextEventsState,
    waitingNote: copy.neutralWaiting,
    waitingSections: [
      {
        description: copy.missingDescription,
        key: "missing",
        title: copy.missingTitle,
      },
      {
        description: copy.prepDescription,
        key: "prep",
        title: copy.prepTitle,
      },
    ],
    whoFirst,
    whoFirstState,
  };
}
