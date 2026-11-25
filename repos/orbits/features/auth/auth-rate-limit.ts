/**
 * 注册 / 登录 / 找回密码的限流（防撞库、批量注册、刷邮件）。
 * Used by: `auth.ts`（网页 credentials 登录）、`app/api/auth/register`、`app/api/auth/mobile/credentials`、
 * `app/api/auth/password-reset/request`。
 *
 * - 计数存储复用邀请码的 `invite_code_attempts`（固定窗口原子 upsert，维护任务按 2 天清理），桶名前缀 `auth-`，不加新表。
 * - 主体：IP（只认平台写入的 `x-real-ip`，见 invite-codes/client-ip.ts）与邮箱，都先 HMAC，库里没有原文。
 *   密钥从 `AUTH_SECRET` 用 HKDF 派生（info 与邀请码不同）。
 * - 出错或未配置（非 live、库或密钥缺失）一律放行：限流挂了不能把所有人挡在登录页外（对标常见做法：limiter fail-open）。
 * - 阈值按「会场里几百人共用一个 Wi-Fi」放宽 IP 维度，账号维度收紧：
 *   登录：每 IP 10 分钟失败 100 次、总数 600 次；每邮箱 15 分钟失败 10 次后锁到窗口结束（成功登录不清零，窗口到期自然解锁）。
 *     只有失败计入较紧的那道：注册完会自动登录，两百多人同一出口 IP 时成功登录不能把后面的人挡住。
 *   注册：每 IP 10 分钟 300 次、每天 1000 次；每邮箱 10 分钟 10 次（换 IP 反复试同一个邮箱也拦）。
 *     300 = 一场活动约 220 人在几分钟内集中注册，再留约三成给输错重试；一个 IP 一天两三场活动仍在 1000 内。
 *   找回密码申请：每 IP 10 分钟 10 次（每邮箱冷却已在 password-reset-service 里）。
 */
import { createHmac, hkdfSync } from "node:crypto";

import { inviteClientIp } from "../invite-codes/client-ip";
import type { InviteAttemptStore } from "../invite-codes/rate-limit";

export const AUTH_RATE_HKDF_INFO = "orbit-auth-rate-v1";

const MINUTE = 60 * 1000;

export const AUTH_RATE_RULES = {
  loginPerIp: { limit: 600, windowMs: 10 * MINUTE },
  loginFailuresPerIp: { limit: 100, windowMs: 10 * MINUTE },
  loginFailuresPerEmail: { limit: 10, windowMs: 15 * MINUTE },
  registerPerIpShort: { limit: 300, windowMs: 10 * MINUTE },
  registerPerIpDay: { limit: 1000, windowMs: 24 * 60 * MINUTE },
  registerPerEmail: { limit: 10, windowMs: 10 * MINUTE },
  resetRequestPerIp: { limit: 10, windowMs: 10 * MINUTE },
} as const;

type Rule = { limit: number; windowMs: number };

export type AuthRateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface AuthRateLimiter {
  /** 登录前：IP 计一次；IP 总数或失败数超量、该邮箱本窗口失败已满 → 不允许。 */
  checkLogin(input: { ip: string; email: string }): Promise<AuthRateDecision>;
  /** 登录失败：该邮箱、该 IP 的失败各 +1。 */
  recordLoginFailure(input: { ip: string; email: string }): Promise<void>;
  checkRegister(input: { ip: string; email: string }): Promise<AuthRateDecision>;
  checkResetRequest(input: { ip: string }): Promise<AuthRateDecision>;
}

export function resolveAuthRateSecret(env: Record<string, string | undefined> = process.env): Buffer | null {
  const authSecret = env.AUTH_SECRET?.trim();
  if (!authSecret) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(authSecret, "utf8"), Buffer.alloc(0), Buffer.from(AUTH_RATE_HKDF_INFO, "utf8"), 32));
}

function windowStart(rule: Rule, at: number): Date {
  return new Date(Math.floor(at / rule.windowMs) * rule.windowMs);
}

function retryAfter(rule: Rule, at: number): number {
  return Math.max(1, Math.ceil((windowStart(rule, at).getTime() + rule.windowMs - at) / 1000));
}

export function createAuthRateLimiter(input: { secret: Buffer; store: InviteAttemptStore; now?: () => Date }): AuthRateLimiter {
  const now = input.now ?? (() => new Date());
  const subject = (kind: "ip" | "email", value: string) =>
    createHmac("sha256", input.secret).update(`${kind}:${kind === "email" ? value.trim().toLowerCase() : value}`).digest("hex").slice(0, 32);
  const bucket = (name: string, kind: "ip" | "email", value: string) => `auth-${name}:${subject(kind, value)}`;

  async function count(name: string, kind: "ip" | "email", value: string, rule: Rule, at: number): Promise<AuthRateDecision> {
    const used = await input.store.increment(bucket(name, kind, value), windowStart(rule, at));
    return used > rule.limit ? { allowed: false, retryAfterSeconds: retryAfter(rule, at) } : { allowed: true };
  }

  return {
    async checkLogin({ ip, email }) {
      const at = now().getTime();
      const rule = AUTH_RATE_RULES.loginFailuresPerEmail;
      if (email.trim()) {
        const failures = await input.store.read(bucket("loginfail", "email", email), windowStart(rule, at));
        if (failures >= rule.limit) return { allowed: false, retryAfterSeconds: retryAfter(rule, at) };
      }
      const ipRule = AUTH_RATE_RULES.loginFailuresPerIp;
      const ipFailures = await input.store.read(bucket("loginfail", "ip", ip), windowStart(ipRule, at));
      if (ipFailures >= ipRule.limit) return { allowed: false, retryAfterSeconds: retryAfter(ipRule, at) };
      return count("login", "ip", ip, AUTH_RATE_RULES.loginPerIp, at);
    },
    async recordLoginFailure({ ip, email }) {
      const at = now().getTime();
      await input.store.increment(bucket("loginfail", "ip", ip), windowStart(AUTH_RATE_RULES.loginFailuresPerIp, at));
      if (!email.trim()) return;
      await input.store.increment(bucket("loginfail", "email", email), windowStart(AUTH_RATE_RULES.loginFailuresPerEmail, at));
    },
    async checkRegister({ ip, email }) {
      const at = now().getTime();
      const short = await count("register10m", "ip", ip, AUTH_RATE_RULES.registerPerIpShort, at);
      if (!short.allowed) return short;
      const day = await count("registerday", "ip", ip, AUTH_RATE_RULES.registerPerIpDay, at);
      if (!day.allowed || !email.trim()) return day;
      return count("registeremail", "email", email, AUTH_RATE_RULES.registerPerEmail, at);
    },
    checkResetRequest: async ({ ip }) => count("reset", "ip", ip, AUTH_RATE_RULES.resetRequestPerIp, now().getTime()),
  };
}

/** 放行版（未配置时用）。 */
const OPEN: AuthRateLimiter = {
  checkLogin: async () => ({ allowed: true }),
  recordLoginFailure: async () => undefined,
  checkRegister: async () => ({ allowed: true }),
  checkResetRequest: async () => ({ allowed: true }),
};

/** 存储出错时放行并记一行日志（不带 IP / 邮箱）。 */
function failOpen(limiter: AuthRateLimiter): AuthRateLimiter {
  const guard = <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>, fallback: R) => async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch {
      console.error(`[auth-rate-limit] ${name} failed; allowing request`);
      return fallback;
    }
  };
  return {
    checkLogin: guard("checkLogin", limiter.checkLogin, { allowed: true } as AuthRateDecision),
    recordLoginFailure: guard("recordLoginFailure", limiter.recordLoginFailure, undefined),
    checkRegister: guard("checkRegister", limiter.checkRegister, { allowed: true } as AuthRateDecision),
    checkResetRequest: guard("checkResetRequest", limiter.checkResetRequest, { allowed: true } as AuthRateDecision),
  };
}

let override: AuthRateLimiter | null = null;

/** 测试注入；传 null 恢复 live 装配。 */
export function setAuthRateLimiterForTests(limiter: AuthRateLimiter | null): void {
  override = limiter;
}

/** live 装配：非 live / 库或密钥缺失 → 放行版。 */
export async function getAuthRateLimiter(env: Record<string, string | undefined> = process.env): Promise<AuthRateLimiter> {
  if (override) return override;
  const secret = resolveAuthRateSecret(env);
  if (!secret) return OPEN;
  try {
    const { getConfiguredInviteCodeRuntime } = await import("../invite-codes/configured");
    const runtime = getConfiguredInviteCodeRuntime();
    if (!runtime) return OPEN;
    return failOpen(createAuthRateLimiter({ secret, store: runtime.attempts }));
  } catch {
    console.error("[auth-rate-limit] runtime unavailable; allowing requests");
    return OPEN;
  }
}

export function authClientIp(headers: Pick<Headers, "get">): string {
  return inviteClientIp(headers);
}

/** 429 JSON（与 envelope 的 failure 形状一致：success false + error.code / message）。 */
export function authRateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { success: false, error: { code: "RATE_LIMITED", message: "尝试次数过多，请稍后再试。" } },
    { status: 429, headers: { "cache-control": "no-store", "retry-after": String(retryAfterSeconds) } },
  );
}
