import type { OrbitCopyTable } from "./types";

// onboarding-3step-proposal ⑤ (V1–V8): the sign-up popup, the mailed link's page, the notice and the account row.
export const emailVerificationCopy = {
  popupTitle: { ja: "確認メールを送りました", zh: "确认邮件已发送", en: "Check your email", kind: "title" },
  popupBody: { ja: "メール内のリンクを開いて確認してください。", zh: "请打开邮件，点里面的链接完成认证。", en: "Open the link in it to confirm your address.", kind: "body" },
  popupOk: { ja: "わかりました", zh: "知道了", en: "Got it", kind: "button" },
  notice: { ja: "メールアドレスが未確認です", zh: "邮箱还没有验证", en: "Your email is not verified", kind: "label" },
  resend: { ja: "再送する", zh: "重新发送", en: "Resend", kind: "button" },
  first: { ja: "確認メールを送る", zh: "发送验证邮件", en: "Send email", kind: "button" },
  sent: { ja: "{email} に送りました", zh: "已发送到{email}", en: "Sent to {email}", kind: "label" },
  wait: { ja: "あと {n} 秒で再送できます", zh: "{n}秒后可以重新发送", en: "You can resend in {n} seconds", kind: "label" },
  limit: { ja: "今日はこれ以上送れません。明日お試しください", zh: "今天不能再发了，请明天再试", en: "No more emails today. Try again tomorrow", kind: "label" },
  fail: { ja: "送信できませんでした。少し待ってからお試しください", zh: "没有发出去，请稍后再试", en: "Could not send it. Try again shortly", kind: "label" },
  rowTitle: { ja: "メールアドレスの確認", zh: "邮箱验证", en: "Email verification", kind: "label" },
  verified: { ja: "確認済み", zh: "已验证", en: "Verified", kind: "chip" },
  unverified: { ja: "未確認", zh: "未验证", en: "Not verified", kind: "chip" },
  doneTitle: { ja: "メール確認が完了しました", zh: "邮箱已完成认证", en: "Your email is verified", kind: "title" },
  doneBody: { ja: "このページは閉じてかまいません。", zh: "可以关闭这个页面了。", en: "You can close this page.", kind: "body" },
  expiredTitle: { ja: "リンクは期限切れです", zh: "链接已过期", en: "This link has expired", kind: "title" },
  expiredBody: { ja: "ログイン後、アカウント設定から再送できます。", zh: "请登录后在账号里重新发送。", en: "Sign in and resend it from your account settings.", kind: "body" },
  failedTitle: { ja: "読み込めませんでした", zh: "加载失败", en: "Could not load this", kind: "title" },
  retry: { ja: "もう一度試す", zh: "重试", en: "Try again", kind: "button" },
  checking: { ja: "確認しています", zh: "正在确认", en: "Checking", kind: "label" },
  googleTerms: { ja: "続けると、{terms}と{privacy}に同意したことになります。", zh: "继续即表示同意{terms}和{privacy}。", en: "By continuing, you agree to the {terms} and {privacy}.", kind: "body" },
  terms: { ja: "利用規約", zh: "使用条款", en: "Terms of Use", kind: "label" },
  privacy: { ja: "プライバシーポリシー", zh: "隐私政策", en: "Privacy Policy", kind: "label" },
} as const satisfies OrbitCopyTable;
