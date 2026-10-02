/**
 * W0045：补全值来源的唯一规则（C-4：六个字段同一规则，W0046／W0048a／W0053／W0055 复用）。
 *
 * 写入优先级（canWriteEnrichedValue）：
 *   - `user` 永远可写；
 *   - `card`、`ai` 只在当前为空、或当前来源为 `ai` 时可写；
 *   - 当前有值但没有来源记录（存量数据）一律按 `user` 对待（保守：存量值可能是用户手改的）。
 */
import type {
  ContactEnrichmentDTO,
  EnrichmentField,
  EnrichmentOrigin,
  EnrichmentProvenance,
  EnrichmentVia,
} from "./contracts";

export type { ContactEnrichmentDTO, EnrichmentField, EnrichmentOrigin, EnrichmentProvenance, EnrichmentVia };

export const ENRICHMENT_FIELDS: readonly EnrichmentField[] = ["industry", "seniorityLevel", "region", "offering", "seeking", "topics"];
export const ENRICHMENT_ORIGINS: readonly EnrichmentOrigin[] = ["ai", "user", "card"];
export const ENRICHMENT_VIAS: readonly EnrichmentVia[] = [
  "card_ocr", "card_review", "text_enrichment", "contact_edit", "legacy_profile", "rule", "memo_extraction",
];

export interface EnrichedValueState {
  /** 当前字段是否已有值。 */
  hasValue: boolean;
  /** 当前值的来源记录；存量数据没有。 */
  provenance?: EnrichmentProvenance | null;
}

export function canWriteEnrichedValue(current: EnrichedValueState, incomingOrigin: EnrichmentOrigin): boolean {
  if (incomingOrigin === "user") return true;
  if (!current.hasValue) return true;
  // 有值无来源 = 存量值，按 user 保护。
  return current.provenance?.origin === "ai";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProvenance(value: unknown): EnrichmentProvenance | null {
  if (!isRecord(value)) return null;
  const { origin, updatedAt, via } = value;
  if (!ENRICHMENT_ORIGINS.includes(origin as EnrichmentOrigin)) return null;
  if (!ENRICHMENT_VIAS.includes(via as EnrichmentVia)) return null;
  if (typeof updatedAt !== "string" || !updatedAt.trim()) return null;
  return { origin: origin as EnrichmentOrigin, updatedAt, via: via as EnrichmentVia };
}

/** 读取 payload 里的 enrichment：只保留结构合法的字段来源；全都无效时返回 null。 */
export function readStoredEnrichment(value: unknown): ContactEnrichmentDTO | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.fields)) return null;
  const fields: Partial<Record<EnrichmentField, EnrichmentProvenance>> = {};
  for (const field of ENRICHMENT_FIELDS) {
    const provenance = readProvenance(value.fields[field]);
    if (provenance) fields[field] = provenance;
  }
  return Object.keys(fields).length ? { version: 1, fields } : null;
}

/** 返回加上（或替换）一个字段来源后的新 enrichment；不改入参。 */
export function withEnrichmentProvenance(
  current: ContactEnrichmentDTO | null | undefined,
  field: EnrichmentField,
  provenance: EnrichmentProvenance,
): ContactEnrichmentDTO {
  return { version: 1, fields: { ...(current?.fields ?? {}), [field]: { ...provenance } } };
}
