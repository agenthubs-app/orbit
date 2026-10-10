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

type StoreLike = Pick<LiveRecordStore, "getRecord" | "updateRecordIfCurrent"> & Required<Pick<LiveRecordStore, "insertRecordIfAbsent">>;

function recordId(actorId: string, key: string): string {
  return `memo-extraction:${encodeURIComponent(actorId)}:${key}`;
}

function liveRecord(input: { workspaceId: string; extraction: MemoExtractionRecord }): LiveRecord {
  const extraction = input.extraction;
  return {
    workspaceId: input.workspaceId,
    collectionName: MEMO_EXTRACTION_COLLECTION,
    recordId: recordId(extraction.actorId, extraction.key),
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
    createdAt: extraction.createdAt,
    updatedAt: extraction.updatedAt,
    deletedAt: null,
  } as LiveRecord;
}

/**
 * orbit_records 实现：`insert` = insertRecordIfAbsent（原子认领）；`replace` = 以上一版 updatedAt 为前提的
 * updateRecordIfCurrent（CAS）。两者失败都返回 false，调用方据此判定「别人已认领／已推进」。
 */
export function createLiveRecordMemoExtractionStore(input: { store: StoreLike; workspaceId: string }): MemoExtractionStore {
  return {
    async get({ actorId, key }) {
      const record = await input.store.getRecord({ workspaceId: input.workspaceId, collectionName: MEMO_EXTRACTION_COLLECTION, recordId: recordId(actorId, key) });
      if (!record || record.userId !== actorId || record.payload?.actorId !== actorId || record.payload?.key !== key) return null;
      return { ...(record.payload as unknown as MemoExtractionRecord), updatedAt: record.updatedAt };
    },
    async insert(extraction) {
      return Boolean(await input.store.insertRecordIfAbsent(liveRecord({ workspaceId: input.workspaceId, extraction })));
    },
    async replace(extraction, expectedUpdatedAt) {
      if (!input.store.updateRecordIfCurrent) throw new Error("Memo extraction storage requires conditional update support.");
      const written = await input.store.updateRecordIfCurrent(liveRecord({ workspaceId: input.workspaceId, extraction }), {
        userId: extraction.actorId,
        updatedAt: expectedUpdatedAt,
      });
      return Boolean(written);
    },
  };
}

/**
 * 「写 memo」保存成功之后（响应之外）调用：用配置的存储、始终拒绝的闸门跑一次作业。
 * 未配置数据库时什么都不做；异常不外抛（提取是派生缓存，不影响 memo 本身），但写结构化错误日志。
 */
export async function runConfiguredMemoExtraction(
  input: MemoExtractionJobInput & { usedForPlan?: boolean },
  overrides: { gate?: AiQuotaGate; provider?: MemoExtractionProvider | null } = {},
): Promise<MemoExtractionRecord | null> {
  try {
    // R24（C11）：memo 打开「プランの話せた に使う」时，带上这个人作为候补 / 已关联的人物类型的 3 问。
    const plan = input.usedForPlan ? await planCoverageHooks(input.actorId, input.contactId) : null;
    const configured = createConfiguredPostgresLiveRecordStore();
    if (!configured) return null;
    if (!configured.store.insertRecordIfAbsent || !configured.store.updateRecordIfCurrent) {
      throw new Error("Memo extraction storage requires atomic insert and conditional update.");
    }
    const contacts = createConfiguredStorageContactGraphProvider();
    return await runMemoExtraction({ ...input, ...(plan?.planQuestions.length ? { planQuestions: plan.planQuestions } : {}) }, {
      ...(plan?.planQuestions.length ? { onPlanCoverage: plan.onPlanCoverage } : {}),
      gate: overrides.gate ?? createConfiguredAiQuotaGate(),
      provider: overrides.provider !== undefined ? overrides.provider : createConfiguredMemoExtractionProvider(),
      store: createLiveRecordMemoExtractionStore({ store: configured.store as unknown as StoreLike, workspaceId: configured.workspaceId }),
      applyValues: async ({ actorId, contactId, values, at }) => {
        if (!contacts?.applyContactMemoExtraction) return [];
        return contacts.applyContactMemoExtraction(contactId, actorId, values, at);
      },
    });
  } catch (error) {
    // 提取是派生缓存，不影响 memo 本身；失败写结构化日志（不含正文），开闸后由维护任务补扫（W0048a）。
    logMemoExtractionFailure("job_failed", input, error);
    return null;
  }
}

/** 结构化错误日志：只含 actorId／contactId／noteId 与错误类型，不含 memo 正文。 */
export function logMemoExtractionFailure(
  stage: "enqueue_failed" | "job_failed",
  input: Pick<MemoExtractionJobInput, "actorId" | "contactId" | "noteId">,
  error: unknown,
): void {
  console.error(JSON.stringify({
    event: "memo_extraction_error",
    stage,
    actorId: input.actorId,
    contactId: input.contactId,
    noteId: input.noteId,
    error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "unknown",
  }));
}

/** R24（C11）：这个人在生效 v2 计划里作为候补 / 已关联的人物类型的 3 问，以及判定结果的去处（计分提议）。 */
async function planCoverageHooks(actorId: string, contactId: string) {
  const { resolvePlanV2Service } = await import("../../plans/v2/service-factory");
  const resolution = resolvePlanV2Service({ actorId, mode: "live" });
  if (resolution.success === false) return null;
  const service = resolution.service;
  const fit = await service.contactFit(contactId);
  const planQuestions: Array<{ itemId: string; questions: readonly string[] }> = [];
  for (const item of fit.fits) {
    if (item.status === "talked") continue;
    const detail = await service.typeDetail(item.planId, item.itemId);
    if (detail && !detail.skipped && detail.questions.length) planQuestions.push({ itemId: item.itemId, questions: detail.questions });
  }
  return {
    onPlanCoverage: async (result: { memoId: string; coverage: ReadonlyArray<{ itemId: string; answered: readonly number[] }>; manual: boolean }) => {
      await service.proposeMemoCoverage({ contactId, coverage: result.coverage, manual: result.manual, memoId: result.memoId });
    },
    planQuestions,
  };
}
