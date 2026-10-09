import type { OrbitApiClient } from "../../api/client";
import { notePath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import type { SyncRecord } from "../../api/contract/sync";
import { offlineReadEnvelopeSchema } from "../../api/schema/universal-read";
import { parseOfflineNoteRequest } from "./note-outbox-mutation";
import { createOutboxUploader, type OutboxUploadRepository } from "./outbox-uploader";
import { createLocalSyncRepository } from "./local-sync-repository";
import type { SyncClient } from "./sync-client";

type LocalSyncRepository = ReturnType<typeof createLocalSyncRepository>;

const NOTE_DOMAIN = "notes";
const MAX_CANONICAL_PAGES = 100;

/** Uploads only frozen note requests, then acknowledges them from the canonical notes mirror page. */
export function createNoteOutboxUploader(input: {
  actorId: string;
  baseUrl: string;
  repository: LocalSyncRepository;
  syncClient: SyncClient;
  writeClient: Pick<OrbitApiClient, "post" | "patch">;
  workspaceId: string;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const repository: OutboxUploadRepository = {
    listQueuedMutations: query => input.repository.listQueuedMutations({ ...query, domainId: NOTE_DOMAIN }),
    beginOutboxMutationAttempt: value => input.repository.beginOutboxMutationAttempt(value),
    acknowledgeOutboxMutation: value => input.repository.acknowledgeOutboxMutation(value),
    markOutboxMutationFailure: value => input.repository.markOutboxMutationFailure(value),
  };

  return createOutboxUploader({
    repository,
    workspaceId: input.workspaceId,
    confirmOnline: async () => true, // The coordinator invokes this only after a successful online lease.
    now,
    uploadOne: async (mutation, signal) => {
      if (mutation.domainId !== NOTE_DOMAIN || mutation.kind !== "note" || !mutation.requestJson) return { status: 400 };
      let parsed: ReturnType<typeof parseOfflineNoteRequest>;
      try {
        parsed = parseOfflineNoteRequest(mutation);
      } catch {
        return { status: 400 };
      }
      const { requestBody } = parsed;
      const request = parsed.mutation;
      if (request.kind !== "note" || (request.operation !== "create" && request.operation !== "update") ||
          request.mutationId !== mutation.mutationId || request.entityId !== mutation.id || request.operation !== mutation.operation) {
        return { status: 400 };
      }

      let targetId = mutation.id;
      if (targetId.startsWith("local:")) {
        const alias = await input.repository.resolveAlias({
          workspaceId: input.workspaceId,
          domainId: NOTE_DOMAIN,
          localId: targetId,
          now: new Date(now()).toISOString(),
        });
        if (alias) targetId = alias;
      }
      const response = request.operation === "create"
        ? await input.writeClient.post<unknown>(ORBIT_API_ENDPOINTS.notes, { body: requestBody, signal })
        : await input.writeClient.patch<unknown>(notePath(targetId), { body: requestBody, signal });

      if (response.status >= 200 && response.status < 300) {
        const receiptNote = canonicalNote(response.success ? response.data : null);
        if (!receiptNote) return { status: 0 };
        if (request.operation === "create" && mutation.id.startsWith("local:")) {
          targetId = receiptNote.id as string;
        } else if (receiptNote.id !== targetId) {
          return { status: 0 };
        }
        const record = await readCanonicalNote(input, targetId, signal, now, receiptNote);
        return record ? { status: response.status, record } : { status: 0 };
      }
      if (response.status === 409 || response.status === 404) {
        const current = await readCanonicalNote(input, targetId, signal, now);
        return { status: response.status, ...(current ? { snapshot: current.payload } : {}) };
      }
      return {
        status: response.status,
        ...(!response.success && response.error.context ? { snapshot: response.error.context } : {}),
      };
    },
    pull: async () => {}, // The coordinator pulls all accepted mirror domains immediately after upload.
  });
}

function canonicalNote(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const note = (value as Record<string, unknown>).note;
  if (typeof note !== "object" || note === null || Array.isArray(note)) return null;
  const record = note as Record<string, unknown>;
  return typeof record.id === "string" && record.id.trim() && !record.id.startsWith("local:") ? record : null;
}

async function readCanonicalNote(
  input: { actorId: string; baseUrl: string; repository: LocalSyncRepository; syncClient: SyncClient; workspaceId: string },
  noteId: string,
  signal: AbortSignal,
  now: () => number,
  receiptNote: Record<string, unknown> | null = null,
): Promise<SyncRecord | null> {
  const leaseValue = await input.repository.getLease();
  const parsedLease = offlineReadEnvelopeSchema.safeParse(leaseValue);
  if (!parsedLease.success) return null;
  const grant = parsedLease.data.grants.find(item => item.workspaceId === input.workspaceId && item.domainId === NOTE_DOMAIN);
  if (!grant || parsedLease.data.actorId !== input.actorId || parsedLease.data.baseUrl !== input.baseUrl) return null;
  const readScope = {
    actorId: input.actorId,
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    domainId: NOTE_DOMAIN,
    authorizationEpoch: grant.authorizationEpoch,
  };
  const stored = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "note", id: noteId });
  const storedMatchesReceipt = Boolean(stored?.syncState === "synced" && stored.payload && (!receiptNote || sameNoteReceipt(stored.payload, receiptNote)));
  let cursor = (await input.repository.getScopeCursor(readScope))?.cursor;
  for (let pageNumber = 0; pageNumber < MAX_CANONICAL_PAGES; pageNumber += 1) {
    const page = await input.syncClient.getDomainPage({ domainId: NOTE_DOMAIN, ...(cursor ? { cursor } : {}), limit: 100, signal });
    if (page.authorizationEpoch !== grant.authorizationEpoch) return null;
    await input.repository.applyDomainPage(readScope, page);
    const change = page.changes.find(item => item.id === noteId);
    if (change?.operation === "upsert" && change.payload) {
      if (receiptNote && !sameNoteReceipt(change.payload, receiptNote)) return null;
      return {
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        kind: "note",
        id: change.id,
        revision: change.revision,
        updatedAt: page.serverTime,
        deletedAt: null,
        payload: change.payload,
        syncState: "synced",
        aiVisibility: "excluded",
      };
    }
    if (!page.hasMore) {
      if (receiptNote) return storedMatchesReceipt ? stored : null;
      // Another upload may have applied this note and advanced the shared cursor
      // after our initial read. Re-read the scoped mirror row before exposing a
      // 409 snapshot instead of returning that stale pre-pull value.
      const latest = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "note", id: noteId });
      return latest?.syncState === "synced" ? latest : null;
    }
    cursor = page.nextCursor;
  }
  if (receiptNote) return storedMatchesReceipt ? stored : null;
  const latest = await input.repository.getRecord({ workspaceId: input.workspaceId, kind: "note", id: noteId });
  return latest?.syncState === "synced" ? latest : null;
}

function sameNoteReceipt(mirrored: unknown, receipt: Record<string, unknown>): boolean {
  if (typeof mirrored !== "object" || mirrored === null || Array.isArray(mirrored)) return false;
  const server = mirrored as Record<string, unknown>;
  return ["id", "accountId", "ownerUserId", "title", "body", "version", "manualContactIds", "mentions", "eventIds"]
    .every(key => JSON.stringify(server[key]) === JSON.stringify(receipt[key]));
}
