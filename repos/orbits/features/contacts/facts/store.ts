/**
 * R33：`contact_facts` 的 orbit_records 实现（与 `memo_extractions` 同一存储方式，不做 DDL）。
 * 记录 id = `ContactFact.id`，user_id = 本人，target = 联系人；读取只按本人 + 联系人（有上限）。
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { CONTACT_FACTS_COLLECTION, type ContactFact, type ContactFactStore } from "./types";

export const CONTACT_FACTS_LIST_LIMIT = 500;

type StoreLike = Pick<LiveRecordStoreLike, "getRecord" | "listRecords" | "upsertRecord">;

function liveRecord(workspaceId: string, fact: ContactFact): LiveRecord {
  return {
    workspaceId,
    collectionName: CONTACT_FACTS_COLLECTION,
    recordId: fact.id,
    userId: fact.actorId,
    sourceType: fact.field === "manual" ? "manual" : "system",
    sourceId: fact.memoId ?? fact.id,
    sourceLabel: fact.field === "manual" ? "Contact fact (manual)" : "Memo extraction",
    evidenceIds: [],
    targetType: "contact",
    targetId: fact.contactId,
    occurredAt: fact.memoDate ?? fact.firstSeenAt,
    lifecycleState: "active",
    searchText: "",
    payload: { ...fact } as Record<string, unknown>,
    createdAt: fact.firstSeenAt,
    updatedAt: fact.lastSeenAt,
    deletedAt: null,
  } as LiveRecord;
}

function factOf(record: LiveRecord, actorId: string): ContactFact | null {
  const payload = record.payload as unknown as ContactFact;
  if (record.userId !== actorId || payload?.actorId !== actorId || typeof payload.contactId !== "string" || typeof payload.text !== "string") return null;
  return { ...payload };
}

export function createLiveRecordContactFactStore(input: { store: StoreLike; workspaceId: string }): ContactFactStore {
  return {
    async get({ actorId, id }) {
      const record = await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: CONTACT_FACTS_COLLECTION, recordId: id, userId: actorId });
      return record ? factOf(record, actorId) : null;
    },
    async list({ actorId, contactId }) {
      const records = await input.store.listRecords({
        workspaceId: input.workspaceId,
        collectionName: CONTACT_FACTS_COLLECTION,
        userId: actorId,
        targetType: "contact",
        targetId: contactId,
        lifecycleState: "active",
        limit: CONTACT_FACTS_LIST_LIMIT,
      });
      return records.flatMap((record) => {
        const fact = factOf(record, actorId);
        return fact && fact.contactId === contactId ? [fact] : [];
      }).sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id));
    },
    async save(fact) {
      await input.store.upsertRecord(liveRecord(input.workspaceId, fact));
    },
  };
}

/** 配置了 live 数据库时的存储；没有为 null（调用方跳过事实累积）。 */
export function createConfiguredContactFactStore(): ContactFactStore | null {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  return createLiveRecordContactFactStore({ store: configured.store as unknown as StoreLike, workspaceId: configured.workspaceId });
}
