import { createAgentActionQueueService } from "../agent/service-factory";
import { createAppBootstrapService } from "../bootstrap/service-factory";
import { createContactsListSearchAndFilterService } from "../contacts/service-factory";
import { createDashboardAggregateService } from "../dashboard/service-factory";
import { createEventCrudAndImportService } from "../events/service-factory";
import { createFollowupTaskGenerationService } from "../followups/service-factory";
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

const panelWords: Record<OrbitAiPanel, readonly string[]> = {
  agent: ["agent", "action", "next", "move", "review", "行动", "下一步", "检查", "确认", "审核"],
  dashboard: ["dashboard", "health", "network", "analysis", "signal", "健康", "网络", "信号", "分析"],
  events: ["event", "events", "meet", "tokyo", "attend", "活动", "见面", "会议", "东京", "参加"],
  followups: ["follow", "followup", "follow-up", "draft", "message", "跟进", "草稿", "消息", "回访"],
  home: [],
  people: ["people", "person", "intro", "introduce", "contact", "人脉", "联系人", "介绍", "见谁"],
  schedule: ["schedule", "calendar", "timeline", "date", "日程", "日历", "时间线", "安排"],
};

const commandLinkLabels: Record<
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

const languageNames: Record<OrbitAiLanguage, string> = {
  en: "English",
  zh: "中文",
};

const englishFallbackItems: readonly OrbitAiStageItem[] = [
  {
    actionLabel: "Open event workspace",
    body: "Find events where your current relationship goals have enough context to act.",
    href: "/app/events",
    label: "Events",
    title: "Recommended events",
  },
  {
    actionLabel: "Open people workspace",
    body: "Prioritize people by source-backed context, value, and next safe action.",
    href: "/app/contacts",
    label: "People",
    title: "People to prioritize",
  },
  {
    actionLabel: "Open follow-ups",
    body: "Review promises, draft boundaries, and follow-up timing before anything is sent.",
    href: "/app/followups",
    label: "Follow-ups",
    title: "Follow-up queue",
  },
  {
    actionLabel: "Review schedule",
    body: "Place events, follow-ups, and held actions on one review-first timeline.",
    href: "/app?panel=schedule&lang=en",
    label: "Schedule",
    title: "Schedule timeline",
  },
  {
    actionLabel: "Open conversations",
    body: "Use private conversation context without turning it into automatic outreach.",
    href: "/app/chat",
    label: "Conversations",
    title: "Conversation context",
  },
  {
    actionLabel: "Open relationship health",
    body: "See gaps, dormant ties, and relationship health signals in one place.",
    href: "/app/dashboard",
    label: "Health",
    title: "Network signal",
  },
  {
    actionLabel: "Review next moves",
    body: "Confirm review-before-action items before external side effects are possible.",
    href: "/app/agent",
    label: "Next moves",
    title: "Review-before-action queue",
  },
];

const chineseFallbackItems: readonly OrbitAiStageItem[] = [
  {
    actionLabel: "打开活动工作区",
    body: "找到和当前关系目标有关、上下文足够的活动。",
    href: "/app/events",
    label: "活动",
    title: "推荐活动",
  },
  {
    actionLabel: "打开人脉工作区",
    body: "按来源、价值和下一步动作，把该优先处理的人排出来。",
    href: "/app/contacts",
    label: "人脉",
    title: "优先联系人",
  },
  {
    actionLabel: "打开跟进",
    body: "先看承诺、草稿边界和时机，再决定要不要发出去。",
    href: "/app/followups",
    label: "跟进",
    title: "跟进队列",
  },
  {
    actionLabel: "查看日程",
    body: "把活动、跟进和待确认动作放在同一条时间线上。",
    href: "/app?panel=schedule",
    label: "日程",
    title: "日程时间线",
  },
  {
    actionLabel: "打开对话",
    body: "把私聊上下文拿来参考，但不自动对外发送。",
    href: "/app/chat",
    label: "对话",
    title: "对话上下文",
  },
  {
    actionLabel: "打开关系健康",
    body: "看关系缺口、沉睡关系和当前网络信号。",
    href: "/app/dashboard",
    label: "关系健康",
    title: "关系信号",
  },
  {
    actionLabel: "检查下一步",
    body: "所有会产生外部影响的动作，都先放在确认队列里。",
    href: "/app/agent",
    label: "下一步",
    title: "发送前检查",
  },
];

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function resolveLanguage(value?: string | null): OrbitAiLanguage {
  return normalizeText(value) === "en" ? "en" : "zh";
}

function appHref(
  input: { language: OrbitAiLanguage; panel?: OrbitAiPanel | null },
): string {
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

function createCommandLinks(language: OrbitAiLanguage): readonly OrbitAiCommandLink[] {
  return panelOrder.map((panel) => ({
    href: appHref({ language, panel }),
    label: commandLinkLabels[language][panel],
    panel,
  }));
}

function createLanguageOptions(
  language: OrbitAiLanguage,
  panel: OrbitAiPanel,
): readonly OrbitAiLanguageOption[] {
  return (["zh", "en"] as const).map((option) => ({
    active: option === language,
    href: appHref({ language: option, panel }),
    label: languageNames[option],
    language: option,
  }));
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

function success(data: OrbitAiCommandPayload): OrbitAiCommandResult {
  return { success: true, data };
}

function fallbackItems(language: OrbitAiLanguage): readonly OrbitAiStageItem[] {
  return language === "en" ? englishFallbackItems : chineseFallbackItems;
}

function itemFromParts(input: {
  actionLabel: string;
  body: string;
  href: string;
  label: string;
  title: string;
}): OrbitAiStageItem {
  return input;
}

export function createMockOrbitAiCommandService(): OrbitAiCommandService {
  const bootstrapService = createAppBootstrapService();
  const contactsService = createContactsListSearchAndFilterService();
  const dashboardService = createDashboardAggregateService();
  const eventService = createEventCrudAndImportService();
  const followupService = createFollowupTaskGenerationService();
  const agentService = createAgentActionQueueService();

  return {
    getCommandCenter(input: OrbitAiCommandInput = {}): OrbitAiCommandResult {
      const panel = resolvePanel(input);
      const language = resolveLanguage(input.language);
      const commandLinks = createCommandLinks(language);
      const languageOptions = createLanguageOptions(language, panel);
      const bootstrap = bootstrapService.getAppBootstrap();
      const prompt =
        input.prompt?.trim() ||
        (language === "en"
          ? "What are you trying to achieve in Tokyo?"
          : "你现在想在东京推进什么？");
      const payload = bootstrap.success ? bootstrap.data : null;
      const orbitContacts = [
        { initials: "AM", label: "Akari Mori", orbit: 1 as const },
        { initials: "MC", label: "Maya Chen", orbit: 2 as const },
        { initials: "KW", label: "Kenji Watanabe", orbit: 3 as const },
        { initials: "PS", label: "Priya Shah", orbit: 2 as const },
      ];
      const baseEvidence = payload?.provenance.evidenceIds ?? ["bootstrap-fixture-1"];

      if (panel === "events") {
        const events = eventService.listEvents();
        const records =
          payload?.upcomingEvents.map((event) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open event workspace" : "打开活动工作区",
              body:
                language === "en"
                  ? event.goal
                  : event.title === "Tokyo SaaS Leaders Roundtable"
                    ? "找两位做创始人销售的渠道伙伴。"
                    : "重新联系已经沉睡的运营关系。",
              href: "/app/events",
              label:
                language === "en"
                  ? event.readinessLabel
                  : event.title === "Tokyo SaaS Leaders Roundtable"
                    ? "3 位重点参会者已就绪"
                    : "目标已整理",
              title: event.title,
            }),
          ) ??
          (events.success
            ? events.data.events.slice(0, 3).map((event) =>
                itemFromParts({
                  actionLabel: language === "en" ? "Open event workspace" : "打开活动工作区",
                  body:
                    language === "en"
                      ? event.recommendedPreparation
                      : "先看参会者和关系线索，再决定要不要去。",
                  href: "/app/events",
                  label: language === "en" ? event.relationshipContext : "活动线索",
                  title: event.title,
                }),
              )
            : []);

        return success({
          assistantMessage:
            language === "en"
              ? "I found event opportunities with source-backed attendee context. The side panel shows where Orbit can help you act."
              : "我找到了几场值得看的活动。右侧先放参会线索和下一步，不会替你自动报名或发消息。",
          commandLinks,
          evidenceIds: baseEvidence,
          language,
          languageOptions,
          orbitContacts,
          panel,
          prompt,
          sideEffectsExecuted: false,
          stageCtaHref: "/app/events",
          stageCtaLabel: language === "en" ? "Open event workspace" : "打开活动工作区",
          stageItems: records,
          stageSubtitle:
            language === "en"
              ? "High-signal events selected from current relationship context."
              : "从当前关系上下文里挑出的高信号活动。",
          stageTitle: language === "en" ? "Recommended events" : "推荐活动",
        });
      }

      if (panel === "people") {
        const contacts = contactsService.listContacts();
        const bootstrapPeople =
          payload?.pendingTasks.slice(0, 2).map((task) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open people workspace" : "打开人脉工作区",
              body:
                language === "en"
                  ? task.recommendedAction
                  : "先看承诺和来源，再决定这次该怎么跟进。",
              href: "/app/contacts",
              label: language === "en" ? task.dueLabel : "需要处理",
              title: task.contactName,
            }),
          ) ?? [];
        const records = contacts.success
          ? contacts.data.contacts.slice(0, 2).map((contact) =>
              itemFromParts({
                actionLabel: language === "en" ? "Open people workspace" : "打开人脉工作区",
                body:
                  language === "en"
                    ? contact.nextAction
                    : "把关系背景、价值判断和下一步放在同一个视图里看。",
                href: "/app/contacts",
                label: language === "en" ? contact.relationshipContext : "关系上下文",
                title: contact.displayName,
              }),
            )
          : [];

        return success({
          assistantMessage:
            language === "en"
              ? "I ranked people by relationship context, value, and whether there is a safe next action."
              : "我先按关系背景和可执行的下一步排人。右侧只给建议，不替你发出任何动作。",
          commandLinks,
          evidenceIds: baseEvidence,
          language,
          languageOptions,
          orbitContacts,
          panel,
          prompt,
          sideEffectsExecuted: false,
          stageCtaHref: "/app/contacts",
          stageCtaLabel: language === "en" ? "Open people workspace" : "打开人脉工作区",
          stageItems: [...bootstrapPeople, ...records].slice(0, 3),
          stageSubtitle:
            language === "en"
              ? "People surfaced from source-backed relationship records."
              : "从有来源的关系记录里挑出优先联系人。",
          stageTitle: language === "en" ? "People to prioritize" : "优先联系人",
        });
      }

      if (panel === "followups") {
        const followups = followupService.listTasks({ limit: 3 });
        const bootstrapTasks =
          payload?.pendingTasks.map((task) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open follow-ups" : "打开跟进",
              body:
                language === "en"
                  ? task.recommendedAction
                  : "先确认摘要和语气，再决定是否发送。",
              href: "/app/followups",
              label: language === "en" ? task.dueLabel : "等待确认",
              title:
                language === "en"
                  ? task.title
                  : `给 ${task.contactName} 发送摘要`,
            }),
          ) ?? [];
        const tasks = followups.success
          ? followups.data.tasks.map((task) =>
              itemFromParts({
                actionLabel: language === "en" ? "Open follow-ups" : "打开跟进",
                body:
                  language === "en"
                    ? task.recommendedAction
                    : "把承诺、草稿和提醒放在一起复核。",
                href: "/app/followups",
                label:
                  language === "en"
                    ? `${task.contactName} at ${task.organization}`
                    : task.organization,
                title: language === "en" ? task.title : `跟进 ${task.contactName}`,
              }),
            )
          : [];

        return success({
          assistantMessage:
            language === "en"
              ? "I opened the follow-up queue. These are staged review items, not sent messages."
              : "我打开了跟进队列。这里是待确认事项，不是已经发出的消息。",
          commandLinks,
          evidenceIds: baseEvidence,
          language,
          languageOptions,
          orbitContacts,
          panel,
          prompt,
          sideEffectsExecuted: false,
          stageCtaHref: "/app/followups",
          stageCtaLabel: language === "en" ? "Open follow-ups" : "打开跟进",
          stageItems: [...bootstrapTasks, ...tasks].slice(0, 3),
          stageSubtitle:
            language === "en"
              ? "Relationship promises staged for review before outreach."
              : "所有关系承诺先进入复核，再进入对外动作。",
          stageTitle: language === "en" ? "Follow-up queue" : "跟进队列",
        });
      }

      if (panel === "schedule") {
        const eventItems =
          payload?.upcomingEvents.slice(0, 2).map((event) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open event workspace" : "打开活动工作区",
              body:
                language === "en"
                  ? `${event.startsAt} · ${event.goal}`
                  : `${event.startsAt} · 先确认活动目标和相关联系人。`,
              href: "/app/events",
              label: language === "en" ? "Event" : "活动",
              title: event.title,
            }),
          ) ?? [];
        const followupItems =
          payload?.pendingTasks.slice(0, 2).map((task) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open follow-ups" : "打开跟进",
              body:
                language === "en"
                  ? task.recommendedAction
                  : "跟进草稿保持待确认，不会自动发送。",
              href: "/app/followups",
              label: language === "en" ? "Follow-up" : "跟进",
              title: task.title,
            }),
          ) ?? [];
        const records = [...eventItems, ...followupItems];

        return success({
          assistantMessage:
            language === "en"
              ? "I placed the upcoming relationship work on one review-first schedule. Nothing is sent or booked automatically."
              : "我把接下来的关系工作排成一条日程线。所有待确认动作都只是草稿，不会自动发送或预约。",
          commandLinks,
          evidenceIds: baseEvidence,
          language,
          languageOptions,
          orbitContacts,
          panel,
          prompt,
          sideEffectsExecuted: false,
          stageCtaHref: "/app?panel=schedule",
          stageCtaLabel: language === "en" ? "Review schedule" : "查看日程",
          stageItems: records.length > 0 ? records : fallbackItems(language).slice(0, 4),
          stageSubtitle:
            language === "en"
              ? "Events, follow-ups, and held actions on a single timeline."
              : "活动、跟进和待确认动作排在同一条时间线上。",
          stageTitle: language === "en" ? "Schedule timeline" : "日程时间线",
        });
      }

      if (panel === "agent") {
        const actions = agentService.listActions();
        const bootstrapActions =
          payload?.topAgentActions.map((action) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open next moves" : "打开下一步",
              body:
                language === "en"
                  ? action.recommendedAction
                  : "Orbit 可以准备内容，但发送前必须由你确认。",
              href: "/app/agent",
              label: language === "en" ? "Human review required" : "需要人工确认",
              title:
                language === "en"
                  ? action.title
                  : action.title === "Confirm intro draft before sending"
                    ? "发送前确认介绍草稿"
                    : action.title,
            }),
          ) ?? [];
        const records = actions.success
          ? actions.data.actions.slice(0, 2).map((action) =>
              itemFromParts({
                actionLabel: language === "en" ? "Open next moves" : "打开下一步",
                body:
                  language === "en"
                    ? action.recommendedAction
                    : "先检查来源、对象和措辞，再决定是否执行。",
                href: "/app/agent",
                label:
                  language === "en"
                    ? `${action.contactName} at ${action.organization}`
                    : `${action.contactName} / ${action.organization}`,
                title: language === "en" ? action.title : "待确认动作",
              }),
            )
          : [];

        return success({
          assistantMessage:
            language === "en"
              ? "I opened the review-before-action queue. Orbit can prepare the work, but action remains held for confirmation."
              : "我打开了发送前检查队列。Orbit 可以准备工作，但外部动作会停在确认前。",
          commandLinks,
          evidenceIds: baseEvidence,
          language,
          languageOptions,
          orbitContacts,
          panel,
          prompt,
          sideEffectsExecuted: false,
          stageCtaHref: "/app/agent",
          stageCtaLabel: language === "en" ? "Open next moves" : "打开下一步",
          stageItems: [...bootstrapActions, ...records].slice(0, 3),
          stageSubtitle:
            language === "en"
              ? "Actions that require human review before external side effects."
              : "会产生外部影响的动作，都先停在这里。",
          stageTitle: language === "en" ? "Review-before-action queue" : "发送前检查",
        });
      }

      if (panel === "dashboard") {
        const dashboard = dashboardService.getDashboardSummary();
        const metrics = dashboard.success ? dashboard.data.metrics : [];

        return success({
          assistantMessage:
            language === "en"
              ? "I opened the network signal view so you can see health, gaps, and opportunities before choosing an action."
              : "我打开了关系信号。先看健康度、缺口和机会，再决定下一步。",
          commandLinks,
          evidenceIds: baseEvidence,
          language,
          languageOptions,
          orbitContacts,
          panel,
          prompt,
          sideEffectsExecuted: false,
          stageCtaHref: "/app/dashboard",
          stageCtaLabel: language === "en" ? "Open relationship health" : "打开关系健康",
          stageItems: metrics.map((metric) =>
            itemFromParts({
              actionLabel: language === "en" ? "Open relationship health" : "打开关系健康",
              body:
                language === "en"
                  ? `${metric.value} ${metric.label.toLowerCase()} need context-aware review.`
                  : `${metric.value} 个${metric.label === "High-value relationships" ? "高价值关系" : "关系信号"}需要复核。`,
              href: "/app/dashboard",
              label: language === "en" ? "Network signal" : "关系信号",
              title:
                language === "en"
                  ? metric.label
                  : metric.label === "High-value relationships"
                    ? "高价值关系"
                    : metric.label,
            }),
          ),
          stageSubtitle:
            language === "en"
              ? "Relationship health summarized from the current workspace."
              : "从当前工作区汇总出的关系健康信号。",
          stageTitle: language === "en" ? "Network signal" : "关系信号",
        });
      }

      return success({
        assistantMessage:
          language === "en"
            ? "Tell me what kind of opportunity you want: an event to attend, people to meet, a follow-up to prepare, or a network signal to inspect."
            : "告诉我你想推进哪类机会：参加活动、见谁、准备跟进，或者先看关系信号。",
        commandLinks,
        evidenceIds: baseEvidence,
        language,
        languageOptions,
        orbitContacts,
        panel,
        prompt,
        sideEffectsExecuted: false,
        stageCtaHref: "/app",
        stageCtaLabel: language === "en" ? "Open a function panel from chat" : "从聊天打开功能面板",
        stageItems: fallbackItems(language),
        stageSubtitle:
          language === "en"
            ? "Function panels turn the conversation into events, people, follow-ups, conversations, health, and next moves."
            : "功能面板会把对话落到活动、人脉、跟进、对话、关系健康和下一步。",
        stageTitle: language === "en" ? "Open a function panel from chat" : "从聊天打开功能面板",
      });
    },
  };
}
