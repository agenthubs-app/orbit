export type OrbitAiPanelLocale = "en" | "zh";

export const ORBIT_AI_PANEL_LOCALIZATION_NAMESPACES = [
  "panel",
  "artifact",
  "metadata",
  "actions",
  "confidence",
  "calendar",
  "proactive",
  "conversation",
  "recovery",
] as const;

type OrbitAiPanelLocalizationNamespace =
  (typeof ORBIT_AI_PANEL_LOCALIZATION_NAMESPACES)[number];

type LocalizationTable = Record<
  OrbitAiPanelLocalizationNamespace,
  Record<string, string>
>;

const zhText: LocalizationTable = {
  actions: {
    "Cancel": "取消",
    "Confirmation unavailable": "暂不能确认",
    "Preview add to calendar": "预览加入日历",
    "Review contact": "查看人脉",
    "Review event": "查看活动",
    "Review follow-up queue": "复核跟进队列",
    "Review person": "复核关系",
    "Review source": "查看来源",
    "View basis": "查看依据",
    "View event details": "查看活动详情",
    "View relationship details": "查看关系详情",
    "View source details": "查看来源详情",
  },
  artifact: {
    "1 existing relationship path matched the request.":
      "已从已有关系中匹配到 1 条可复核人脉路径。",
    "Conversation and schedule context": "来自对话和日程上下文",
    "Event matches": "活动匹配",
    "Follow-up queue": "跟进队列",
    "Goal-based contact recommendations": "按目标匹配的人脉推荐",
    "Matched from existing relationship evidence only":
      "仅从已有真实关系证据中匹配",
    "No source-backed upcoming relationship work matched this prompt.":
      "没有匹配这次问题的有来源待办。",
    "Only people with existing relationship evidence are eligible.":
      "只有已有真实关系证据的人会进入候选。",
    "Open a contact detail page and verify the source snippets before requesting an intro, message, or follow-up.":
      "请打开联系人详情页并复核来源片段，再决定是否请求介绍、发消息或跟进。",
    "Orbit AI loaded reviewable event recommendations from Events without registration, calendar writes, notifications, or external actions.":
      "Orbit AI 从 Events 加载可复核活动推荐，未报名、未写日历、未发通知、未执行外部动作。",
    "Prioritized next actions": "优先下一步",
    "Recommended contacts": "推荐人脉",
    "Recommended events": "推荐活动",
    "Review the linked person or event before sending, scheduling, notifying, or writing anything.":
      "发送、安排、通知或写入前，请先打开对应人或活动复核。",
    "Review the relationship path and source evidence before asking for an intro, message, or follow-up.":
      "请先复核人脉路径和来源证据，再决定是否请求介绍、发消息或跟进。",
    "Upcoming relationship work": "关系待办摘要",
  },
  calendar: {
    "Attendee intent notes": "参会者意图记录",
    "Data source": "数据来源",
    "Event topic record": "活动主题记录",
    "Events service": "活动服务",
    "Local calendar fixture": "本地日历记录",
    "Local preview only": "仅本地预览",
    "No calendar event created": "尚未创建日历事件",
    "Review event evidence before registering, adding calendar holds, notifying anyone, or taking external action.":
      "复核活动证据后，再决定是否报名、加入日历、通知他人或执行外部动作。",
    "Review-only preview. No calendar event has been created; check the source details or cancel until a live calendar adapter is connected.":
      "当前预览仅用于复核；尚未创建日历事件。接入真实日历适配器前，请先查看来源详情或取消。",
    "Unconfirmed": "未确认",
    "What would be added": "将加入什么",
  },
  confidence: {
    "Evidence-backed": "有证据支撑",
    "High confidence": "高可信",
    "Medium confidence": "中等可信",
    "high priority": "高优先级",
    "low priority": "低优先级",
    "medium priority": "中优先级",
  },
  conversation: {
    "Conversation summary": "对话摘要",
    "Conversation and schedule context": "来自对话和日程上下文",
    "Due:": "到期：",
    "Evidence snippets:": "证据片段：",
    "Event attendance": "活动出席记录",
    "Generated contact profile": "生成联系人画像",
    "Local schedule review": "本地日程复核",
    "Orbit Agent free-form reply rule": "Orbit Agent 自由对话规则",
    "People to meet:": "建议认识：",
    "Profile fit summary": "画像匹配摘要",
    "Relationship opportunity graph": "关系机会图谱",
    "Relationship graph": "关系图谱",
    "Relationship recency reminder": "关系新近度提醒",
    "Schedule timing record": "日程时间记录",
    "Saved relationship conversation": "已保存关系对话",
    "Saved conversation context says": "已保存对话上下文显示",
    "Source context:": "来源上下文：",
    "Timing:": "时间：",
    "Today": "今天",
    "Tomorrow": "明天",
    "conversation": "对话",
    "full": "完整",
    "limited": "有限",
    "schedule": "日程",
  },
  metadata: {
    "Boundary": "边界",
    "Confidence": "可信度",
    "Contact": "联系人",
    "Data source": "数据来源",
    "Date": "日期",
    "Due": "到期",
    "End": "结束",
    "Event": "活动",
    "Evidence": "证据",
    "Last touch": "最近联系",
    "Location": "地点",
    "Method": "方法",
    "Organization": "组织",
    "People": "建议认识",
    "Privacy": "隐私范围",
    "Reason": "原因",
    "Resolution score": "解析分",
    "Score": "匹配分",
    "Source": "来源",
    "Source context": "来源上下文",
    "Start": "开始",
    "Time zone": "时区",
    "Timing": "时间",
    "Title": "标题",
    "When": "时间",
  },
  panel: {
    "Contact recommendations": "人脉推荐",
    "Event recommendations": "活动推荐",
    "Follow-up queue": "跟进队列",
    "Message context": "消息上下文",
    "Orbit prepared this result for review.":
      "Orbit 已整理好这份结果，等待你确认。",
    "Orbit result": "Orbit 结果",
    "Pending": "等待中",
    "Ready": "已就绪",
    "Failed": "失败",
    "Relationship context": "关系上下文",
    "Results": "结果",
    "To-do summary": "关系待办",
  },
  proactive: {
    "Local calendar fixture": "本地日历记录",
    "Mina is connected through the founder salon and asked for a short operator update.":
      "Mina 来自创始人沙龙关系，并请求一份简短的运营进展更新。",
    "Mina Park: warm intro from last week's founder salon":
      "人物上下文：Mina Park：来自上周创始人沙龙的暖引荐",
    "People:": "人物：",
    "People context:": "人物上下文：",
    "Preparation prompt:": "准备重点：",
    "Preparation:": "准备重点：",
    "Prepare me for": "帮我准备",
    "Relationship context:": "关系背景：",
    "Review the investor's climate portfolio and prepare two follow-up paths.":
      "复核这位投资人的气候领域组合，并准备两条跟进路径。",
    "Seed investor preparation call": "种子投资人准备电话",
    "This is a local Orbit Agent inbox message. Nothing has been delivered outside Orbit.":
      "这是 Orbit Agent 的本地站内消息，没有向 Orbit 外部投递任何内容。",
    "Upcoming:": "即将开始：",
    "warm intro from last week's founder salon":
      "来自上周创始人沙龙的暖引荐",
  },
  recovery: {
    "No source-backed upcoming relationship work matched this prompt.":
      "没有匹配这次问题的有来源待办。",
    "Orbit could not reply right now. Please try again.":
      "Orbit 现在没有返回结果，请稍后再试。",
    "Orbit replied, but no message text was returned.":
      "Orbit 已返回，但没有可显示的回复文本。",
    "The user asked about follow-ups, so a follow-up review artifact can be generated.":
      "用户询问了跟进事项，可以生成待复核的跟进结果。",
    "Understood. Keep describing the goal in natural language; if contact, event, or follow-up context is needed, I will explain what to inspect before waiting for confirmation.":
      "我明白。你可以继续用自然语言描述目标；如果需要联系人、活动或跟进上下文，我会先说明要查什么，再等你确认。",
  },
};

const technicalKeys = new Set([
  "actionId",
  "artifactId",
  "artifactProducer",
  "artifactSource",
  "collectedAt",
  "completionBoundary",
  "confirmationStatus",
  "conversationId",
  "createdAt",
  "date",
  "dedupeKey",
  "deliverySurface",
  "endTime",
  "endsAt",
  "evidenceId",
  "evidenceIds",
  "externalNetworkRequested",
  "href",
  "id",
  "intent",
  "intentId",
  "itemId",
  "kind",
  "localOnly",
  "messageId",
  "noExternalEventCreated",
  "provider",
  "providerRecordId",
  "role",
  "routingDecision",
  "safety",
  "source",
  "sourceId",
  "sourceMessageId",
  "sourceModules",
  "startTime",
  "startsAt",
  "state",
  "status",
  "taskId",
  "time",
  "timeLabel",
  "timeZone",
  "toolCallId",
  "toolFamily",
  "toolName",
  "type",
  "updatedAt",
  "windowEndsAt",
  "windowStartsAt",
]);

const localizableKeys = new Set([
  "activityTitle",
  "answer",
  "assistantMessage",
  "body",
  "confidenceLabel",
  "description",
  "emptyState",
  "label",
  "message",
  "nextAction",
  "peopleContext",
  "preparationPrompt",
  "reason",
  "recoveryCopy",
  "relationshipContext",
  "sourceLabel",
  "subject",
  "subtitle",
  "summary",
  "title",
  "value",
]);

const replacements = Object.values(zhText)
  .flatMap((namespace) => Object.entries(namespace))
  .filter(([source]) => source.length > 5 || /[\s:;.·-]/.test(source))
  .sort((left, right) => right[0].length - left[0].length);
const exactTranslations = new Map(
  Object.values(zhText).flatMap((namespace) => Object.entries(namespace)),
);

function normalizeLocale(locale: string | null | undefined): OrbitAiPanelLocale {
  return locale === "en" ? "en" : "zh";
}

function shouldLocalizeKey(key: string | null): boolean {
  if (!key) return true;
  if (technicalKeys.has(key)) return false;
  return localizableKeys.has(key);
}

function withPriorityCopy(value: string): string {
  return value
    .replace(/\bhigh priority\b/gi, "高优先级")
    .replace(/\bmedium priority\b/gi, "中优先级")
    .replace(/\blow priority\b/gi, "低优先级");
}

export function localizeOrbitAiPanelText(
  value: string,
  locale: string | null | undefined,
): string {
  if (normalizeLocale(locale) === "en") return value;

  const exact = exactTranslations.get(value);
  if (exact) return exact;

  let localized = withPriorityCopy(value);

  for (const [source, target] of replacements) {
    if (localized.includes(source)) {
      localized = localized.split(source).join(target);
    }
  }

  return localized
    .replace(/：\s+/g, "：")
    .replace(/人物上下文：\s*人物上下文：/g, "人物上下文：")
    .replace(/\bstarts at\b/gi, "于")
    .replace(/\bat (?=\d{2}:\d{2}\b)/g, "于 ")
    .replace(/\bToday\b/g, "今天")
    .replace(/\bTomorrow\b/g, "明天");
}

function localizeNode<T>(value: T, locale: OrbitAiPanelLocale, key: string | null): T {
  if (typeof value === "string") {
    return (shouldLocalizeKey(key)
      ? localizeOrbitAiPanelText(value, locale)
      : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => localizeNode(item, locale, key)) as T;
  }

  if (value && typeof value === "object") {
    const localized: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      localized[childKey] = localizeNode(
        childValue,
        locale,
        childKey,
      );
    }

    return localized as T;
  }

  return value;
}

export function localizeOrbitAiPanelPayload<T>(
  value: T,
  locale: string | null | undefined,
): T {
  return localizeNode(value, normalizeLocale(locale), null);
}

export function localizeOrbitAiPanelCalendarActionPreview<T>(
  value: T,
  locale: string | null | undefined,
): T {
  return localizeOrbitAiPanelPayload(value, locale);
}

export function localizeOrbitAiPanelProactiveContext<T>(
  value: T,
  locale: string | null | undefined,
): T {
  return localizeOrbitAiPanelPayload(value, locale);
}
