/**
 * 「引导已走完」的签名 cookie：门禁（proxy.ts）判定一次后写下，之后的页面跳转不再为它读数据库。
 *
 * - 值 = HMAC(用户 id)，密钥从 AUTH_SECRET 派生；换账号、伪造、密钥轮换都对不上，对不上就重新读一次。
 * - 走完是单向的（finishedAt 写下后不变），所以可以放心缓存；**没走完从不缓存**，走完那一刻的下一次跳转就放行。
 * - 没有 AUTH_SECRET 时不写、不认，每次照读。
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const ONBOARDING_SETTLED_COOKIE = "orbit-onb";
export const ONBOARDING_SETTLED_MAX_AGE = 30 * 24 * 60 * 60;

export function onboardingSettledValue(userId: string, env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || !userId) return null;
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), Buffer.from("orbit-onboarding-settled-v1", "utf8"), 32));
  return createHmac("sha256", key).update(userId).digest("base64url");
}

export function hasOnboardingSettledValue(value: string | undefined, userId: string, env: Record<string, string | undefined> = process.env): boolean {
  const expected = onboardingSettledValue(userId, env);
  if (!expected || !value) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
