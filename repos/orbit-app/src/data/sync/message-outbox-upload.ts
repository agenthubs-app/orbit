import type { OrbitApiClient } from "../../api/client";
import { relationshipDeliveryReceiptMatches } from "../../api/contact-communication";
import { relationshipCommunicationMessagesPath } from "../../api/endpoints";
import type { SyncRecord } from "../../api/contract/sync";
import { offlineReadEnvelopeSchema } from "../../api/schema/universal-read";
import { MESSAGE_OUTBOX_DOMAIN, parseOfflineMessageRequest } from "./message-outbox-mutation";
import { createOutboxUploader, type OutboxUploadRepository } from "./outbox-uploader";
import { createLocalSyncRepository } from "./local-sync-repository";
import type { SyncClient } from "./sync-client";

type LocalSyncRepository = ReturnType<typeof createLocalSyncRepository>;
const CONVERSATIONS_DOMAIN = "relationship-conversations";
const MAX_CANONICAL_PAGES = 100;
export const CONVERSATION_ENDED = "CONVERSATION_ENDED";

/**
 * Sprint 0135: uploads frozen relationship message sends (one request each,
 * the existing send route) and acknowledges each with the mirrored message row
 * (server sequence number and server time, D13). Before a round, queued
 * messages whose conversation has left the device (revoked or left, 0119) are
 * marked failed and never sent.
 */
export function createMessageOutboxUploader(input: {
  actorId: string;
  baseUrl: string;
  repository: LocalSyncRepository;
  syncClient: SyncClient;
  writeClient: Pick<OrbitApiClient, "post">;
  workspaceId: string;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const repository: OutboxUploadRepository = {
    listQueuedMutations: query => input.repository.listQueuedMutations({ ...query, domainId: MESSAGE_OUTBOX_DOMAIN }),
    beginOutboxMutationAttempt: value => input.repository.beginOutboxMutationAttempt(value),
    acknowledgeOutboxMutation: value => input.repository.acknowledgeOutboxMutation(value),
    markOutboxMutationFailure: value => input.repository.markOutboxMutationFailure(value),
  };
  const uploader = createOutboxUploader({
    repository,
    workspaceId: input.workspaceId,
    confirmOnline: async () => true, // The coordinator invokes this only after a successful online lease.
    now,
    uploadOne: async (mutation, signal) => {
      let parsed: ReturnType<typeof parseOfflineMessageRequest>;
      try { parsed = parseOfflineMessageRequest(mutation); } catch { return { status: 400 }; }
      const { conversationId, request } = parsed;
      const response = await input.writeClient.post<unknown>(relationshipCommunicationMessagesPath(conversationId), {
        body: request,
        headers: { "Idempotency-Key": request.requestId },
        signal,
      });
      if (response.status >= 200 && response.status < 300) {
        const data = response.success ? response.data : null;
        if (!relationshipDeliveryReceiptMatches(data, { body: request.body, conversationId, qualificationVersion: request.qualificationVersion, senderAccountId: input.actorId })) {
          return { status: 0 };
        }
        // A replay of a delivered request returns the same message, so an unconfirmed mirror row retries safely.
        const record = await readCanonicalMessage(input, data.message.messageId, signal);
        return record ? { status: response.status, record } : { status: 0 };
      }
      return { status: response.status };
    },
    pull: async () => {}, // The coordinator pulls every accepted mirror domain right after the upload.
  });

  /** Queued sends whose conversation is no longer on the device are failed before anything is sent. */
  async function failEndedConversations(): Promise<number> {
    const lease = offlineReadEnvelopeSchema.safeParse(await input.repository.getLease());
    if (!lease.success || lease.data.actorId !== input.actorId || lease.data.baseUrl !== input.baseUrl) return 0;
    const grant = lease.data.grants.find(item => item.workspaceId === input.workspaceId && item.domainId === CONVERSATIONS_DOMAIN);
    if (!grant) return 0;
    const cursor = await input.repository.getScopeCursor({ actorId: input.actorId, baseUrl: input.baseUrl, workspaceId: input.workspaceId, domainId: CONVERSATIONS_DOMAIN, authorizationEpoch: grant.authorizationEpoch });
    if (cursor?.bootstrapState !== "complete") return 0;
    let failed = 0;
    for (const row of await repository.listQueuedMutations({ workspaceId: input.workspaceId })) {
      if (row.state !== "queued") continue;
      const conversation = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "relationship_conversation", id: row.id });
      const payload = conversation?.payload as Record<string, unknown> | null | undefined;
      const active = conversation && conversation.deletedAt === null && payload?.status === "active" &&
        Array.isArray(payload.participantAccountIds) && payload.participantAccountIds.includes(input.actorId);
      if (active) continue;
      await repository.markOutboxMutationFailure({ mutationId: row.mutationId, state: "failed", nextRetryAt: null, errorCode: CONVERSATION_ENDED });
      failed += 1;
    }
    return failed;
  }

  return {
    async run() {
      await failEndedConversations();
      return uploader.run();
    },
    cancel: () => uploader.cancel(),
  };
}

async function readCanonicalMessage(
  input: { actorId: string; baseUrl: string; repository: LocalSyncRepository; syncClient: SyncClient; workspaceId: string },
  messageId: string,
  signal: AbortSignal,
): Promise<SyncRecord | null> {
  const lease = offlineReadEnvelopeSchema.safeParse(await input.repository.getLease());
  if (!lease.success || lease.data.actorId !== input.actorId || lease.data.baseUrl !== input.baseUrl) return null;
  const grant = lease.data.grants.find(item => item.workspaceId === input.workspaceId && item.domainId === MESSAGE_OUTBOX_DOMAIN);
  if (!grant) return null;
  const scope = { actorId: input.actorId, baseUrl: input.baseUrl, workspaceId: input.workspaceId, domainId: MESSAGE_OUTBOX_DOMAIN, authorizationEpoch: grant.authorizationEpoch };
  let cursor = (await input.repository.getScopeCursor(scope))?.cursor;
  for (let pageNumber = 0; pageNumber < MAX_CANONICAL_PAGES; pageNumber += 1) {
    const page = await input.syncClient.getDomainPage({ domainId: MESSAGE_OUTBOX_DOMAIN, ...(cursor ? { cursor } : {}), limit: 100, signal });
    if (page.authorizationEpoch !== grant.authorizationEpoch) return null;
    await input.repository.applyDomainPage(scope, page);
    const change = page.changes.find(item => item.operation === "upsert" && item.payload && (item.payload as Record<string, unknown>).messageId === messageId);
    if (change) {
      return { actorId: input.actorId, workspaceId: input.workspaceId, kind: "relationship_message", id: change.id, revision: change.revision,
        updatedAt: page.serverTime, deletedAt: null, payload: change.payload, syncState: "synced", aiVisibility: "excluded" };
    }
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }
  // Another round may already have applied the row and advanced the cursor: look it up in the mirror.
  const rows = await input.repository.listRecords({ workspaceId: input.workspaceId, kind: "relationship_message" });
  return rows.find(row => row.syncState === "synced" && row.deletedAt === null && (row.payload as Record<string, unknown> | null)?.messageId === messageId) ?? null;
}
