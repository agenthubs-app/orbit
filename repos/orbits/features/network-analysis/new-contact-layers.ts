/**
 * W0048a：新联系人的三层更新入口（W0053 导入、W0055 回填调用）。
 *
 *  ① 事实层：不经快照（W0049 实时规则算）；
 *  ② 补全 + 规则匹配进「待确认」：对缺行业／职级／地区的联系人调用 W0045 按文字补全（每批 ≤20 人 = 1 次操作，
 *     写入一律过 `canWriteEnrichedValue`，`user` 值不被覆盖）；每批先向账本预留一次操作（默认后台池 enrichment；
 *     `budget: "system"` 只给回填脚本），HTTP 逐次登记子账，批结束由本入口 finish；后台池不够时把剩余 id 并入
 *     `network_analysis_jobs(kind='enrichment')`，次日 00:00 东京继续；随后 `enqueuePlanMatchJob`（0 次 AI）；
 *  ③ AI 叙述：按 `decideSnapshotRefresh` 判定，自动时只 upsert 快照 job（不预留）。
 * 不调用任何计划写方法。
 */
import { applyEnrichedValues, enrichedFieldHasValue, type EnrichedValue } from "../contacts/enrichment/apply-enrichment";
import { TEXT_ENRICHMENT_MAX_CONTACTS, type TextEnricher, type TextEnrichmentContactInput } from "../contacts/enrichment/text-enrichment";
import { nextTokyoMidnight } from "../ai-quota/constants";
import type { AiQuotaGate } from "../ai-quota/gate";

export interface LayerContactRecord {
  contactId: string;
  payload: Record<string, unknown>;
  /** CAS 版本。 */
  updatedAt: string;
}

export interface NewContactLayersDeps {
  gate: AiQuotaGate;
  enricher: TextEnricher | null;
  /** 只返回本人、未删除的联系人。 */
  readContacts(actorId: string, contactIds: readonly string[]): Promise<LayerContactRecord[]>;
  /** 以 updatedAt 为前提写回；别人先改了返回 false（本次跳过，不覆盖）。 */
  writeContact(actorId: string, record: LayerContactRecord, nextPayload: Record<string, unknown>, at: string): Promise<boolean>;
  /** 顺延剩余待补全 id（并入 enrichment job）。 */
  deferEnrichment(actorId: string, contactIds: readonly string[], sourceKey: string, notBefore: string): Promise<void>;
  /** 入队一次「待确认」规则匹配（enqueuePlanMatchJob，0 次 AI）。 */
  enqueuePlanMatch(input: { actorId: string; batchId: string; contactIds: readonly string[] }): Promise<{ state: string }>;
  /** 快照第 ③ 层：判定并在需要时排队（不预留）。 */
  refreshSnapshot(actorId: string): Promise<{ decision: string }>;
  log?: (line: Record<string, unknown>) => void;
}

export interface RunNewContactLayersInput {
  actorId: string;
  contactIds: readonly string[];
  sourceKey: string;
  now: Date;
  budget?: "background" | "system";
}

export interface EnrichmentPassResult {
  enrichment: "done" | "deferred" | "skipped" | "unavailable";
  operations: number;
  writtenContacts: number;
  deferredContactIds: string[];
  retryOn?: string;
}

export interface RunNewContactLayersResult extends EnrichmentPassResult {
  planMatch: string;
  snapshot: string;
}

const ENRICHMENT_FIELDS = ["industry", "seniorityLevel", "region"] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function enrichmentInput(record: LayerContactRecord): TextEnrichmentContactInput | null {
  const payload = record.payload;
  const input = {
    cardNotes: text(payload.notes),
    contactId: record.contactId,
    location: text(payload.location),
    organization: text(payload.organization),
    role: text(payload.role),
  };
  return input.organization || input.role || input.location || input.cardNotes ? input : null;
}

/** 只做第 ② 层的补全部分（维护任务消化顺延行也用它）。 */
export async function runEnrichmentPass(input: RunNewContactLayersInput, deps: NewContactLayersDeps): Promise<EnrichmentPassResult> {
  const log = deps.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));
  const ids = [...new Set(input.contactIds.map((id) => id.trim()).filter(Boolean))].slice(0, 200);
  const contacts = ids.length ? await deps.readContacts(input.actorId, ids) : [];
  const candidates = contacts
    .filter((record) => ENRICHMENT_FIELDS.some((field) => !enrichedFieldHasValue(record.payload, field)))
    .filter((record) => enrichmentInput(record) !== null);
  const result: EnrichmentPassResult = { deferredContactIds: [], enrichment: "done", operations: 0, writtenContacts: 0 };
  if (!candidates.length) return result;
  if (!deps.enricher) return { ...result, enrichment: "skipped" };
  const byId = new Map(candidates.map((record) => [record.contactId, record]));
  for (let start = 0; start < candidates.length; start += TEXT_ENRICHMENT_MAX_CONTACTS) {
    const batch = candidates.slice(start, start + TEXT_ENRICHMENT_MAX_CONTACTS);
    const reservation = await deps.gate.reserve({
      actorId: input.actorId,
      idempotencyKey: `enrichment:${input.sourceKey}:${batch.map((record) => record.contactId).join(",")}`.slice(0, 300),
      now: input.now,
      pool: input.budget === "system" ? "system" : "background",
      purpose: "enrichment",
      trigger: "auto",
    });
    if (reservation.ok !== true) {
      const denial = reservation as Extract<typeof reservation, { ok: false }>;
      const remaining = candidates.slice(start).map((record) => record.contactId);
      if (denial.reason === "daily_limit") {
        const retryOn = denial.retryOn ?? nextTokyoMidnight(input.now);
        await deps.deferEnrichment(input.actorId, remaining, input.sourceKey, retryOn);
        return { ...result, deferredContactIds: remaining, enrichment: "deferred", retryOn };
      }
      return { ...result, enrichment: "unavailable" };
    }
    // W0048b review P1：同键操作已在别处进行或已结束（同一批重放）：不执行、不结算。
    if (!reservation.owner) {
      log({ actorId: input.actorId, event: "network_layers_enrichment_not_owner", sourceKey: input.sourceKey, status: reservation.status });
      continue;
    }
    result.operations += 1;
    const operationId = reservation.operationId;
    let outcome: "succeeded" | "failed" = "failed";
    try {
      let callId: string;
      try {
        callId = (await deps.gate.beginCall(operationId, { model: deps.enricher.model, provider: deps.enricher.providerName })).callId;
      } catch {
        // 操作已结算（同一批重放）或超出 max_calls：这一批不再发请求。
        continue;
      }
      let proposals;
      try {
        const enriched = await deps.enricher.enrich({ contacts: batch.map((record) => enrichmentInput(record)!) });
        await deps.gate.endCall(callId, { inputTokens: enriched.usage.inputTokens, outputTokens: enriched.usage.outputTokens });
        proposals = enriched.proposals;
      } catch (error) {
        const usage = (error as { usage?: { inputTokens: number; outputTokens: number } | null })?.usage ?? null;
        await deps.gate.endCall(callId, usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : null).catch(() => undefined);
        log({ actorId: input.actorId, event: "network_layers_enrichment_failed", sourceKey: input.sourceKey });
        continue;
      }
      outcome = "succeeded";
      const at = input.now.toISOString();
      for (const proposal of proposals) {
        const record = byId.get(proposal.contactId);
        if (!record) continue;
        const values: EnrichedValue[] = [];
        if (proposal.primaryIndustryId) {
          values.push({ field: "industry", origin: "ai", value: { primaryIndustryId: proposal.primaryIndustryId, secondaryIndustryId: proposal.secondaryIndustryId }, via: "text_enrichment" });
        }
        if (proposal.seniorityLevel) values.push({ field: "seniorityLevel", origin: "ai", value: proposal.seniorityLevel, via: "text_enrichment" });
        if (proposal.region) values.push({ field: "region", origin: "ai", value: proposal.region, via: "text_enrichment" });
        const nextPayload = structuredClone(record.payload);
        // applyEnrichedValues 逐项过 canWriteEnrichedValue：user 值不被覆盖，只补空或替换 ai。
        if (!applyEnrichedValues(nextPayload, values, at).length) continue;
        if (await deps.writeContact(input.actorId, record, nextPayload, at)) result.writtenContacts += 1;
      }
    } finally {
      await deps.gate.finish(operationId, outcome);
    }
  }
  return result;
}

export async function runNewContactLayers(input: RunNewContactLayersInput, deps: NewContactLayersDeps): Promise<RunNewContactLayersResult> {
  const enrichment = await runEnrichmentPass(input, deps);
  const ids = [...new Set(input.contactIds.map((id) => id.trim()).filter(Boolean))];
  const planMatch = ids.length ? (await deps.enqueuePlanMatch({ actorId: input.actorId, batchId: input.sourceKey, contactIds: ids })).state : "skipped";
  const snapshot = (await deps.refreshSnapshot(input.actorId)).decision;
  return { ...enrichment, planMatch, snapshot };
}
