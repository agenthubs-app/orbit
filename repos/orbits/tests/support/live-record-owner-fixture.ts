import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";

/**
 * Sprint 0113: upsertRecord never moves a row to another owner. A test that
 * hands fixture rows to its own actor (or plants a foreign-owned row) does so
 * through the explicit owner-change interface first, then writes the rest of
 * the record with the new owner. Sync-domain collections refuse this (no
 * registered handler); tests seed those rows with the right owner instead.
 */
export async function writeAsOwner<TPayload extends Record<string, unknown>>(
  store: LiveRecordStoreLike<TPayload>,
  record: LiveRecord<TPayload>,
): Promise<LiveRecord<TPayload>> {
  const current = await store.getRecord({ workspaceId: record.workspaceId, collectionName: record.collectionName, recordId: record.recordId, includeDeleted: true });
  const next = record.userId ?? null;
  if (current && next !== null && (current.userId ?? null) !== next) {
    if (!store.reassignRecordOwner) throw new Error("This store has no reassignRecordOwner.");
    const moved = await store.reassignRecordOwner({
      workspaceId: record.workspaceId, collectionName: record.collectionName, recordId: record.recordId,
      fromUserId: current.userId ?? null, toUserId: next, updatedAt: record.updatedAt,
    });
    if (!moved) throw new Error(`Could not hand ${record.collectionName}/${record.recordId} to ${next}.`);
  }
  return store.upsertRecord(record);
}
