/**
 * R12（DESIGN §2.3、§9 #10，复核 M6）：查重的一种口径——`findContactCandidate`（邮箱 / 电话 / 姓名 + 公司）
 * 加「同名」规则（`shared/compute/contact-name-match.ts`：规范化姓名相同、且至少一方没有公司 / 邮箱 / 电话）。
 * Owner: 甲 (R12). Used by: 手入力（`manual-contact-v2`）、名片 v2 `duplicates` 接口。
 *
 * 同名候选只提示、不自动统合：`matchedOn: ['name']`、`identical: false`。`findContactCandidate` 只调用、不改。
 */
import { nameOnlyMatch } from "../../shared/compute/contact-name-match";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { findContactCandidate, ownedByActor, type CardContactFields, type ContactCandidate } from "./business-card-contact-match";

type ContactRecord = LiveRecord<Record<string, unknown>>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fieldsOf(payload: Record<string, unknown>): CardContactFields {
  return {
    address: text(payload.location),
    displayName: text(payload.displayName),
    email: text(payload.primaryEmail),
    organization: text(payload.organization),
    phone: text(payload.primaryPhone),
    role: text(payload.role),
  };
}

/** 本人、未删除的联系人里的「同名」候选，最近更新的在前；`excludeIds` 里的不再列出。 */
export function findNameOnlyCandidates(
  records: readonly ContactRecord[],
  actorId: string,
  incoming: CardContactFields,
  excludeIds: ReadonlySet<string> = new Set(),
): ContactCandidate[] {
  return records
    .filter((record) => record.lifecycleState === "active" && ownedByActor(record, actorId) && !excludeIds.has(record.recordId))
    .map((record) => ({ fields: fieldsOf(record.payload), record }))
    .filter(({ fields }) => nameOnlyMatch(fields, incoming))
    .sort((left, right) => right.record.updatedAt.localeCompare(left.record.updatedAt) || left.record.recordId.localeCompare(right.record.recordId))
    .map(({ fields, record }) => ({ ...fields, contactId: record.recordId, identical: false, matchedOn: ["name"] as const }));
}

/**
 * 手入力：`findContactCandidate` 的最佳候选在前，之后是同名候选，合计最多 `limit` 条。
 * 手入力不自动统合：完全相同的候选也照样返回，由用户选。
 */
export function findManualContactCandidates(
  records: readonly ContactRecord[],
  actorId: string,
  incoming: CardContactFields,
  limit = 3,
): ContactCandidate[] {
  const best = findContactCandidate(records, actorId, incoming);
  const named = findNameOnlyCandidates(records, actorId, incoming, new Set(best ? [best.contactId] : []));
  return [...(best ? [best] : []), ...named].slice(0, Math.max(0, limit));
}

/** 名片 v2 `duplicates`：原有候选不变；没有命中时才用第一条同名候选。 */
export function findCardDuplicateCandidate(
  records: readonly ContactRecord[],
  actorId: string,
  card: CardContactFields,
): ContactCandidate | null {
  return findContactCandidate(records, actorId, card) ?? findNameOnlyCandidates(records, actorId, card)[0] ?? null;
}
