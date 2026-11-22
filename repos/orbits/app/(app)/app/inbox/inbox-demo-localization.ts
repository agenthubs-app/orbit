// 关系收件箱面板的 demo 内容本地化。
//
// 面板读取的是确定性 mock/fixture 文字（英文），无法像真实数据那样跟随语言。
// 这里按稳定 ID / 模式提供日文、中文改写，在 view-model 层应用。
// 规则：
//  - 只覆盖已知的 demo 记录（对话 conversationId、消息 messageId、提醒模式、
//    proactive 固定文案）；未知内容（如用户新建的线程、真实数据）原样返回。
//  - 语言为 "en" 时不改写，保留英文原文；ja / zh 各取各的译文（以前 ja 也落到中文）。
// 这是展示层的 demo 兜底，不改动任何共享 fixture / service / 测试。

import type { OrbitLanguage } from "../orbit-language-core";

type Localized = { en: string; ja: string; zh: string };

function pick(copy: Localized | undefined, original: string, language: OrbitLanguage): string {
  return copy ? copy[language] : original;
}

interface ThreadDemo {
  subject: Localized;
  summary: Localized;
  preview: Localized;
  draftReplyBody: Localized;
  messages: Record<string, Localized>;
}

// 两个 demo 对话（async mock 固定 fixture，conversationId 稳定）。en 是 fixture 原文的意思。
const THREAD_DEMO: Record<string, ThreadDemo> = {
  conversation_demo_aoba: {
    subject: {
      ja: "創業者朝食会の振り返り",
      zh: "创始人早餐要点回顾",
      en: "Founder breakfast recap",
    },
    summary: {
      ja: "青葉さんは会場チームと話す前に、代々木の気候テック創業者朝食会の要点を 2 つ受け取りたいと考えています。",
      zh: "青叶在与场地团队沟通前，希望先拿到代代木气候创始人早餐的两点要点回顾。",
      en: "Aoba wants a two-point recap of the Yoyogi climate founder breakfast before talking to the venue team.",
    },
    preview: {
      ja: "承知しました。短くまとめて、会場チームからの質問に沿う形にします。",
      zh: "好的，我会写得简短，并对应场地团队的后续问题。",
      en: "Sure — I'll keep it short and map it to the venue team's follow-up questions.",
    },
    draftReplyBody: {
      ja: "青葉さん、朝食会の要点は 2 つです。会場チームがいちばん重視しているのは創業者との相性と、フォローの担当者がはっきりしていることです。会場チームと話す前にこの 2 点をお送りできます。木曜 10:00（JST）に短く打ち合わせることもできます。",
      zh: "青叶，早餐的两点要点如下：场地团队最看重创始人契合度，以及一个明确的后续负责人。我可以在你和场地团队沟通前把这两条发给你，周四 10:00（JST）也可以留出来快速对齐。",
      en: "Aoba, here are the two points from the breakfast: the venue team cares most about founder fit and a clear follow-up owner. I can send both before you talk to them, and Thursday 10:00 (JST) is open for a quick sync.",
    },
    messages: {
      message_demo_aoba_1: {
        ja: "代々木の気候テック創業者朝食会、とても実りがありました。会場チームと話す前に、要点を 2 つまとめて送っていただけますか？",
        zh: "代代木的气候创始人早餐很有收获。在我和场地团队沟通之前，能麻烦你把两点要点回顾发给我吗？",
        en: "The Yoyogi climate founder breakfast was great. Could you send me a two-point recap before I talk to the venue team?",
      },
      message_demo_aoba_2: {
        ja: "承知しました。短くまとめて、会場チームからの質問に沿う形にします。",
        zh: "好的，我会写得简短，并对应场地团队的后续问题。",
        en: "Sure — I'll keep it short and map it to the venue team's follow-up questions.",
      },
    },
  },
  conversation_demo_lina: {
    subject: {
      ja: "投資家紹介の背景",
      zh: "投资人引荐背景",
      en: "Investor intro context",
    },
    summary: {
      ja: "リナさんは、このロボティクス投資家への紹介に今も明確で絞り込んだ理由があるかを確認しています。",
      zh: "莉娜在确认这次机器人投资人引荐是否仍有清晰、聚焦的理由。",
      en: "Lina is checking whether the robotics investor intro still has a clear, focused reason.",
    },
    preview: {
      ja: "ロボティクス投資家への紹介がまだ合いそうなら、どの切り口がいちばん関係しそうか教えていただけますか？",
      zh: "如果机器人投资人引荐还合适，能提醒我一下哪个切入角度最相关吗？",
      en: "If the robotics investor intro still fits, could you remind me which angle is most relevant?",
    },
    draftReplyBody: {
      ja: "リナさん、いちばん強い切り口は今も、現場主導のロボティクス導入事例です。紹介では資金調達の時期ではなく、顧客での実績を軸にします。",
      zh: "莉娜，最有力的角度仍然是以运营为主导的机器人落地案例。我会把引荐重点放在客户实证，而不是融资节奏上。",
      en: "Lina, the strongest angle is still the operations-led robotics deployment story. I'll center the intro on customer proof rather than fundraising timing.",
    },
    messages: {
      message_demo_lina_1: {
        ja: "ロボティクス投資家への紹介がまだ合いそうなら、どの切り口がいちばん関係しそうか教えていただけますか？",
        zh: "如果机器人投资人引荐还合适，能提醒我一下哪个切入角度最相关吗？",
        en: "If the robotics investor intro still fits, could you remind me which angle is most relevant?",
      },
    },
  },
};

// 提醒标题：live 生成为 "Review follow-up for contact_XXX" 模式；mock 为具名散文。
const REMINDER_TITLE: Record<string, Localized> = {
  "Deliver the grid storage intro deck promised to Maya": {
    ja: "Maya さんに約束した系統用蓄電池の紹介資料を送る",
    zh: "把答应给 Maya 的电网储能引荐资料发出去",
    en: "Deliver the grid storage intro deck promised to Maya",
  },
  "Send Diego the procurement case study": {
    ja: "Diego さんに調達の事例資料を送る",
    zh: "给 Diego 发送采购案例研究",
    en: "Send Diego the procurement case study",
  },
  "Restart the Helio Works partner conversation": {
    ja: "Helio Works との協業の話を再開する",
    zh: "重启与 Helio Works 的合作对话",
    en: "Restart the Helio Works partner conversation",
  },
  "Check whether Kenji can make the investor intro": {
    ja: "Kenji さんに投資家を紹介してもらえるか確認する",
    zh: "确认 Kenji 是否能做这次投资人引荐",
    en: "Check whether Kenji can make the investor intro",
  },
};

const REMINDER_WINDOW: Record<string, Localized> = {
  "Review before the scheduled in-app reminder": {
    ja: "期限前に確認",
    zh: "到期前请复核",
    en: "Review before the scheduled in-app reminder",
  },
  "Morning follow-up before the Tokyo workday starts": {
    ja: "東京の始業前に朝のフォロー",
    zh: "东京工作日开始前的早间跟进",
    en: "Morning follow-up before the Tokyo workday starts",
  },
  "One morning reminder until the requested asset is sent": {
    ja: "頼まれた資料を送るまで毎朝リマインド",
    zh: "每天早间提醒，直到把对方要的资料发出",
    en: "One morning reminder until the requested asset is sent",
  },
  "Weekly relationship digest": {
    ja: "週次の関係ダイジェスト",
    zh: "每周关系摘要",
    en: "Weekly relationship digest",
  },
  "Monthly low-priority relationship digest": {
    ja: "月次の低優先度の関係ダイジェスト",
    zh: "每月低优先级关系摘要",
    en: "Monthly low-priority relationship digest",
  },
};

// 线程 / 提醒的来源上下文标签（demo 里出现的几种）。
const SOURCE_LABEL: Record<string, Localized> = {
  "Yoyogi climate founder breakfast": {
    ja: "代々木 気候テック創業者朝食会",
    zh: "代代木气候创始人早餐",
    en: "Yoyogi climate founder breakfast",
  },
  "Aoba follow-up task": {
    ja: "青葉さんのフォロータスク",
    zh: "青叶跟进任务",
    en: "Aoba follow-up task",
  },
  "Robotics investor intro note": {
    ja: "ロボティクス投資家紹介のメモ",
    zh: "机器人投资人引荐备注",
    en: "Robotics investor intro note",
  },
};

const PROACTIVE: Record<string, Localized> = {
  "Breakfast with Sarah tomorrow": { ja: "明日 Sarah さんと朝食", zh: "明天与 Sarah 的早餐", en: "Breakfast with Sarah tomorrow" },
  "Open source context": { ja: "出典を見る", zh: "查看来源上下文", en: "Open source context" },
  "Prepare relationship context": { ja: "関係の背景を準備", zh: "准备关系背景", en: "Prepare relationship context" },
  "Draft follow-up message": { ja: "フォローのメッセージを下書き", zh: "起草后续消息", en: "Draft follow-up message" },
  "Review follow-up context": { ja: "フォローの背景を確認", zh: "复核跟进背景", en: "Review follow-up context" },
  "Draft a message": { ja: "メッセージを下書き", zh: "起草一条消息", en: "Draft a message" },
  "Snooze in Orbit AI": { ja: "Orbit AI であとで通知", zh: "在 Orbit AI 中稍后提醒", en: "Snooze in Orbit AI" },
  "Open in Orbit AI": { ja: "Orbit AI で開く", zh: "在 Orbit AI 中打开", en: "Open in Orbit AI" },
  "Relationship nudge": { ja: "関係のリマインド", zh: "关系提醒", en: "Relationship nudge" },
};

function active(language: OrbitLanguage): boolean {
  // 英文页面保留 fixture 原文。
  return language !== "en";
}

export function localizeThreadSubject(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? pick(THREAD_DEMO[conversationId]?.subject, original, language) : original;
}

export function localizeThreadSummary(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? pick(THREAD_DEMO[conversationId]?.summary, original, language) : original;
}

export function localizeThreadPreview(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? pick(THREAD_DEMO[conversationId]?.preview, original, language) : original;
}

export function localizeDraftReply(
  conversationId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language)
    ? pick(THREAD_DEMO[conversationId]?.draftReplyBody, original, language)
    : original;
}

export function localizeThreadMessage(
  conversationId: string,
  messageId: string,
  original: string,
  language: OrbitLanguage,
): string {
  return active(language)
    ? pick(THREAD_DEMO[conversationId]?.messages[messageId], original, language)
    : original;
}

export function localizeReminderTitle(
  original: string,
  language: OrbitLanguage,
  readableTarget?: string,
): string {
  const followUp = original.match(/^Review follow-up for (.+)$/);
  if (followUp) {
    const target = readableTarget?.trim() || followUp[1];
    return pick({ ja: `${target} さんをフォロー`, zh: `跟进 ${target}`, en: `Follow up with ${target}` }, original, language);
  }
  if (!active(language)) {
    return original;
  }
  return pick(REMINDER_TITLE[original], original, language);
}

export function localizeReminderWindow(
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? pick(REMINDER_WINDOW[original], original, language) : original;
}

export function localizeProactive(
  original: string,
  language: OrbitLanguage,
): string {
  return active(language) ? pick(PROACTIVE[original], original, language) : original;
}

export function localizeSourceLabels(
  labels: readonly string[],
  language: OrbitLanguage,
): readonly string[] {
  if (!active(language)) {
    return labels;
  }
  return labels.map((label) => pick(SOURCE_LABEL[label], label, language));
}
