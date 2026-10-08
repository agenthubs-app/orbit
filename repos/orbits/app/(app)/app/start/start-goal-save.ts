/**
 * 引导页保存目标（W0006）：与资料页、onboarding 同一个接口与核验口径
 * （`onboarding-client.ts` 的 `saveProfileFields`：PUT /api/profile + 回执核验 + 复读核验，
 * 版本冲突时读最新版本重发一次）。存储仍是 `relationshipGoal` 一段文字。
 */
import { saveProfileFields } from "../profile/onboarding-0918/onboarding-client";

export async function saveGuideGoal(
  relationshipGoal: string,
  expectedUpdatedAt: string | null,
): Promise<{ relationshipGoal: string; updatedAt: string | null }> {
  const payload = await saveProfileFields({ relationshipGoal }, expectedUpdatedAt);
  return {
    relationshipGoal: payload.profile?.relationshipGoal ?? relationshipGoal,
    updatedAt: payload.profile?.updatedAt ?? null,
  };
}
