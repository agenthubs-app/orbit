import type { OrbitCopyTable } from "./types";

/**
 * 本人联系方式（LINE / WeChat / メール / 電話）的共用文案：引导第①步（UR-C）与编辑资料面板（UR-P9–P15）同一份，
 * 两处一字不差。谁能看 2026-11-27 定：人脉里的人（交换完成）和报名活动的主办方。
 */
export const contactMethodsCopy = {
  title: { ja: "連絡先", zh: "联系方式", en: "Contact", kind: "title" },
  see: { ja: "人脈の相手と、申し込んだイベントの主催者だけに表示されます。", zh: "只有人脉里的人和你报名活动的主办方能看到。", en: "Only people in your network and hosts of events you apply to can see this.", kind: "body" },
  email: { ja: "メール", zh: "邮箱", en: "Email", kind: "label" },
  phone: { ja: "電話", zh: "电话", en: "Phone", kind: "label" },
  emailPh: { ja: "例）name@example.com", zh: "例如：name@example.com", en: "e.g. name@example.com", kind: "placeholder" },
  phonePh: { ja: "例）090-1234-5678", zh: "例如：090-1234-5678", en: "e.g. 090-1234-5678", kind: "placeholder" },
  addMore: { ja: "メール・電話を入れる", zh: "填写邮箱或电话", en: "Add email or phone", kind: "button" },
  emailFormat: { ja: "メールアドレスの形式を確認してください（例：name@example.com）", zh: "请检查邮箱格式（例：name@example.com）", en: "Check the email address (e.g. name@example.com)", kind: "body" },
  phoneFormat: { ja: "電話番号の形式を確認してください（例：090-1234-5678）", zh: "请检查电话号码格式（例：090-1234-5678）", en: "Check the phone number (e.g. 090-1234-5678)", kind: "body" },
  emailFormatShort: { ja: "メールの形式を確認してください", zh: "请检查邮箱格式", en: "Check the email address", kind: "label" },
  phoneFormatShort: { ja: "電話番号の形式を確認してください", zh: "请检查电话号码格式", en: "Check the phone number", kind: "label" },
} satisfies OrbitCopyTable;

/** 品牌名各语言照写（不进文案表：日文与英文本来就一样）。WeChat 中文写「微信」。 */
export const LINE_NAME = "LINE";
export const WECHAT_NAME = "WeChat";
export const LINE_PLACEHOLDER = "LINE ID";
export const WECHAT_PLACEHOLDER = "WeChat ID";
export const wechatLabel = (language: "ja" | "zh" | "en") => (language === "zh" ? "微信" : WECHAT_NAME);
