/**
 * W0048a：三层更新入口的数据库装配（读写本人联系人、顺延补全、入队待确认、快照判定）。
 *
 * 联系人只读本人、已确认的行（与快照同一归属口径）；写回走 LiveRecordStore 的条件更新（以 updatedAt 为前提），
 * 别人先改了就跳过本条，不覆盖。补全值的写入资格由 `applyEnrichedValues`（canWriteEnrichedValue）决定。
 */
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { enqueuePlanMatchJob } from "../plans/matching-repository";
import { createConfiguredTextEnricher, type TextEnricher } from "../contacts/enrichment/text-enrichment";
import type { AiQuotaGate } from "../ai-quota/gate";
import type { NetworkAnalysisRuntime } from "./runtime";
import { confirmedContactPredicate } from "./repository";
import { markContactInsightsDirty } from "../contacts/insights/repository";
import { runNewContactLayers, type LayerContactRecord, type NewContactLayersDeps, type RunNewContactLayersInput } from "./new-contact-layers";

type Row = Record<string, unknown>;

const READ_LAYER_CONTACTS_SQL = `/* network-layers:contacts */
  select c.record_id, c.payload, c.updated_at
  from orbit_records c
  where ${confirmedContactPredicate("c")} and c.record_id = any($3::text[])
  order by c.record_id`;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

export function createNewContactLayersDeps(input: {
  runtime: NetworkAnalysisRuntime;
  store: Pick<LiveRecordStoreLike, "getRecord" | "updateRecordIfCurrent">;
  gate?: AiQuotaGate;
  enricher?: TextEnricher | null;
}): NewContactLayersDeps {
  const { runtime, store } = input;
  const { client, workspaceId } = runtime;
  return {
    async deferEnrichment(actorId, contactIds, sourceKey, notBefore) {
      await runtime.repository.deferEnrichment(actorId, contactIds, sourceKey, notBefore);
    },
    enricher: input.enricher !== undefined ? input.enricher : createConfiguredTextEnricher(),
    async enqueuePlanMatch({ actorId, batchId, contactIds }) {
      return runtime.repository.transaction((tx) => enqueuePlanMatchJob(tx as never, { actorId, batchId, contactIds, singleCard: false, workspaceId }));
    },
    gate: input.gate ?? runtime.ledger,
    async readContacts(actorId, contactIds) {
      const rows = (await client.query<Row>(READ_LAYER_CONTACTS_SQL, [workspaceId, actorId, [...contactIds]])).rows;
      return rows.flatMap((row): LayerContactRecord[] => {
        const payload = typeof row.payload === "string" ? (JSON.parse(row.payload) as Record<string, unknown>) : (row.payload as Record<string, unknown> | null);
        return payload && typeof payload === "object" ? [{ contactId: String(row.record_id), payload, updatedAt: iso(row.updated_at) }] : [];
      });
    },
    async refreshSnapshot(actorId) {
      return runtime.service.refreshAfterChange(actorId);
    },
    async markInsightsDirty(actorId, contactIds) {
      await markContactInsightsDirty(client, { actorId, contactIds, reason: "enrichment", workspaceId });
    },
    async writeContact(actorId, record, nextPayload, at) {
      if (!store.updateRecordIfCurrent) throw new Error("Contact storage requires conditional update support.");
      const current = await store.getRecord({ collectionName: "contacts", recordId: record.contactId, workspaceId });
      if (!current || current.userId !== actorId || current.updatedAt !== record.updatedAt) return false;
      const updatedAt = new Date(Math.max(Date.parse(at), Date.parse(current.updatedAt) + 1)).toISOString();
      const written = await store.updateRecordIfCurrent(
        { ...current, payload: { ...nextPayload, updatedAt }, updatedAt },
        { updatedAt: current.updatedAt, userId: current.userId ?? null },
      );
      return Boolean(written);
    },
  };
}

/** 给 W0053 导入、W0055 回填用的一行入口。 */
export async function runConfiguredNewContactLayers(
  runtime: NetworkAnalysisRuntime,
  store: Pick<LiveRecordStoreLike, "getRecord" | "updateRecordIfCurrent">,
  input: RunNewContactLayersInput,
) {
  return runNewContactLayers(input, createNewContactLayersDeps({ runtime, store }));
}
