/**
 * R15 `/i/<code>` 在非 live 模式（本机 mock、`ORBIT_REDESIGN_MOCK=invite-codes`）下的预览：演示世界里的码
 * （`H8MW-4QZT` 等，`sample: true`），与 mock 路由（`features/redesign-contracts/handlers.ts` 的 `previewInviteCode`）
 * 读同一个演示世界。只在 `redesignContractMode` 不是 live 时调用；生产永远是 live，不会走到这里。
 */
import type { InviteLandingInitial } from "../../(app)/app/orbit-2026/invite-landing/landing-model";
import { inviteCodePreviewSchema } from "../../../shared/api-schema/invite-codes";
import { redesignMock } from "../../../features/redesign-contracts/mock-service";

export function readMockInvitePreview(code: string): InviteLandingInitial {
  const preview = redesignMock.invitePreview(code);
  if ("failure" in preview) return { kind: "unavailable", limited: false };
  const parsed = inviteCodePreviewSchema.safeParse(preview);
  return parsed.success ? { kind: "preview", preview: parsed.data } : { kind: "unavailable", limited: true };
}
