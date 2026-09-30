// Sprint 0104 (message plan M1): the legacy chat collections `conversations`
// and `messages` held only demo rows and no code reads them any more. This
// removes them from one workspace. Idempotent: a second run deletes nothing.

export const LEGACY_CHAT_COLLECTIONS = ["conversations", "messages"] as const;

import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";

export type LegacyChatCleanupClient = LiveRecordSqlClient;

export interface LegacyChatCleanupResult {
  counts: Record<(typeof LEGACY_CHAT_COLLECTIONS)[number], number>;
  deleted: number;
}

export async function countLegacyChatRecords(
  client: LegacyChatCleanupClient,
  workspaceId: string,
): Promise<LegacyChatCleanupResult["counts"]> {
  const result = await client.query<{ collection_name: string; count: number }>(
    `select collection_name, count(*)::int as count from orbit_records
      where workspace_id = $1 and collection_name = any($2::text[]) group by collection_name`,
    [workspaceId, [...LEGACY_CHAT_COLLECTIONS]],
  );
  const counts = { conversations: 0, messages: 0 };
  for (const row of result.rows) {
    if (row.collection_name === "conversations" || row.collection_name === "messages") {
      counts[row.collection_name] = Number(row.count);
    }
  }
  return counts;
}

export async function deleteLegacyChatRecords(
  client: LegacyChatCleanupClient,
  workspaceId: string,
): Promise<LegacyChatCleanupResult> {
  const counts = await countLegacyChatRecords(client, workspaceId);
  const result = await client.query<{ count: number }>(
    `with removed as (
       delete from orbit_records
        where workspace_id = $1 and collection_name = any($2::text[])
        returning 1
     ) select count(*)::int as count from removed`,
    [workspaceId, [...LEGACY_CHAT_COLLECTIONS]],
  );
  return { counts, deleted: Number(result.rows[0]?.count ?? 0) };
}
