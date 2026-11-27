/**
 * 密码重置邮件正文（2026-11-27）：按申请时页面的语言发单一语言（与注册验证邮件同一做法：请求的 x-orbit-lang /
 * orbit-lang cookie / Accept-Language）。之前固定中英双语、没有日文。记录里没有语言（旧记录）时用日文。
 */
import type { OrbitLanguage } from "../../shared/contract/language";

export function passwordResetMail(language: OrbitLanguage | undefined, resetUrl: string): { subject: string; text: string } {
  if (language === "zh") {
    return { subject: "重置你的 Orbit 密码", text: `请打开以下链接设置新密码。链接在申请后 7 天内有效，且只能使用一次。\n\n${resetUrl}\n\n如果你没有申请重置，请忽略这封邮件。` };
  }
  if (language === "en") {
    return { subject: "Reset your Orbit password", text: `Open the link below to set a new password. It expires 7 days after your request and can only be used once.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.` };
  }
  return { subject: "Orbit パスワードの再設定", text: `以下のリンクから新しいパスワードを設定してください。リンクの有効期限は申請から 7 日間で、1 回だけ使えます。\n\n${resetUrl}\n\n心当たりがない場合は、このメールは破棄してください。` };
}
