import type { OrbitApiClient } from "../../api/client";
import { aiSessionDeleteReceiptSchema, aiSessionOrganizationReceiptSchema } from "../../api/ai-history-contract";
import type { SyncRecord } from "../../api/contract/sync";
import { aiConversationSessionPath } from "../../api/endpoints";
import { parseOfflineAiSessionDelete, parseOfflineAiSessionRequest, type OfflineAiSessionDeleteInput, type OfflineAiSessionMutationInput } from "./ai-session-outbox-mutation";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";
import { createOutboxUploader, type OutboxUploadRepository } from "./outbox-uploader";

type Repository = OutboxUploadRepository & {
  getRecord(input: { workspaceId: string; kind: "ai_session"; id: string }): Promise<SyncRecord | null>;
};

export function createAiSessionOutboxUploader(input: {
  actorId: string;
  baseUrl: string;
  workspaceId: string;
  repository: Repository;
  writeClient: Pick<OrbitApiClient, "patch" | "delete">;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const repository: OutboxUploadRepository = {
    listQueuedMutations: query => input.repository.listQueuedMutations({ ...query, domainId: "ai-sessions" } as { workspaceId: string }),
    beginOutboxMutationAttempt: value => input.repository.beginOutboxMutationAttempt(value),
    acknowledgeOutboxMutation: value => input.repository.acknowledgeOutboxMutation(value),
    markOutboxMutationFailure: value => input.repository.markOutboxMutationFailure(value),
  };
  return createOutboxUploader({
    repository,
    workspaceId: input.workspaceId,
    confirmOnline: async () => true,
    now,
    uploadOne: async (row: LocalSyncQueuedMutation, signal) => {
      if (row.operation === "delete") {
        let expectedRevision: number;
        try { expectedRevision = parseOfflineAiSessionDelete(row as OfflineAiSessionDeleteInput).expectedRevision; }
        catch { return { status: 400 }; }
        const response = await input.writeClient.delete<unknown>(aiConversationSessionPath(row.id), {
          body: { expectedRevision }, signal,
        });
        if (!response.success && "error" in response) return { status: response.status, errorCode: response.error.code };
        if (!aiSessionDeleteReceiptSchema.safeParse(response.data).success) return { status: 0 };
        const previous = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "ai_session", id: row.id });
        if (!previous || previous.actorId !== input.actorId || previous.deletedAt !== null) return { status: 0 };
        return { status: response.status, record: { ...previous, deletedAt: new Date(now()).toISOString(), payload: null, syncState: "synced" } };
      }
      let requestBody: ReturnType<typeof parseOfflineAiSessionRequest>["requestBody"];
      try { requestBody = parseOfflineAiSessionRequest(row as OfflineAiSessionMutationInput).requestBody; }
      catch { return { status: 400 }; }
      const response = await input.writeClient.patch<unknown>(aiConversationSessionPath(row.id), { body: requestBody, signal });
      if (!response.success && "error" in response) return { status: response.status, errorCode: response.error.code,
        ...(response.error.context ? { snapshot: response.error.context } : {}) };
      const parsed = aiSessionOrganizationReceiptSchema.safeParse(response.data);
      if (!parsed.success || parsed.data.session.id !== row.id ||
          parsed.data.session.organization?.revision !== requestBody.expectedRevision + 1) return { status: 0 };
      const previous = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "ai_session", id: row.id });
      if (!previous || previous.actorId !== input.actorId || previous.deletedAt !== null ||
          !previous.payload || typeof previous.payload !== "object" || Array.isArray(previous.payload)) return { status: 0 };
      const session = parsed.data.session;
      const organization = session.organization;
      if (!organization) return { status: 0 };
      const record: SyncRecord<Record<string, unknown>> = {
        ...previous,
        updatedAt: new Date(now()).toISOString(),
        payload: {
          ...previous.payload,
          organization,
        },
        syncState: "synced",
      };
      return { status: response.status, record };
    },
    pull: async () => {},
  });
}
