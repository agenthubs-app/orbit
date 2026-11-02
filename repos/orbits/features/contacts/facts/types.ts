/**
 * R33 事实层（plan-v3/DESIGN.md §2.4）：按联系人累积备注里抽出的事实。
 *
 * 新集合 `contact_facts`（orbit_records 集合，按 workspace / 本人作用域，不建 SQL 表）；一行 = 一条事实。
 * 合并键 = 本人 + 联系人 + 字段 + `normalized`（去空白、小写、NFKC）：同一联系人同一字段的重复文本只有一行，
 * `lastSeenAt` 更新、`memoId` / `memoDate` / `firstSeenAt` 指向最早来源；不同联系人的事实永远不合并。
 * 手动加的事实（`field: "manual"`，`memoId` 为空）与抽取的事实同一张表，之后的抽取只追加、不覆盖、不删除。
 */
import { createHash } from "node:crypto";

export type ContactFactField = "offering" | "seeking" | "topic" | "event" | "manual";

export interface ContactFact {
  id: string;
  actorId: string;
  contactId: string;
  field: ContactFactField;
  /** ≤40 字（`manual` ≤80 字）。 */
  text: string;
  /** 去空白小写（NFKC），合并用。 */
  normalized: string;
  /** 来源备注；`manual` 时为 null。 */
  memoId: string | null;
  memoDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export const CONTACT_FACT_LIMITS = { textChars: 40, manualTextChars: 80 } as const;
export const CONTACT_FACTS_COLLECTION = "contact_facts";

export function normalizeFactText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

/** 稳定 id：本人 + 联系人 + 字段 + 规范化文本的哈希（同一事实两次写入落到同一行）。 */
export function contactFactId(input: { actorId: string; contactId: string; field: ContactFactField; normalized: string }): string {
  const digest = createHash("sha256").update(input.normalized).digest("hex").slice(0, 24);
  return `contact-fact:${encodeURIComponent(input.actorId)}:${encodeURIComponent(input.contactId)}:${input.field}:${digest}`;
}

export interface ContactFactStore {
  /** 本人某个联系人的全部事实（最多 500 条，按 firstSeenAt 正序）。 */
  list(input: { actorId: string; contactId: string }): Promise<ContactFact[]>;
  get(input: { actorId: string; id: string }): Promise<ContactFact | null>;
  /** 按 id 写入（新建或整行替换）。 */
  save(fact: ContactFact): Promise<void>;
}
