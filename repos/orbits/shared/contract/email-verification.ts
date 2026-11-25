// 邮箱验证（2026-11-25）：不拦任何功能，只是登录后一直有一条提醒。
// Owner: Web / 共用后端。Used by: 注册后的提示、全站顶部提醒、账号页、邮件链接页。

/**
 * GET /api/account/me 的 `data.emailVerification`（可选，只加不改）。
 * 没有这个字段 = 不知道（旧服务端、演示账号）：不显示提醒，也不当作已验证。
 * 读它不多一次查询：和会话检查同一次读取。App 回到前台、或下一次读 /api/account/me 时更新，不轮询。
 */
export interface EmailVerificationStatusContract {
  email: string;
  /** Google 登录的账号一律为 true；邮箱密码账号点过邮件里的链接、或走过忘记密码重设之后为 true。 */
  verified: boolean;
}

/** POST /api/account/email-verification/send（要登录）。两个字段都可不给：语言缺省按请求头。 */
export interface EmailVerificationSendInput {
  language?: "zh" | "ja" | "en";
}

/** 200 `data`。已经验证过的账号也是 200，`verified: true`、不再发信：客户端收起提醒即可。 */
export interface EmailVerificationSendResult {
  email: string;
  verified: boolean;
  /** 这次真的发出了信才有。 */
  sentAt?: string;
}

/**
 * 发不出去的原因，在失败响应的 `error.context.reason`：
 * - `EMAIL_SEND_TOO_SOON` 429：同一账号一分钟一封，`context.retryAfterSeconds` 是还要等的秒数；
 * - `EMAIL_SEND_DAILY_LIMIT` 429：同一账号一天五封（按东京日期），明天再试；
 * - `EMAIL_SEND_FAILED` 502：发信通道没收下这封信，一分钟后可再试（这次不占当天的五封）；
 * - `EMAIL_SEND_UNAVAILABLE` 503：这个环境没有配置发信通道。
 */
export type EmailVerificationSendFailureReason =
  | "EMAIL_SEND_TOO_SOON"
  | "EMAIL_SEND_DAILY_LIMIT"
  | "EMAIL_SEND_FAILED"
  | "EMAIL_SEND_UNAVAILABLE";

/** POST /api/auth/email-verification/confirm（公开，不要登录）。链接是 `<站点>/verify-email#token=…`，七天有效、用一次。 */
export interface EmailVerificationConfirmInput {
  token: string;
}

/**
 * 200 `data`。`verified` 这次完成；`already` 这条链接已经用过（账号已验证）；
 * `expired` 过期、被重新发送的新链接取代、或不认识的链接（三种不区分，不泄露账号是否存在）。
 */
export interface EmailVerificationConfirmResult {
  outcome: "verified" | "already" | "expired";
}
