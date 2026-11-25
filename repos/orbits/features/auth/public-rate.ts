/**
 * 登录前公开接口的每 IP 限流（漏斗事件、点验证链接）。计数复用 invite_code_attempts，IP 先 HMAC；
 * 阈值按「会场里几百人共用一个 Wi-Fi」放宽，与注册同一口径（auth-rate-limit.ts）。未配置或出错时放行。
 */
import { createHmac } from "node:crypto";

import { authClientIp, resolveAuthRateSecret } from "./auth-rate-limit";

const WINDOW_MS = 10 * 60_000;
export const PUBLIC_AUTH_CALLS_PER_IP = 300;

export async function withinPublicAuthLimit(name: "funnel" | "verify-email", headers: Pick<Headers, "get">): Promise<boolean> {
  try {
    const secret = resolveAuthRateSecret();
    if (!secret) return true;
    const { getConfiguredInviteCodeRuntime } = await import("../invite-codes/configured");
    const runtime = getConfiguredInviteCodeRuntime();
    if (!runtime) return true;
    const subject = createHmac("sha256", secret).update(`ip:${authClientIp(headers)}`).digest("hex").slice(0, 32);
    const used = await runtime.attempts.increment(`auth-${name}:${subject}`, new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS));
    return used <= PUBLIC_AUTH_CALLS_PER_IP;
  } catch {
    console.error(`[public-rate] ${name} failed; allowing request`);
    return true;
  }
}
