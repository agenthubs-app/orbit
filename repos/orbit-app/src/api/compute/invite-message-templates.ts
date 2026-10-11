/**
 * R15（DESIGN add-and-invite §2.4「メッセージの下書き」、§2.5 第 6 条、§9 #23）：招待消息草稿的固定模板，两端共用。
 * Owner: 甲 (R15). Used by: 发出方「メッセージで送る」草稿 sheet（[ていねい][カジュアル][英語]）、接收方期限切れ / 上限页
 * 「〇〇さんに新しいコードを頼む」草稿。
 *
 * 不调 AI；只做草稿（复制 / 用 LINE・邮件打开，由用户自己发），文字里不出现「送信」。正文按设计稿 b11 A2 ③ / ⑧；
 * 「英語」语气在任何界面语言下都出英文（= ていねい的英文版）。copy:qa 检查范围（`scripts/copy-qa/sources.mjs`
 * 的 `loadInviteMessageCopy`）。零 import 常量 + 填充函数，不碰 IO 与时钟（期限日期由调用方格式化好传入）。
 */

export type InviteMessageTone = "polite" | "casual" | "english";
export type InviteMessageLanguage = "ja" | "zh" | "en";
export type InviteTriText = Readonly<Record<InviteMessageLanguage, string>>;

export const INVITE_MESSAGE_TONES: readonly InviteMessageTone[] = ["polite", "casual", "english"];
export const INVITE_MESSAGE_LANGUAGES: readonly InviteMessageLanguage[] = ["ja", "zh", "en"];

/** 草稿正文（不含链接行与署名）。「英語」语气用 polite.en。 */
export const INVITE_MESSAGE_BODY_COPY: Readonly<Record<"polite" | "casual", InviteTriText>> = {
  polite: {
    ja: "先日はありがとうございました。\nOrbit という名刺・人脈アプリで、お互いの連絡先を交換できればと思います。下のリンクから 1分ほどで登録できます（アプリは不要です）。",
    zh: "前几天非常感谢。\n我在用 Orbit 这款名片和人脉应用，希望能和您互换联系方式。通过下面的链接大约1分钟就能注册（不需要下载应用）。",
    en: "Thank you for the other day.\nI use Orbit, an app for business cards and contacts, and would love to exchange contact details there. You can sign up from the link below in about a minute (no app needed).",
  },
  casual: {
    ja: "この前はありがとうございました！\nOrbit という名刺・人脈アプリで、連絡先を交換しませんか？下のリンクから 1分で登録できます（アプリはいりません）。",
    zh: "前几天谢谢啦！\n要不要用 Orbit 这款名片和人脉应用互换联系方式？从下面的链接1分钟就能注册（不用下载应用）。",
    en: "Thanks for the other day!\nWant to swap contact details on Orbit, a business card and contacts app? Signing up from the link below takes a minute (no app needed).",
  },
};

/** 链接行：链接与期限（`{until}` 是调用方按界面语言格式化好的日期，例如「10/14」）。 */
export const INVITE_MESSAGE_LINK_LINE_COPY: InviteTriText = {
  ja: "{link}（{until} まで）",
  zh: "{link}（{until}前有效）",
  en: "{link} (until {until})",
};

/** 期限切れ / 人数上限时，请邀请人重发的草稿（b11 A2 ⑧）。`{inviter}` 是邀请人的名字。 */
export const INVITE_RESEND_REQUEST_COPY: InviteTriText = {
  ja: "{inviter}さん、Orbit の招待リンクの期限が切れていました。お手数ですが、もう一度送っていただけますか？",
  zh: "{inviter}，Orbit 的邀请链接已经过期了。麻烦您再发一次好吗？",
  en: "Hi {inviter}, the Orbit invite link has expired. Could you share a new one with me?",
};

/** 一次替换全部占位符（值里出现的「{link}」之类不会被再替换）。 */
function fillPlaceholders(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z]+)\}/gu, (whole, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? whole : whole));
}

export interface InviteMessageInput {
  tone: InviteMessageTone;
  /** 界面语言（「英語」语气忽略它）。 */
  language: InviteMessageLanguage;
  /** 我的名字（署名）；空白时不加署名行。 */
  name: string;
  link: string;
  /** 已格式化的期限日期。 */
  until: string;
}

/** 招待消息草稿：正文、链接行、署名，用换行连起来。 */
export function inviteMessageText(input: InviteMessageInput): string {
  const language: InviteMessageLanguage = input.tone === "english" ? "en" : input.language;
  const body = INVITE_MESSAGE_BODY_COPY[input.tone === "english" ? "polite" : input.tone][language];
  const linkLine = fillPlaceholders(INVITE_MESSAGE_LINK_LINE_COPY[language], { link: input.link, until: input.until });
  const name = input.name.trim();
  return [body, linkLine, ...(name ? [name] : [])].join("\n");
}

/** 请邀请人重发的草稿。 */
export function inviteResendRequestText(input: { language: InviteMessageLanguage; inviter: string }): string {
  return fillPlaceholders(INVITE_RESEND_REQUEST_COPY[input.language], { inviter: input.inviter.trim() });
}
