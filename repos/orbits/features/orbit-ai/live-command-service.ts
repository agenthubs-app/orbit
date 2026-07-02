import type { AgentActionQueueResult } from "../agent/contract";
import { createAgentActionQueueService } from "../agent/service-factory";
import type { AgentActionQueueService } from "../agent/service";
import type { ContactsListSearchResult } from "../contacts/contract";
import { createContactsListSearchAndFilterService } from "../contacts/service-factory";
import type { ContactsListSearchAndFilterService } from "../contacts/service";
import type { DashboardAggregateSummaryResult } from "../dashboard/contract";
import { createDashboardAggregateService } from "../dashboard/service-factory";
import type { DashboardAggregateService } from "../dashboard/service";
import type { EventListResult } from "../events/event-crud-and-import/contract";
import type { EventCrudAndImportService } from "../events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../events/service-factory";
import type { FollowupTaskGenerationResult } from "../followups/contract";
import { createFollowupTaskGenerationService } from "../followups/service-factory";
import type { FollowupTaskGenerationService } from "../followups/service";
import type {
  OrbitAiCommandInput,
  OrbitAiCommandLink,
  OrbitAiCommandPayload,
  OrbitAiCommandResult,
  OrbitAiLanguage,
  OrbitAiLanguageOption,
  OrbitAiPanel,
  OrbitAiStageItem,
} from "./contract";
import type { OrbitAiCommandService } from "./service";

export interface LiveOrbitAiCommandServiceOptions {
  agentService?: AgentActionQueueService;
  contactsService?: ContactsListSearchAndFilterService;
  dashboardService?: DashboardAggregateService;
  eventService?: EventCrudAndImportService;
  followupService?: FollowupTaskGenerationService;
}

type LiveCommandResult =
  | AgentActionQueueResult
  | ContactsListSearchResult
  | DashboardAggregateSummaryResult
  | EventListResult
  | FollowupTaskGenerationResult;

interface LiveCommandReadFailure {
  success: false;
  error: {
    code: string;
    evidenceIds: readonly string[];
  };
}

type SafeLiveCommandResult = LiveCommandResult | LiveCommandReadFailure;
type SafeAgentActionQueueResult = AgentActionQueueResult | LiveCommandReadFailure;
type SafeContactsListSearchResult =
  | ContactsListSearchResult
  | LiveCommandReadFailure;
type SafeDashboardAggregateSummaryResult =
  | DashboardAggregateSummaryResult
  | LiveCommandReadFailure;
type SafeEventListResult = EventListResult | LiveCommandReadFailure;
type SafeFollowupTaskGenerationResult =
  | FollowupTaskGenerationResult
  | LiveCommandReadFailure;

const panelWords: Record<OrbitAiPanel, readonly string[]> = {
  agent: ["agent", "action", "review", "confirm", "行动", "下一步", "确认"],
  dashboard: ["dashboard", "health", "network", "signal", "健康", "网络"],
  events: ["event", "events", "meet", "attend", "活动", "会议", "见面"],
  followups: ["follow", "followup", "message", "跟进", "消息"],
  home: [],
  people: ["people", "person", "intro", "contact", "人脉", "联系人", "介绍"],
  schedule: ["schedule", "calendar", "timeline", "日程", "日历"],
};

const commandLabels: Record<
  OrbitAiLanguage,
  Record<Exclude<OrbitAiPanel, "home" | "dashboard">, string>
> = {
  en: {
    agent: "Review next moves",
    events: "Recommend events",
    followups: "Prepare follow-up",
    people: "Recommend people",
    schedule: "Check schedule",
  },
  zh: {
    agent: "检查下一步",
    events: "推荐活动",
    followups: "准备跟进",
    people: "推荐人脉",
    schedule: "查看日程",
  },
};

const panelOrder = ["events", "people", "schedule", "followups", "agent"] as const;

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function resolveLanguage(value?: string | null): OrbitAiLanguage {
  return normalizeText(value) === "en" ? "en" : "zh";
}

function resolvePanel(input: OrbitAiCommandInput): OrbitAiPanel {
  const requested = normalizeText(input.panel);

  if (requested in panelWords && requested !== "home") {
    return requested as OrbitAiPanel;
  }

  const prompt = normalizeText(input.prompt);

  for (const panel of ["events", "people", "schedule", "followups", "agent", "dashboard"] as const) {
    if (panelWords[panel].some((word) => prompt.includes(word))) {
      return panel;
    }
  }

  return "home";
}

function appHref(input: {
  language: OrbitAiLanguage;
  panel?: OrbitAiPanel | null;
}): string {
  const params = new URLSearchParams();

  if (input.panel && input.panel !== "home") {
    params.set("panel", input.panel);
  }

  if (input.language === "en") {
    params.set("lang", "en");
  }

  const queryString = params.toString();

  return queryString ? `/app?${queryString}` : "/app";
}

function commandLinks(language: OrbitAiLanguage): readonly OrbitAiCommandLink[] {
  return panelOrder.map((panel) => ({
    href: appHref({ language, panel }),
    label: commandLabels[language][panel],
    panel,
  }));
}

function languageOptions(
  language: OrbitAiLanguage,
  panel: OrbitAiPanel,
): readonly OrbitAiLanguageOption[] {
  return (["zh", "en"] as const).map((option) => ({
    active: option === language,
    href: appHref({ language: option, panel }),
    label: option === "zh" ? "中文" : "English",
    language: option,
  }));
}

function readFailure(code: string): LiveCommandReadFailure {
  return {
    success: false,
    error: {
      code,
      evidenceIds: [`evidence:${code.toLowerCase()}`],
    },
  };
}

async function readSafely<TResult extends LiveCommandResult>(
  code: string,
  read: () => Promise<TResult> | TResult,
): Promise<TResult | LiveCommandReadFailure> {
  try {
    return await read();
  } catch {
    return readFailure(code);
  }
}

function resultEvidence(result: SafeLiveCommandResult): readonly string[] {
  if (result.success === false) {
    return result.error.evidenceIds.length
      ? result.error.evidenceIds
      : [result.error.code];
  }

  return result.data.provenance.evidenceIds;
}

function uniqueEvidence(
  results: readonly SafeLiveCommandResult[],
): readonly string[] {
  const evidence = results.flatMap(resultEvidence);

  return Array.from(new Set(evidence.length ? evidence : ["evidence:orbit-ai-command-live"]));
}

function eventItems(
  result: SafeEventListResult,
  language: OrbitAiLanguage,
): readonly OrbitAiStageItem[] {
  if (result.success === false) return [];

  return result.data.events.slice(0, 2).map((event) => ({
    actionLabel: language === "en" ? "Open event workspace" : "打开活动工作区",
    body: event.recommendedPreparation || event.nextAction,
    href: "/app/events",
    label: language === "en" ? "Live event" : "真实活动",
    title: event.title,
  }));
}

function contactItems(
  result: SafeContactsListSearchResult,
  language: OrbitAiLanguage,
): readonly OrbitAiStageItem[] {
  if (result.success === false) return [];

  return result.data.contacts.slice(0, 2).map((contact) => ({
    actionLabel: language === "en" ? "Open people workspace" : "打开人脉工作区",
    body: contact.relationshipContext || contact.nextAction,
    href: "/app/contacts",
    label: language === "en" ? "Live relationship" : "真实人脉",
    title: contact.displayName,
  }));
}

function followupItems(
  result: SafeFollowupTaskGenerationResult,
  language: OrbitAiLanguage,
): readonly OrbitAiStageItem[] {
  if (result.success === false) return [];

  return result.data.tasks.slice(0, 2).map((task) => ({
    actionLabel: language === "en" ? "Open follow-ups" : "打开跟进",
    body: task.recommendedAction || task.rationale,
    href: "/app/followups",
    label: language === "en" ? "Live follow-up" : "真实跟进",
    title: task.title,
  }));
}

function dashboardItems(
  result: SafeDashboardAggregateSummaryResult,
  language: OrbitAiLanguage,
): readonly OrbitAiStageItem[] {
  if (result.success === false) return [];

  return result.data.metrics.slice(0, 2).map((metric) => ({
    actionLabel: language === "en" ? "Open relationship health" : "打开关系健康",
    body:
      language === "en"
        ? `${metric.value} sourced records are included in this live metric.`
        : `这个真实指标包含 ${metric.value} 条来源记录。`,
    href: "/app/dashboard",
    label: language === "en" ? "Live metric" : "真实指标",
    title: metric.label,
  }));
}

function agentItems(
  result: SafeAgentActionQueueResult,
  language: OrbitAiLanguage,
): readonly OrbitAiStageItem[] {
  if (result.success === false) return [];

  return result.data.actions.slice(0, 2).map((action) => ({
    actionLabel: language === "en" ? "Review next move" : "检查下一步",
    body: action.recommendedAction || action.reason,
    href: "/app/agent",
    label: language === "en" ? "Review queue" : "确认队列",
    title: action.title,
  }));
}

function fallbackItems(language: OrbitAiLanguage): readonly OrbitAiStageItem[] {
  return [
    {
      actionLabel: language === "en" ? "Open events" : "打开活动",
      body:
        language === "en"
          ? "Live event context is not available yet; the page can recover without side effects."
          : "真实活动上下文暂不可用；页面会无副作用恢复。",
      href: "/app/events",
      label: language === "en" ? "Events" : "活动",
      title: language === "en" ? "Live context unavailable" : "真实上下文暂不可用",
    },
  ];
}

function preferredItems(input: {
  agentResult: SafeAgentActionQueueResult;
  contactsResult: SafeContactsListSearchResult;
  dashboardResult: SafeDashboardAggregateSummaryResult;
  eventsResult: SafeEventListResult;
  followupsResult: SafeFollowupTaskGenerationResult;
  language: OrbitAiLanguage;
  panel: OrbitAiPanel;
}): readonly OrbitAiStageItem[] {
  const allItems = [
    ...eventItems(input.eventsResult, input.language),
    ...contactItems(input.contactsResult, input.language),
    ...followupItems(input.followupsResult, input.language),
    ...dashboardItems(input.dashboardResult, input.language),
    ...agentItems(input.agentResult, input.language),
  ];
  const panelItems: Partial<Record<OrbitAiPanel, readonly OrbitAiStageItem[]>> = {
    agent: agentItems(input.agentResult, input.language),
    dashboard: dashboardItems(input.dashboardResult, input.language),
    events: eventItems(input.eventsResult, input.language),
    followups: followupItems(input.followupsResult, input.language),
    people: contactItems(input.contactsResult, input.language),
  };
  const selectedItems =
    input.panel === "home" || input.panel === "schedule"
      ? allItems
      : panelItems[input.panel] ?? allItems;

  return selectedItems.length ? selectedItems.slice(0, 7) : fallbackItems(input.language);
}

function orbitContacts(
  contactsResult: SafeContactsListSearchResult,
): OrbitAiCommandPayload["orbitContacts"] {
  if (contactsResult.success === false) {
    return [];
  }

  return contactsResult.data.contacts.slice(0, 4).map((contact, index) => ({
    initials: contact.displayName
      .split(/\s+/u)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    label: contact.displayName,
    orbit: ((index % 3) + 1) as 1 | 2 | 3,
  }));
}

function success(data: OrbitAiCommandPayload): OrbitAiCommandResult {
  return {
    success: true,
    data,
  };
}

export function createLiveOrbitAiCommandService({
  agentService = createAgentActionQueueService("live"),
  contactsService = createContactsListSearchAndFilterService("live"),
  dashboardService = createDashboardAggregateService("live"),
  eventService = createEventCrudAndImportService("live"),
  followupService = createFollowupTaskGenerationService("live"),
}: LiveOrbitAiCommandServiceOptions = {}): OrbitAiCommandService {
  return {
    async getCommandCenter(input: OrbitAiCommandInput = {}): Promise<OrbitAiCommandResult> {
      const panel = resolvePanel(input);
      const language = resolveLanguage(input.language);
      const prompt =
        input.prompt?.trim() ||
        (language === "en"
          ? "What live relationship context should I review next?"
          : "我现在应该先看哪些真实关系上下文？");
      const eventsResult = await readSafely(
        "ORBIT_AI_COMMAND_LIVE_EVENTS_READ_FAILED",
        () => eventService.listEvents(),
      );
      const contactsResult = await readSafely(
        "ORBIT_AI_COMMAND_LIVE_CONTACTS_READ_FAILED",
        () => contactsService.listContacts(),
      );
      const followupsResult = await readSafely(
        "ORBIT_AI_COMMAND_LIVE_FOLLOWUPS_READ_FAILED",
        () => followupService.listTasks(),
      );
      const dashboardResult = await readSafely(
        "ORBIT_AI_COMMAND_LIVE_DASHBOARD_READ_FAILED",
        () => dashboardService.getDashboardSummary(),
      );
      const agentResult = await readSafely(
        "ORBIT_AI_COMMAND_LIVE_AGENT_READ_FAILED",
        () => agentService.listActions(),
      );
      const results = [
        eventsResult,
        contactsResult,
        followupsResult,
        dashboardResult,
        agentResult,
      ] as const;
      const stageItems = preferredItems({
        agentResult,
        contactsResult,
        dashboardResult,
        eventsResult,
        followupsResult,
        language,
        panel,
      });

      return success({
        assistantMessage:
          language === "en"
            ? "I loaded live Orbit context from events, people, follow-ups, relationship health, and the review queue. Nothing has been executed outside Orbit."
            : "我已经读取真实 Orbit 上下文，包括活动、人脉、跟进、关系健康和确认队列。没有在 Orbit 外部执行任何动作。",
        commandLinks: commandLinks(language),
        evidenceIds: uniqueEvidence(results),
        language,
        languageOptions: languageOptions(language, panel),
        orbitContacts: orbitContacts(contactsResult),
        panel,
        prompt,
        sideEffectsExecuted: false,
        stageCtaHref: stageItems[0]?.href ?? "/app",
        stageCtaLabel:
          stageItems[0]?.actionLabel ??
          (language === "en" ? "Open Orbit" : "打开 Orbit"),
        stageItems,
        stageSubtitle:
          language === "en"
            ? "Live remote records are summarized as reviewable surfaces only."
            : "真实远程记录只被整理成可复核界面。",
        stageTitle:
          language === "en" ? "Live Orbit priorities" : "真实 Orbit 优先事项",
      });
    },
  };
}
