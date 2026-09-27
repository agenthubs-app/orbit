import type { Pool } from "pg";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

/**
 * Task ids and due keys chosen to expose collation differences: case, accents,
 * CJK variants, kana, Hangul, full-width forms,
 * punctuation, digits, ß/ss and emoji. Canonically equivalent pairs (é vs e+U+0301)
 * are left out: localeCompare ties them, so the legacy order would depend on input
 * order. The expected orders for this fixture are
 * recorded in lifecycle-sort-order-postgres.test.ts from the legacy localeCompare
 * oracle on the formerly approved runtime (Node 25.6.0 / ICU 78.2) in a server locale.
 */
export const SORT_FIXTURE_AT = "2026-09-25T00:00:00.000Z";
export const SORT_FIXTURE_IDS = [
  "É", "e", "é", "E", "东京", "東京", "とうきょう", "トウキョウ", "도쿄",
  "a-2", "a_2", "a 2", "A2", "a2", "😀", "🙂", "🧑‍💻", "z", "Z", "ｚ", "Ｚ",
  "ß", "ss", "SS", "Ω", "ω", "10", "9", "09", "task:0010", "task:0009", "Task:0009",
  "ñ", "Ł", "l", "ø", "o", "æ", "ae", "İ", "i", "ı", "I",
  ...Array.from({ length: 40 }, (_, i) => `pad:${String(i).padStart(3, "0")}`),
] as const;

const DUE_VALUES = [null, "2026-09-26T00:00:00.000Z", "2026-09-25T01:00:00.000Z", "2026-09-25T10:00:00+09:00", "2026-09-25T01:00:00.000Z"] as const;

export function sortFixtureDue(index: number): string | null {
  return DUE_VALUES[index % DUE_VALUES.length]!;
}

export async function seedSortFixture(pool: Pool): Promise<void> {
  const store = createPostgresLiveRecordStore({ client: pool });
  const at = SORT_FIXTURE_AT;
  const insert = (collectionName: string, id: string, payload: Record<string, unknown>) => store.upsertRecord({
    workspaceId: "w", collectionName, recordId: `${collectionName}:${id}`, userId: "a", sourceType: "manual", sourceId: "s",
    evidenceIds: ["e"], lifecycleState: "active", createdAt: at, updatedAt: at,
    payload: { source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: at, updatedAt: at, id, ...payload },
  });
  await insert("contacts", "c", { displayName: "Contact", organization: "Org", stage: "active" });
  await insert("connections", "cn", { accountId: "a", contactId: "c", stage: "active", summary: "S" });
  for (const [index, id] of SORT_FIXTURE_IDS.entries()) {
    const dueAt = sortFixtureDue(index);
    await insert("tasks", id, { title: `Task ${id}`, status: index % 7 === 3 ? "completed" : "open", connectionId: "cn", ...(dueAt ? { dueAt } : {}) });
  }
}
