/**
 * R15 公开预览与兑换的限流（DESIGN add-and-invite §6 第 4、5、7、9 条）。Owner: 甲 (R15).
 * Used by: `handlers.ts`（预览 / 兑换路由）、`sync.ts`（计数清理任务的存储类型）。
 *
 * - 主体：IP（只认 `x-real-ip`，见 `client-ip.ts`）与账号，都先做 HMAC，库里和日志里只有 HMAC。
 * - 密钥：`ORBIT_INVITE_RATE_SECRET`；缺省时从 `AUTH_SECRET` 用 HKDF 派生（`info = "orbit-invite-rate-v1"`，不直接复用同一把密钥）；
 *   两者都缺 → `null`，live 下这几个接口 503，不退化为不限流。
 * - 规则（固定窗口，计数表 `invite_code_attempts` 原子 upsert）：
 *   预览：每 IP 每 10 分钟 60 次、每天 500 次；每 IP 每小时失败（404）60 次后，这个 IP 本小时剩余时间**所有**预览都 429
 *   （包括真码，否则被锁的 IP 仍能靠 200 / 429 区分真假码）；已登录的预览只按账号计失败（每小时 30 次），不占 IP 的额度。
 *   兑换：每账号每天 20 次、失败 10 次；失败同时计入 IP 失败桶（与预览共用），IP 被锁时兑换也 429。不做全站熔断。
 */
import { createHmac, hkdfSync } from "node:crypto";

import type { TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

export const INVITE_RATE_HKDF_INFO = "orbit-invite-rate-v1";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const INVITE_RATE_RULES = {
  accountPreviewFailuresPerHour: 30,
  ipFailuresPerHour: 60,
  previewsPerDay: 500,
  previewsPerTenMinutes: 60,
  redeemFailuresPerDay: 10,
  redeemsPerDay: 20,
} as const;

/** HMAC 密钥；都缺时 null（调用方 503）。 */
export function resolveInviteRateSecret(env: Record<string, string | undefined> = process.env): Buffer | null {
  const dedicated = env.ORBIT_INVITE_RATE_SECRET?.trim();
  if (dedicated) return Buffer.from(dedicated, "utf8");
  const authSecret = env.AUTH_SECRET?.trim();
  if (!authSecret) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(authSecret, "utf8"), Buffer.alloc(0), Buffer.from(INVITE_RATE_HKDF_INFO, "utf8"), 32));
}

export interface InviteAttemptStore {
  /** 这个桶这个窗口 +1，返回加完的计数（原子）。 */
  increment(bucket: string, windowStart: Date): Promise<number>;
  read(bucket: string, windowStart: Date): Promise<number>;
  /** 删掉起点早于 `cutoff` 的窗口，返回删了几行。 */
  purgeBefore(cutoff: Date): Promise<number>;
}

export function createPostgresInviteAttemptStore(client: TransactionalSqlExecutor): InviteAttemptStore {
  return {
    async increment(bucket, windowStart) {
      const result = await client.query<{ count: number }>(
        `insert into invite_code_attempts (bucket, window_start, count) values ($1, $2::timestamptz, 1)
         on conflict (bucket, window_start) do update set count = invite_code_attempts.count + 1
         returning count`,
        [bucket, windowStart.toISOString()],
      );
      return Number(result.rows[0]?.count ?? 0);
    },
    async read(bucket, windowStart) {
      const result = await client.query<{ count: number }>("select count from invite_code_attempts where bucket = $1 and window_start = $2::timestamptz", [bucket, windowStart.toISOString()]);
      return Number(result.rows[0]?.count ?? 0);
    },
    async purgeBefore(cutoff) {
      const result = await client.query<{ bucket: string }>("delete from invite_code_attempts where window_start < $1::timestamptz returning bucket", [cutoff.toISOString()]);
      return result.rows.length;
    },
  };
}

export function createMemoryInviteAttemptStore(): InviteAttemptStore & { rows: Map<string, number> } {
  const rows = new Map<string, number>();
  const keyOf = (bucket: string, windowStart: Date) => `${bucket}@${windowStart.toISOString()}`;
  return {
    rows,
    async increment(bucket, windowStart) {
      const key = keyOf(bucket, windowStart);
      const next = (rows.get(key) ?? 0) + 1;
      rows.set(key, next);
      return next;
    },
    read: async (bucket, windowStart) => rows.get(keyOf(bucket, windowStart)) ?? 0,
    async purgeBefore(cutoff) {
      let deleted = 0;
      for (const key of [...rows.keys()]) {
        if (Date.parse(key.slice(key.lastIndexOf("@") + 1)) < cutoff.getTime()) {
          rows.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    },
  };
}

export type InviteRateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface InviteRateLimiter {
  /** 预览之前：IP / 账号被锁或超总量 → 不允许。允许时已计入总量。 */
  checkPreview(input: { ip: string; actorId: string | null }): Promise<InviteRateDecision>;
  /** 预览失败（不可用）：未登录计 IP 失败桶，已登录计账号失败桶。 */
  recordPreviewFailure(input: { ip: string; actorId: string | null }): Promise<void>;
  /** 兑换之前：IP 失败桶被锁、账号当天失败满 10 次、当天兑换超过 20 次 → 不允许。允许时已计入当天兑换数。 */
  checkRedeem(input: { ip: string; actorId: string }): Promise<InviteRateDecision>;
  /** 兑换失败（不可用）：同时计 IP 失败桶与账号当天失败数。 */
  recordRedeemFailure(input: { ip: string; actorId: string }): Promise<void>;
  /** 日志用：HMAC 后 IP 的前 16 位（不记原始 IP）。 */
  logSubject(ip: string): string;
}

interface Window {
  ms: number;
}

const TEN_MINUTES: Window = { ms: 10 * MINUTE };
const ONE_HOUR: Window = { ms: HOUR };
const ONE_DAY: Window = { ms: DAY };

function windowStart(window: Window, at: number): Date {
  return new Date(Math.floor(at / window.ms) * window.ms);
}

function retryAfter(window: Window, at: number): number {
  return Math.max(1, Math.ceil((windowStart(window, at).getTime() + window.ms - at) / 1000));
}

export function createInviteRateLimiter(input: { secret: Buffer; store: InviteAttemptStore; now?: () => Date }): InviteRateLimiter {
  const now = input.now ?? (() => new Date());
  const subject = (kind: "ip" | "account", value: string) => createHmac("sha256", input.secret).update(`${kind}:${value}`).digest("hex").slice(0, 32);
  const bucket = (rule: string, kind: "ip" | "account", value: string) => `${rule}:${subject(kind, value)}`;
  const blocked = (window: Window, at: number): InviteRateDecision => ({ allowed: false, retryAfterSeconds: retryAfter(window, at) });

  async function ipLocked(ip: string, at: number): Promise<boolean> {
    return (await input.store.read(bucket("ipfail", "ip", ip), windowStart(ONE_HOUR, at))) >= INVITE_RATE_RULES.ipFailuresPerHour;
  }

  return {
    async checkPreview({ ip, actorId }) {
      const at = now().getTime();
      if (actorId) {
        // 已登录：按账号计失败，不占 IP 的额度（会场里登录的人互不影响）。
        const failures = await input.store.read(bucket("acctfail", "account", actorId), windowStart(ONE_HOUR, at));
        return failures >= INVITE_RATE_RULES.accountPreviewFailuresPerHour ? blocked(ONE_HOUR, at) : { allowed: true };
      }
      if (await ipLocked(ip, at)) return blocked(ONE_HOUR, at);
      const tenMinutes = await input.store.increment(bucket("pv10m", "ip", ip), windowStart(TEN_MINUTES, at));
      if (tenMinutes > INVITE_RATE_RULES.previewsPerTenMinutes) return blocked(TEN_MINUTES, at);
      const day = await input.store.increment(bucket("pvday", "ip", ip), windowStart(ONE_DAY, at));
      if (day > INVITE_RATE_RULES.previewsPerDay) return blocked(ONE_DAY, at);
      return { allowed: true };
    },
    async recordPreviewFailure({ ip, actorId }) {
      const at = now().getTime();
      if (actorId) await input.store.increment(bucket("acctfail", "account", actorId), windowStart(ONE_HOUR, at));
      else await input.store.increment(bucket("ipfail", "ip", ip), windowStart(ONE_HOUR, at));
    },
    async checkRedeem({ ip, actorId }) {
      const at = now().getTime();
      if (await ipLocked(ip, at)) return blocked(ONE_HOUR, at);
      const failures = await input.store.read(bucket("rdfail", "account", actorId), windowStart(ONE_DAY, at));
      if (failures >= INVITE_RATE_RULES.redeemFailuresPerDay) return blocked(ONE_DAY, at);
      const redeems = await input.store.increment(bucket("rdday", "account", actorId), windowStart(ONE_DAY, at));
      return redeems > INVITE_RATE_RULES.redeemsPerDay ? blocked(ONE_DAY, at) : { allowed: true };
    },
    async recordRedeemFailure({ ip, actorId }) {
      const at = now().getTime();
      await input.store.increment(bucket("ipfail", "ip", ip), windowStart(ONE_HOUR, at));
      await input.store.increment(bucket("rdfail", "account", actorId), windowStart(ONE_DAY, at));
    },
    logSubject: (ip) => subject("ip", ip).slice(0, 16),
  };
}
