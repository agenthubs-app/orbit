import type { EmailVerificationLanguage } from "./email-verification-store";

const COPY: Record<EmailVerificationLanguage, { subject: string; lines: (url: string) => readonly string[] }> = {
  zh: {
    subject: "请完成 Orbit 邮箱认证",
    lines: (url) => ["请打开下面的链接，完成邮箱认证。", "", url, "", "链接 7 天内有效。在手机或电脑上打开都可以。", "", "如果你没有注册过 Orbit，请不要打开链接，忽略这封邮件即可。"],
  },
  ja: {
    subject: "Orbit：メールアドレスの確認",
    lines: (url) => ["下のリンクを開いて、メールアドレスの確認を完了してください。", "", url, "", "リンクの有効期限は 7 日間です。スマートフォンでもパソコンでも開けます。", "", "Orbit に登録した覚えがない場合は、リンクを開かず、このメールを破棄してください。"],
  },
  en: {
    subject: "Confirm your email for Orbit",
    lines: (url) => ["Open this link to confirm your email address.", "", url, "", "The link works for 7 days, on your phone or computer.", "", "If you did not sign up for Orbit, do not open the link. You can ignore this email."],
  },
};

export function emailVerificationMail(language: EmailVerificationLanguage, url: string): { subject: string; text: string } {
  return { subject: COPY[language].subject, text: COPY[language].lines(url).join("\n") };
}
