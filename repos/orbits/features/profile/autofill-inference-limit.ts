/**
 * 引导自动填写推断的每日次数（每账号 20 次）：登录就能调的付费 AI 要有上限。
 * 计数复用邀请码的 invite_code_attempts（固定窗口原子 upsert、维护任务清理），桶名前缀 `autofill:`，不加新表；
 * 主体做 HMAC。未配置或出错时放行（与登录限流同一口径），超过时调用方回 unavailable。
 */
import { createHmac } from "node:crypto";

import { resolveAuthRateSecret } from "../auth/auth-rate-limit";
import type { InviteAttemptStore } from "../invite-codes/rate-limit";

export const AUTOFILL_INFERENCES_PER_DAY = 20;
const DAY = 24 * 60 * 60 * 1000;

export async function withinAutofillLimit(input: { actorId: string; store: InviteAttemptStore; secret: Buffer; now?: () => Date }): Promise<boolean> {
  const at = (input.now ?? (() => new Date()))().getTime();
  const subject = createHmac("sha256", input.secret).update(`autofill:${input.actorId}`).digest("hex").slice(0, 32);
  const used = await input.store.increment(`autofill:${subject}`, new Date(Math.floor(at / DAY) * DAY));
  return used <= AUTOFILL_INFERENCES_PER_DAY;
}

export async function configuredAutofillLimit(actorId: string): Promise<boolean> {
  try {
    const secret = resolveAuthRateSecret();
    if (!secret) return true;
    const { getConfiguredInviteCodeRuntime } = await import("../invite-codes/configured");
    const runtime = getConfiguredInviteCodeRuntime();
    return runtime ? await withinAutofillLimit({ actorId, secret, store: runtime.attempts }) : true;
  } catch {
    console.error("[profile-autofill] limit unavailable; allowing request");
    return true;
  }
}
