/**
 * R15 `/i/<code>` 服务端渲染时读预览（DESIGN add-and-invite §6 第 8 条）：不另开接口，走与
 * `GET /api/invite-codes/[code]/preview` 同一套服务与限流——
 *   - live：`getConfiguredInviteCodeRuntime().service.preview` + `getConfiguredInviteRateLimiter()`（同一个
 *     计数存储、同一批桶：总量、每 IP 每小时失败 60 次后真码也锁、登录按账号计），步骤与路由
 *     （`features/invite-codes/handlers.ts` 的 `preview`）一一对应：先 `checkPreview`，不可用时
 *     `recordPreviewFailure`；客户端 IP 只认 `x-real-ip`（`inviteClientIp`）；日志只记 HMAC 后 IP 前 16 位与码前 2 位。
 *     路由文件本身引用了演示世界（mock 分派），页面不直接 import 它，以免公开页的依赖里出现 mock 数据。
 *   - 非 live（本机 mock / `ORBIT_REDESIGN_MOCK`）：演示世界的预览（`mock-preview.ts`）。
 * 结果：预览 →「打开」等状态；不可用 →「このコードは使えません」；被限流或服务没配置 → 同一页 +「しばらくしてから」。
 * 页面语言只按浏览器 `Accept-Language`（`/i` 不经过 proxy，没有 `?lang=` 处理）。
 */
import { headers } from "next/headers";

import { negotiateOrbitLanguage } from "../../(app)/app/orbit-language-core";
import type { InviteLandingInitial } from "../../(app)/app/orbit-2026/invite-landing/landing-model";
import { resolveAuthenticatedApiActor } from "../../api/_shared/authenticated-actor";
import { inviteCodePreviewSchema } from "../../../shared/api-schema/invite-codes";
import type { OrbitLanguage } from "../../../shared/contract/language";
import { inviteClientIp } from "../../../features/invite-codes/client-ip";
import { getConfiguredInviteCodeRuntime, getConfiguredInviteRateLimiter } from "../../../features/invite-codes/configured";
import { InviteCodeError } from "../../../features/invite-codes/contract";
import type { InviteRateLimiter } from "../../../features/invite-codes/rate-limit";
import type { InviteCodeService } from "../../../features/invite-codes/service";
import { redesignContractMode } from "../../../features/redesign-contracts/route";
import { readMockInvitePreview } from "./mock-preview";

export async function inviteLandingLanguage(): Promise<OrbitLanguage> {
  return negotiateOrbitLanguage((await headers()).get("accept-language"));
}

export async function readInviteLandingSession(): Promise<{ signedIn: boolean; actorId: string | null; accountName: string | null; accountEmail: string | null }> {
  const actor = await resolveAuthenticatedApiActor().catch(() => null);
  return { signedIn: Boolean(actor), actorId: actor?.id ?? null, accountName: actor?.name?.trim() || null, accountEmail: actor?.email?.trim() || null };
}

/** 日志里码只留前 2 位（同路由）。 */
function codePrefix(code: string): string {
  return code.normalize("NFKC").replace(/[^0-9A-Za-z]/gu, "").toUpperCase().slice(0, 2);
}

/** live 的一次预览，步骤与路由的 `preview` 相同（同一个限流器、同一个服务）。 */
export async function readLiveInvitePreview(input: {
  code: string;
  actorId: string | null;
  ip: string;
  service: InviteCodeService;
  limiter: InviteRateLimiter;
  log?: (line: string) => void;
}): Promise<InviteLandingInitial> {
  const log = input.log ?? ((line: string) => console.warn(line));
  const { actorId, ip, limiter } = input;
  const decision = await limiter.checkPreview({ actorId, ip });
  if ("retryAfterSeconds" in decision) {
    log(JSON.stringify({ code: codePrefix(input.code), event: "invite_code_preview_limited", ip: limiter.logSubject(ip), via: "page" }));
    return { kind: "unavailable", limited: true };
  }
  try {
    const parsed = inviteCodePreviewSchema.safeParse(await input.service.preview(input.code, actorId));
    return parsed.success ? { kind: "preview", preview: parsed.data } : { kind: "unavailable", limited: true };
  } catch (error) {
    if (error instanceof InviteCodeError && error.code === "UNAVAILABLE") {
      await limiter.recordPreviewFailure({ actorId, ip });
      log(JSON.stringify({ code: codePrefix(input.code), event: "invite_code_preview_unavailable", ip: limiter.logSubject(ip), via: "page" }));
      return { kind: "unavailable", limited: false };
    }
    console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "invite_code_page_preview_failed" }));
    return { kind: "unavailable", limited: true };
  }
}

export async function loadInviteLanding(code: string, actorId: string | null): Promise<InviteLandingInitial> {
  try {
    if (redesignContractMode("invite-codes") !== "live") return readMockInvitePreview(code);
    const runtime = getConfiguredInviteCodeRuntime();
    const limiter = getConfiguredInviteRateLimiter();
    // 库或限流密钥没配置：与路由的 503 同义——页面不退化为不限流，显示「しばらくしてから」。
    if (!runtime || !limiter) return { kind: "unavailable", limited: true };
    return await readLiveInvitePreview({ actorId, code, ip: inviteClientIp(await headers()), limiter, service: runtime.service });
  } catch {
    return { kind: "unavailable", limited: true };
  }
}
