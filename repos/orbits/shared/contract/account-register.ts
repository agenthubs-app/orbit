// 邮箱密码注册的请求体（2026-11-25 起必须带同意）。成功与其余失败照旧（POST /api/auth/register，201 / 400 / 409 / 429）。
import type { SignupFunnelClient, SignupFunnelSource } from "./signup-funnel";

/** 屏幕上那两份条款的版本（shared/compute/legal-version.ts 的 LEGAL_VERSIONS；App 用自己同步到的那一份）。 */
export interface AccountRegisterConsent {
  accepted: true;
  termsVersion: string;
  privacyVersion: string;
}

export interface AccountRegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  /** 缺少、`accepted` 不是 true、或版本不是发布过的 → 400 `VALIDATION_ERROR`，`error.context.authErrorCode = "AUTH_CONSENT_REQUIRED"`。 */
  consent: AccountRegisterConsent;
  client: SignupFunnelClient;
  /** 验证邮件用的语言；缺省按请求头。 */
  language?: "zh" | "ja" | "en";
  /** 匿名访客标识（见 signup-funnel.ts）。Web 用 cookie，不放这里；App 放这里。 */
  visitorId?: string;
  source?: SignupFunnelSource;
}

/**
 * 201 `data` 新增 `emailVerification`：注册成功时是否已经安排发出验证邮件。
 * `sending: false` = 这个环境没有发信通道，不要告诉用户「已经发了」。发信失败不影响注册。
 */
export interface AccountRegisterEmailVerification {
  email: string;
  sending: boolean;
}
