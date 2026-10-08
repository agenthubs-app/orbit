/**
 * W0045：补全值来源的唯一规则（C-4：六个字段同一规则，W0046／W0048a／W0053／W0055 复用）。
 *
 * 写入优先级（canWriteEnrichedValue）：
 *   - `user` 永远可写；
 *   - `card`、`ai` 只在当前为空、或当前来源为 `ai` 时可写；
 *   - 当前有值但没有来源记录（存量数据）一律按 `user` 对待（保守：存量值可能是用户手改的）。
 *
 * W0058（W58-2，rev 2 G-10）：传入完整来源 `{ origin, via }` 时比较完整来源（memo 提取与名片推测都这样调用）：
 *   - 当前来源 `user`（含值为空 = 用户主动清空）→ 只有 `user` 可写；
 *   - 当前 `via = memo_extraction` → `card_inference` 不可写，memo 提取可再写；
 *   - 当前 `via = card_inference` → memo 提取与 `card_inference` 都可写；
 *   - 无来源且有值（存量）→ 按 `user` 保护；无来源且空 → 可写；其余情况与只传 origin 的旧规则相同。
 * 只传 origin 的旧调用方语义逐项不变（表驱动测试锁定）。
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
  "card_ocr", "card_review", "text_enrichment", "contact_edit", "legacy_profile", "rule", "memo_extraction", "card_inference",
];

/** 写入方的完整来源（W0058）。 */
export interface EnrichmentWriter {
  origin: EnrichmentOrigin;
  via: EnrichmentVia;
}

export interface EnrichedValueState {
  /** 当前字段是否已有值。 */
  hasValue: boolean;
  /** 当前值的来源记录；存量数据没有。 */
  provenance?: EnrichmentProvenance | null;
}

export function canWriteEnrichedValue(current: EnrichedValueState, incoming: EnrichmentOrigin | EnrichmentWriter): boolean {
  if (typeof incoming === "string") {
    if (incoming === "user") return true;
    if (!current.hasValue) return true;
    // 有值无来源 = 存量值，按 user 保护。
    return current.provenance?.origin === "ai";
  }
  if (incoming.origin === "user") return true;
  const provenance = current.provenance ?? null;
  // 用户手改或主动清空：AI 永不回填。
  if (provenance?.origin === "user") return false;
  if (!current.hasValue) return true;
  // 有值无来源 = 存量值，按 user 保护。
  if (!provenance) return false;
  if (provenance.via === "memo_extraction" && incoming.via === "card_inference") return false;
  if (provenance.via === "card_inference") return incoming.via === "card_inference" || incoming.via === "memo_extraction";
  return provenance.origin === "ai";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : null;
}

/** W0058：可选的双语原文；结构不合法时丢掉（不影响来源本身）。 */
function readBilingual(value: unknown): EnrichmentProvenance["bilingual"] | null {
  if (!isRecord(value)) return null;
  const zh = stringList(value.zh);
  const en = stringList(value.en);
  return zh && en && zh.length === en.length ? { en, zh } : null;
}

function readProvenance(value: unknown): EnrichmentProvenance | null {
  if (!isRecord(value)) return null;
  const { origin, updatedAt, via } = value;
  if (!ENRICHMENT_ORIGINS.includes(origin as EnrichmentOrigin)) return null;
  if (!ENRICHMENT_VIAS.includes(via as EnrichmentVia)) return null;
  if (typeof updatedAt !== "string" || !updatedAt.trim()) return null;
  const bilingual = readBilingual(value.bilingual);
  return { origin: origin as EnrichmentOrigin, updatedAt, via: via as EnrichmentVia, ...(bilingual ? { bilingual } : {}) };
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
