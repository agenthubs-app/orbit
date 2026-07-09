// 关系收件箱面板的 demo 内容本地化。
//
// 面板读取的是确定性 mock/fixture 文字（英文），无法像真实数据那样跟随语言。
// 为了让 demo 默认展示中文，这里按稳定 ID / 模式提供中文改写，在 view-model 层应用。
// 规则：
//  - 只覆盖已知的 demo 记录（对话 conversationId、消息 messageId、提醒模式、
//    proactive 固定文案）；未知内容（如用户新建的中文线程、真实数据）原样返回。
//  - 语言为 "en" 时不改写，保留英文原文；其余（默认 zh）应用中文。
// 这是展示层的 demo 兜底，不改动任何共享 fixture / service / 测试。

import type { OrbitLanguage } from "../orbit-language-core";

interface ThreadDemoZh {
  subject: string;
  summary: string;
  preview: string;
  draftReplyBody: string;
  messages: Record<string, string>;
}

// 两个 demo 对话（async mock 固定 fixture，conversationId 稳定）。
const THREAD_ZH: Record<string, ThreadDemoZh> = {
  conversation_demo_aoba: {
    subject: "创始人早餐要点回顾",
    summary:
      "青叶在与场地团队沟通前，希望先拿到代代木气候创始人早餐的两点要点回顾。",
    preview: "好的，我会写得简短，并对应场地团队的后续问题。",
    draftReplyBody:
      "青叶，早餐的两点要点如下：场地团队最看重创始人契合度，以及一个明确的后续负责人。我可以在你和场地团队沟通前把这两条发给你，周四 10:00（JST）也可以留出来快速对齐。",
    messages: {
      message_demo_aoba_1:
        "代代木的气候创始人早餐很有收获。在我和场地团队沟通之前，能麻烦你把两点要点回顾发给我吗？",
      message_demo_aoba_2: "好的，我会写得简短，并对应场地团队的后续问题。",
    },
  },
  conversation_demo_lina: {
    subject: "投资人引荐背景",
    summary: "莉娜在确认这次机器人投资人引荐是否仍有清晰、聚焦的理由。",
    preview: "如果机器人投资人引荐还合适，能提醒我一下哪个切入角度最相关吗？",
    draftReplyBody:
      "莉娜，最有力的角度仍然是以运营为主导的机器人落地案例。我会把引荐重点放在客户实证，而不是融资节奏上。",
    messages: {
      message_demo_lina_1:
        "如果机器人投资人引荐还合适，能提醒我一下哪个切入角度最相关吗？",
    },
  },
};

// 提醒标题：live 生成为 "Review follow-up for contact_XXX" 模式；mock 为具名散文。
const REMINDER_TITLE_ZH: Record<string, string> = {
  "Deliver the grid storage intro deck promised to Maya":
    "把答应给 Maya 的电网储能引荐资料发出去",
  "Send Diego the procurement case study": "给 Diego 发送采购案例研究",
  "Restart the Helio Works partner conversation": "重启与 Helio Works 的合作对话",
  "Check whether Kenji can make the investor intro": "确认 Kenji 是否能做这次投资人引荐",
};

const REMINDER_WINDOW_ZH: Record<string, string> = {
  "Review before the scheduled in-app reminder": "在计划的应用内提醒前复核",
  "Morning follow-up before the Tokyo workday starts": "东京工作日开始前的早间跟进",
  "One morning reminder until the requested asset is sent": "每天早间提醒，直到把对方要的资料发出",
  "Weekly relationship digest": "每周关系摘要",
  "Monthly low-priority relationship digest": "每月低优先级关系摘要",
};

// 线程 / 提醒的来源上下文标签（demo 里出现的几种）。
const SOURCE_LABEL_ZH: Record<string, string> = {
  "Yoyogi climate founder breakfast": "代代木气候创始人早餐",
  "Aoba follow-up task": "青叶跟进任务",
  "Robotics investor intro note": "机器人投资人引荐备注",
};

const PROACTIVE_ZH: Record<string, string> = {
  "Breakfast with Sarah tomorrow": "明天与 Sarah 的早餐",
  "Open source context": "查看来源上下文",
  "Prepare relationship context": "准备关系背景",
  "Draft follow-up message": "起草后续消息",
  "Review follow-up context": "复核跟进背景",
  "Draft a message": "起草一条消息",
  "Snooze in Orbit AI": "在 Orbit AI 中稍后提醒",
  "Open in Orbit AI": "在 Orbit AI 中打开",
  "Relationship nudge": "关系提醒",
};

function active(language: OrbitLanguage): boolean {
  // demo 默认中文；英文页面保留原文。
  return language !== "en";
}

export function localizeThreadSubject(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? THREAD_ZH[conversationId]?.subject ?? original : original;
}

export function localizeThreadSummary(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? THREAD_ZH[conversationId]?.summary ?? original : original;
}

export function localizeThreadPreview(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? THREAD_ZH[conversationId]?.preview ?? original : original;
}

export function localizeDraftReply(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language)
    ? THREAD_ZH[conversationId]?.draftReplyBody ?? original
    : original;
}

export function localizeThreadMessage(
  conversationId: string,
  messageId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language)
    ? THREAD_ZH[conversationId]?.messages[messageId] ?? original
    : original;
}

export function localizeReminderTitle(
  original: string,
  language: OrbitLanguage,
): string {
  if (!active(language)) {
    return original;
  }
  const mapped = REMINDER_TITLE_ZH[original];
  if (mapped) {
    return mapped;
  }
  // live 生成模式："Review follow-up for contact_021" → "跟进 contact_021"
  const followUp = original.match(/^Review follow-up for (.+)$/);
  if (followUp) {
    return `跟进 ${followUp[1]}`;
  }
  return original;
}

export function localizeReminderWindow(
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? REMINDER_WINDOW_ZH[original] ?? original : original;
}

export function localizeProactive(
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? PROACTIVE_ZH[original] ?? original : original;
}

export function localizeSourceLabels(
  labels: readonly string[],
  language: OrbitLanguage,
): readonly string[] {
  if (!active(language)) {
    return labels;
  }
  return labels.map((label) => SOURCE_LABEL_ZH[label] ?? label);
}
