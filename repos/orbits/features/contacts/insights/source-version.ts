/**
 * W0051：洞察的输入指纹 `source_data_version`（纯函数）。
 *
 * 只覆盖会改变洞察文字的输入：联系人身份三项（姓名、公司、职位）、补全字段（行业、职级、地区、offering／seeking／topics
 * 的值）与来源（W0045 `enrichment.fields` 的 origin／updatedAt）、该联系人 memo 的 id 与时间、计划关联（需求 id + 状态）、
 * 关系目标哈希、提示词版本。**不含强度档**（R-10）：档位随时间衰减变化不让洞察过期、不改写文字，档位在读取时实时取 W0047。
 *
 * W0058（rev 2 G-3）：`via = card_inference` 的 offering／seeking／topics（值与来源记录）不计入——推测是这次生成自己的产物，
 * 写回后版本不变，下一次领取判为「未变化」、不再计费；这三栏的空数组与缺失同一口径。提示词升 `contact-insight@2`
 * 只改新算出的版本，不让存量 ready 行过期（`view.ts` 的过期只看待更新与目标哈希），也不触发重算。
 */
import { createHash } from "node:crypto";

export const CONTACT_INSIGHT_PROMPT_VERSION = "contact-insight@2";

const PROFILE_LIST_FIELDS = ["offering", "seeking", "topics"] as const;

export interface ContactInsightVersionInput {
  displayName: string;
  organization: string | null;
  role: string | null;
  /** 补全字段的值（行业一级／二级、职级、地区、offering／seeking／topics），按字段名。 */
  enrichedValues: Readonly<Record<string, unknown>>;
  /** W0045 `enrichment.fields`：字段 → { origin, updatedAt, via }。 */
  enrichmentFields: Readonly<Record<string, unknown>> | null;
  /** 该联系人 memo：noteId（正文哈希）+ 发生／创建时间。 */
  memos: readonly { id: string; at: string | null }[];
  /** 生效计划里该联系人的关联：需求 id + 状态。 */
  planLinks: readonly { needId: string; state: string }[];
  goalHash: string;
  /** W0058：名片备注（推测依据之一，脱敏截断后的文字）。 */
  cardNotes?: string | null;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  }
  return value ?? null;
}

function viaOf(provenance: unknown): unknown {
  return provenance && typeof provenance === "object" ? (provenance as { via?: unknown }).via : undefined;
}

/** 去掉 card_inference 的三栏（值与来源）；三栏空数组按缺失算。 */
function withoutCardInference(input: ContactInsightVersionInput): { enrichedValues: Record<string, unknown>; enrichmentFields: Record<string, unknown> } {
  const enrichedValues: Record<string, unknown> = { ...input.enrichedValues };
  const enrichmentFields: Record<string, unknown> = { ...(input.enrichmentFields ?? {}) };
  for (const field of PROFILE_LIST_FIELDS) {
    if (viaOf(enrichmentFields[field]) === "card_inference") {
      delete enrichmentFields[field];
      enrichedValues[field] = null;
    }
    const value = enrichedValues[field];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) enrichedValues[field] = null;
  }
  return { enrichedValues, enrichmentFields };
}

export function contactInsightSourceVersion(input: ContactInsightVersionInput): string {
  const { enrichedValues, enrichmentFields } = withoutCardInference(input);
  const payload = canonical({
    cardNotes: input.cardNotes ?? null,
    enrichedValues,
    enrichmentFields,
    goalHash: input.goalHash,
    identity: [input.displayName.trim(), (input.organization ?? "").trim(), (input.role ?? "").trim()],
    memos: [...input.memos].map((memo) => `${memo.id}@${memo.at ?? ""}`).sort(),
    planLinks: [...input.planLinks].map((link) => `${link.needId}:${link.state}`).sort(),
    prompt: CONTACT_INSIGHT_PROMPT_VERSION,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 40);
}
