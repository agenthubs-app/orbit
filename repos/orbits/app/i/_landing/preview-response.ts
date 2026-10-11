/** R15：一个预览响应（mock 路由的 Response）→ `/i/<code>` 的首屏状态。404 = 不可用；其余失败 = 不可用 +「しばらくしてから」。 */
import type { InviteLandingInitial } from "../../(app)/app/orbit-2026/invite-landing/landing-model";
import { inviteCodePreviewSchema } from "../../../shared/api-schema/invite-codes";

export async function interpretInvitePreviewResponse(response: Response): Promise<InviteLandingInitial> {
  if (response.status === 404) return { kind: "unavailable", limited: false };
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;
  if (response.ok && body?.success) {
    const parsed = inviteCodePreviewSchema.safeParse(body.data);
    if (parsed.success) return { kind: "preview", preview: parsed.data };
  }
  return { kind: "unavailable", limited: true };
}
