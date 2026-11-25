/**
 * 引导没走完就关掉页面：记住走完后回哪里（第一方 httpOnly cookie，按账号绑定）。
 *
 * - 代理在打开引导页时写（地址里带着非默认的 next）；引导页的 next 只是默认首页时读它——
 *   之后从首页、书签、别的入口被带回引导，走完仍回原来那页。后来又从另一个深层页面被带回引导，就以新的为准。
 * - 门禁确认走完时删掉。读出来再过一遍 normalize，值被改过也只会落在本站允许的路径上。
 */
import { createHash } from "node:crypto";

import { normalizeProfileOnboardingNext } from "./profile-onboarding-navigation";

export const ONBOARDING_RETURN_COOKIE = "orbit-onb-next";
export const ONBOARDING_RETURN_MAX_AGE = 30 * 24 * 60 * 60;
const MAX_PATH = 1_500;
const DEFAULT_DESTINATIONS = new Set(["/", "/app", "/app/home"]);

const owner = (userId: string) => createHash("sha256").update(`orbit-onb-next:${userId}`).digest("base64url").slice(0, 16);

/** 要记的值；默认去处（首页）或过长的地址不记。 */
export function onboardingReturnValue(userId: string, next: string | null | undefined): string | null {
  const path = normalizeProfileOnboardingNext(next);
  if (!userId || DEFAULT_DESTINATIONS.has(path.split(/[?#]/u)[0]!) || path.length > MAX_PATH) return null;
  return `${owner(userId)}.${encodeURIComponent(path)}`;
}

/** 引导走完去哪：地址里明说的优先，其次是记住的，最后默认首页。 */
export function resolveOnboardingNext(requested: string | string[] | null | undefined, remembered: string | undefined, userId: string): string {
  const next = normalizeProfileOnboardingNext(requested);
  if (!DEFAULT_DESTINATIONS.has(next.split(/[?#]/u)[0]!)) return next;
  const at = remembered?.indexOf(".") ?? -1;
  if (!remembered || at < 0 || remembered.slice(0, at) !== owner(userId)) return next;
  try {
    return normalizeProfileOnboardingNext(decodeURIComponent(remembered.slice(at + 1)), next);
  } catch {
    return next;
  }
}
