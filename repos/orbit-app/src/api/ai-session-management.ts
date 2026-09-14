import type { OrbitApiClient } from "./client";
import {
  aiSessionGroupDeleteReceiptSchema,
  aiSessionGroupReceiptSchema,
  aiSessionOrganizationReceiptSchema,
  type AiSession,
} from "./ai-history-contract";
import type {
  AiSessionGroupContract,
  AiSessionGroupCreateContract,
  AiSessionGroupDeleteContract,
  AiSessionGroupMutationContract,
  AiSessionOrganizationMutationContract,
} from "./contract/ai-sessions";
import {
  ORBIT_API_ENDPOINTS,
  aiConversationGroupPath,
  aiConversationSessionPath,
} from "./endpoints";

export type AiSessionManagementResult<T> =
  | { ok: true; value: T }
  | { error: string; ok: false };

function failed(message?: string): AiSessionManagementResult<never> {
  return { error: message?.trim() || "更改尚未保存，请刷新后重试。", ok: false };
}

export async function updateAiSessionOrganization(
  client: OrbitApiClient,
  sessionId: string,
  mutation: AiSessionOrganizationMutationContract,
  signal?: AbortSignal,
): Promise<AiSessionManagementResult<AiSession>> {
  const result = await client.patch<unknown>(aiConversationSessionPath(sessionId), {
    body: mutation,
    ...(signal ? { signal } : {}),
  });
  if (!result.success) return failed(result.error.message);
  const parsed = aiSessionOrganizationReceiptSchema.safeParse(result.data);
  return parsed.success ? { ok: true, value: parsed.data.session } : failed();
}

export async function createAiSessionGroup(
  client: OrbitApiClient,
  input: AiSessionGroupCreateContract,
  signal?: AbortSignal,
): Promise<AiSessionManagementResult<AiSessionGroupContract>> {
  const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.aiConversationGroups, {
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!result.success) return failed(result.error.message);
  const parsed = aiSessionGroupReceiptSchema.safeParse(result.data);
  return parsed.success ? { ok: true, value: parsed.data.group } : failed();
}

export async function renameAiSessionGroup(
  client: OrbitApiClient,
  groupId: string,
  input: AiSessionGroupMutationContract,
  signal?: AbortSignal,
): Promise<AiSessionManagementResult<AiSessionGroupContract>> {
  const result = await client.patch<unknown>(aiConversationGroupPath(groupId), {
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!result.success) return failed(result.error.message);
  const parsed = aiSessionGroupReceiptSchema.safeParse(result.data);
  return parsed.success ? { ok: true, value: parsed.data.group } : failed();
}

export async function deleteAiSessionGroup(
  client: OrbitApiClient,
  groupId: string,
  input: AiSessionGroupDeleteContract,
  signal?: AbortSignal,
): Promise<AiSessionManagementResult<{ deleted: true; id: string; ungroupedCount: number }>> {
  const result = await client.delete<unknown>(aiConversationGroupPath(groupId), {
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!result.success) return failed(result.error.message);
  const parsed = aiSessionGroupDeleteReceiptSchema.safeParse(result.data);
  return parsed.success ? { ok: true, value: parsed.data } : failed();
}
