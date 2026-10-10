/**
 * R24 面談提案与紹介ルート依頼文的草稿（模板，不调 AI；止于草稿：コピー / メールアプリで開く，没有发送）。
 * 三语；称呼用对方名字，时段用东京时间。
 */
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";

function slotText(iso: string, language: PlanCopyLanguage): string {
  const date = new Date(iso);
  const locale = language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US";
  return new Intl.DateTimeFormat(locale, { day: "numeric", hour: "2-digit", minute: "2-digit", month: "numeric", timeZone: "Asia/Tokyo", weekday: "short" }).format(date);
}

export function proposalDraftText(input: { contactName: string; goal: string; typeLabel: string; questions: readonly string[]; slots: readonly string[]; language: PlanCopyLanguage }): { subject: string; body: string } {
  const slots = input.slots.map((slot) => `・${slotText(slot, input.language)}`).join("\n");
  const topics = input.questions.slice(0, 3).map((question) => `・${question}`).join("\n");
  if (input.language === "en") {
    return {
      body: `Hi ${input.contactName},\n\nI'm working toward "${input.goal}" and would love 30 minutes of your time to hear about your experience.\n\nWhat I'd like to ask:\n${topics}\n\nWould any of these times work?\n${slots}\n\nThank you.`,
      subject: `Could I ask you about ${input.typeLabel.toLowerCase()} experience?`,
    };
  }
  if (input.language === "zh") {
    return {
      body: `${input.contactName}您好：\n\n我正在推进「${input.goal}」，想请您抽 30 分钟聊聊您的经验。\n\n想请教的问题：\n${topics}\n\n以下时间您方便吗？\n${slots}\n\n谢谢。`,
      subject: "想请教您的经验",
    };
  }
  return {
    body: `${input.contactName}さん\n\nいま「${input.goal}」に取り組んでいます。30分ほど、ご経験をお聞かせいただけないでしょうか。\n\nお聞きしたいこと：\n${topics}\n\n次のいずれかでご都合はいかがでしょうか。\n${slots}\n\nよろしくお願いいたします。`,
    subject: "ご経験をお聞かせいただけませんか",
  };
}

export function introDraftText(input: { viaName: string; goal: string; typeLabel: string; roleSituation: string; why: string; language: PlanCopyLanguage }): { subject: string; body: string } {
  if (input.language === "en") {
    return {
      body: `Hi ${input.viaName},\n\nI'm working toward "${input.goal}". I'm looking to talk with ${input.roleSituation.toLowerCase()}. ${input.why}\n\nIf someone comes to mind, would you be willing to introduce us? A short note is fine; I'll take it from there.\n\nThank you.`,
      subject: "Could you introduce me to someone?",
    };
  }
  if (input.language === "zh") {
    return {
      body: `${input.viaName}您好：\n\n我正在推进「${input.goal}」，想找「${input.roleSituation}」这样的人聊聊。${input.why}\n\n如果您想到合适的人，能帮忙介绍一下吗？一句话就好，之后我来联系。\n\n谢谢。`,
      subject: "想请您帮忙介绍一位朋友",
    };
  }
  return {
    body: `${input.viaName}さん\n\nいま「${input.goal}」に取り組んでいて、「${input.roleSituation}」にあたる方とお話ししたいと考えています。${input.why}\n\nお心当たりの方がいれば、ご紹介いただけないでしょうか。一言添えていただければ、あとはこちらから連絡します。\n\nよろしくお願いいたします。`,
    subject: "ご紹介のお願い",
  };
}
