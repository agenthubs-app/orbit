// 注册漏斗的第一方 cookie：`<访客 UUID>.<来源类别>.<端>`，httpOnly。建号后清掉，同一浏览器的下一个人是新访客。
import { randomUUID } from "node:crypto";

import type { SignupFunnelClient, SignupFunnelSource } from "../../shared/contract/signup-funnel";

export const SIGNUP_COOKIE = "orbit-signup";
export const SIGNUP_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
/** App 的 Google 登录只用这一趟。 */
export const SIGNUP_COOKIE_APP_MAX_AGE = 10 * 60;

export interface SignupContext {
  visitorId: string | null;
  source: SignupFunnelSource;
  client: SignupFunnelClient;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function signupVisitorId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID.test(text) ? text : null;
}

export function signupSource(value: unknown): SignupFunnelSource {
  return value === "event" || value === "invite" ? value : "direct";
}

export function signupClient(value: unknown): SignupFunnelClient {
  return value === "app" ? "app" : "web";
}

export function readSignupCookie(value: string | undefined): SignupContext | null {
  const [visitor, source, client] = (value ?? "").split(".");
  const visitorId = signupVisitorId(visitor);
  return visitorId ? { visitorId, source: signupSource(source), client: signupClient(client) } : null;
}

export function signupCookieValue(context: { visitorId: string; source: SignupFunnelSource; client: SignupFunnelClient }): string {
  return `${context.visitorId}.${context.source}.${context.client}`;
}

export function newSignupVisitorId(): string {
  return randomUUID();
}

export function requestCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}
