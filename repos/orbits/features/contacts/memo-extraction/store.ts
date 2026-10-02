/**
 * W0046：`memo_extractions` 存储（orbit_records 集合，不做 DDL）与「写 memo 后」的作业入口。
 *
 * 记录 id = `memo-extraction:<actor>:<key>`，user_id = 本人；读取只按主键（有上限）。
 * 入口 `runConfiguredMemoExtraction` 注入「始终拒绝」闸门（createConfiguredAiQuotaGate），
 * 本 Sprint 每条 memo 只落一条 `disabled` 记录、provider 0 次调用、联系人行 0 次写。
 */
import { createConfiguredAiQuotaGate, type AiQuotaGate } from "../../ai-quota/gate";
import type { LiveRecord, LiveRecordStore } from "../../../shared/storage/live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createConfiguredStorageContactGraphProvider } from "../storage/contact-live-record-provider";
import { runMemoExtraction, type MemoExtractionJobInput, type MemoExtractionRecord, type MemoExtractionStore } from "./job";
import { createConfiguredMemoExtractionProvider, type MemoExtractionProvider } from "./provider";

export const MEMO_EXTRACTION_COLLECTION = "memo_extractions";

type StoreLike = Pick<LiveRecordStore, "getRecord" | "upsertRecord">;

function recordId(actorId: string, key: string): string {
  return `memo-extraction:${encodeURIComponent(actorId)}:${key}`;
}

export function createLiveRecordMemoExtractionStore(input: { store: StoreLike; workspaceId: string }): MemoExtractionStore {
  return {
    async get({ actorId, key }) {
      const record = await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: MEMO_EXTRACTION_COLLECTION, recordId: recordId(actorId, key) });
      if (!record || record.userId !== actorId || record.payload?.actorId !== actorId || record.payload?.key !== key) return null;
      return record.payload as unknown as MemoExtractionRecord;
    },
    async put(extraction) {
      const id = recordId(extraction.actorId, extraction.key);
      const existing = await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: MEMO_EXTRACTION_COLLECTION, recordId: id });
      if (existing && existing.userId !== extraction.actorId) throw new Error("Memo extraction record belongs to another actor.");
      await input.store.upsertRecord({
        workspaceId: input.workspaceId,
        collectionName: MEMO_EXTRACTION_COLLECTION,
        recordId: id,
        userId: extraction.actorId,
        sourceType: "system",
        sourceId: extraction.noteId,
        sourceLabel: "Memo extraction",
        evidenceIds: [],
        targetType: "contact",
        targetId: extraction.contactId,
        occurredAt: extraction.updatedAt,
        lifecycleState: "active",
        searchText: "",
        payload: { ...extraction } as Record<string, unknown>,
        createdAt: existing?.createdAt ?? extraction.createdAt,
        updatedAt: extraction.updatedAt,
        deletedAt: null,
      } as LiveRecord);
    },
  };
}

/**
 * 「写 memo」保存成功之后（响应之外）调用：用配置的存储、始终拒绝的闸门跑一次作业。
 * 未配置数据库时什么都不做；任何异常都吞掉（提取是派生缓存，不影响 memo 本身）。
 */
export async function runConfiguredMemoExtraction(
  input: MemoExtractionJobInput,
  overrides: { gate?: AiQuotaGate; provider?: MemoExtractionProvider | null } = {},
): Promise<MemoExtractionRecord | null> {
  try {
    const configured = createConfiguredPostgresLiveRecordStore();
    if (!configured) return null;
    const contacts = createConfiguredStorageContactGraphProvider();
    return await runMemoExtraction(input, {
      gate: overrides.gate ?? createConfiguredAiQuotaGate(),
      provider: overrides.provider !== undefined ? overrides.provider : createConfiguredMemoExtractionProvider(),
      store: createLiveRecordMemoExtractionStore({ store: configured.store as unknown as StoreLike, workspaceId: configured.workspaceId }),
      applyValues: async ({ actorId, contactId, values, at }) => {
        if (!contacts?.applyContactMemoExtraction) return [];
        return contacts.applyContactMemoExtraction(contactId, actorId, values, at);
      },
    });
  } catch {
    return null;
  }
}
