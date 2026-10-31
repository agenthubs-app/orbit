/**
 * R33：事实的累积写入（抽取成功后追加；手动加一条）。只追加、只更新 `lastSeenAt`；从不删、从不覆盖已有行。
 */
import type { MemoExtractionOutput } from "../memo-extraction/provider";
import { CONTACT_FACT_LIMITS, contactFactId, normalizeFactText, type ContactFact, type ContactFactField, type ContactFactStore } from "./types";

export interface AccumulateContactFactsInput {
  actorId: string;
  contactId: string;
  /** 来源备注 id（`memo_extractions` 的 noteId）。 */
  memoId: string;
  /** 来源备注的日期；没有就用写入时刻。 */
  memoDate?: string | null;
  output: Pick<MemoExtractionOutput, "offering" | "seeking" | "topics" | "eventTypes">;
  at: string;
}

export interface AccumulateContactFactsResult {
  inserted: number;
  updated: number;
}

const cut = (text: string, max: number) => Array.from(text.trim()).slice(0, max).join("");

/** 抽取结果 → 事实（字段：offering / seeking / topic / event；去空、截到 40 字、同字段去重）。 */
export function factsFromExtraction(output: AccumulateContactFactsInput["output"]): Array<{ field: Exclude<ContactFactField, "manual">; text: string }> {
  const out: Array<{ field: Exclude<ContactFactField, "manual">; text: string }> = [];
  const seen = new Set<string>();
  const push = (field: Exclude<ContactFactField, "manual">, values: readonly string[]) => {
    for (const value of values) {
      const text = cut(value, CONTACT_FACT_LIMITS.textChars);
      const key = `${field}:${normalizeFactText(text)}`;
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push({ field, text });
    }
  };
  push("offering", output.offering);
  push("seeking", output.seeking);
  push("topic", output.topics);
  push("event", output.eventTypes);
  return out;
}

async function merge(store: ContactFactStore, draft: Omit<ContactFact, "id" | "normalized" | "firstSeenAt" | "lastSeenAt">, at: string): Promise<"inserted" | "updated"> {
  const normalized = normalizeFactText(draft.text);
  const id = contactFactId({ actorId: draft.actorId, contactId: draft.contactId, field: draft.field, normalized });
  const existing = await store.get({ actorId: draft.actorId, id });
  if (existing) {
    // 重复文本只一行：lastSeenAt 取较晚者；memoId / memoDate / firstSeenAt 保持最早来源。
    const later = existing.lastSeenAt >= at ? existing.lastSeenAt : at;
    if (later !== existing.lastSeenAt) await store.save({ ...existing, lastSeenAt: later });
    return "updated";
  }
  await store.save({ ...draft, firstSeenAt: at, id, lastSeenAt: at, normalized });
  return "inserted";
}

export async function accumulateContactFacts(store: ContactFactStore, input: AccumulateContactFactsInput): Promise<AccumulateContactFactsResult> {
  const result: AccumulateContactFactsResult = { inserted: 0, updated: 0 };
  for (const fact of factsFromExtraction(input.output)) {
    const outcome = await merge(store, { actorId: input.actorId, contactId: input.contactId, field: fact.field, memoDate: input.memoDate ?? input.at, memoId: input.memoId, text: fact.text }, input.at);
    result[outcome] += 1;
  }
  return result;
}

export class ContactFactError extends Error {
  constructor(readonly code: "EMPTY_TEXT" | "TEXT_TOO_LONG") {
    super(code);
    this.name = "ContactFactError";
  }
}

/** 备注页「补一条事实」（R37a / R37b 接界面）：`field: "manual"`，≤80 字，同文本合并。返回写入后的行。 */
export async function addManualContactFact(store: ContactFactStore, input: { actorId: string; contactId: string; text: string; at: string }): Promise<ContactFact> {
  const text = input.text.trim().replace(/\s+/gu, " ");
  if (!text) throw new ContactFactError("EMPTY_TEXT");
  if (Array.from(text).length > CONTACT_FACT_LIMITS.manualTextChars) throw new ContactFactError("TEXT_TOO_LONG");
  await merge(store, { actorId: input.actorId, contactId: input.contactId, field: "manual", memoDate: null, memoId: null, text }, input.at);
  const id = contactFactId({ actorId: input.actorId, contactId: input.contactId, field: "manual", normalized: normalizeFactText(text) });
  return (await store.get({ actorId: input.actorId, id }))!;
}
