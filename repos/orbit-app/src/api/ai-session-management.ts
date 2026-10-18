import type { OrbitApiClient } from "./client";
import {
  aiSessionGroupDeleteReceiptSchema,
  aiSessionGroupReceiptSchema,
  aiSessionDeleteReceiptSchema,
  aiSessionOrganizationReceiptSchema,
  aiSessionRestoreReceiptSchema,
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
  | { code?: string; error: string; ok: false };

function failed(message?: string, code?: string): AiSessionManagementResult<never> {
  return { ...(code ? { code } : {}), error: message?.trim() || "更改尚未保存，请刷新后重试。", ok: false };
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
  if (!result.success) return failed(result.error.message, result.error.code);
  const parsed = aiSessionOrganizationReceiptSchema.safeParse(result.data);
  return parsed.success ? { ok: true, value: parsed.data.session } : failed();
}

export async function deleteAiSession(
  client: OrbitApiClient,
  sessionId: string,
  expectedRevision: number,
  signal?: AbortSignal,
): Promise<AiSessionManagementResult<{ undoToken: string | null; undoUntil: string | null }>> {
  const result = await client.delete<unknown>(aiConversationSessionPath(sessionId), {
    body: { expectedRevision }, ...(signal ? { signal } : {}),
  });
  if (!result.success) return failed(result.error.message, result.error.code);
  const parsed = aiSessionDeleteReceiptSchema.safeParse(result.data);
  return parsed.success
    ? { ok: true, value: { undoToken: parsed.data.undoToken ?? null, undoUntil: parsed.data.undoUntil ?? null } }
    : failed();
}

export async function restoreAiSession(
  client: OrbitApiClient,
  sessionId: string,
  undoToken: string,
  signal?: AbortSignal,
): Promise<AiSessionManagementResult<true>> {
  const result = await client.post<unknown>(`${aiConversationSessionPath(sessionId)}/restore`, {
    body: { undoToken },
    ...(signal ? { signal } : {}),
  });
  if (!result.success) return failed(result.error.message, result.error.code);
  return aiSessionRestoreReceiptSchema.safeParse(result.data).success ? { ok: true, value: true } : failed();
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
