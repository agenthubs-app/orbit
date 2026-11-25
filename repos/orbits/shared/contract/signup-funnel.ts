// 注册漏斗（2026-11-25）：只记步骤、端、来源类别、时间。不存邮箱、姓名、活动地址或任何个人信息。

export type SignupFunnelClient = "web" | "app";

/** 只记类别，不记具体地址：从活动报名来 / 从邀请来 / 其余。 */
export type SignupFunnelSource = "event" | "invite" | "direct";

/** 服务端自己记后六种；匿名接口只收 `register_opened`。 */
export type SignupFunnelEventName =
  | "register_opened"
  | "account_created"
  | "email_verified"
  | "onboarding_step1"
  | "onboarding_step2"
  | "onboarding_step3"
  | "onboarding_finished";

/**
 * POST /api/auth/signup-funnel（公开，限流，204；写不进去也是 204，客户端不必处理结果）。
 * 打开注册页 / 注册弹窗时发一次。
 * `visitorId`：客户端随机生成的 UUID（App 存在本机、登出不换；注册请求带同一个）。Web 不用传，服务端发 cookie。
 */
export interface SignupFunnelOpenedInput {
  name: "register_opened";
  client: SignupFunnelClient;
  source: SignupFunnelSource;
  visitorId?: string;
}
